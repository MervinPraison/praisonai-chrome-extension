/**
 * Tests for CDP Client
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome.debugger API
const mockChrome = {
    debugger: {
        attach: vi.fn(),
        detach: vi.fn(),
        sendCommand: vi.fn(),
        onEvent: {
            addListener: vi.fn(),
        },
        onDetach: {
            addListener: vi.fn(),
        },
    },
    tabs: {
        get: vi.fn(),
    },
};

// @ts-expect-error - Mocking chrome global
globalThis.chrome = mockChrome;

// Mock DOMRect
globalThis.DOMRect = class DOMRect {
    x: number;
    y: number;
    width: number;
    height: number;
    top: number;
    left: number;
    bottom: number;
    right: number;

    constructor(x = 0, y = 0, width = 0, height = 0) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.top = y;
        this.left = x;
        this.bottom = y + height;
        this.right = x + width;
    }

    toJSON() {
        return { x: this.x, y: this.y, width: this.width, height: this.height };
    }
};

// Import after mocking
import { CDPClient } from '../src/cdp/client';

describe('CDPClient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockChrome.debugger.attach.mockResolvedValue(undefined);
        mockChrome.debugger.detach.mockResolvedValue(undefined);
        mockChrome.debugger.sendCommand.mockResolvedValue({});
        mockChrome.tabs.get.mockResolvedValue({ url: 'https://example.com', title: 'Example' });
    });

    describe('attach', () => {
        it('should attach debugger to tab', async () => {
            const client = new CDPClient(123);
            const result = await client.attach();

            expect(result.success).toBe(true);
            expect(mockChrome.debugger.attach).toHaveBeenCalledWith({ tabId: 123 }, '1.3');
            expect(client.isAttached()).toBe(true);
        });

        it('should enable required CDP domains on attach', async () => {
            const client = new CDPClient(123);
            await client.attach();

            expect(mockChrome.debugger.sendCommand).toHaveBeenCalledWith(
                { tabId: 123 },
                'DOM.enable',
                undefined
            );
            expect(mockChrome.debugger.sendCommand).toHaveBeenCalledWith(
                { tabId: 123 },
                'Page.enable',
                undefined
            );
            expect(mockChrome.debugger.sendCommand).toHaveBeenCalledWith(
                { tabId: 123 },
                'Runtime.enable',
                undefined
            );
        });

        it('should return error on attach failure', async () => {
            mockChrome.debugger.attach.mockRejectedValue(new Error('Permission denied'));

            const client = new CDPClient(123);
            const result = await client.attach();

            expect(result.success).toBe(false);
            expect(result.error).toContain('Permission denied');
        });

        it('should not re-attach if already attached', async () => {
            const client = new CDPClient(123);
            await client.attach();
            await client.attach();

            expect(mockChrome.debugger.attach).toHaveBeenCalledTimes(1);
        });
    });

    describe('detach', () => {
        it('should detach debugger from tab', async () => {
            const client = new CDPClient(123);
            await client.attach();
            const result = await client.detach();

            expect(result.success).toBe(true);
            expect(mockChrome.debugger.detach).toHaveBeenCalledWith({ tabId: 123 });
            expect(client.isAttached()).toBe(false);
        });

        it('should succeed if not attached', async () => {
            const client = new CDPClient(123);
            const result = await client.detach();

            expect(result.success).toBe(true);
            expect(mockChrome.debugger.detach).not.toHaveBeenCalled();
        });
    });

    describe('navigate', () => {
        it('should navigate to URL', async () => {
            const client = new CDPClient(123);
            await client.attach();

            mockChrome.debugger.sendCommand
                .mockResolvedValueOnce({ frameId: 'frame-1' })
                // navigate() then waits for the document to finish loading
                .mockResolvedValue({ result: { value: 'complete' } });
            const result = await client.navigate('https://google.com');

            expect(result.success).toBe(true);
            expect(mockChrome.debugger.sendCommand).toHaveBeenCalledWith(
                { tabId: 123 },
                'Page.navigate',
                { url: 'https://google.com' }
            );
        });

        it('should fail if not attached', async () => {
            const client = new CDPClient(123);
            const result = await client.navigate('https://google.com');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Debugger not attached');
        });
    });

    describe('captureScreenshot', () => {
        it('should capture screenshot as base64', async () => {
            const client = new CDPClient(123);
            await client.attach();

            mockChrome.debugger.sendCommand.mockResolvedValueOnce({ data: 'base64imagedata' });
            const result = await client.captureScreenshot();

            expect(result.success).toBe(true);
            expect(result.data?.data).toBe('base64imagedata');
            expect(mockChrome.debugger.sendCommand).toHaveBeenCalledWith(
                { tabId: 123 },
                'Page.captureScreenshot',
                expect.objectContaining({ format: 'png' })
            );
        });

        it('should support different formats', async () => {
            const client = new CDPClient(123);
            await client.attach();

            mockChrome.debugger.sendCommand.mockResolvedValueOnce({ data: 'data' });
            await client.captureScreenshot('jpeg', 90);

            expect(mockChrome.debugger.sendCommand).toHaveBeenCalledWith(
                { tabId: 123 },
                'Page.captureScreenshot',
                expect.objectContaining({ format: 'jpeg', quality: 90 })
            );
        });
    });

    describe('click', () => {
        it('should dispatch mouse events at coordinates', async () => {
            const client = new CDPClient(123);
            await client.attach();

            await client.click(100, 200);

            expect(mockChrome.debugger.sendCommand).toHaveBeenCalledWith(
                { tabId: 123 },
                'Input.dispatchMouseEvent',
                expect.objectContaining({
                    type: 'mousePressed',
                    x: 100,
                    y: 200,
                    button: 'left',
                })
            );
            expect(mockChrome.debugger.sendCommand).toHaveBeenCalledWith(
                { tabId: 123 },
                'Input.dispatchMouseEvent',
                expect.objectContaining({
                    type: 'mouseReleased',
                    x: 100,
                    y: 200,
                })
            );
        });
    });

    describe('type', () => {
        it('should insert the text in a single CDP call', async () => {
            const client = new CDPClient(123);
            await client.attach();

            await client.type('ab');

            expect(mockChrome.debugger.sendCommand).toHaveBeenCalledWith(
                { tabId: 123 },
                'Input.insertText',
                { text: 'ab' }
            );
        });
    });

    describe('evaluate', () => {
        it('should execute JavaScript expression', async () => {
            const client = new CDPClient(123);
            await client.attach();

            mockChrome.debugger.sendCommand.mockResolvedValueOnce({
                result: { value: 'Example Title' },
            });

            const result = await client.evaluate('document.title');

            expect(result.success).toBe(true);
            expect(result.data).toBe('Example Title');
        });

        it('should return error on exception', async () => {
            const client = new CDPClient(123);
            await client.attach();

            mockChrome.debugger.sendCommand.mockResolvedValueOnce({
                result: { value: null },
                exceptionDetails: { text: 'ReferenceError: x is not defined' },
            });

            const result = await client.evaluate('x');

            expect(result.success).toBe(false);
            expect(result.error).toContain('ReferenceError');
        });
    });


    // ---- regressions found during the v1.0.4 store-compliance review ----

    describe('regressions', () => {
        it('escapes single-quoted attribute selectors without breaking the literal', async () => {
            const client = new CDPClient(123);
            await client.attach();

            // Previously `input[name='q']` produced `input[name=\\'q\\']`,
            // which ended the JS string early and threw a SyntaxError, so
            // Click and Type both failed on the most common selector shape.
            mockChrome.debugger.sendCommand.mockResolvedValue({
                result: { value: { found: false } },
            });
            await client.clickElement("input[name='q']");

            const expressions = mockChrome.debugger.sendCommand.mock.calls
                .filter((call: unknown[]) => call[1] === 'Runtime.evaluate')
                .map((call: unknown[]) => (call[2] as { expression: string }).expression);

            expect(expressions.length).toBeGreaterThan(0);
            for (const expression of expressions) {
                expect(expression).toContain("input[name=\\'q\\']");
                expect(expression).not.toContain("\\\\'q");
            }
        });

        it('reports a failed navigation instead of claiming success', async () => {
            const client = new CDPClient(123);
            await client.attach();

            // Page.navigate resolves successfully and reports the failure in
            // errorText; the old code returned success regardless.
            mockChrome.debugger.sendCommand.mockResolvedValueOnce({
                frameId: 'frame-1',
                errorText: 'net::ERR_NAME_NOT_RESOLVED',
            });

            const result = await client.navigate('https://nope.invalid');

            expect(result.success).toBe(false);
            expect(result.error).toContain('ERR_NAME_NOT_RESOLVED');
        });

        it('surfaces the real message for a thrown exception', async () => {
            const client = new CDPClient(123);
            await client.attach();

            // exceptionDetails.text is literally "Uncaught"; the useful text
            // is on exception.description.
            mockChrome.debugger.sendCommand.mockResolvedValueOnce({
                result: { value: null },
                exceptionDetails: {
                    text: 'Uncaught',
                    exception: { description: 'ReferenceError: nope is not defined' },
                },
            });

            const result = await client.evaluate('nope');

            expect(result.success).toBe(false);
            expect(result.error).toBe('ReferenceError: nope is not defined');
        });

        it('does not throw when a CDP response has no result object', async () => {
            const client = new CDPClient(123);
            await client.attach();

            mockChrome.debugger.sendCommand.mockResolvedValueOnce({});

            const result = await client.evaluate('1');

            expect(result.success).toBe(true);
            expect(result.data).toBeUndefined();
        });

        it('reports failure when the scroll command fails', async () => {
            const client = new CDPClient(123);
            await client.attach();

            mockChrome.debugger.sendCommand.mockRejectedValueOnce(new Error('Detached'));

            const result = await client.scroll(0, 500);

            expect(result.success).toBe(false);
        });
    });

});
