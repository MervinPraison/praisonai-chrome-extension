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
import { CDPClient, createCDPClient } from '../src/cdp/client';

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

            mockChrome.debugger.sendCommand.mockResolvedValueOnce({ frameId: 'frame-1' });
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
        it('should dispatch key events for each character', async () => {
            const client = new CDPClient(123);
            await client.attach();

            await client.type('ab');

            // Check keyDown and keyUp for 'a'
            expect(mockChrome.debugger.sendCommand).toHaveBeenCalledWith(
                { tabId: 123 },
                'Input.dispatchKeyEvent',
                expect.objectContaining({ type: 'keyDown', text: 'a' })
            );
            expect(mockChrome.debugger.sendCommand).toHaveBeenCalledWith(
                { tabId: 123 },
                'Input.dispatchKeyEvent',
                expect.objectContaining({ type: 'keyUp', text: 'a' })
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

    describe('getPageState', () => {
        it('should return page URL, title, and document node', async () => {
            const client = new CDPClient(123);
            await client.attach();

            mockChrome.debugger.sendCommand.mockResolvedValueOnce({
                root: { nodeId: 1 },
            });

            const result = await client.getPageState();

            expect(result.success).toBe(true);
            expect(result.data).toEqual({
                url: 'https://example.com',
                title: 'Example',
                documentNodeId: 1,
            });
        });
    });
});

describe('createCDPClient', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockChrome.debugger.attach.mockResolvedValue(undefined);
        mockChrome.debugger.sendCommand.mockResolvedValue({});
    });

    it('should create and attach client', async () => {
        const result = await createCDPClient(123);

        expect(result.success).toBe(true);
        expect(result.data).toBeInstanceOf(CDPClient);
        expect(result.data?.isAttached()).toBe(true);
    });

    it('should return error on failure', async () => {
        mockChrome.debugger.attach.mockRejectedValue(new Error('Not allowed'));

        const result = await createCDPClient(123);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Not allowed');
    });
});
