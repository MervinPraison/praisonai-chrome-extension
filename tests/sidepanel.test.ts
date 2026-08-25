/**
 * @vitest-environment happy-dom
 *
 * Side panel behaviour, driven against the real sidepanel.html markup that
 * ships in dist/. The panel module captures its elements at import time and
 * runs init() immediately, so each test builds the DOM and the chrome mock
 * first, then imports.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- the chrome global and DOM handles are deliberately loose in tests. */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const HTML = readFileSync(resolve(__dirname, '../src/sidepanel/sidepanel.html'), 'utf8');
const BODY = (HTML.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? '').replace(
    /<script[\s\S]*?<\/script>/gi,
    ''
);

type Msg = Record<string, unknown>;
type Response = { success: boolean; data?: unknown; error?: string };

interface Panel {
    sent: Msg[];
    chrome: Record<string, any>;
    respond: (fn: (m: Msg) => Response | Promise<Response>) => void;
    $: (sel: string) => any;
    $$: (sel: string) => any[];
    text: (sel: string) => string;
}

const DEFAULT_TAB = { id: 5, windowId: 1, url: 'https://example.com/', title: 'Example' };

async function loadPanel(
    options: {
        responder?: (m: Msg) => Response | Promise<Response>;
        tabs?: unknown[];
        windowId?: number | null;
        windowsThrows?: boolean;
    } = {}
): Promise<Panel> {
    vi.resetModules();
    document.body.innerHTML = BODY;

    const sent: Msg[] = [];
    let responder: (m: Msg) => Response | Promise<Response> =
        options.responder ??
        ((m) => {
            if (m.type === 'GET_HISTORY') return { success: true, data: [] };
            if (m.type === 'GET_TAB_INFO') {
                return { success: true, data: { id: 5, url: 'https://example.com/', restricted: false } };
            }
            if (m.type === 'GET_LAST_SCREENSHOT') return { success: true, data: null };
            if (m.type === 'GET_CONSOLE_LOGS') return { success: true, data: [] };
            return { success: true, data: 'ok' };
        });

    const listeners: Record<string, Array<(...a: any[]) => void>> = {};
    const on = (name: string) => ({
        addListener: vi.fn((fn: (...a: any[]) => void) => {
            (listeners[name] ??= []).push(fn);
        }),
    });

    const chromeMock: Record<string, any> = {
        runtime: {
            sendMessage: vi.fn(async (m: Msg) => {
                sent.push(m);
                return responder(m);
            }),
            // The panel holds a port open so the worker detaches every session
            // when the panel closes.
            connect: vi.fn((info?: { name?: string }) => ({
                name: info?.name ?? '',
                disconnect: vi.fn(),
                onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
                onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
                postMessage: vi.fn(),
            })),
            lastError: undefined,
        },
        tabs: {
            query: vi.fn(async () => options.tabs ?? [DEFAULT_TAB]),
            onActivated: on('tabs.onActivated'),
            onUpdated: on('tabs.onUpdated'),
        },
        windows: {
            getCurrent: vi.fn(async () => {
                if (options.windowsThrows) throw new Error('no window');
                return { id: options.windowId === undefined ? 1 : options.windowId };
            }),
        },
    };

    // @ts-expect-error - installing the chrome global for the module under test
    globalThis.chrome = chromeMock;

    await import('../src/sidepanel/index');
    await flush();

    return {
        sent,
        chrome: chromeMock,
        respond(fn) {
            responder = fn;
        },
        $: (sel) => document.querySelector(sel),
        $$: (sel) => Array.from(document.querySelectorAll(sel)),
        text: (sel) => document.querySelector(sel)?.textContent ?? '',
    };
}

async function flush(times = 8): Promise<void> {
    for (let i = 0; i < times; i += 1) {
        await new Promise((r) => setTimeout(r, 0));
    }
}

async function clickAndSettle(el: any): Promise<void> {
    el.click();
    await flush(12);
}

