/**
 * Background message router - every shipped message type, success and failure.
 *
 * Driven through the real chrome.runtime.onMessage listener so the routing,
 * the tab guard, the history side effects and the error shapes are all the
 * production ones.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createHarness, type Harness } from './harness';

const TAB = 42;

/** Every type the router claims to handle. */
const ALL_TYPES = [
    'CDP_NAVIGATE',
    'CDP_CLICK',
    'CDP_TYPE',
    'CDP_SCROLL',
    'CDP_EVALUATE',
    'CDP_SCREENSHOT',
    'EXTRACT_DATA',
    'GET_CONSOLE_LOGS',
    'GET_TAB_INFO',
    'DETACH',
    'GET_HISTORY',
    'CLEAR_HISTORY',
    'GET_LAST_SCREENSHOT',
] as const;

const TAB_FREE = new Set(['GET_HISTORY', 'CLEAR_HISTORY', 'GET_LAST_SCREENSHOT']);

describe('background message router', () => {
    let h: Harness;

    beforeEach(async () => {
        h = await createHarness();
    });

    it('routes all 13 message types without falling through to "Unknown action"', async () => {
        for (const type of ALL_TYPES) {
            const result = await h.send({ type, tabId: TAB, url: 'example.com', selector: '#a', text: 'x', expression: '1' });
            expect(result, `${type} returned no response`).toBeDefined();
            expect(result.error ?? '', `${type} was not routed`).not.toContain('Unknown action');
        }
    });

    it('rejects an unknown message type', async () => {
        const result = await h.send({ type: 'NOT_A_THING', tabId: TAB });
        expect(result.success).toBe(false);
        expect(result.error).toBe('Unknown action: NOT_A_THING');
    });

    it('rejects every tab-scoped action when no tabId is supplied', async () => {
        for (const type of ALL_TYPES) {
            if (TAB_FREE.has(type)) continue;
            const result = await h.send({ type });
            expect(result.success, `${type} accepted a missing tabId`).toBe(false);
            expect(result.error).toBe('No tab selected.');
        }
    });

    it('allows the three tab-free actions with no tabId', async () => {
        for (const type of TAB_FREE) {
            const result = await h.send({ type });
            expect(result.success, `${type} required a tabId`).toBe(true);
        }
    });

    // ---------------------------------------------------------------- navigate

    describe('CDP_NAVIGATE', () => {
        it('navigates and reports the normalised URL', async () => {
            const result = await h.send({ type: 'CDP_NAVIGATE', tabId: TAB, url: 'example.com' });
            expect(result.success).toBe(true);
            expect(result.data).toBe('Navigated to https://example.com/');
            expect(h.cdpCalls.some((c) => c.method === 'Page.navigate')).toBe(true);
        });

        it('records history only on success', async () => {
            await h.send({ type: 'CDP_NAVIGATE', tabId: TAB, url: 'example.com' });
            const history = (await h.send({ type: 'GET_HISTORY' })).data as Array<{ action: string }>;
            expect(history.map((e) => e.action)).toEqual(['Navigate']);
        });

        it('fails - not a false success - when Page.navigate reports errorText', async () => {
            h.onCdp('Page.navigate', () => ({ frameId: 'f', errorText: 'net::ERR_NAME_NOT_RESOLVED' }));
            const result = await h.send({ type: 'CDP_NAVIGATE', tabId: TAB, url: 'nope.invalid' });
            expect(result.success).toBe(false);
            expect(result.error).toContain('ERR_NAME_NOT_RESOLVED');
            const history = (await h.send({ type: 'GET_HISTORY' })).data as unknown[];
            expect(history).toHaveLength(0);
        });

        it('fails when the CDP command itself rejects', async () => {
            h.onCdp('Page.navigate', () => {
                throw new Error('Detached while handling command.');
            });
            const result = await h.send({ type: 'CDP_NAVIGATE', tabId: TAB, url: 'example.com' });
            expect(result.success).toBe(false);
            expect(result.error).toContain('Detached while handling command.');
        });

        it('rejects an empty URL before touching CDP', async () => {
            const result = await h.send({ type: 'CDP_NAVIGATE', tabId: TAB, url: '   ' });
            expect(result.success).toBe(false);
            expect(result.error).toContain('valid URL');
            expect(h.chrome.debugger.attach).not.toHaveBeenCalled();
        });

        it('rejects a missing URL field', async () => {
            const result = await h.send({ type: 'CDP_NAVIGATE', tabId: TAB });
            expect(result.success).toBe(false);
            expect(result.error).toContain('valid URL');
        });
    });

    // ------------------------------------------------------------------- click

    describe('CDP_CLICK', () => {
        it('clicks and reports the selector', async () => {
            const result = await h.send({ type: 'CDP_CLICK', tabId: TAB, selector: '#submit' });
            expect(result.success).toBe(true);
            expect(result.data).toBe('Clicked #submit');
            expect(h.cdpCalls.some((c) => c.method === 'Input.dispatchMouseEvent')).toBe(true);
        });

        it('rejects a blank selector', async () => {
            const result = await h.send({ type: 'CDP_CLICK', tabId: TAB, selector: '  ' });
            expect(result.success).toBe(false);
            expect(result.error).toContain('CSS selector');
        });

        it('fails with a useful error when no element matches', async () => {
            // Every evaluate returns "element not found" for each of the three methods.
            h.onCdp('Runtime.evaluate', (params) => {
                const expr = String((params as { expression?: string })?.expression ?? '');
                if (expr.includes('document.readyState')) return { result: { value: 'complete' } };
                return { result: { value: null } };
            });
            const result = await h.send({ type: 'CDP_CLICK', tabId: TAB, selector: '#nope' });
            expect(result.success).toBe(false);
            expect(result.error).toContain('#nope');
            expect(result.error).not.toBe('');
        });

        it('rejects a jQuery-style selector with an explanatory error', async () => {
            h.onCdp('Runtime.evaluate', () => ({ result: { value: { found: false } } }));
            const result = await h.send({ type: 'CDP_CLICK', tabId: TAB, selector: "a:contains('Next')" });
            expect(result.success).toBe(false);
            expect(result.error).toContain('jQuery-style not supported');
        });

        /**
         * `:has()` is standard CSS that document.querySelector supports, but
         * isInvalidSelector() lumps it in with the jQuery extensions and
         * refuses it outright - there is no fallback path for it.
         */
        it('accepts :has(), which is standard CSS that querySelector supports', async () => {
            await h.send({ type: 'CDP_CLICK', tabId: TAB, selector: 'div:has(> button)' });
            // It must reach the page rather than being refused as "jQuery-style".
            expect(h.cdpCalls.some((c) => c.method === 'Runtime.evaluate')).toBe(true);
        });

        it('fails when the CDP transport dies mid-click', async () => {
            h.onCdp('Runtime.evaluate', () => {
                throw new Error('Debugger is not attached to the tab with id: 42.');
            });
            const result = await h.send({ type: 'CDP_CLICK', tabId: TAB, selector: '#a' });
            expect(result.success).toBe(false);
            expect(result.error).toContain('#a');
        });
    });

    // -------------------------------------------------------------------- type

    describe('CDP_TYPE', () => {
        it('types into the element and reports the selector', async () => {
            const result = await h.send({ type: 'CDP_TYPE', tabId: TAB, selector: '#q', text: 'hello' });
            expect(result.success).toBe(true);
            expect(result.data).toBe('Typed into #q');
            const insert = h.cdpCalls.find((c) => c.method === 'Input.insertText');
            expect(insert?.params).toEqual({ text: 'hello' });
        });

        it('rejects a blank selector', async () => {
            const result = await h.send({ type: 'CDP_TYPE', tabId: TAB, selector: '', text: 'x' });
            expect(result.success).toBe(false);
            expect(result.error).toContain('CSS selector');
        });

        it('does NOT report success when the text never landed in the element', async () => {
            h.onCdp('Runtime.evaluate', (params) => {
                const expr = String((params as { expression?: string })?.expression ?? '');
                if (expr.includes('document.readyState')) return { result: { value: 'complete' } };
                if (expr.includes('indexOf(')) return { result: { value: { ok: false, kind: 'div' } } };
                if (expr.includes('getBoundingClientRect')) {
                    return { result: { value: { x: 10, y: 10, width: 50, height: 20 } } };
                }
                return { result: { value: '' } };
            });
            const result = await h.send({ type: 'CDP_TYPE', tabId: TAB, selector: '#d', text: 'hi' });
            expect(result.success).toBe(false);
            expect(result.error).toContain('not accepted');
            expect(result.error).toContain('<div>');
        });

        it('handles a missing text field as an empty string', async () => {
            const result = await h.send({ type: 'CDP_TYPE', tabId: TAB, selector: '#q' });
            expect(result.success).toBe(true);
            const insert = h.cdpCalls.find((c) => c.method === 'Input.insertText');
            expect(insert?.params).toEqual({ text: '' });
        });
    });

    // ------------------------------------------------------------------ scroll

    describe('CDP_SCROLL', () => {
        it('scrolls down by a positive delta', async () => {
            const result = await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
            expect(result.success).toBe(true);
            expect(result.data).toBe('Scrolled down');
            const wheel = h.cdpCalls.find(
                (c) => c.method === 'Input.dispatchMouseEvent' && (c.params as { type?: string })?.type === 'mouseWheel'
            );
            expect(wheel?.params).toMatchObject({ deltaY: 500, deltaX: 0 });
        });

        it('scrolls up by a negative delta', async () => {
            const result = await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'up' });
            expect(result.success).toBe(true);
            expect(result.data).toBe('Scrolled up');
            const wheel = h.cdpCalls.find(
                (c) => c.method === 'Input.dispatchMouseEvent' && (c.params as { type?: string })?.type === 'mouseWheel'
            );
            expect(wheel?.params).toMatchObject({ deltaY: -500 });
        });

        it('defaults to down when no direction is given', async () => {
            const result = await h.send({ type: 'CDP_SCROLL', tabId: TAB });
            expect(result.data).toBe('Scrolled down');
        });

        it('reports failure when the CDP command fails', async () => {
            h.onCdp('Input.dispatchMouseEvent', () => {
                throw new Error('Detached');
            });
            const result = await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
            expect(result.success).toBe(false);
            expect(result.error).toContain('Detached');
        });
    });

    // ---------------------------------------------------------------- evaluate

    describe('CDP_EVALUATE', () => {
        it('returns the evaluated value', async () => {
            h.onCdp('Runtime.evaluate', () => ({ result: { value: 'Example Domain' } }));
            const result = await h.send({ type: 'CDP_EVALUATE', tabId: TAB, expression: 'document.title' });
            expect(result.success).toBe(true);
            expect(result.data).toBe('Example Domain');
        });

        it('rejects an empty expression', async () => {
            const result = await h.send({ type: 'CDP_EVALUATE', tabId: TAB, expression: '  ' });
            expect(result.success).toBe(false);
            expect(result.error).toContain('JavaScript expression');
        });

        it('surfaces a page exception rather than claiming success', async () => {
            h.onCdp('Runtime.evaluate', () => ({
                result: { value: null },
                exceptionDetails: { text: 'Uncaught', exception: { description: 'ReferenceError: q is not defined' } },
            }));
            const result = await h.send({ type: 'CDP_EVALUATE', tabId: TAB, expression: 'q' });
            expect(result.success).toBe(false);
            expect(result.error).toBe('ReferenceError: q is not defined');
        });

        it('does not add history for a failed evaluation', async () => {
            h.onCdp('Runtime.evaluate', () => ({
                result: { value: null },
                exceptionDetails: { text: 'Uncaught', exception: { description: 'boom' } },
            }));
            await h.send({ type: 'CDP_EVALUATE', tabId: TAB, expression: 'q' });
            expect((await h.send({ type: 'GET_HISTORY' })).data).toEqual([]);
        });
    });

    // -------------------------------------------------------------- screenshot

    describe('CDP_SCREENSHOT', () => {
        it('unwraps Page.captureScreenshot {data} into a png data URL', async () => {
            h.onCdp('Page.captureScreenshot', () => ({ data: 'QUJD' }));
            const result = await h.send({ type: 'CDP_SCREENSHOT', tabId: TAB });
            expect(result.success).toBe(true);
            expect(result.data).toBe('data:image/png;base64,QUJD');
        });

        it('stores the shot in session storage for a closed panel', async () => {
            h.onCdp('Page.captureScreenshot', () => ({ data: 'QUJD' }));
            await h.send({ type: 'CDP_SCREENSHOT', tabId: TAB });
            const stored = h.session.store.get('lastScreenshot') as { dataUrl: string; capturedAt: number };
            expect(stored.dataUrl).toBe('data:image/png;base64,QUJD');
            expect(typeof stored.capturedAt).toBe('number');
            const last = await h.send({ type: 'GET_LAST_SCREENSHOT' });
            expect((last.data as { dataUrl: string }).dataUrl).toBe('data:image/png;base64,QUJD');
        });

        it('still succeeds when the session-storage quota is exceeded', async () => {
            h.onCdp('Page.captureScreenshot', () => ({ data: 'QUJD' }));
            h.session.failSetWith = new Error('QUOTA_BYTES quota exceeded');
            const result = await h.send({ type: 'CDP_SCREENSHOT', tabId: TAB });
            expect(result.success).toBe(true);
            expect(result.data).toBe('data:image/png;base64,QUJD');
        });

        it('fails when the CDP response carries no image data', async () => {
            h.onCdp('Page.captureScreenshot', () => ({}));
            const result = await h.send({ type: 'CDP_SCREENSHOT', tabId: TAB });
            expect(result.success).toBe(false);
            expect(result.error).toBe('Screenshot failed.');
        });

        it('fails when the CDP command rejects', async () => {
            h.onCdp('Page.captureScreenshot', () => {
                throw new Error('Not attached');
            });
            const result = await h.send({ type: 'CDP_SCREENSHOT', tabId: TAB });
            expect(result.success).toBe(false);
            expect(result.error).toContain('Not attached');
        });

        it('returns null when nothing has been captured yet', async () => {
            const last = await h.send({ type: 'GET_LAST_SCREENSHOT' });
            expect(last.success).toBe(true);
            expect(last.data).toBeNull();
        });
    });

    // ------------------------------------------------------------ extract data

    describe('EXTRACT_DATA', () => {
        it('returns the JSON the page produced', async () => {
            h.onCdp('Runtime.evaluate', () => ({ result: { value: '{"title":"Example"}' } }));
            const result = await h.send({ type: 'EXTRACT_DATA', tabId: TAB });
            expect(result.success).toBe(true);
            expect(JSON.parse(result.data as string)).toEqual({ title: 'Example' });
        });

        it('asks the page for title, url, headings, links and images', async () => {
            await h.send({ type: 'EXTRACT_DATA', tabId: TAB });
            const expr = String(
                (h.cdpCalls.filter((c) => c.method === 'Runtime.evaluate').pop()?.params as { expression: string })
                    .expression
            );
            for (const key of ['title', 'location.href', 'h1,h2,h3', 'a[href]', 'img[src]']) {
                expect(expr).toContain(key);
            }
        });

        it('reports the failure instead of an empty result', async () => {
            h.onCdp('Runtime.evaluate', () => {
                throw new Error('Inspected target navigated or closed');
            });
            const result = await h.send({ type: 'EXTRACT_DATA', tabId: TAB });
            expect(result.success).toBe(false);
            expect(result.error).toContain('navigated or closed');
        });
    });

    // ---------------------------------------------------------------- tab info

    describe('GET_TAB_INFO', () => {
        it('returns the tab identity and restricted flag', async () => {
            const result = await h.send({ type: 'GET_TAB_INFO', tabId: TAB });
            expect(result.success).toBe(true);
            expect(result.data).toMatchObject({
                id: TAB,
                url: 'https://example.com/',
                title: 'Example',
                restricted: false,
            });
        });

        it('reports a closed tab instead of throwing', async () => {
            h.chrome.tabs.get.mockRejectedValue(new Error('No tab with id: 42.'));
            const result = await h.send({ type: 'GET_TAB_INFO', tabId: TAB });
            expect(result.success).toBe(false);
            expect(result.error).toBe('That tab is no longer open.');
        });
    });

    // ----------------------------------------------------------------- detach

    describe('DETACH', () => {
        it('ends an active session', async () => {
            await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
            const result = await h.send({ type: 'DETACH', tabId: TAB });
            expect(result.success).toBe(true);
            expect(String(result.data)).toMatch(/Session ended|No active session/);
        });

        it('reports "no active session" rather than an error when nothing is attached', async () => {
            h.chrome.debugger.detach.mockRejectedValue(
                new Error('Debugger is not attached to the tab with id: 42.')
            );
            const result = await h.send({ type: 'DETACH', tabId: TAB });
            expect(result.success).toBe(true);
            expect(result.data).toBe('No active session on this tab.');
        });

        it('surfaces an unexpected detach failure', async () => {
            h.chrome.debugger.detach.mockRejectedValue(new Error('Something else went wrong'));
            const result = await h.send({ type: 'DETACH', tabId: TAB });
            expect(result.success).toBe(false);
            expect(result.error).toBe('Something else went wrong');
        });

        it('clears the stored console buffer for that tab', async () => {
            await h.send({ type: 'GET_CONSOLE_LOGS', tabId: TAB });
            h.session.store.set(`console:${TAB}`, [{ level: 'log', text: 'x' }]);
            await h.send({ type: 'DETACH', tabId: TAB });
            expect(h.session.store.has(`console:${TAB}`)).toBe(false);
        });
    });

    // ----------------------------------------------------- listener contract

    it('keeps the response channel open by returning true', async () => {
        // send() already asserts this; this test names the contract explicitly.
        await expect(h.send({ type: 'GET_HISTORY' })).resolves.toBeDefined();
    });

    it('never resolves a failing CDP call as a success', async () => {
        h.chrome.debugger.attach.mockRejectedValue(new Error('Cannot access a chrome:// URL'));
        for (const type of ['CDP_CLICK', 'CDP_TYPE', 'CDP_SCROLL', 'CDP_EVALUATE', 'CDP_SCREENSHOT', 'EXTRACT_DATA']) {
            const result = await h.send({
                type,
                tabId: TAB,
                selector: '#a',
                text: 'x',
                expression: '1',
            });
            expect(result.success, `${type} claimed success with no debugger`).toBe(false);
            expect(result.error, `${type} gave no error text`).toBeTruthy();
        }
        expect((await h.send({ type: 'GET_HISTORY' })).data).toEqual([]);
    });
});
