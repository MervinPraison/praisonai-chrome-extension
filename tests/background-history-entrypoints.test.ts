/**
 * History storage, plus the non-panel entry points: the two context menu items
 * and the two keyboard commands.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createHarness, type Harness } from './harness';

const TAB = 31;

type Entry = { action: string; detail: string; at: number };

async function history(h: Harness): Promise<Entry[]> {
    return (await h.send({ type: 'GET_HISTORY' })).data as Entry[];
}

/** Poll until `check` is true, for fire-and-forget handlers. */
async function waitUntil(check: () => boolean, ms = 2000): Promise<void> {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        if (check()) return;
        await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('waitUntil timed out');
}

describe('history', () => {
    let h: Harness;
    beforeEach(async () => {
        h = await createHarness();
    });

    it('is empty on a clean profile', async () => {
        expect(await history(h)).toEqual([]);
    });

    it('appends one entry per successful action', async () => {
        await h.send({ type: 'CDP_NAVIGATE', tabId: TAB, url: 'example.com' });
        await h.send({ type: 'CDP_CLICK', tabId: TAB, selector: '#go' });
        await h.send({ type: 'CDP_TYPE', tabId: TAB, selector: '#q', text: 'hi' });
        await h.send({ type: 'CDP_EVALUATE', tabId: TAB, expression: 'document.title' });
        await h.send({ type: 'CDP_SCREENSHOT', tabId: TAB });
        await h.send({ type: 'EXTRACT_DATA', tabId: TAB });

        expect((await history(h)).map((e) => e.action)).toEqual([
            'Extract Data',
            'Screenshot',
            'Run JavaScript',
            'Type',
            'Click',
            'Navigate',
        ]);
    });

    it('stores newest first', async () => {
        await h.send({ type: 'CDP_EVALUATE', tabId: TAB, expression: 'one' });
        await h.send({ type: 'CDP_EVALUATE', tabId: TAB, expression: 'two' });
        const entries = await history(h);
        expect(entries[0].detail).toBe('two');
        expect(entries[1].detail).toBe('one');
        expect(entries[0].at).toBeGreaterThanOrEqual(entries[1].at);
    });

    it('records the detail the user typed', async () => {
        await h.send({ type: 'CDP_CLICK', tabId: TAB, selector: '.btn-primary' });
        expect((await history(h))[0]).toMatchObject({ action: 'Click', detail: '.btn-primary' });
    });

    it('caps at 50 entries, discarding the oldest', async () => {
        const seeded: Entry[] = Array.from({ length: 55 }, (_, i) => ({
            action: 'Seed',
            detail: `s${i}`,
            at: 1000 + i,
        }));
        h.local.store.set('history', seeded);

        await h.send({ type: 'CDP_EVALUATE', tabId: TAB, expression: 'newest' });

        const entries = await history(h);
        expect(entries).toHaveLength(50);
        expect(entries[0].detail).toBe('newest');
        expect(entries[1].detail).toBe('s0');
        expect(entries[49].detail).toBe('s48');
        expect(entries.some((e) => e.detail === 's54')).toBe(false);
    });

    it('stays at the cap over repeated actions', async () => {
        h.local.store.set(
            'history',
            Array.from({ length: 50 }, (_, i) => ({ action: 'Seed', detail: `s${i}`, at: i }))
        );
        for (let i = 0; i < 5; i += 1) {
            await h.send({ type: 'CDP_EVALUATE', tabId: TAB, expression: `e${i}` });
            expect(await history(h)).toHaveLength(50);
        }
        expect((await history(h))[0].detail).toBe('e4');
    });

    it('clears', async () => {
        await h.send({ type: 'CDP_EVALUATE', tabId: TAB, expression: 'x' });
        expect(await history(h)).toHaveLength(1);

        const cleared = await h.send({ type: 'CLEAR_HISTORY' });
        expect(cleared.success).toBe(true);
        expect(cleared.data).toBe('History cleared');
        expect(await history(h)).toEqual([]);
        expect(h.local.store.has('history')).toBe(false);
    });

    it('clearing an already empty history succeeds', async () => {
        expect((await h.send({ type: 'CLEAR_HISTORY' })).success).toBe(true);
    });

    it('does not record failed actions', async () => {
        h.onCdp('Page.navigate', () => ({ frameId: 'f', errorText: 'net::ERR_ABORTED' }));
        await h.send({ type: 'CDP_NAVIGATE', tabId: TAB, url: 'example.com' });
        expect(await history(h)).toEqual([]);
    });

    /**
     * Scroll is the only advertised action that writes no history entry, so a
     * scroll never shows up in the History tab. Deliberate or not, it is a
     * visible inconsistency with the other five actions.
     */
    it('records a Scroll in history like every other action', async () => {
        const result = await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        expect(result.success).toBe(true);
        const entries = await history(h);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ action: 'Scroll', detail: 'down' });
    });

    it('does not record End Session or Console Logs, which are not page actions', async () => {
        await h.send({ type: 'GET_CONSOLE_LOGS', tabId: TAB });
        await h.send({ type: 'DETACH', tabId: TAB });
        expect(await history(h)).toEqual([]);
    });
});