describe('side panel: startup', () => {
    it('renders Ready and the current tab URL', async () => {
        const p = await loadPanel();
        expect(p.text('#status-indicator .status-text')).toBe('Ready');
        expect(p.$('#status-indicator').className).toBe('status-indicator ready');
        expect(p.text('#tab-url')).toBe('https://example.com/');
    });

    it('scopes the tab query to its own window', async () => {
        const p = await loadPanel({ windowId: 7 });
        expect(p.chrome.windows.getCurrent).toHaveBeenCalled();
        expect(p.chrome.tabs.query).toHaveBeenCalledWith({ active: true, windowId: 7 });
    });

    it('falls back to lastFocusedWindow when the window has no id', async () => {
        const p = await loadPanel({ windowId: null });
        expect(p.chrome.tabs.query).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true });
    });

    it('shows "No tab selected" when the window has no active tab', async () => {
        const p = await loadPanel({ tabs: [] });
        expect(p.text('#tab-url')).toBe('No tab selected');
    });

    it('marks a restricted tab and says so', async () => {
        const p = await loadPanel({
            responder: (m) => {
                if (m.type === 'GET_TAB_INFO') {
                    return { success: true, data: { restricted: true, url: 'chrome://settings' } };
                }
                if (m.type === 'GET_HISTORY') return { success: true, data: [] };
                return { success: true, data: null };
            },
        });
        expect(p.$('#tab-url').classList.contains('is-restricted')).toBe(true);
        expect(p.text('#tab-url')).toContain('Chrome blocks automation here');
    });

    it('shows the empty history state', async () => {
        const p = await loadPanel();
        expect(p.text('#history-list')).toContain('No history yet');
    });

    it('restores a recent screenshot taken while the panel was closed', async () => {
        const p = await loadPanel({
            responder: (m) => {
                if (m.type === 'GET_HISTORY') return { success: true, data: [] };
                if (m.type === 'GET_TAB_INFO') return { success: true, data: { restricted: false } };
                if (m.type === 'GET_LAST_SCREENSHOT') {
                    return {
                        success: true,
                        data: { dataUrl: 'data:image/png;base64,QUJD', capturedAt: Date.now() - 1000 },
                    };
                }
                return { success: true, data: null };
            },
        });
        expect(p.$('#screenshot-result').hidden).toBe(false);
        expect(p.$('#screenshot-img').getAttribute('src')).toBe('data:image/png;base64,QUJD');
        expect(p.text('#output-content')).toContain('Screenshot captured at');
    });

    it('ignores a stale screenshot older than five minutes', async () => {
        const p = await loadPanel({
            responder: (m) => {
                if (m.type === 'GET_HISTORY') return { success: true, data: [] };
                if (m.type === 'GET_TAB_INFO') return { success: true, data: { restricted: false } };
                if (m.type === 'GET_LAST_SCREENSHOT') {
                    return {
                        success: true,
                        data: { dataUrl: 'data:image/png;base64,QUJD', capturedAt: Date.now() - 6 * 60 * 1000 },
                    };
                }
                return { success: true, data: null };
            },
        });
        expect(p.$('#screenshot-result').hidden).toBe(true);
    });

    it('only listens to tab events from its own window', async () => {
        const p = await loadPanel({ windowId: 7 });
        expect(p.chrome.tabs.onActivated.addListener).toHaveBeenCalled();
        expect(p.chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
    });
});

