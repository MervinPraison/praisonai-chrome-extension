/**
 * normalizeUrl and isRestrictedUrl.
 *
 * Neither is exported, so both are exercised through the real router:
 *   - normalizeUrl via CDP_NAVIGATE (the echoed "Navigated to <href>" is the
 *     normalised value, and a rejection is the "Enter a valid URL" error)
 *   - isRestrictedUrl via GET_TAB_INFO's `restricted` flag and via the
 *     attach-time guard message.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createHarness, type Harness } from './harness';

const TAB = 7;

describe('normalizeUrl (via CDP_NAVIGATE)', () => {
    let h: Harness;
    beforeEach(async () => {
        h = await createHarness();
    });

    const accepted: Array<[string, string]> = [
        ['example.com', 'https://example.com/'],
        ['https://example.com', 'https://example.com/'],
        ['http://example.com/a?b=1#c', 'http://example.com/a?b=1#c'],
        ['  spaced.com  ', 'https://spaced.com/'],
        ['HTTPS://EXAMPLE.COM/Path', 'https://example.com/Path'],
        ['localhost:3000', 'https://localhost:3000/'],
        ['//example.com', 'https://example.com/'],
        ['sub.domain.co.uk/deep/path', 'https://sub.domain.co.uk/deep/path'],
    ];

    for (const [input, expected] of accepted) {
        it(`accepts ${JSON.stringify(input)} -> ${expected}`, async () => {
            const result = await h.send({ type: 'CDP_NAVIGATE', tabId: TAB, url: input });
            expect(result.success).toBe(true);
            expect(result.data).toBe(`Navigated to ${expected}`);
            const nav = h.cdpCalls.find((c) => c.method === 'Page.navigate');
            expect(nav?.params).toEqual({ url: expected });
        });
    }

    const rejected = [
        ['a javascript: URL', 'javascript:alert(1)'],
        ['a mixed-case javascript: URL', 'jAvAsCrIpT:void(0)'],
        ['a data: URL', 'data:text/html,<h1>x</h1>'],
        ['a bare data: URL', 'data:,x'],
        ['empty input', ''],
        ['whitespace only', '   \t\n  '],
        ['text that is not a URL', 'not a url'],
    ] as const;

    for (const [label, input] of rejected) {
        it(`rejects ${label}`, async () => {
            const result = await h.send({ type: 'CDP_NAVIGATE', tabId: TAB, url: input });
            expect(result.success).toBe(false);
            expect(result.error).toBe('Enter a valid URL, for example https://example.com');
            expect(h.cdpCalls.some((c) => c.method === 'Page.navigate')).toBe(false);
            expect(h.chrome.debugger.attach).not.toHaveBeenCalled();
        });
    }

    it('never hands a non-http(s) scheme to Page.navigate', async () => {
        for (const input of ['javascript:alert(1)', 'data:,x', 'file:///etc/passwd', 'chrome://settings', 'ftp://host/x', 'vbscript:msgbox']) {
            await h.send({ type: 'CDP_NAVIGATE', tabId: TAB, url: input });
        }
        const urls = h.cdpCalls
            .filter((c) => c.method === 'Page.navigate')
            .map((c) => String((c.params as { url: string }).url));
        for (const url of urls) {
            expect(url, `${url} escaped the http(s) guard`).toMatch(/^https?:\/\//);
        }
    });

    // BUG: a scheme other than http/https is not rejected - it is silently
    // reinterpreted as an https host. "chrome://settings" navigates the tab to
    // "https://chrome//settings" instead of telling the user it is not allowed.
    it.each(['chrome://settings', 'file:///etc/passwd', 'ftp://host/x', 'mailto:a@b.com'])(
        'rejects the non-http scheme %s instead of mangling it into an https URL',
        async (url) => {
            const result = await h.send({ type: 'CDP_NAVIGATE', tabId: TAB, url });
            expect(result.success).toBe(false);
            expect(result.error).toContain('valid URL');
            expect(h.cdpCalls.some((c) => c.method === 'Page.navigate')).toBe(false);
        }
    );
});

describe('isRestrictedUrl (via GET_TAB_INFO and the attach guard)', () => {
    let h: Harness;

    const restricted = [
        'chrome://settings',
        'chrome-extension://abcdefghijklmnop/page.html',
        'devtools://devtools/bundled/inspector.html',
        'about:srcdoc',
        'edge://settings',
        'https://chromewebstore.google.com/detail/foo',
        'https://chrome.google.com/webstore/detail/foo',
    ];

    const allowed = [
        // Chrome attaches to about:blank happily, and navigating away from a
        // blank tab is the first thing most people do - verified in a real
        // browser before this was allowed.
        'about:blank',
        'https://example.com/',
        'http://example.com/',
        'https://google.com/search?q=x',
        'https://chromewebstore.example.com/',
        'https://notchrome.google.com/webstore',
        'file:///Users/me/page.html',
    ];

    for (const url of restricted) {
        it(`flags ${url} as restricted`, async () => {
            h = await createHarness({ tabUrl: url });
            const info = await h.send({ type: 'GET_TAB_INFO', tabId: TAB });
            expect((info.data as { restricted: boolean }).restricted).toBe(true);
        });
    }

    const blank = ['chrome://newtab/', 'chrome://new-tab-page/', ''];

    for (const url of blank) {
        it(`reports ${JSON.stringify(url)} as blank rather than restricted`, async () => {
            h = await createHarness({ tabUrl: url });
            const info = await h.send({ type: 'GET_TAB_INFO', tabId: TAB });
            const state = info.data as { restricted: boolean; blank: boolean };
            // The panel shows "Open a website in this tab first" for these,
            // which is different from "Chrome blocks automation here".
            expect(state.blank).toBe(true);
            expect(state.restricted).toBe(false);
        });
    }

    for (const url of allowed) {
        it(`does not flag ${url}`, async () => {
            h = await createHarness({ tabUrl: url });
            const info = await h.send({ type: 'GET_TAB_INFO', tabId: TAB });
            expect((info.data as { restricted: boolean }).restricted).toBe(false);
        });
    }

    it('treats an undefined url as blank, and still refuses to act on it', async () => {
        h = await createHarness();
        h.chrome.tabs.get.mockResolvedValue({ id: TAB, windowId: 1, title: 'x' });
        const info = await h.send({ type: 'GET_TAB_INFO', tabId: TAB });
        expect((info.data as { blank: boolean }).blank).toBe(true);

        const result = await h.send({ type: 'CDP_SCREENSHOT', tabId: TAB });
        expect(result.success).toBe(false);
        expect(result.error).toContain('Open a website in this tab first');
    });

    it('refuses to attach on a restricted page with an actionable message', async () => {
        h = await createHarness({ tabUrl: 'chrome://settings' });
        const result = await h.send({ type: 'CDP_SCREENSHOT', tabId: TAB });
        expect(result.success).toBe(false);
        expect(result.error).toContain('Chrome does not allow automation on this page');
        expect(h.chrome.debugger.attach).not.toHaveBeenCalled();
    });

    it('gives the new-tab page its own message', async () => {
        h = await createHarness({ tabUrl: 'chrome://newtab/' });
        const result = await h.send({ type: 'CDP_SCREENSHOT', tabId: TAB });
        expect(result.success).toBe(false);
        expect(result.error).toBe('Open a website in this tab first, then try again.');
    });

    it('refuses to attach when the tab has no url at all', async () => {
        h = await createHarness({ tabUrl: '' });
        const result = await h.send({ type: 'CDP_SCREENSHOT', tabId: TAB });
        expect(result.success).toBe(false);
        expect(result.error).toBe('Open a website in this tab first, then try again.');
    });

    it('refuses to attach to a tab that has gone away', async () => {
        h = await createHarness();
        h.chrome.tabs.get.mockRejectedValue(new Error('No tab with id: 7.'));
        const result = await h.send({ type: 'CDP_SCREENSHOT', tabId: TAB });
        expect(result.success).toBe(false);
        expect(result.error).toBe('That tab is no longer open.');
    });

    // Not covered by isRestrictedUrl - Chrome also blocks these, but the
    // extension only finds out from the attach error.
    it('DOCUMENTS GAP: view-source: is not pre-flagged and reaches chrome.debugger.attach', async () => {
        h = await createHarness({ tabUrl: 'view-source:https://example.com' });
        const info = await h.send({ type: 'GET_TAB_INFO', tabId: TAB });
        expect((info.data as { restricted: boolean }).restricted).toBe(false);
        await h.send({ type: 'CDP_SCREENSHOT', tabId: TAB });
        expect(h.chrome.debugger.attach).toHaveBeenCalled();
    });
});
