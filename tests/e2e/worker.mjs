/**
 * Service-worker restart.
 *
 * An MV3 worker is recycled out from under the extension. Everything the panel
 * promises has to survive that: actions keep working, captured console output
 * comes back (it is mirrored into chrome.storage.session), and End Session
 * still reports what really happened.
 *
 * The worker is stopped for real with Target.closeTarget on the worker target -
 * not chrome.runtime.reload(), which would restart the whole extension and
 * prove nothing.
 *
 *   node worker.mjs
 */
import { launch, sleep, until, EXT } from './harness.mjs';
import { startFixtureServer, openPanel, scoreboard } from './common.mjs';

const PORT = 9415, WEB = 8155;
const server = await startFixtureServer(WEB);
const b = await launch(PORT);
const { ok, report } = scoreboard();
const step = (m) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

let extId;
const worker = async () => (await b.targets()).find((t) => t.type === 'service_worker' && t.url.includes(extId));

/** Stop the running worker and prove it is gone. */
async function stopWorker() {
    const sw = await until('worker present', worker, 20000);
    await b.send('Target.closeTarget', { targetId: sw.targetId });
    await until('worker stopped', async () => ((await worker()) ? null : true), 20000);
    return sw.targetId;
}

try {
    ({ id: extId } = await b.send('Extensions.loadUnpacked', { path: EXT }));
    await until('service worker', worker);

    const { targetId: pageId } = await b.send('Target.createTarget', { url: `http://127.0.0.1:${WEB}/?tag=W` });
    await sleep(1000);
    const { targetId: panelId, d } = await openPanel(b, extId, pageId, sleep);
    await d.waitTab('tag=W');

    // Attach a session and capture some console output.
    const before = await d.tool('console');
    ok('a session attaches and captures the page console',
        !before.error && before.text.includes('log-from-W'), before.text.slice(0, 100));
    await d.pageEval(`console.log('logged-before-restart'), 'ok'`);
    await sleep(1200); // the buffer is flushed to session storage on a 500ms timer
    const beforeMore = await d.tool('console');
    ok('a later log is captured too', beforeMore.text.includes('logged-before-restart'), beforeMore.text.slice(-90));

    // ------------------------------------------------------------- restart it
    const oldWorker = await stopWorker();
    step('worker stopped: ' + oldWorker);
    ok('the service worker really stopped', (await worker()) === undefined);

    // (a) an action still works
    const evalAfter = await d.pageEval('20+22');
    ok('(a) an action still works after the worker was killed',
        !evalAfter.error && evalAfter.text.trim() === '42', `${evalAfter.status} | ${evalAfter.text.slice(0, 60)}`);
    const newWorker = await until('worker back', worker, 20000);
    ok('a NEW worker was started to serve it', newWorker.targetId !== oldWorker, `${oldWorker} -> ${newWorker.targetId}`);

    // it really is a fresh JS context, not the old one
    const swSend = await b.attach(newWorker.targetId);
    await swSend('Runtime.enable', {});
    const fresh = await swSend('Runtime.evaluate', {
        expression: `typeof self.__e2eStamp`, returnByValue: true,
    });
    ok('the new worker is a fresh context', fresh.result.value === 'undefined', String(fresh.result.value));

    // (b) previously captured console logs survive the restart
    const afterLogs = await d.tool('console');
    step('console after restart: ' + afterLogs.text.slice(0, 120));
    ok('(b) console output captured BEFORE the restart still comes back',
        !afterLogs.error && afterLogs.text.includes('log-from-W') && afterLogs.text.includes('logged-before-restart'),
        afterLogs.text.slice(0, 160));

    // and capture keeps working afterwards
    await d.pageEval(`console.log('logged-after-restart'), 'ok'`);
    await sleep(900);
    const afterLogs2 = await d.tool('console');
    ok('capture keeps working after the restart',
        afterLogs2.text.includes('logged-after-restart'), afterLogs2.text.slice(-110));

    // (c) End Session still reports correctly
    const detach1 = await d.tool('detach');
    ok('(c) End Session ends the session that outlived the worker',
        detach1.text.includes('Session ended'), detach1.text.slice(0, 90));
    const detach2 = await d.tool('detach');
    ok('(c) a second End Session correctly reports nothing attached',
        detach2.text.includes('No active session'), detach2.text.slice(0, 90));

    // ----------------------------------------------------------------------
    // The panel's port is what makes the worker end every session when the
    // panel closes. Does that guarantee survive a worker restart?
    // ----------------------------------------------------------------------
    const reattach = await d.pageEval('document.title');
    ok('a session re-attaches for the port test', !reattach.error && reattach.text.includes('Fixture W'), reattach.text.slice(0, 60));

    // Watch what a port opened by a panel actually does when the worker dies.
    // init() calls chrome.runtime.connect exactly once, so if that port drops it
    // is never replaced.
    await d.ev(`(() => {
        window.__portProbe = { disconnected: false };
        const port = chrome.runtime.connect({ name: 'e2e-port-probe' });
        port.onDisconnect.addListener(() => { window.__portProbe.disconnected = true; });
        return true;
    })()`);
    await stopWorker();
    await sleep(1000);
    const portProbe = await d.ev(`window.__portProbe.disconnected`);
    ok('a panel-held port is dropped when the worker is recycled (mechanism)',
        portProbe === true, `port.onDisconnect fired: ${portProbe}`);
    const wake = await d.pageEval('1+1');           // wakes a brand-new worker
    ok('the panel wakes the worker again', !wake.error && wake.text.trim() === '2', wake.text.slice(0, 40));
    await until('worker back for port test', worker, 20000);
    await sleep(500);

    await b.send('Target.closeTarget', { targetId: panelId });
    await sleep(3000);

    const { d: d2 } = await openPanel(b, extId, pageId, sleep);
    await d2.waitTab('tag=W');
    const afterClose = await d2.tool('detach');
    step('detach after panel close: ' + afterClose.text);
    ok('closing the panel still ends every session after a worker restart',
        afterClose.text.includes('No active session'),
        `PRODUCT BUG: the debugging session outlived the panel — panel reports ${JSON.stringify(afterClose.text)}`);

    // CONTROL: the same sequence with a panel whose port was never orphaned.
    // If this passes, the failure above is caused by the lost port and nothing
    // else about the restart.
    const ctlAttach = await d2.pageEval('document.title');
    ok('control: a session attaches from the second panel',
        !ctlAttach.error && ctlAttach.text.includes('Fixture W'), ctlAttach.text.slice(0, 60));
    const panel2Id = (await b.targets()).filter((t) => t.url.endsWith('/sidepanel.html')).pop().targetId;
    await b.send('Target.closeTarget', { targetId: panel2Id });
    await sleep(3000);
    const { d: dCtl } = await openPanel(b, extId, pageId, sleep);
    await dCtl.waitTab('tag=W');
    const ctlClose = await dCtl.tool('detach');
    step('control detach after panel close (no restart in between): ' + ctlClose.text);
    ok('control: with a live port, closing the panel DOES end the session',
        ctlClose.text.includes('No active session'), ctlClose.text.slice(0, 90));

    // --------------------------------------------------- natural idle timeout
    // The panel holds a port open, which is what normally keeps an MV3 worker
    // alive. Observe what actually happens over a full idle window.
    const idleBefore = (await worker())?.targetId ?? null;
    step('idling 40s...');
    await sleep(40000);
    const idleAfter = (await worker())?.targetId ?? null;
    step(`idle: ${idleBefore} -> ${idleAfter}`);
    const afterIdle = await dCtl.pageEval('6*7');
    ok('an action works after 40s of idleness (whatever happened to the worker)',
        !afterIdle.error && afterIdle.text.trim() === '42',
        `worker before=${idleBefore} after=${idleAfter} | ${afterIdle.status} ${afterIdle.text.slice(0, 40)}`);
    await dCtl.tool('detach');

    const swErrors = b.events.filter((e) => e.method === 'Runtime.exceptionThrown');
    ok('no uncaught exceptions surfaced from the worker sessions', swErrors.length === 0,
        swErrors.map((e) => e.params?.exceptionDetails?.text).join(' | ').slice(0, 200));
} catch (e) {
    ok('HARNESS ERROR', false, e.message);
    console.error(e);
} finally {
    await b.close(); server.close();
}
report('worker.mjs');