describe('side panel: actions', () => {
    let p: Panel;
    beforeEach(async () => {
        p = await loadPanel();
    });

    const cases: Array<[string, string, Msg]> = [
        ['#nav-go', 'CDP_NAVIGATE', { type: 'CDP_NAVIGATE', url: '', tabId: 5 }],
        ['#click-go', 'CDP_CLICK', { type: 'CDP_CLICK', selector: '', tabId: 5 }],
        ['#type-go', 'CDP_TYPE', { type: 'CDP_TYPE', selector: '', text: '', tabId: 5 }],
        ['#eval-go', 'CDP_EVALUATE', { type: 'CDP_EVALUATE', expression: '', tabId: 5 }],
    ];

    for (const [selector, type, shape] of cases) {
        it(`${selector} sends ${type} with the tab id`, async () => {
            await clickAndSettle(p.$(selector));
            const msg = p.sent.find((m) => m.type === type);
            expect(msg).toEqual(shape);
        });
    }

    it('sends the values typed into the inputs', async () => {
        p.$('#nav-url').value = 'example.com';
        p.$('#click-selector').value = '#submit';
        p.$('#type-selector').value = '#q';
        p.$('#type-text').value = 'hello';
        p.$('#eval-code').value = 'document.title';

        await clickAndSettle(p.$('#nav-go'));
        await clickAndSettle(p.$('#click-go'));
        await clickAndSettle(p.$('#type-go'));
        await clickAndSettle(p.$('#eval-go'));

        expect(p.sent.find((m) => m.type === 'CDP_NAVIGATE')).toMatchObject({ url: 'example.com' });
        expect(p.sent.find((m) => m.type === 'CDP_CLICK')).toMatchObject({ selector: '#submit' });
        expect(p.sent.find((m) => m.type === 'CDP_TYPE')).toMatchObject({ selector: '#q', text: 'hello' });
        expect(p.sent.find((m) => m.type === 'CDP_EVALUATE')).toMatchObject({ expression: 'document.title' });
    });

    it('scroll buttons send the right direction', async () => {
        await clickAndSettle(p.$('#scroll-up'));
        await clickAndSettle(p.$('#scroll-down'));
        expect(p.sent.filter((m) => m.type === 'CDP_SCROLL').map((m) => m.direction)).toEqual([
            'up',
            'down',
        ]);
    });

    it('the four tool buttons map to their message types', async () => {
        for (const action of ['screenshot', 'extract', 'console', 'detach']) {
            await clickAndSettle(p.$(`.tool-btn[data-action="${action}"]`));
        }
        const types = p.sent.map((m) => m.type);
        expect(types).toContain('CDP_SCREENSHOT');
        expect(types).toContain('EXTRACT_DATA');
        expect(types).toContain('GET_CONSOLE_LOGS');
        expect(types).toContain('DETACH');
    });

    it('renders an error in the output pane and never as a success', async () => {
        p.respond((m) =>
            m.type === 'CDP_CLICK'
                ? { success: false, error: 'No element matched #nope' }
                : { success: true, data: [] }
        );
        await clickAndSettle(p.$('#click-go'));

        expect(p.text('#output-content')).toBe('No element matched #nope');
        expect(p.$('#output-content').classList.contains('is-error')).toBe(true);
        expect(p.$('#status-indicator').className).toBe('status-indicator error');
        expect(p.text('#status-indicator .status-text')).toBe('Failed');
    });

    it('clears the error state on the next successful action', async () => {
        p.respond((m) =>
            m.type === 'CDP_CLICK' ? { success: false, error: 'nope' } : { success: true, data: 'Scrolled down' }
        );
        await clickAndSettle(p.$('#click-go'));
        expect(p.$('#output-content').classList.contains('is-error')).toBe(true);

        await clickAndSettle(p.$('#scroll-down'));
        expect(p.$('#output-content').classList.contains('is-error')).toBe(false);
        expect(p.text('#output-content')).toBe('Scrolled down');
    });

    it('falls back to a generic message when the worker returns no error text', async () => {
        p.respond(() => ({ success: false }));
        await clickAndSettle(p.$('#scroll-down'));
        expect(p.text('#output-content')).toBe('The action failed.');
    });

    it('reports a dead message channel instead of hanging', async () => {
        p.chrome.runtime.sendMessage.mockRejectedValue(
            new Error('Could not establish connection. Receiving end does not exist.')
        );
        await clickAndSettle(p.$('#scroll-down'));
        expect(p.text('#output-content')).toContain('Receiving end does not exist');
        expect(p.$('#output-content').classList.contains('is-error')).toBe(true);
    });

    it('reports an undefined response instead of claiming success', async () => {
        p.chrome.runtime.sendMessage.mockResolvedValue(undefined);
        await clickAndSettle(p.$('#scroll-down'));
        expect(p.text('#output-content')).toBe('No response from the extension.');
    });

    it('refuses to act when there is no tab', async () => {
        const noTab = await loadPanel({ tabs: [] });
        await clickAndSettle(noTab.$('#scroll-down'));
        expect(noTab.text('#output-content')).toContain('No tab selected');
        expect(noTab.$('#status-indicator').className).toBe('status-indicator error');
        expect(noTab.sent.some((m) => m.type === 'CDP_SCROLL')).toBe(false);
    });

    it('disables the buttons while an action runs and re-enables them after', async () => {
        let release: (r: Response) => void = () => {};
        p.respond((m) => {
            if (m.type === 'GET_HISTORY') return { success: true, data: [] };
            return new Promise<Response>((r) => {
                release = r;
            });
        });

        p.$('#scroll-down').click();
        await flush(2);
        expect(p.$('#scroll-down').disabled).toBe(true);
        expect(p.$('.tool-btn[data-action="screenshot"]').disabled).toBe(true);

        release({ success: true, data: 'Scrolled down' });
        await flush(12);
        expect(p.$('#scroll-down').disabled).toBe(false);
        expect(p.$('.tool-btn[data-action="screenshot"]').disabled).toBe(false);
    });

    it('re-enables the buttons even when the action fails', async () => {
        p.chrome.runtime.sendMessage.mockRejectedValue(new Error('boom'));
        await clickAndSettle(p.$('#scroll-down'));
        expect(p.$('#scroll-down').disabled).toBe(false);
    });
});