describe('context menus', () => {
    let h: Harness;
    beforeEach(async () => {
        h = await createHarness();
    });

    it('registers exactly two "all" context items on install', async () => {
        h.fireInstalled();
        expect(h.chrome.contextMenus.removeAll).toHaveBeenCalled();
        expect(h.chrome.contextMenus.create).toHaveBeenCalledTimes(2);
        expect(h.chrome.contextMenus.create).toHaveBeenCalledWith({
            id: 'praisonai-screenshot',
            title: 'Capture screenshot',
            contexts: ['all'],
        });
        expect(h.chrome.contextMenus.create).toHaveBeenCalledWith({
            id: 'praisonai-open-panel',
            title: 'Open PraisonAI panel',
            contexts: ['all'],
        });
    });

    it('removeAll runs before create, so a reinstall cannot duplicate the items', async () => {
        const order: string[] = [];
        h.chrome.contextMenus.removeAll.mockImplementation((cb?: () => void) => {
            order.push('removeAll');
            cb?.();
        });
        h.chrome.contextMenus.create.mockImplementation(() => {
            order.push('create');
        });
        h.fireInstalled();
        expect(order).toEqual(['removeAll', 'create', 'create']);
    });

    it('"Open PraisonAI panel" opens the panel synchronously, keeping the user gesture', async () => {
        h.fireContextMenu({ menuItemId: 'praisonai-open-panel' }, { id: TAB, windowId: 3 });
        // Asserted with no await: the call must happen in the same task.
        expect(h.chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 3 });
    });

    it('"Capture screenshot" does not open the panel', async () => {
        h.fireContextMenu({ menuItemId: 'praisonai-screenshot' }, { id: TAB, windowId: 3 });
        expect(h.chrome.sidePanel.open).not.toHaveBeenCalled();
        await waitUntil(() => h.chrome.notifications.create.mock.calls.length > 0);
    });

    it('"Capture screenshot" captures, records history and notifies', async () => {
        h.onCdp('Page.captureScreenshot', () => ({ data: 'QUJD' }));
        h.fireContextMenu({ menuItemId: 'praisonai-screenshot' }, { id: TAB, windowId: 3 });

        await waitUntil(() => h.chrome.notifications.create.mock.calls.length > 0);

        expect(h.session.store.get('lastScreenshot')).toMatchObject({
            dataUrl: 'data:image/png;base64,QUJD',
        });
        expect((await history(h)).map((e) => e.action)).toEqual(['Screenshot']);
        expect(h.chrome.notifications.create).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'basic',
                title: 'Screenshot captured',
                message: 'Open the PraisonAI panel to view and save it.',
            })
        );
    });

    it('notifies the real reason when the capture fails', async () => {
        h.chrome.tabs.get.mockResolvedValue({ id: TAB, windowId: 3, url: 'chrome://settings' });
        h.fireContextMenu({ menuItemId: 'praisonai-screenshot' }, { id: TAB, windowId: 3 });

        await waitUntil(() => h.chrome.notifications.create.mock.calls.length > 0);

        const arg = h.chrome.notifications.create.mock.calls[0][0];
        expect(arg.title).toBe('Screenshot failed');
        expect(arg.message).toContain('Chrome does not allow automation on this page');
        expect(await history(h)).toEqual([]);
    });

    it('never claims the image was saved to disk', async () => {
        h.fireContextMenu({ menuItemId: 'praisonai-screenshot' }, { id: TAB, windowId: 3 });
        await waitUntil(() => h.chrome.notifications.create.mock.calls.length > 0);
        const arg = h.chrome.notifications.create.mock.calls[0][0];
        expect(`${arg.title} ${arg.message}`.toLowerCase()).not.toContain('saved');
    });

    /**
     * `contexts: ['all']` also puts both items on surfaces where onClicked gets
     * no tab (Chrome documents `tab` as optional). Both handlers bail out with
     * no feedback at all - no notification, no panel.
     */
    it('tells the user when Chrome supplied no tab, instead of doing nothing', async () => {
        h.fireContextMenu({ menuItemId: 'praisonai-screenshot' }, undefined);
        await new Promise((r) => setTimeout(r, 50));
        expect(h.chrome.notifications.create).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Screenshot failed' })
        );
        expect(h.chrome.sidePanel.open).not.toHaveBeenCalled();
    });

    it('DOCUMENTS BUG: a click on a tab with no windowId does not open the panel', async () => {
        h.fireContextMenu({ menuItemId: 'praisonai-open-panel' }, { id: TAB });
        expect(h.chrome.sidePanel.open).not.toHaveBeenCalled();
    });

    it('an unknown menu id opens the panel and takes no screenshot', async () => {
        h.fireContextMenu({ menuItemId: 'something-else' }, { id: TAB, windowId: 3 });
        expect(h.chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 3 });
        await new Promise((r) => setTimeout(r, 50));
        expect(h.chrome.notifications.create).not.toHaveBeenCalled();
    });
});

