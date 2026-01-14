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
     * Click element by selector
     */
    async clickElement(selector: string): Promise<CDPResult<void>> {
        const element = await this.findElement(selector);
        if (!element.success || !element.data) {
            return { success: false, error: element.error || 'Element not found' };
        }

        if (!element.data.rect) {
            return { success: false, error: 'Element has no bounding rect' };
        }

        const x = element.data.rect.x + element.data.rect.width / 2;
        const y = element.data.rect.y + element.data.rect.height / 2;

        return this.click(x, y);
    }

    /**
     * Type text
     */
    async type(text: string): Promise<CDPResult<void>> {
        for (const char of text) {
            await this.send('Input.dispatchKeyEvent', {
                type: 'keyDown',
                text: char,
            });
            await this.send('Input.dispatchKeyEvent', {
                type: 'keyUp',
                text: char,
            });
            // Small delay between keystrokes
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
        return { success: true };
    }

    /**
     * Type into element
     */
    async typeInElement(selector: string, text: string): Promise<CDPResult<void>> {
        const clickResult = await this.clickElement(selector);
        if (!clickResult.success) {
            return clickResult;
        }

        // Wait for focus
        await new Promise((resolve) => setTimeout(resolve, 100));

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
     * Get all clickable elements on page
     */
    async getClickableElements(): Promise<CDPResult<ElementInfo[]>> {
        const docResult = await this.send<{ root: { nodeId: number } }>('DOM.getDocument');
        if (!docResult.success || !docResult.data) {
            return { success: false, error: docResult.error };
        }

        // Query for interactive elements
        const selectors = [
            'a[href]',
            'button',
            'input[type="button"]',
            'input[type="submit"]',
            '[onclick]',
            '[role="button"]',
            '[role="link"]',
        ];

        const elements: ElementInfo[] = [];

        for (const selector of selectors) {
            try {
                const queryResult = await this.send<{ nodeIds: number[] }>(
                    'DOM.querySelectorAll',
                    {
                        nodeId: docResult.data.root.nodeId,
                        selector,
                    }
                );

                if (queryResult.success && queryResult.data) {
                    for (const nodeId of queryResult.data.nodeIds.slice(0, 20)) {
                        const element = await this.findElement(`[data-nodeId="${nodeId}"]`);
                        if (element.success && element.data) {
                            elements.push(element.data);
                        }
                    }
                }
            } catch {
                // Continue with next selector
            }
        }

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