describe('side panel: output formatting', () => {
    it('pretty-prints an object result from Run JavaScript', async () => {
        const p = await loadPanel({
            responder: (m) =>
                m.type === 'CDP_EVALUATE'
                    ? { success: true, data: { a: 1, b: [2, 3] } }
                    : { success: true, data: [] },
        });
        await clickAndSettle(p.$('#eval-go'));
        expect(p.text('#output-content')).toBe(JSON.stringify({ a: 1, b: [2, 3] }, null, 2));
    });

    it('renders null and undefined results literally', async () => {
        const p = await loadPanel({
            responder: (m) => (m.type === 'CDP_EVALUATE' ? { success: true, data: null } : { success: true, data: [] }),
        });
        await clickAndSettle(p.$('#eval-go'));
        expect(p.text('#output-content')).toBe('null');
    });

    it('shows the Extract Data JSON as-is', async () => {
        const json = '{\n  "title": "Example"\n}';
        const p = await loadPanel({
            responder: (m) =>
                m.type === 'EXTRACT_DATA' ? { success: true, data: json } : { success: true, data: [] },
        });
        await clickAndSettle(p.$('.tool-btn[data-action="extract"]'));
        expect(p.text('#output-content')).toBe(json);
    });

    it('formats console logs as [level] text', async () => {
        const p = await loadPanel({
            responder: (m) =>
                m.type === 'GET_CONSOLE_LOGS'
                    ? {
                          success: true,
                          data: [
                              { level: 'error', text: 'boom' },
                              { level: 'log', text: 'hello' },
                          ],
                      }
                    : { success: true, data: [] },
        });
        await clickAndSettle(p.$('.tool-btn[data-action="console"]'));
        expect(p.text('#output-content')).toBe('[error] boom\n[log] hello');
    });

    it('explains an empty console instead of showing a blank box', async () => {
        const p = await loadPanel({
            responder: (m) =>
                m.type === 'GET_CONSOLE_LOGS' ? { success: true, data: [] } : { success: true, data: [] },
        });
        await clickAndSettle(p.$('.tool-btn[data-action="console"]'));
        expect(p.text('#output-content')).toContain('No console output yet');
        expect(p.$('#output-content').classList.contains('is-error')).toBe(false);
    });

    it('reports the outcome the worker gives, not a fixed confirmation', async () => {
        // The worker distinguishes ending a live session from finding none
        // attached; the panel must not paper over that with one string.
        const ended = await loadPanel({
            responder: (m) =>
                m.type === 'DETACH'
                    ? { success: true, data: 'Session ended. The debugging banner is gone.' }
                    : { success: true, data: [] },
        });
        await clickAndSettle(ended.$('.tool-btn[data-action="detach"]'));
        expect(ended.text('#output-content')).toContain('Session ended');

        const none = await loadPanel({
            responder: (m) =>
                m.type === 'DETACH'
                    ? { success: true, data: 'No active session on this tab.' }
                    : { success: true, data: [] },
        });
        await clickAndSettle(none.$('.tool-btn[data-action="detach"]'));
        expect(none.text('#output-content')).toContain('No active session');
    });

    it('shows the End Session failure instead of claiming it worked', async () => {
        const p = await loadPanel({
            responder: (m) =>
                m.type === 'DETACH'
                    ? { success: false, error: 'Something else went wrong' }
                    : { success: true, data: [] },
        });
        await clickAndSettle(p.$('.tool-btn[data-action="detach"]'));
        expect(p.text('#output-content')).toBe('Something else went wrong');
        expect(p.$('#output-content').classList.contains('is-error')).toBe(true);
    });
});

