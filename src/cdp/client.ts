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

export interface ElementInfo {
    nodeId: number;
    backendNodeId: number;
    selector: string;
    tagName: string;
    text: string;
    rect: DOMRect | null;
    attributes: Record<string, string>;
}

export interface PageState {
    url: string;
    title: string;
    documentNodeId: number;
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
            await this.send('DOM.enable');
            await this.send('Page.enable');
            await this.send('Runtime.enable');
            await this.send('Network.enable');

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
        return this.send<{ frameId: string }>('Page.navigate', { url });
    }

    /**
     * Get page state (URL, title, root node)
     */
    async getPageState(): Promise<CDPResult<PageState>> {
        const docResult = await this.send<{ root: { nodeId: number } }>('DOM.getDocument');
        if (!docResult.success || !docResult.data) {
            return { success: false, error: docResult.error };
        }

        const tab = await chrome.tabs.get(this.tabId);

        return {
            success: true,
            data: {
                url: tab.url || '',
                title: tab.title || '',
                documentNodeId: docResult.data.root.nodeId,
            },
        };
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
        // Mouse down
        await this.send('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x,
            y,
            button: 'left',
            clickCount: 1,
        });

        // Mouse up
        await this.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x,
            y,
            button: 'left',
            clickCount: 1,
        });

        return { success: true };
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
            return sel.includes(':contains(') ||
                sel.includes(':has(') ||
                sel.includes(':not(') && sel.includes(':contains') ||
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
            console.log(`[CDP] Invalid selector detected: ${selector}, trying text search: "${searchText}"`);

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

        const escapedSelector = selector.replace(/'/g, "\\'").replace(/\\/g, "\\\\");

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
            console.log('[CDP] Trying JavaScript click fallback');
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
            console.log('[CDP] Trying focus + Enter fallback');
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
        // *** DEBUG: Log exactly what text is being typed ***
        console.log(`[CDP] type() called with text: "${text}" (${text.length} chars)`);

        // Use Input.insertText for reliable text insertion
        // This is the recommended approach for typing text
        await this.send('Input.insertText', { text });
        console.log(`[CDP] type() completed for: "${text}"`);
        return { success: true };
    }

    /**
     * Type into element (clears existing content first)
     */
    async typeInElement(selector: string, text: string): Promise<CDPResult<void>> {
        // *** DEBUG: Log element and text ***
        console.log(`[CDP] typeInElement() called - selector: "${selector}", text: "${text}"`);

        const clickResult = await this.clickElement(selector);
        if (!clickResult.success) {
            console.log(`[CDP] typeInElement() - click failed for: ${selector}`);
            return clickResult;
        }

        // Wait for focus
        await new Promise((resolve) => setTimeout(resolve, 100));

        // TRIPLE-CLEAR APPROACH (robust for all platforms):
        // 1. Clear via JavaScript directly (most reliable)
        try {
            const escapedSelector = selector.replace(/'/g, "\\'");
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
            console.log(`[CDP] typeInElement() - cleared via JavaScript`);
        } catch (e) {
            console.log(`[CDP] typeInElement() - JS clear failed, falling back to keyboard`);
        }

        // 2. Also try keyboard Select-All + Delete (backup)
        // Try BOTH Cmd+A (macOS modifier=4) and Ctrl+A (Windows modifier=2)
        console.log(`[CDP] typeInElement() - sending Cmd+A (modifier=4) to clear`);
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
            const verifyResult = await this.send('Runtime.evaluate', {
                expression: `document.querySelector('${selector.replace(/'/g, "\\'")}')?.value || ''`,
            });
            const currentValue = (verifyResult as any)?.result?.value || '';
            if (currentValue) {
                console.log(`[CDP] typeInElement() - WARNING: Input still has value="${currentValue}", attempting force clear`);
                // Force clear if still has content
                await this.send('Runtime.evaluate', {
                    expression: `document.querySelector('${selector.replace(/'/g, "\\'")}').value = '';`,
                });
            } else {
                console.log(`[CDP] typeInElement() - Input cleared successfully`);
            }
        } catch (e) {
            // Ignore verification errors - some elements don't have .value
        }

        // Now type the new text
        return this.type(text);

    }

    /**
     * Scroll page
     */
    async scroll(deltaX: number, deltaY: number): Promise<CDPResult<void>> {
        await this.send('Input.dispatchMouseEvent', {
            type: 'mouseWheel',
            x: 100,
            y: 100,
            deltaX,
            deltaY,
        });
        return { success: true };
    }

    /**
     * Find element by selector
     */
    async findElement(selector: string): Promise<CDPResult<ElementInfo>> {
        // Get document
        const docResult = await this.send<{ root: { nodeId: number } }>('DOM.getDocument');
        if (!docResult.success || !docResult.data) {
            return { success: false, error: docResult.error };
        }

        // Query selector
        const queryResult = await this.send<{ nodeId: number }>('DOM.querySelector', {
            nodeId: docResult.data.root.nodeId,
            selector,
        });

        if (!queryResult.success || !queryResult.data || queryResult.data.nodeId === 0) {
            return { success: false, error: `Element not found: ${selector}` };
        }

        const nodeId = queryResult.data.nodeId;

        // Get node details
        const nodeResult = await this.send<{
            node: {
                nodeId: number;
                backendNodeId: number;
                nodeName: string;
                attributes?: string[];
            };
        }>('DOM.describeNode', { nodeId });

        if (!nodeResult.success || !nodeResult.data) {
            return { success: false, error: nodeResult.error };
        }

        // Get bounding box
        const boxResult = await this.send<{
            model: {
                content: number[];
                width: number;
                height: number;
            };
        }>('DOM.getBoxModel', { nodeId });

        let rect: DOMRect | null = null;
        if (boxResult.success && boxResult.data) {
            const content = boxResult.data.model.content;
            rect = new DOMRect(
                content[0],
                content[1],
                boxResult.data.model.width,
                boxResult.data.model.height
            );
        }

        // Parse attributes
        const attributes: Record<string, string> = {};
        const attrList = nodeResult.data.node.attributes || [];
        for (let i = 0; i < attrList.length; i += 2) {
            attributes[attrList[i]] = attrList[i + 1];
        }

        // Get text content
        const textResult = await this.send<{ outerHTML: string }>('DOM.getOuterHTML', { nodeId });

        return {
            success: true,
            data: {
                nodeId,
                backendNodeId: nodeResult.data.node.backendNodeId,
                selector,
                tagName: nodeResult.data.node.nodeName.toLowerCase(),
                text: textResult.data?.outerHTML?.slice(0, 200) || '',
                rect,
                attributes,
            },
        };
    }

    /**
     * Get all interactive elements on page (for browser automation)
     */
    async getClickableElements(): Promise<CDPResult<ElementInfo[]>> {
        const docResult = await this.send<{ root: { nodeId: number } }>('DOM.getDocument');
        if (!docResult.success || !docResult.data) {
            return { success: false, error: docResult.error };
        }

        // Query for all interactive elements including inputs
        const selectors = [
            'input:not([type="hidden"])',  // Text inputs, search, etc.
            'textarea',
            'select',
            '[contenteditable="true"]',
            'a[href]',
            'button',
            'input[type="button"]',
            'input[type="submit"]',
            '[onclick]',
            '[role="button"]',
            '[role="link"]',
            '[role="textbox"]',
        ];

        const elements: ElementInfo[] = [];
        const seenNodeIds = new Set<number>();
        let elementIndex = 0;

        for (const selector of selectors) {
            try {
                const queryResult = await this.send<{ nodeIds: number[] }>(
                    'DOM.querySelectorAll',
                    {
                        nodeId: docResult.data.root.nodeId,
                        selector,
                    }
                );

                if (!queryResult.success || !queryResult.data) continue;

                for (const nodeId of queryResult.data.nodeIds) {
                    // Skip if already seen (element may match multiple selectors)
                    if (seenNodeIds.has(nodeId)) continue;
                    seenNodeIds.add(nodeId);

                    // Limit total elements
                    if (elements.length >= 30) break;

                    try {
                        // Get node details directly using nodeId
                        const nodeResult = await this.send<{
                            node: {
                                nodeId: number;
                                backendNodeId: number;
                                nodeName: string;
                                attributes?: string[];
                            };
                        }>('DOM.describeNode', { nodeId });

                        if (!nodeResult.success || !nodeResult.data) continue;

                        // Get bounding box
                        const boxResult = await this.send<{
                            model: {
                                content: number[];
                                width: number;
                                height: number;
                            };
                        }>('DOM.getBoxModel', { nodeId });

                        let rect: DOMRect | null = null;
                        if (boxResult.success && boxResult.data) {
                            const content = boxResult.data.model.content;
                            rect = new DOMRect(
                                content[0],
                                content[1],
                                boxResult.data.model.width,
                                boxResult.data.model.height
                            );
                        }

                        // Skip elements not visible (zero size or off-screen)
                        if (!rect || rect.width === 0 || rect.height === 0) continue;
                        if (rect.x < 0 || rect.y < 0 || rect.x > 2000 || rect.y > 2000) continue;

                        // Parse attributes
                        const attributes: Record<string, string> = {};
                        const attrList = nodeResult.data.node.attributes || [];
                        for (let i = 0; i < attrList.length; i += 2) {
                            attributes[attrList[i]] = attrList[i + 1];
                        }

                        // Build a usable selector
                        const tagName = nodeResult.data.node.nodeName.toLowerCase();
                        let bestSelector = tagName;

                        if (attributes['id']) {
                            bestSelector = `#${attributes['id']}`;
                        } else if (attributes['name']) {
                            bestSelector = `${tagName}[name="${attributes['name']}"]`;
                        } else if (attributes['data-testid']) {
                            bestSelector = `[data-testid="${attributes['data-testid']}"]`;
                        } else if (attributes['aria-label']) {
                            bestSelector = `[aria-label="${attributes['aria-label']}"]`;
                        } else if (attributes['class']) {
                            const firstClass = attributes['class'].split(' ')[0];
                            if (firstClass && !firstClass.includes(':')) {
                                bestSelector = `${tagName}.${firstClass}`;
                            }
                        }

                        // Get text content (for display)
                        let textContent = '';
                        const textResult = await this.send<{ outerHTML: string }>('DOM.getOuterHTML', { nodeId });
                        if (textResult.success && textResult.data) {
                            // Extract visible text only
                            const html = textResult.data.outerHTML;
                            const textMatch = html.match(/>([^<]{1,50})</);
                            textContent = textMatch ? textMatch[1].trim() : '';
                            // Use placeholder/value for inputs
                            if (!textContent && attributes['placeholder']) {
                                textContent = attributes['placeholder'];
                            }
                            if (!textContent && attributes['value']) {
                                textContent = attributes['value'];
                            }
                        }

                        elementIndex++;
                        elements.push({
                            nodeId,
                            backendNodeId: nodeResult.data.node.backendNodeId,
                            selector: bestSelector,
                            tagName,
                            text: textContent.slice(0, 50),
                            rect,
                            attributes,
                        });
                    } catch {
                        // Skip this element on error
                    }
                }
            } catch {
                // Continue with next selector
            }
        }

        console.log(`[CDP] Found ${elements.length} interactive elements`);
        return { success: true, data: elements };
    }

    /**
     * Execute JavaScript in page context
     */
    async evaluate<T = unknown>(expression: string): Promise<CDPResult<T>> {
        const result = await this.send<{
            result: { value: T };
            exceptionDetails?: { text: string };
        }>('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true,
        });

        if (!result.success || !result.data) {
            return { success: false, error: result.error };
        }

        if (result.data.exceptionDetails) {
            return { success: false, error: result.data.exceptionDetails.text };
        }

        return { success: true, data: result.data.result.value };
    }

    /**
     * Get console logs
     */
    async getConsoleLogs(): Promise<CDPResult<Array<{ level: string; text: string }>>> {
        // Console logs are captured via events, not direct query
        // This would need event listener setup
        return { success: true, data: [] };
    }

    /**
     * Check if currently attached
     */
    isAttached(): boolean {
        return this.attached;
    }

    /**
     * Get tab ID
     */
    getTabId(): number {
        return this.tabId;
    }
}

/**
 * Factory function to create and attach CDP client
 */
export async function createCDPClient(tabId: number): Promise<CDPResult<CDPClient>> {
    const client = new CDPClient(tabId);
    const result = await client.attach();

    if (!result.success) {
        return { success: false, error: result.error };
    }

    return { success: true, data: client };
}
