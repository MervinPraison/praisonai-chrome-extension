/**
 * Two browser windows, one panel each.
 *
 * Each panel must drive the active tab of ITS OWN window and never the other's
 * - that is what chrome.windows.getCurrent() scoping buys, and it is invisible
 * in a single-window test.
 *
 *   node windows.mjs
 */
import { launch, sleep, until, EXT } from './harness.mjs';
import { startFixtureServer, openPanel, driver, scoreboard } from './common.mjs';

const PORT = 9412, WEB = 8152;
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

    // ---- window A: fixture A + its panel -----------------------------------
    const { targetId: fixtureA } = await b.send('Target.createTarget', { url: `http://127.0.0.1:${WEB}/?tag=A` });
    await sleep(1000);
    const { d: panelA } = await openPanel(b, extId, fixtureA, sleep);
    await panelA.waitTab('tag=A');
    const winA = await panelA.ev(`chrome.windows.getCurrent().then(w => w.id)`);
    step(`window A = ${winA}`);

    // ---- window B: its own fixture + its own panel --------------------------
    // Built through the extension's own API so the panel really belongs to it.
    const winB = await panelA.ev(`chrome.windows.create({ url: [
        'http://127.0.0.1:${WEB}/?tag=B',
        'chrome-extension://${extId}/sidepanel.html'
    ] }).then(w => w.id)`);
    await sleep(1500);
    ok('a second browser window really opened', typeof winB === 'number' && winB !== winA, `A=${winA} B=${winB}`);

    const panelBTarget = await until('panel B target', async () => {
        const tabs = await panelA.ev(`chrome.windows.get(${winB}, { populate: true }).then(w => w.tabs.map(t => ({ id: t.id, url: t.url, active: t.active })))`);
        return tabs.length === 2 && tabs.every((t) => t.url) ? tabs : null;
    });
    step('window B tabs: ' + JSON.stringify(panelBTarget));
    const panelBUrl = `chrome-extension://${extId}/sidepanel.html`;
    const bPanelTargets = (await b.targets()).filter((t) => t.url === panelBUrl);
    ok('window B has its own panel page', bPanelTargets.length === 2, `${bPanelTargets.length} panel pages`);

    // Attach to the panel that reports window B as its own.
    let panelB = null;
    for (const t of bPanelTargets) {
        const send = await b.attach(t.targetId);
        await send('Runtime.enable', {});
        const dd = driver(send);
        const w = await dd.ev(`chrome.windows.getCurrent().then(w => w.id)`);
        if (w === winB) panelB = dd;
    }
    ok('the second panel reports the second window as its own', panelB !== null, `looking for ${winB}`);
    if (!panelB) throw new Error('no panel bound to window B');

    // ---- each panel sees its own tab ----------------------------------------
    const labelA = await panelA.waitTab('tag=A');
    const labelB = await panelB.waitTab('tag=B');
    ok('panel A shows window A\'s tab', labelA.includes('tag=A') && !labelA.includes('tag=B'), labelA);
    ok('panel B shows window B\'s tab', labelB.includes('tag=B') && !labelB.includes('tag=A'), labelB);

    // ---- each panel ACTS on its own tab -------------------------------------
    const evalA = await panelA.pageEval('document.title');
    const evalB = await panelB.pageEval('document.title');
    ok('panel A runs JavaScript in window A\'s page', evalA.text.includes('Fixture A'), evalA.text.slice(0, 80));
    ok('panel B runs JavaScript in window B\'s page', evalB.text.includes('Fixture B'), evalB.text.slice(0, 80));

    // A write through panel B must not appear in window A.
    const typedB = await panelB.fillAct({ 'type-selector': '#field', 'type-text': 'only-in-B' }, 'type-go');
    ok('panel B types into its own page', !typedB.error && typedB.text.includes('Typed into'), typedB.text.slice(0, 90));
    const readB = await panelB.pageEval(`document.getElementById('field').value`);
    ok('the text landed in window B\'s field', readB.text.includes('only-in-B'), readB.text.slice(0, 60));
    const readA = await panelA.pageEval(`document.getElementById('field').value + '|' + document.title`);
    ok('window A\'s field was NOT touched by panel B',
        !readA.text.includes('only-in-B') && readA.text.includes('Fixture A'), readA.text.slice(0, 80));

    // And the other direction.
    const clickA = await panelA.fillAct({ 'click-selector': '#inner' }, 'click-go');
    ok('panel A clicks in its own page', !clickA.error && clickA.text.includes('Clicked'), clickA.text.slice(0, 80));
    const markerA = await panelA.pageEval(`document.getElementById('marker').textContent`);
    const markerB = await panelB.pageEval(`document.getElementById('marker').textContent`);
    ok('window A\'s page reacted to panel A\'s click', markerA.text.includes('wrap-clicked'), markerA.text.slice(0, 60));
    ok('window B\'s page did NOT react to panel A\'s click', markerB.text.includes('idle'), markerB.text.slice(0, 60));

    // ---- switching tabs in window A must not move panel B -------------------
    // Target.createTarget would drop the tab into whichever window Chrome last
    // focused (window B), so ask for window A explicitly.
    const tabA2 = await panelA.ev(`chrome.tabs.create({ windowId: ${winA},
        url: 'http://127.0.0.1:${WEB}/?tag=A2', active: true }).then(t => t.id)`);
    await sleep(1500);
    const a2Window = await panelA.ev(`chrome.tabs.get(${tabA2}).then(t => t.windowId)`);
    ok('the new tab really opened in window A', a2Window === winA, `${a2Window} vs ${winA}`);
    const labelA2 = await panelA.waitTab('tag=A2');
    ok('panel A follows the new active tab of window A', labelA2.includes('tag=A2'), labelA2);
    const labelBStill = await panelB.tabLabel();
    ok('panel B is unmoved by window A activating a tab', labelBStill.includes('tag=B'), labelBStill);
    const evalBStill = await panelB.pageEval('document.title');
    ok('panel B still acts on window B after window A switched tabs',
        evalBStill.text.includes('Fixture B'), evalBStill.text.slice(0, 80));

    // ---- ending a session in one window leaves the other alone --------------
    const detachB = await panelB.tool('detach');
    ok('End Session in window B ends window B\'s session', detachB.text.includes('Session ended'), detachB.text.slice(0, 80));
    await b.send('Target.activateTarget', { targetId: fixtureA });
    await panelA.waitTab('tag=A');
    const detachA = await panelA.tool('detach');
    ok('window A\'s session survived window B ending its own',
        detachA.text.includes('Session ended'), detachA.text.slice(0, 80));

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
report('windows.mjs');