describe('side panel: screenshot', () => {
    async function panelWithShot(data = 'QUJD') {
        return loadPanel({
            responder: (m) =>
                m.type === 'CDP_SCREENSHOT'
                    ? { success: true, data: `data:image/png;base64,${data}` }
                    : { success: true, data: [] },
        });
    }

    it('shows the image and reveals the result block', async () => {
        const p = await panelWithShot();
        await clickAndSettle(p.$('.tool-btn[data-action="screenshot"]'));
        expect(p.$('#screenshot-result').hidden).toBe(false);
        expect(p.$('#screenshot-img').getAttribute('src')).toBe('data:image/png;base64,QUJD');
        expect(p.text('#output-content')).toBe('Screenshot captured.');
    });

    it('offers a timestamped .png download from a blob URL', async () => {
        const p = await panelWithShot();
        await clickAndSettle(p.$('.tool-btn[data-action="screenshot"]'));
        const link = p.$('#screenshot-save');
        expect(link.getAttribute('download')).toMatch(/^screenshot-.*\.png$/);
        expect(link.getAttribute('href')).toMatch(/^blob:/);
    });

    it('falls back to the data URL when the base64 cannot be decoded', async () => {
        const p = await loadPanel({
            responder: (m) =>
                m.type === 'CDP_SCREENSHOT'
                    ? { success: true, data: 'data:image/png;base64,!!!not-base64!!!' }
                    : { success: true, data: [] },
        });
        await clickAndSettle(p.$('.tool-btn[data-action="screenshot"]'));
        expect(p.$('#screenshot-save').getAttribute('href')).toContain('data:image/png;base64,');
        expect(p.$('#screenshot-result').hidden).toBe(false);
    });

    it('hides the previous screenshot when a later action fails', async () => {
        const p = await panelWithShot();
        await clickAndSettle(p.$('.tool-btn[data-action="screenshot"]'));
        expect(p.$('#screenshot-result').hidden).toBe(false);

        p.respond(() => ({ success: false, error: 'nope' }));
        await clickAndSettle(p.$('#scroll-down'));
        expect(p.$('#screenshot-result').hidden).toBe(true);
    });

    it('reports a screenshot failure rather than showing a broken image', async () => {
        const p = await loadPanel({
            responder: (m) =>
                m.type === 'CDP_SCREENSHOT'
                    ? { success: false, error: 'Chrome does not allow automation on this page.' }
                    : { success: true, data: [] },
        });
        await clickAndSettle(p.$('.tool-btn[data-action="screenshot"]'));
        expect(p.$('#screenshot-result').hidden).toBe(true);
        expect(p.text('#output-content')).toContain('Chrome does not allow automation');
    });
});

