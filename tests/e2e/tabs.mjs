/**
 * Two tabs in ONE window, one panel.
 *
 * Console capture is per tab, and ending the session on one tab must leave the
 * other attached.
 *
 *   node tabs.mjs
 */
import { launch, sleep, until, EXT } from './harness.mjs';
import { startFixtureServer, openPanel, scoreboard } from './common.mjs';

const PORT = 9413, WEB = 8153;
const server = await startFixtureServer(WEB);
const b = await launch(PORT);
const { ok, report } = scoreboard();
const step = (m) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

try {
    const { id: extId } = await b.send('Extensions.loadUnpacked', { path: EXT });
    const sw = await until('service worker', async () =>
        (await b.targets()).find((t) => t.type === 'service_worker' && t.url.includes(extId)));
    const swSend = await b.attach(sw.targetId);
    await swSend('Runtime.enable', {}); await swSend('Log.enable', {});

    const { targetId: tab1 } = await b.send('Target.createTarget', { url: `http://127.0.0.1:${WEB}/?tag=ONE` });
    await sleep(900);
    const { targetId: tab2 } = await b.send('Target.createTarget', { url: `http://127.0.0.1:${WEB}/?tag=TWO` });
    await sleep(900);
    const { d } = await openPanel(b, extId, tab1, sleep);
    await d.waitTab('tag=ONE');

    const focus = async (targetId, needle) => {
        await b.send('Target.activateTarget', { targetId });
        await sleep(600);
        return d.waitTab(needle);
    };

    // Both tabs are in one window, so the panel must follow the ACTIVE one.
    ok('the panel starts on tab ONE', (await d.tabLabel()).includes('tag=ONE'));

    // --- attach a session on each tab and read its console --------------------
    const c1 = await d.tool('console');
    step('console ONE: ' + c1.text.slice(0, 80));
    ok('tab ONE console shows only tab ONE\'s log',
        c1.text.includes('log-from-ONE') && !c1.text.includes('log-from-TWO'), c1.text.slice(0, 120));

    await focus(tab2, 'tag=TWO');
    const c2 = await d.tool('console');
    step('console TWO: ' + c2.text.slice(0, 80));
    ok('tab TWO console shows only tab TWO\'s log',
        c2.text.includes('log-from-TWO') && !c2.text.includes('log-from-ONE'), c2.text.slice(0, 120));

    // --- new output on one tab must not leak into the other ------------------
    await d.pageEval(`console.log('marker-TWO-late'), 'done'`);
    await sleep(700);
    const c2b = await d.tool('console');
    ok('a fresh log on tab TWO is captured', c2b.text.includes('marker-TWO-late'), c2b.text.slice(-120));

    await focus(tab1, 'tag=ONE');
    const c1b = await d.tool('console');
    ok('tab ONE console never sees tab TWO\'s fresh log',
        !c1b.text.includes('marker-TWO-late') && c1b.text.includes('log-from-ONE'), c1b.text.slice(0, 160));

    // --- both sessions are genuinely live ------------------------------------
    const evalOne = await d.pageEval('document.title');
    ok('tab ONE acts on its own page', evalOne.text.includes('Fixture ONE'), evalOne.text.slice(0, 60));
    await focus(tab2, 'tag=TWO');
    const evalTwo = await d.pageEval('document.title');
    ok('tab TWO acts on its own page', evalTwo.text.includes('Fixture TWO'), evalTwo.text.slice(0, 60));

    // --- ending TWO must not end ONE -----------------------------------------
    const detach2 = await d.tool('detach');
    ok('End Session on tab TWO ends tab TWO', detach2.text.includes('Session ended'), detach2.text.slice(0, 80));
    const detach2again = await d.tool('detach');
    ok('a second End Session on tab TWO reports nothing attached',
        detach2again.text.includes('No active session'), detach2again.text.slice(0, 80));

    await focus(tab1, 'tag=ONE');
    const c1c = await d.tool('console');
    ok('tab ONE still has its console logs after tab TWO was ended',
        c1c.text.includes('log-from-ONE'), c1c.text.slice(0, 120));
    const detach1 = await d.tool('detach');
    ok('tab ONE\'s session was still attached (ending TWO did not kill it)',
        detach1.text.includes('Session ended'), detach1.text.slice(0, 80));

    // --- closing a tab must clean up ------------------------------------------
    await focus(tab2, 'tag=TWO');
    await d.pageEval('document.title'); // re-attach TWO
    await b.send('Target.closeTarget', { targetId: tab2 });
    await sleep(1200);
    await focus(tab1, 'tag=ONE');
    const after = await d.pageEval('document.title');
    ok('the panel keeps working after the other tab is closed',
        !after.error && after.text.includes('Fixture ONE'), after.text.slice(0, 80));

    const swErrors = b.events.filter((e) =>
        e.method === 'Runtime.exceptionThrown' ||
        (e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error'));
    ok('no uncaught errors in the service worker', swErrors.length === 0,
        swErrors.map((e) => e.params?.entry?.text ?? e.params?.exceptionDetails?.text).join(' | ').slice(0, 300));
} catch (e) {
    ok('HARNESS ERROR', false, e.message);
    console.error(e);
} finally {
    await b.close(); server.close();
}
report('tabs.mjs');
