/**
 * Chrome DevTools Protocol (CDP) Client
 * 
 * Provides low-level browser control via chrome.debugger API.
 * This is the core of browser automation - similar to what Project Mariner uses.
 */

export interface CDPCommand {
    method: string;
    params?: Record<string, unknown>;
}

export interface CDPResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
}

/**
 * Escape a selector for embedding inside a single-quoted JS string literal.
 *
 * Order matters: backslashes must be doubled before quotes are escaped.
 */
function jsString(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * CDP Client for browser automation via chrome.debugger API
 */
export class CDPClient {
    private tabId: number;
    private attached: boolean = false;
    private debuggeeId: chrome.debugger.Debuggee;

    constructor(tabId: number) {
        this.tabId = tabId;
        this.debuggeeId = { tabId: this.tabId };
    }

    /**
     * Attach debugger to tab
     */
    async attach(): Promise<CDPResult<void>> {
        if (this.attached) {
            return { success: true };
        }

        try {
            await chrome.debugger.attach(this.debuggeeId, '1.3');
            this.attached = true;

            // Enable required CDP domains
            // Only the domains the shipped tools actually need.
            // Log + Runtime are what make the Console Logs tool work; without
            // Log.enable no `Log.entryAdded` event is ever emitted.
            await this.send('DOM.enable');
            await this.send('Page.enable');
            await this.send('Runtime.enable');
            await this.send('Log.enable');

            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: `Failed to attach debugger: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     * Detach debugger from tab
     */
    async detach(): Promise<CDPResult<void>> {
        if (!this.attached) {
            return { success: true };
        }

        try {
            await chrome.debugger.detach(this.debuggeeId);
            this.attached = false;
            return { success: true };
        } catch (error) {
            return {
                success: false,
                error: `Failed to detach debugger: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     * Send CDP command
     */
    async send<T = unknown>(
        method: string,
        params?: Record<string, unknown>
    ): Promise<CDPResult<T>> {
        if (!this.attached) {
            return { success: false, error: 'Debugger not attached' };
        }

        try {
            const result = await chrome.debugger.sendCommand(
                this.debuggeeId,
                method,
                params
            );
            return { success: true, data: result as T };
        } catch (error) {
            return {
                success: false,
                error: `CDP command failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    /**
     * Navigate to URL
     */
    async navigate(url: string): Promise<CDPResult<{ frameId: string }>> {
        const result = await this.send<{ frameId: string; errorText?: string }>(
            'Page.navigate',
            { url }
        );
        if (!result.success) {
            return result;
        }
        // Page.navigate resolves successfully even when the load failed - the
        // reason arrives as errorText, e.g. net::ERR_NAME_NOT_RESOLVED.
        if (result.data?.errorText) {
            return { success: false, error: result.data.errorText };
        }
        await this.waitForLoad();
        return result;
    }

    /**
     * Wait until the document has finished loading, so a follow-up click acts
     * on the new page rather than the old one.
     */
    private async waitForLoad(timeoutMs = 10000): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            const state = await this.evaluate<string>('document.readyState');
            if (state.success && state.data === 'complete') {
                return;
            }
        }
    }


    /**
     * Capture screenshot as base64
     */
    async captureScreenshot(
        format: 'jpeg' | 'png' | 'webp' = 'png',
        quality?: number
    ): Promise<CDPResult<{ data: string }>> {
        return this.send<{ data: string }>('Page.captureScreenshot', {
            format,
            quality: quality ?? (format === 'jpeg' ? 80 : undefined),
            captureBeyondViewport: false,
        });
    }

    /**
     * Click at coordinates
     */
    async click(x: number, y: number): Promise<CDPResult<void>> {
        // Hover first - many sites only wire up handlers after a mousemove.
        await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });

        // Mouse down
        const down = await this.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x,
            y,
            button: 'left',
            buttons: 1,
            clickCount: 1,
        });
        if (!down.success) {
            return { success: false, error: down.error };
        }

        // Mouse up
        const up = await this.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x,
            y,
            button: 'left',
            clickCount: 1,
        });

        return up.success ? { success: true } : { success: false, error: up.error };
    }

    /**
     * Click element by selector with smart fallbacks
     * Method 1: getBoundingClientRect + mouse events (most reliable)
     * Method 2: JavaScript element.click() (fallback)
     * Method 3: Focus + Enter key (for buttons/links)
     * Method 4: Text-based matching (for invalid selectors)
     */
    async clickElement(selector: string, method: 'auto' | 'js' | 'focus' = 'auto'): Promise<CDPResult<void>> {
        // *** FIX: Validate and sanitize selector ***
        // Check for invalid jQuery-style selectors
        const isInvalidSelector = (sel: string): boolean => {
            // :has() is standard CSS and querySelector supports it, so it is
            // deliberately not listed here.
            return sel.includes(':contains(') ||
                sel.startsWith('$') ||
                sel.includes('$(');
        };

        // Extract text from :contains() for fallback text search
        const extractContainsText = (sel: string): string | null => {
            const match = sel.match(/:contains\(['"]?([^'"]+)['"]?\)/);
            return match ? match[1] : null;
        };

        // *** FIX: Handle invalid selectors with text fallback ***
        if (isInvalidSelector(selector)) {
            const searchText = extractContainsText(selector);

            if (searchText) {
                // Find element by visible text
                const textResult = await this.evaluate(`
                    (function() {
                        const searchText = "${searchText.replace(/"/g, '\\"')}";
                        // Search links first
                        const links = Array.from(document.querySelectorAll('a'));
                        for (const link of links) {
                            if (link.textContent && link.textContent.toLowerCase().includes(searchText.toLowerCase())) {
                                link.scrollIntoView({ block: 'center', behavior: 'instant' });
                                const rect = link.getBoundingClientRect();
                                return { found: true, x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
                            }
                        }
                        // Search buttons
                        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"]'));
                        for (const btn of buttons) {
                            if (btn.textContent && btn.textContent.toLowerCase().includes(searchText.toLowerCase())) {
                                btn.scrollIntoView({ block: 'center', behavior: 'instant' });
                                const rect = btn.getBoundingClientRect();
                                return { found: true, x: rect.left + rect.width/2, y: rect.top + rect.height/2 };
                            }
                        }
                        return { found: false };
                    })()
                `);

                if (textResult.success && (textResult.data as { found: boolean })?.found) {
                    const coords = textResult.data as { x: number; y: number };
                    await new Promise(r => setTimeout(r, 100));
                    return this.click(coords.x, coords.y);
                }
            }

            return { success: false, error: `Invalid selector (jQuery-style not supported): ${selector}` };
        }

        // Backslashes first: escaping quotes first would then double the
        // backslash we just added, leaving a live quote that ends the string
        // literal. `input[name='q']` used to become a SyntaxError.
        const escapedSelector = jsString(selector);

        // Method 1: Scroll into view and click at viewport coordinates
        if (method === 'auto') {
            const result = await this.evaluate(`
                (function() {
                    const elem = document.querySelector('${escapedSelector}');
                    if (!elem) return null;
                    elem.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
                    const rect = elem.getBoundingClientRect();
                    return { 
                        x: rect.left + rect.width / 2, 
                        y: rect.top + rect.height / 2,
                        width: rect.width,
                        height: rect.height
                    };
                })()
            `);

            if (result.success && result.data) {
                const coords = result.data as { x: number; y: number; width: number; height: number };
                if (coords.width > 0 && coords.height > 0 && coords.x >= 0 && coords.y >= 0) {
                    await new Promise(r => setTimeout(r, 100));
                    const clickResult = await this.click(coords.x, coords.y);
                    if (clickResult.success) return clickResult;
                }
            }
        }

        // Method 2: JavaScript click() - works when mouse events fail
        if (method === 'auto' || method === 'js') {
            const jsResult = await this.evaluate(`
                (function() {
                    const elem = document.querySelector('${escapedSelector}');
                    if (!elem) return { success: false };
                    elem.click();
                    return { success: true };
                })()
            `);
            if (jsResult.success && (jsResult.data as { success: boolean })?.success) {
                return { success: true };
            }
        }

        // Method 3: Focus + Enter - works for buttons and links
        if (method === 'auto' || method === 'focus') {
            const focusResult = await this.evaluate(`
                (function() {
                    const elem = document.querySelector('${escapedSelector}');
                    if (!elem) return false;
                    elem.focus();
                    return true;
                })()
            `);
            if (focusResult.success && focusResult.data) {
                await new Promise(r => setTimeout(r, 50));
                await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter' });
                await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter' });
                return { success: true };
            }
        }

        return { success: false, error: `All click methods failed for: ${selector}` };
    }

    /**
     * Type text character by character
     * 
     * IMPORTANT: Use Input.insertText for reliable text input.
     * Previous approach sent 'text' in both keyDown and keyUp which caused double-typing.
     */
    async type(text: string): Promise<CDPResult<void>> {

        // Use Input.insertText for reliable text insertion
        // This is the recommended approach for typing text
        return this.send<void>('Input.insertText', { text });
    }

    /**
     * Type into element (clears existing content first)
     */
    async typeInElement(selector: string, text: string): Promise<CDPResult<void>> {

        const clickResult = await this.clickElement(selector);
        if (!clickResult.success) {
            return clickResult;
        }

        // Wait for focus
        await new Promise((resolve) => setTimeout(resolve, 100));

        // TRIPLE-CLEAR APPROACH (robust for all platforms):
        // 1. Clear via JavaScript directly (most reliable)
        try {
            const escapedSelector = jsString(selector);
            await this.send('Runtime.evaluate', {
                expression: `
                    (function() {
                        const el = document.querySelector('${escapedSelector}');
                        if (el) {
                            el.value = '';
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    })()
                `,
            });
        } catch {
            // Fall through to the keyboard clear below.
        }

        // 2. Also try keyboard Select-All + Delete (backup)
        // Try BOTH Cmd+A (macOS modifier=4) and Ctrl+A (Windows modifier=2)
        await this.send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'a',
            code: 'KeyA',
            modifiers: 4,  // Meta/Cmd for macOS
        });
        await this.send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'a',
            code: 'KeyA',
        });

        // Also send Ctrl+A for Windows/Linux compatibility
        await this.send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'a',
            code: 'KeyA',
            modifiers: 2,  // Ctrl for Windows/Linux
        });
        await this.send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'a',
            code: 'KeyA',
        });

        // 3. Delete the selected content
        await this.send('Input.dispatchKeyEvent', {
            type: 'keyDown',
            key: 'Backspace',
            code: 'Backspace',
        });
        await this.send('Input.dispatchKeyEvent', {
            type: 'keyUp',
            key: 'Backspace',
            code: 'Backspace',
        });

        await new Promise((resolve) => setTimeout(resolve, 50));

        // Verify text was cleared
        try {
            const verifyResult = await this.send<{ result: { value: string } }>(
                'Runtime.evaluate',
                {
                    expression: `document.querySelector('${jsString(selector)}')?.value || ''`,
                }
            );
            // send() wraps the CDP payload in { success, data } - reading
            // `.result` directly (as an earlier `as any` cast did) always
            // yielded undefined, so this check never actually fired.
            const currentValue = verifyResult.data?.result?.value || '';
            if (currentValue) {
                // Force clear if still has content
                await this.send('Runtime.evaluate', {
                    expression: `document.querySelector('${jsString(selector)}').value = '';`,
                });
            }
        } catch {
            // Ignore verification errors - some elements don't have .value
        }

        // Now type the new text
        const typed = await this.type(text);
        if (!typed.success) {
            return typed;
        }

        // Confirm the text actually landed. Input.insertText succeeds at the
        // protocol level even when the focused node accepts no text, so
        // without this the panel would report a success that never happened.
        const check = await this.evaluate<{ ok: boolean; kind: string }>(`
            (function () {
                var el = document.querySelector('${jsString(selector)}');
                if (!el) return { ok: false, kind: 'missing' };
                var current = ('value' in el) ? el.value : el.textContent;
                return {
                    ok: String(current || '').indexOf(${JSON.stringify(text)}) !== -1,
                    kind: el.tagName.toLowerCase()
                };
            })()
        `);

        if (check.success && check.data && !check.data.ok) {
            return {
                success: false,
                error:
                    `Text was not accepted by <${check.data.kind}> "${selector}". ` +
                    'Check that the selector points at an input, textarea or editable element.',
            };
        }

        return { success: true };
    }

    /**
     * Scroll page
     */
    async scroll(deltaX: number, deltaY: number): Promise<CDPResult<void>> {
        return this.send<void>('Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            x: 100,
            y: 100,
            deltaX,
            deltaY,
        });
    }



    /**
     * Execute JavaScript in page context
     */
    async evaluate<T = unknown>(expression: string): Promise<CDPResult<T>> {
        const result = await this.send<{
            result: { value: T };
            exceptionDetails?: { text: string; exception?: { description?: string } };
        }>('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
        });

        if (!result.success || !result.data) {
            return { success: false, error: result.error };
        }

        if (result.data.exceptionDetails) {
            // exceptionDetails.text is literally "Uncaught" for a thrown
            // error; the useful message lives on exception.description.
            const details = result.data.exceptionDetails;
            return { success: false, error: details.exception?.description ?? details.text };
        }

        // A malformed or empty CDP response has no `result` object; reading
        // through it unguarded throws inside the client.
        if (!('result' in result.data) || result.data.result === undefined) {
            return { success: true, data: undefined as T };
        }

        return { success: true, data: result.data.result.value };
    }


    /**
     * Check if currently attached
     */
    isAttached(): boolean {
        return this.attached;
    }

}