describe('side panel: history tab', () => {
    const entries = [
        { action: 'Navigate', detail: 'https://b.example/', at: 1700000002000 },
        { action: 'Click', detail: '#go', at: 1700000001000 },
    ];

    async function panelWithHistory(data: unknown = entries) {
        return loadPanel({
            responder: (m) => {
                if (m.type === 'GET_HISTORY') return { success: true, data };
                if (m.type === 'GET_TAB_INFO') return { success: true, data: { restricted: false } };
                return { success: true, data: null };
            },
        });
    }

    it('renders one row per entry, in the order supplied', async () => {
        const p = await panelWithHistory();
        const rows = p.$$('#history-list .history-item');
        expect(rows).toHaveLength(2);
        expect(rows[0].querySelector('.history-action').textContent).toBe('Navigate');
        expect(rows[0].querySelector('.history-detail').textContent).toBe('https://b.example/');
        expect(rows[1].querySelector('.history-action').textContent).toBe('Click');
        expect(rows[0].querySelector('.history-time').textContent).toBeTruthy();
    });

    it('escapes entry text rather than injecting it as HTML', async () => {
        const p = await panelWithHistory([
            { action: 'Run JavaScript', detail: '<img src=x onerror=alert(1)>', at: 1700000000000 },
        ]);
        const detail = p.$('#history-list .history-detail');
        expect(detail.textContent).toBe('<img src=x onerror=alert(1)>');
        expect(p.$('#history-list').querySelector('img')).toBeNull();
    });

    it('switches to the History tab and marks it active', async () => {
        const p = await panelWithHistory();
        p.$('.mode-tab[data-mode="history"]').click();
        await flush();
        expect(p.$('.mode-tab[data-mode="history"]').classList.contains('active')).toBe(true);
        expect(p.$('.mode-tab[data-mode="tools"]').classList.contains('active')).toBe(false);
        expect(p.$('#mode-history').classList.contains('active')).toBe(true);
        expect(p.$('#mode-tools').classList.contains('active')).toBe(false);
    });

    it('switches back to Tools', async () => {
        const p = await panelWithHistory();
        p.$('.mode-tab[data-mode="history"]').click();
        await flush();
        p.$('.mode-tab[data-mode="tools"]').click();
        await flush();
        expect(p.$('#mode-tools').classList.contains('active')).toBe(true);
        expect(p.$('#mode-history').classList.contains('active')).toBe(false);
    });

    it('reloads history when the History tab is opened', async () => {
        const p = await panelWithHistory();
        const before = p.sent.filter((m) => m.type === 'GET_HISTORY').length;
        p.$('.mode-tab[data-mode="history"]').click();
        await flush();
        expect(p.sent.filter((m) => m.type === 'GET_HISTORY').length).toBeGreaterThan(before);
    });

    it('clear history sends CLEAR_HISTORY and re-renders the empty state', async () => {
        let cleared = false;
        const p = await loadPanel({
            responder: (m) => {
                if (m.type === 'CLEAR_HISTORY') {
                    cleared = true;
                    return { success: true, data: 'History cleared' };
                }
                if (m.type === 'GET_HISTORY') return { success: true, data: cleared ? [] : entries };
                if (m.type === 'GET_TAB_INFO') return { success: true, data: { restricted: false } };
                return { success: true, data: null };
            },
        });
        expect(p.$$('#history-list .history-item')).toHaveLength(2);

        await clickAndSettle(p.$('#clear-history'));
        expect(cleared).toBe(true);
        expect(p.text('#history-list')).toContain('No history yet');
    });

    it('refreshes history after every action', async () => {
        const p = await panelWithHistory();
        const before = p.sent.filter((m) => m.type === 'GET_HISTORY').length;
        await clickAndSettle(p.$('#scroll-down'));
        expect(p.sent.filter((m) => m.type === 'GET_HISTORY').length).toBe(before + 1);
    });
});

