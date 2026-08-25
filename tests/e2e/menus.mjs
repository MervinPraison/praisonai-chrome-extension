/**
 * Context menus, keyboard commands and the screenshot hand-off.
 *
 * Neither a context-menu click nor a Chrome keyboard command can be delivered
 * from CDP - both are browser-chrome UI, and headless Chrome has none. So this
 * file verifies everything about them that IS observable from the browser:
 *   - the two commands are registered with the shortcuts the manifest declares
 *   - both context-menu items really exist (a duplicate id is refused)
 *   - the side-panel open-on-action-click behaviour is actually set
 *   - the session-storage hand-off those two paths rely on works end to end,
 *     including the five-minute staleness gate
 * What cannot be observed is listed as UNVERIFIED at the end - nothing here
 * pretends to have clicked a menu item.
 *
 *   node menus.mjs
 */
import { launch, sleep, until, EXT } from './harness.mjs';
import { startFixtureServer, openPanel, scoreboard } from './common.mjs';

const PORT = 9416, WEB = 8156;
const server = await startFixtureServer(WEB);
const b = await launch(PORT);
const { ok, report } = scoreboard();
const unverified = [];
const step = (m) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${m}`);

try {
    const { id: extId } = await b.send('Extensions.loadUnpacked', { path: EXT });
    const sw = await until('service worker', async () =>
        (await b.targets()).find((t) => t.type === 'service_worker' && t.url.includes(extId)));
    const swSend = await b.attach(sw.targetId);
    await swSend('Runtime.enable', {});
    const swEval = async (expression) => {
        const r = await swSend('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'worker eval threw');
        return r.result.value;
    };

    // ------------------------------------------------------- keyboard commands
    const commands = await swEval(`chrome.commands.getAll()`);
    step('commands: ' + JSON.stringify(commands));
    const byName = Object.fromEntries(commands.map((c) => [c.name, c]));
    ok('the open-panel command is registered', !!byName['open-panel'], JSON.stringify(byName['open-panel']));
    ok('the capture-screenshot command is registered', !!byName['capture-screenshot'], JSON.stringify(byName['capture-screenshot']));
    ok('open-panel has a real bound shortcut', (byName['open-panel']?.shortcut ?? '') !== '', byName['open-panel']?.shortcut);
    ok('capture-screenshot has a real bound shortcut', (byName['capture-screenshot']?.shortcut ?? '') !== '', byName['capture-screenshot']?.shortcut);
    ok('the two shortcuts do not collide',
        byName['open-panel']?.shortcut !== byName['capture-screenshot']?.shortcut,
        `${byName['open-panel']?.shortcut} / ${byName['capture-screenshot']?.shortcut}`);
    ok('no command was silently dropped by Chrome',
        commands.filter((c) => !c.name.startsWith('_execute')).length === 2,
        commands.map((c) => c.name).join(','));

    // --------------------------------------------------------- context menus
    // There is no API to list menu items, but Chrome refuses a duplicate id -
    // so the refusal is proof the item exists.
    const tryCreate = (id) => swEval(`new Promise(resolve => {
        chrome.contextMenus.create({ id: ${JSON.stringify(id)}, title: 'probe', contexts: ['all'] },
            () => resolve(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'CREATED'));
    })`);
    const dupShot = await tryCreate('praisonai-screenshot');
    const dupPanel = await tryCreate('praisonai-open-panel');
    const control = await tryCreate('e2e-control-id-that-cannot-exist');
    await swEval(`new Promise(r => chrome.contextMenus.remove('e2e-control-id-that-cannot-exist', () => r(1)))`);
    step(`menus: shot=${dupShot} panel=${dupPanel} control=${control}`);
    ok('control: an unused menu id is accepted (so the probe is meaningful)', control === 'CREATED', control);
    ok('the "Capture screenshot" context-menu item exists', /duplicate id/i.test(dupShot), dupShot);
    ok('the "Open PraisonAI panel" context-menu item exists', /duplicate id/i.test(dupPanel), dupPanel);

    // ------------------------------------------------------ side panel behaviour
    const behaviour = await swEval(`chrome.sidePanel.getPanelBehavior()`);
    ok('clicking the toolbar icon is wired to open the panel',
        behaviour?.openPanelOnActionClick === true, JSON.stringify(behaviour));
    const options = await swEval(`chrome.sidePanel.getOptions({})`);
    ok('the panel path is registered', String(options?.path ?? '').includes('sidepanel.html'), JSON.stringify(options));

    // --------------------------------- the hand-off both paths depend on
    // A screenshot taken from the menu or the shortcut is stored in session
    // storage and picked up by the panel when it next opens. Drive the capture
    // through the panel (the only reachable trigger) and verify the hand-off.
    const { targetId: pageId } = await b.send('Target.createTarget', { url: `http://127.0.0.1:${WEB}/?tag=S` });
    await sleep(1000);
    const { targetId: panel1, d } = await openPanel(b, extId, pageId, sleep);
    await d.waitTab('tag=S');

    const hiddenAtStart = await d.ev(`document.getElementById('screenshot-result').hasAttribute('hidden')`);
    ok('the panel shows no screenshot before one is taken', hiddenAtStart === true);

    const shot = await d.tool('screenshot');
    ok('a screenshot capture succeeds', !shot.error && shot.text.includes('Screenshot captured'), shot.text.slice(0, 80));
    const stored = await swEval(`chrome.storage.session.get('lastScreenshot')
        .then(s => ({ has: !!s.lastScreenshot, len: (s.lastScreenshot?.dataUrl || '').length,
                      png: (s.lastScreenshot?.dataUrl || '').startsWith('data:image/png;base64,') }))`);
    ok('the capture is handed to session storage for a closed panel',
        stored.has && stored.png && stored.len > 1000, JSON.stringify(stored));

    // Close the panel entirely, then open a fresh one - the shortcut/menu case.
    await b.send('Target.closeTarget', { targetId: panel1 });
    await sleep(1500);
    const { targetId: panel2, d: d2 } = await openPanel(b, extId, pageId, sleep);
    await d2.waitTab('tag=S');
    const restored = await until('restored screenshot', async () => {
        const r = await d2.ev(`(() => {
            const el = document.getElementById('screenshot-result');
            const img = document.getElementById('screenshot-img');
            return { hidden: el.hasAttribute('hidden'), display: getComputedStyle(el).display,
                     len: (img.src || '').length, png: (img.src || '').startsWith('data:image/png;base64,'),
                     text: document.getElementById('output-content').textContent };
        })()`);
        return r.len > 1000 ? r : null;
    }, 20000).catch(() => null);
    step('restored: ' + JSON.stringify(restored)?.slice(0, 160));
    ok('a fresh panel shows the screenshot taken while it was closed',
        restored !== null && restored.png && !restored.hidden, JSON.stringify(restored)?.slice(0, 140));
    ok('the restored screenshot says when it was taken',
        /Screenshot captured at /.test(restored?.text ?? ''), (restored?.text ?? '').slice(0, 80));

    // The five-minute staleness gate.
    await b.send('Target.closeTarget', { targetId: panel2 });
    await sleep(1000);
    await swEval(`chrome.storage.session.get('lastScreenshot').then(s =>
        chrome.storage.session.set({ lastScreenshot: { dataUrl: s.lastScreenshot.dataUrl,
            capturedAt: Date.now() - 10 * 60 * 1000 } }))`);
    const { d: d3 } = await openPanel(b, extId, pageId, sleep);
    await d3.waitTab('tag=S');
    await sleep(1500);
    const stale = await d3.ev(`(() => {
        const el = document.getElementById('screenshot-result');
        return { hidden: el.hasAttribute('hidden'), display: getComputedStyle(el).display,
                 h: el.getBoundingClientRect().height };
    })()`);
    ok('a screenshot older than five minutes is NOT re-shown',
        stale.hidden === true && stale.h === 0, JSON.stringify(stale));

    // -------------------------------------------- notifications the two paths use
    const notified = await swEval(`new Promise(resolve => {
        try {
            chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon128.png',
                title: 'e2e probe', message: 'probe' },
                id => resolve(chrome.runtime.lastError ? 'ERROR: ' + chrome.runtime.lastError.message : 'OK:' + id));
        } catch (e) { resolve('THREW: ' + e.message); }
    })`);
    step('notifications: ' + notified);
    ok('the notifications API the menu/shortcut paths report through is usable',
        String(notified).startsWith('OK:'), String(notified));

    // ---------------------------------------------------------------- limits
    // Prove the shortcut cannot be delivered from CDP rather than assuming it.
    await swEval(`chrome.storage.session.remove('lastScreenshot')`);
    const pageSend = await b.attach(pageId);
    for (const type of ['keyDown', 'keyUp']) {
        await pageSend('Input.dispatchKeyEvent', {
            type, key: 'S', code: 'KeyS', windowsVirtualKeyCode: 83,
            modifiers: 4 | 8, // Meta + Shift
        }).catch(() => undefined);
    }
    await sleep(2500);
    const afterKeys = await swEval(`chrome.storage.session.get('lastScreenshot').then(s => !!s.lastScreenshot)`);
    unverified.push(`Cmd+Shift+S delivered to the page produced no capture (lastScreenshot present: ${afterKeys}) — ` +
        'Chrome commands are handled by browser UI, which headless Chrome does not run. The capture-screenshot ' +
        'and open-panel command HANDLERS are therefore UNVERIFIED end to end.');
    unverified.push('A context-menu CLICK cannot be dispatched: chrome.contextMenus has no programmatic invoke and ' +
        'the menu itself is native browser chrome. contextMenus.onClicked (including its no-tab fallback and the ' +
        'sidePanel.open() call) is UNVERIFIED end to end; only the existence of both items was confirmed.');
    unverified.push('chrome.sidePanel.open() cannot be called from a test: it requires a user gesture. The real ' +
        'side panel surface is never instantiated here — every panel in this suite is sidepanel.html in a tab.');

    const swErrors = b.events.filter((e) => e.method === 'Runtime.exceptionThrown');
    ok('no uncaught exceptions in the worker', swErrors.length === 0,
        swErrors.map((e) => e.params?.exceptionDetails?.text).join(' | ').slice(0, 200));
} catch (e) {
    ok('HARNESS ERROR', false, e.message);
    console.error(e);
} finally {
    await b.close(); server.close();
}
console.log('\n=== menus.mjs: UNVERIFIED (' + unverified.length + ') ===');
unverified.forEach((u) => console.log('  ? ' + u));
report('menus.mjs');
