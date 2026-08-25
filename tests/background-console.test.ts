/**
 * Console Logs capture: the three CDP event shapes, the 200-entry cap, and
 * survival across a service-worker restart via chrome.storage.session.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createHarness, waitForFlush, type Harness } from './harness';

const TAB = 21;

type Log = { level: string; text: string };

async function logsFor(h: Harness, tabId = TAB): Promise<Log[]> {
    const result = await h.send({ type: 'GET_CONSOLE_LOGS', tabId });
    expect(result.success).toBe(true);
    return result.data as Log[];
}

describe('console log capture', () => {
    let h: Harness;

    beforeEach(async () => {
        h = await createHarness();
        // Attaching is what creates the buffer; the panel does this by asking
        // for logs, so do the same.
        await h.send({ type: 'GET_CONSOLE_LOGS', tabId: TAB });
    });

    it('starts empty on a fresh session', async () => {
        expect(await logsFor(h)).toEqual([]);
    });

    it('captures Log.entryAdded', async () => {
        h.emitCdpEvent(TAB, 'Log.entryAdded', {
            entry: { level: 'error', text: 'Failed to load resource: 404' },
        });
        expect(await logsFor(h)).toEqual([{ level: 'error', text: 'Failed to load resource: 404' }]);
    });

    it('defaults a Log.entryAdded with no level/text', async () => {
        h.emitCdpEvent(TAB, 'Log.entryAdded', { entry: {} });
        expect(await logsFor(h)).toEqual([{ level: 'log', text: '' }]);
    });

    it('ignores a Log.entryAdded with no entry', async () => {
        h.emitCdpEvent(TAB, 'Log.entryAdded', {});
        expect(await logsFor(h)).toEqual([]);
    });

    it('captures Runtime.consoleAPICalled with primitive args', async () => {
        h.emitCdpEvent(TAB, 'Runtime.consoleAPICalled', {
            type: 'warning',
            args: [{ type: 'string', value: 'count is' }, { type: 'number', value: 3 }],
        });
        expect(await logsFor(h)).toEqual([{ level: 'warning', text: 'count is 3' }]);
    });

    it('renders an object arg from its preview instead of the bare word Object', async () => {
        h.emitCdpEvent(TAB, 'Runtime.consoleAPICalled', {
            type: 'log',
            args: [
                { type: 'string', value: 'state:' },
                {
                    type: 'object',
                    className: 'Object',
                    description: 'Object',
                    preview: {
                        properties: [
                            { name: 'ok', value: 'true' },
                            { name: 'count', value: '2' },
                        ],
                    },
                },
            ],
        });
        expect(await logsFor(h)).toEqual([{ level: 'log', text: 'state: { ok: true, count: 2 }' }]);
    });

    it('falls back to the arg description when there is no preview', async () => {
        h.emitCdpEvent(TAB, 'Runtime.consoleAPICalled', {
            type: 'log',
            args: [{ type: 'function', description: 'function foo() {}' }],
        });
        expect(await logsFor(h)).toEqual([{ level: 'log', text: 'function foo() {}' }]);
    });

    it('keeps null and 0 args (they are not treated as missing)', async () => {
        h.emitCdpEvent(TAB, 'Runtime.consoleAPICalled', {
            type: 'log',
            args: [{ value: null }, { value: 0 }, { value: false }],
        });
        expect((await logsFor(h))[0].text).toBe('null 0 false');
    });

    it('handles consoleAPICalled with no args at all', async () => {
        h.emitCdpEvent(TAB, 'Runtime.consoleAPICalled', { type: 'log' });
        expect(await logsFor(h)).toEqual([{ level: 'log', text: '' }]);
    });

    it('captures Runtime.exceptionThrown using the exception description', async () => {
        h.emitCdpEvent(TAB, 'Runtime.exceptionThrown', {
            exceptionDetails: {
                text: 'Uncaught',
                exception: { description: 'TypeError: x is not a function\n  at <anonymous>:1:1' },
            },
        });
        const logs = await logsFor(h);
        expect(logs[0].level).toBe('error');
        expect(logs[0].text).toContain('TypeError: x is not a function');
    });

    it('falls back to exceptionDetails.text, then to a generic message', async () => {
        h.emitCdpEvent(TAB, 'Runtime.exceptionThrown', { exceptionDetails: { text: 'Script error.' } });
        h.emitCdpEvent(TAB, 'Runtime.exceptionThrown', {});
        expect((await logsFor(h)).map((l) => l.text)).toEqual(['Script error.', 'Uncaught exception']);
    });

    it('ignores CDP events it does not capture', async () => {
        h.emitCdpEvent(TAB, 'Page.frameNavigated', { frame: {} });
        h.emitCdpEvent(TAB, 'Network.requestWillBeSent', {});
        expect(await logsFor(h)).toEqual([]);
    });

    it('drops events for a tab with no session (no buffer)', async () => {
        h.emitCdpEvent(999, 'Log.entryAdded', { entry: { level: 'log', text: 'orphan' } });
        expect(await logsFor(h)).toEqual([]);
    });

    it('drops events from a tabless debuggee', async () => {
        for (const fn of h.listeners['debugger.onEvent'] ?? []) {
            fn({ targetId: 'abc' }, 'Log.entryAdded', { entry: { level: 'log', text: 'orphan' } });
        }
        expect(await logsFor(h)).toEqual([]);
    });

    it('keeps buffers separate per tab', async () => {
        await h.send({ type: 'GET_CONSOLE_LOGS', tabId: 22 });
        h.emitCdpEvent(TAB, 'Log.entryAdded', { entry: { level: 'log', text: 'tab-21' } });
        h.emitCdpEvent(22, 'Log.entryAdded', { entry: { level: 'log', text: 'tab-22' } });

        expect((await logsFor(h, TAB)).map((l) => l.text)).toEqual(['tab-21']);
        expect((await logsFor(h, 22)).map((l) => l.text)).toEqual(['tab-22']);
    });

    // ------------------------------------------------------------------- cap

    it('caps the buffer at 200 entries and keeps the newest', async () => {
        for (let i = 0; i < 250; i += 1) {
            h.emitCdpEvent(TAB, 'Log.entryAdded', { entry: { level: 'log', text: `m${i}` } });
        }
        const logs = await logsFor(h);
        expect(logs).toHaveLength(200);
        expect(logs[0].text).toBe('m50');
        expect(logs[199].text).toBe('m249');
    });

    it('never exceeds the cap while entries keep arriving', async () => {
        for (let i = 0; i < 205; i += 1) {
            h.emitCdpEvent(TAB, 'Log.entryAdded', { entry: { level: 'log', text: `m${i}` } });
            expect((await logsFor(h)).length).toBeLessThanOrEqual(200);
        }
    });

    // --------------------------------------------------- reporting the failure

    it('reports the attach error instead of an empty log list', async () => {
        const cold = await createHarness({ tabUrl: 'chrome://settings' });
        const result = await cold.send({ type: 'GET_CONSOLE_LOGS', tabId: TAB });
        expect(result.success).toBe(false);
        expect(result.error).toContain('Chrome does not allow automation');
    });
});

describe('console logs across a service-worker restart', () => {
    it('mirrors the buffer into chrome.storage.session', async () => {
        const h = await createHarness();
        await h.send({ type: 'GET_CONSOLE_LOGS', tabId: TAB });
        h.emitCdpEvent(TAB, 'Log.entryAdded', { entry: { level: 'error', text: 'boom' } });

        await waitForFlush();

        expect(h.session.store.get(`console:${TAB}`)).toEqual([{ level: 'error', text: 'boom' }]);
    });

    it('restores the logs in a new worker generation', async () => {
        const first = await createHarness();
        await first.send({ type: 'GET_CONSOLE_LOGS', tabId: TAB });
        first.emitCdpEvent(TAB, 'Log.entryAdded', { entry: { level: 'error', text: 'boom' } });
        first.emitCdpEvent(TAB, 'Runtime.consoleAPICalled', { type: 'log', args: [{ value: 'hello' }] });
        await waitForFlush();

        // Worker recycled: fresh module state, session storage persists.
        const second = await createHarness();
        for (const [k, v] of first.session.store) second.session.store.set(k, v);

        const logs = (await second.send({ type: 'GET_CONSOLE_LOGS', tabId: TAB })).data as Log[];
        expect(logs.map((l) => l.text)).toEqual(['boom', 'hello']);
    });

    it('appends new entries onto the restored buffer', async () => {
        const first = await createHarness();
        await first.send({ type: 'GET_CONSOLE_LOGS', tabId: TAB });
        first.emitCdpEvent(TAB, 'Log.entryAdded', { entry: { level: 'log', text: 'old' } });
        await waitForFlush();

        const second = await createHarness();
        for (const [k, v] of first.session.store) second.session.store.set(k, v);
        await second.send({ type: 'GET_CONSOLE_LOGS', tabId: TAB });
        second.emitCdpEvent(TAB, 'Log.entryAdded', { entry: { level: 'log', text: 'new' } });

        const logs = (await second.send({ type: 'GET_CONSOLE_LOGS', tabId: TAB })).data as Log[];
        expect(logs.map((l) => l.text)).toEqual(['old', 'new']);
    });

    it('survives a session-storage write failure without losing the live buffer', async () => {
        const h = await createHarness();
        await h.send({ type: 'GET_CONSOLE_LOGS', tabId: TAB });
        h.session.failSetWith = new Error('QUOTA_BYTES quota exceeded');
        h.emitCdpEvent(TAB, 'Log.entryAdded', { entry: { level: 'log', text: 'live' } });
        await waitForFlush();

        expect((await logsFor(h)).map((l) => l.text)).toEqual(['live']);
    });

    /**
     * BUG: scheduleFlush() keeps a single module-level timer and captures the
     * tabId of whichever call created it. A log that arrives for a second tab
     * while that timer is pending is coalesced away - only the first tab is
     * written to session storage, so the second tab's logs do not survive a
     * service-worker restart.
     */
    it('persists every tab that logged inside the same flush window', async () => {
        const h = await createHarness();
        await h.send({ type: 'GET_CONSOLE_LOGS', tabId: 1 });
        await h.send({ type: 'GET_CONSOLE_LOGS', tabId: 2 });

        h.emitCdpEvent(1, 'Log.entryAdded', { entry: { level: 'log', text: 'tab-one' } });
        h.emitCdpEvent(2, 'Log.entryAdded', { entry: { level: 'log', text: 'tab-two' } });

        await waitForFlush();

        expect(h.session.store.get('console:1')).toEqual([{ level: 'log', text: 'tab-one' }]);
        // A single captured tabId used to drop every other tab's entries.
        expect(h.session.store.get('console:2')).toEqual([{ level: 'log', text: 'tab-two' }]);

        // And both survive a worker restart.
        const second = await createHarness();
        for (const [k, v] of h.session.store) second.session.store.set(k, v);
        expect((await second.send({ type: 'GET_CONSOLE_LOGS', tabId: 2 })).data).toEqual([
            { level: 'log', text: 'tab-two' },
        ]);
    });
});