describe('keyboard commands', () => {
    let h: Harness;
    beforeEach(async () => {
        h = await createHarness();
    });

    it('sets openPanelOnActionClick so the toolbar icon opens the panel', async () => {
        expect(h.chrome.sidePanel.setPanelBehavior).toHaveBeenCalledWith({
            openPanelOnActionClick: true,
        });
    });

    it('open-panel opens the panel for the command tab window, synchronously', async () => {
        const fn = h.listeners['commands.onCommand'][0];
        void fn('open-panel', { id: TAB, windowId: 9 });
        expect(h.chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 9 });
    });

    it('open-panel takes no screenshot', async () => {
        await h.fireCommand('open-panel', { id: TAB, windowId: 9 });
        expect(h.cdpCalls.some((c) => c.method === 'Page.captureScreenshot')).toBe(false);
        expect(h.chrome.notifications.create).not.toHaveBeenCalled();
    });

    it('open-panel with no tab does not throw', async () => {
        await expect(h.fireCommand('open-panel', undefined)).resolves.toBeUndefined();
        expect(h.chrome.sidePanel.open).not.toHaveBeenCalled();
    });

    it('capture-screenshot captures, stores, records history and notifies', async () => {
        h.onCdp('Page.captureScreenshot', () => ({ data: 'QUJD' }));
        await h.fireCommand('capture-screenshot', { id: TAB, windowId: 9 });

        expect(h.session.store.get('lastScreenshot')).toMatchObject({
            dataUrl: 'data:image/png;base64,QUJD',
        });
        expect((await history(h)).map((e) => e.action)).toEqual(['Screenshot']);
        expect(h.chrome.notifications.create).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Screenshot captured' })
        );
    });

    it('capture-screenshot notifies on failure', async () => {
        h.onCdp('Page.captureScreenshot', () => {
            throw new Error('Not attached to the target');
        });
        await h.fireCommand('capture-screenshot', { id: TAB, windowId: 9 });
        expect(h.chrome.notifications.create).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Screenshot failed' })
        );
        expect(await history(h)).toEqual([]);
    });

    it('capture-screenshot does not open the side panel', async () => {
        await h.fireCommand('capture-screenshot', { id: TAB, windowId: 9 });
        expect(h.chrome.sidePanel.open).not.toHaveBeenCalled();
    });

    it('ignores an unknown command', async () => {
        await h.fireCommand('not-a-command', { id: TAB, windowId: 9 });
        expect(h.chrome.sidePanel.open).not.toHaveBeenCalled();
        expect(h.chrome.notifications.create).not.toHaveBeenCalled();
    });

    it('reports rather than no-ops when the shortcut fires with no tab', async () => {
        await h.fireCommand('capture-screenshot', undefined);
        expect(h.chrome.notifications.create).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Screenshot failed' })
        );
    });

    it('degrades gracefully when chrome.notifications is unavailable', async () => {
        delete h.chrome.notifications.create;
        await expect(h.fireCommand('capture-screenshot', { id: TAB, windowId: 9 })).resolves.toBeUndefined();
        expect(h.session.store.has('lastScreenshot')).toBe(true);
    });
});
