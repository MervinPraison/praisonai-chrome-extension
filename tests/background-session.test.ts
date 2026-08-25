/**
 * CDP session lifecycle in the background worker:
 * attach, reuse, the "already attached" recovery, concurrency, detach
 * reporting and behaviour after a simulated service-worker restart.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createHarness, type Harness } from './harness';

const TAB = 11;

describe('CDP session lifecycle', () => {
    let h: Harness;

    beforeEach(async () => {
        h = await createHarness();
    });

    it('attaches once and reuses the session for later actions', async () => {
        await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'up' });
        await h.send({ type: 'CDP_EVALUATE', tabId: TAB, expression: '1' });

        expect(h.chrome.debugger.attach).toHaveBeenCalledTimes(1);
        expect(h.chrome.debugger.attach).toHaveBeenCalledWith({ tabId: TAB }, '1.3');
    });

    it('enables the domains the shipped tools need, including Log for console capture', async () => {
        await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        const enabled = h.cdpCalls.filter((c) => c.method.endsWith('.enable')).map((c) => c.method);
        expect(enabled).toEqual(['DOM.enable', 'Page.enable', 'Runtime.enable', 'Log.enable']);
    });

    it('keeps separate sessions for separate tabs', async () => {
        await h.send({ type: 'CDP_SCROLL', tabId: 1, direction: 'down' });
        await h.send({ type: 'CDP_SCROLL', tabId: 2, direction: 'down' });
        expect(h.chrome.debugger.attach).toHaveBeenCalledTimes(2);
        expect(h.chrome.debugger.attach).toHaveBeenCalledWith({ tabId: 1 }, '1.3');
        expect(h.chrome.debugger.attach).toHaveBeenCalledWith({ tabId: 2 }, '1.3');
    });

    // ------------------------------------------------ already-attached recovery

    it('recovers from "Another debugger is already attached" by detaching and retrying', async () => {
        let attempts = 0;
        h.chrome.debugger.attach.mockImplementation(async () => {
            attempts += 1;
            if (attempts === 1) {
                throw new Error('Another debugger is already attached to the tab with id: 11.');
            }
        });

        const result = await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });

        expect(result.success).toBe(true);
        expect(attempts).toBe(2);
        expect(h.chrome.debugger.detach).toHaveBeenCalledWith({ tabId: TAB });
    });

    it('gives up with the real Chrome message when the retry also fails', async () => {
        h.chrome.debugger.attach.mockRejectedValue(
            new Error('Another debugger is already attached to the tab with id: 11.')
        );
        const result = await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('already attached');
        expect(h.chrome.debugger.attach).toHaveBeenCalledTimes(2);
    });

    it('does not retry an unrelated attach failure', async () => {
        h.chrome.debugger.attach.mockRejectedValue(new Error('Cannot attach to this target.'));
        const result = await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('Cannot attach to this target.');
        expect(h.chrome.debugger.attach).toHaveBeenCalledTimes(1);
    });

    it('the recovery detach does not wipe the session that replaces it', async () => {
        let attempts = 0;
        h.chrome.debugger.attach.mockImplementation(async () => {
            attempts += 1;
            if (attempts === 1) {
                throw new Error('Another debugger is already attached to the tab with id: 11.');
            }
        });
        // Chrome fires onDetach as a consequence of the recovery detach.
        h.chrome.debugger.detach.mockImplementation(async () => {
            h.emitDetach(TAB, 'canceled_by_user');
        });

        await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        // A follow-up action must find the session still registered.
        await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'up' });

        expect(attempts).toBe(2);
        expect(h.chrome.debugger.attach).toHaveBeenCalledTimes(2);
    });

    // ---------------------------------------------------------------- concurrency

    it('two concurrent actions on one tab share a single attach', async () => {
        const a = h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        const b = h.send({ type: 'CDP_EVALUATE', tabId: TAB, expression: 'document.title' });
        const [ra, rb] = await Promise.all([a, b]);

        expect(ra.success).toBe(true);
        expect(rb.success).toBe(true);
        expect(h.chrome.debugger.attach).toHaveBeenCalledTimes(1);
        expect(h.chrome.debugger.detach).not.toHaveBeenCalled();
    });

    it('five concurrent actions still attach only once', async () => {
        const all = await Promise.all(
            Array.from({ length: 5 }, () => h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' }))
        );
        expect(all.every((r) => r.success)).toBe(true);
        expect(h.chrome.debugger.attach).toHaveBeenCalledTimes(1);
        const enables = h.cdpCalls.filter((c) => c.method === 'Log.enable');
        expect(enables).toHaveLength(1);
    });

    it('a failing concurrent attach fails every waiter with the same error', async () => {
        h.chrome.debugger.attach.mockRejectedValue(new Error('Cannot access contents of the page.'));
        const results = await Promise.all([
            h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' }),
            h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'up' }),
        ]);
        for (const r of results) {
            expect(r.success).toBe(false);
            expect(r.error).toContain('Cannot access contents of the page.');
        }
    });

    it('a failed attach is not cached - the next action tries again', async () => {
        h.chrome.debugger.attach.mockRejectedValueOnce(new Error('Transient failure'));
        const first = await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        expect(first.success).toBe(false);
        const second = await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        expect(second.success).toBe(true);
    });

    // ------------------------------------------------------------------- detach

    it('an external detach makes the next action re-attach', async () => {
        await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        expect(h.chrome.debugger.attach).toHaveBeenCalledTimes(1);

        // User clicked "Cancel" on the debugging banner, or opened DevTools.
        h.emitDetach(TAB, 'canceled_by_user');

        const result = await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        expect(result.success).toBe(true);
        expect(h.chrome.debugger.attach).toHaveBeenCalledTimes(2);
    });

    it('ignores onDetach for a tabless debuggee', async () => {
        await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        for (const fn of h.listeners['debugger.onDetach'] ?? []) {
            fn({ targetId: 'abc' }, 'target_closed');
        }
        await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        expect(h.chrome.debugger.attach).toHaveBeenCalledTimes(1);
    });

    it('closing the tab drops its session and its console buffer', async () => {
        await h.send({ type: 'GET_CONSOLE_LOGS', tabId: TAB });
        h.emitCdpEvent(TAB, 'Log.entryAdded', { entry: { level: 'error', text: 'boom' } });
        h.session.store.set(`console:${TAB}`, [{ level: 'error', text: 'boom' }]);

        h.emitTabRemoved(TAB);

        expect(h.session.store.has(`console:${TAB}`)).toBe(false);
        // A new action on a re-used id must attach afresh.
        await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        expect(h.chrome.debugger.attach).toHaveBeenCalledTimes(2);
    });

    it('DETACH reports the end of a live session and is idempotent', async () => {
        await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        const first = await h.send({ type: 'DETACH', tabId: TAB });
        expect(first.success).toBe(true);

        h.chrome.debugger.detach.mockRejectedValue(
            new Error('Debugger is not attached to the tab with id: 11.')
        );
        const second = await h.send({ type: 'DETACH', tabId: TAB });
        expect(second.success).toBe(true);
        expect(second.data).toBe('No active session on this tab.');
    });

    it('after DETACH the next action attaches again', async () => {
        await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        await h.send({ type: 'DETACH', tabId: TAB });
        const result = await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        expect(result.success).toBe(true);
        expect(h.chrome.debugger.attach).toHaveBeenCalledTimes(2);
    });

    it('does not report "no active session" after successfully ending one', async () => {
        // Regression, found in a real browser: detaching through the client
        // already releases the debuggee, so the follow-up chrome.debugger.detach
        // threw "not attached" and the panel announced "No active session on
        // this tab." for a session it had just ended.
        await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });

        let calls = 0;
        h.chrome.debugger.detach.mockImplementation(async () => {
            calls += 1;
            if (calls > 1) {
                throw new Error('Debugger is not attached to the tab with id: 11.');
            }
        });

        const result = await h.send({ type: 'DETACH', tabId: TAB });
        expect(result.success).toBe(true);
        expect(result.data).toContain('Session ended');
        expect(result.data).not.toContain('No active session');
    });

    it('DETACH does not require a prior session (End Session on a cold worker)', async () => {
        const result = await h.send({ type: 'DETACH', tabId: TAB });
        expect(result.success).toBe(true);
        expect(h.chrome.debugger.detach).toHaveBeenCalledWith({ tabId: TAB });
    });
});

describe('the persisted attached-tab set', () => {
    const TAB_B = TAB + 1;

    async function attachedIds(h: Harness): Promise<number[]> {
        const ids = h.session.store.get('attachedTabs');
        return Array.isArray(ids) ? (ids as number[]) : [];
    }

    it('records a tab on attach and clears it on detach', async () => {
        const h = await createHarness();
        await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        expect(await attachedIds(h)).toContain(TAB);

        await h.send({ type: 'DETACH', tabId: TAB });
        expect(await attachedIds(h)).not.toContain(TAB);
    });

    it('keeps every tab when two attach concurrently', async () => {
        // Regression: the read-modify-write on session storage was not
        // serialised, so simultaneous attaches read the same list and the
        // second write dropped the first tab's id - which is exactly the
        // scenario the persisted set exists to survive.
        const h = await createHarness();
        await Promise.all([
            h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' }),
            h.send({ type: 'CDP_SCROLL', tabId: TAB_B, direction: 'down' }),
        ]);

        const ids = await attachedIds(h);
        expect(ids).toContain(TAB);
        expect(ids).toContain(TAB_B);
    });

    it('does not leave a stale id behind when Chrome detaches externally', async () => {
        const h = await createHarness();
        await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        expect(await attachedIds(h)).toContain(TAB);

        // The user dismissed the debugging banner.
        h.emitDetach(TAB);
        await new Promise((r) => setTimeout(r, 20));
        expect(await attachedIds(h)).not.toContain(TAB);
    });

    it('does not leave a stale id behind when the tab is closed', async () => {
        const h = await createHarness();
        await h.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });

        h.emitTabRemoved(TAB);
        await new Promise((r) => setTimeout(r, 20));
        expect(await attachedIds(h)).not.toContain(TAB);
    });
});

describe('service-worker restart', () => {
    it('recovers when the in-memory maps are gone but Chrome is still attached', async () => {
        // Worker generation 1: attach normally.
        const first = await createHarness();
        await first.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        expect(first.chrome.debugger.attach).toHaveBeenCalledTimes(1);

        // Worker generation 2: fresh module state, but Chrome still holds the
        // debugger, so the first attach is rejected.
        const second = await createHarness();
        let attempts = 0;
        second.chrome.debugger.attach.mockImplementation(async () => {
            attempts += 1;
            if (attempts === 1) {
                throw new Error('Another debugger is already attached to the tab with id: 11.');
            }
        });

        const result = await second.send({ type: 'CDP_SCROLL', tabId: TAB, direction: 'down' });
        expect(result.success).toBe(true);
        expect(second.chrome.debugger.detach).toHaveBeenCalledWith({ tabId: TAB });
        expect(attempts).toBe(2);
    });

    it('End Session still works after a restart with no in-memory client', async () => {
        const worker = await createHarness();
        const result = await worker.send({ type: 'DETACH', tabId: TAB });
        expect(result.success).toBe(true);
        expect(worker.chrome.debugger.detach).toHaveBeenCalledWith({ tabId: TAB });
        expect(result.data).toBe('Session ended. The debugging banner is gone.');
    });

    it('history survives a restart because it lives in chrome.storage.local', async () => {
        const first = await createHarness();
        await first.send({ type: 'CDP_NAVIGATE', tabId: TAB, url: 'example.com' });
        const saved = first.local.store.get('history');

        const second = await createHarness();
        second.local.store.set('history', saved);
        const history = (await second.send({ type: 'GET_HISTORY' })).data as Array<{ action: string }>;
        expect(history).toHaveLength(1);
        expect(history[0].action).toBe('Navigate');
    });
});