describe('side panel: markup and stylesheet cover what the JS toggles', () => {
    const CSS = readFileSync(resolve(__dirname, '../src/sidepanel/styles.css'), 'utf8');

    it('every element id the panel looks up exists in the markup', async () => {
        await loadPanel();
        const ids = [
            'status-indicator',
            'tab-url',
            'output-content',
            'screenshot-result',
            'screenshot-img',
            'screenshot-save',
            'history-list',
            'nav-url',
            'click-selector',
            'type-selector',
            'type-text',
            'eval-code',
            'nav-go',
            'click-go',
            'type-go',
            'eval-go',
            'scroll-up',
            'scroll-down',
            'clear-history',
            'mode-tools',
            'mode-history',
        ];
        for (const id of ids) {
            expect(document.getElementById(id), `#${id} missing from sidepanel.html`).not.toBeNull();
        }
        expect(document.querySelector('#status-indicator .status-text')).not.toBeNull();
    });

    it('every data-action button has a handler branch', async () => {
        await loadPanel();
        const actions = Array.from(document.querySelectorAll('.tool-btn')).map(
            (b) => (b as HTMLElement).dataset.action
        );
        expect(actions.sort()).toEqual(['console', 'detach', 'extract', 'screenshot']);
    });

    it('the stylesheet defines every class the panel toggles', () => {
        const toggled = [
            '.status-indicator.busy',
            '.status-indicator.error',
            '.tab-url.is-restricted',
            '.mode-tab.active',
            '.mode-content.active',
            '.history-item',
            '.history-action',
            '.history-detail',
            '.history-time',
            '.empty-state',
            '.screenshot-result',
        ];
        for (const rule of toggled) {
            expect(CSS, `${rule} has no rule in styles.css`).toContain(rule);
        }
        // is-error is written as `.tool-output pre.is-error`
        expect(CSS).toMatch(/pre\.is-error/);
    });

    /**
     * BUG, confirmed by computed style in real headless Chrome:
     * `.screenshot-result { display: flex }` is an author-origin rule and so
     * beats the user-agent `[hidden] { display: none }` rule. The panel's
     * `elements.screenshotResult.hidden = true` therefore paints nothing:
     *
     *   getComputedStyle(.screenshot-result[hidden]).display === "flex"
     *   getComputedStyle(div[hidden]).display               === "none"
     *
     * On a clean profile the panel opens with a 468x61 empty screenshot block
     * and a live 90x30 "Save image" button whose href is null, and a stale
     * screenshot stays on screen underneath a later error message - which is
     * exactly what setOutput() sets `hidden` in order to prevent.
     */
    it('restores the [hidden] behaviour that an author display rule would defeat', () => {
        // .screenshot-result sets display:flex, which as an author-origin rule
        // outranks the user-agent [hidden] rule - so the block (and its
        // href-less "Save image" button) stayed visible on a clean profile.
        expect(CSS).toMatch(/\.screenshot-result\s*\{[^}]*display:\s*flex/);
        expect(CSS).toMatch(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
    });

    it('hides the save link until a screenshot gives it an href', () => {
        expect(HTML).toMatch(/id="screenshot-save"/);
        expect(HTML).not.toMatch(/id="screenshot-save"[^>]*href=/);
        // The container is hidden in the markup, and the [hidden] rule above
        // is what makes that stick.
        expect(HTML).toMatch(/id="screenshot-result"[^>]*hidden/);
    });

    /**
     * setControlsDisabled() disables `.tool-btn` as well as `.btn`, so both
     * need a disabled appearance or the panel looks interactive mid-action.
     */
    it('dims tool buttons while they are disabled', () => {
        expect(CSS).toContain('.btn:disabled');
        expect(CSS).toContain('.tool-btn:disabled');
        // ...and does not let hover re-light a disabled one.
        expect(CSS).toContain('.tool-btn:disabled:hover');
    });
});
