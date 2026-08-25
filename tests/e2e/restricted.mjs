/**
 * Restricted pages and brand-new tabs.
 *
 * Every action must come back with the explanatory error - never a silent
 * no-op, never a false success, never a panel stuck on "Working...".
 *
 *   node restricted.mjs
 */
import { launch, sleep, until, EXT } from './harness.mjs';
import { startFixtureServer, openPanel, scoreboard } from './common.mjs';

const PORT = 9411, WEB = 8151;
const RESTRICTED = 'Chrome does not allow automation on this page';
const EMPTY_TAB = 'Open a website in this tab first';
const STORE = 'https://chromewebstore.google.com/';

const server = await startFixtureServer(WEB);
// Point the Web Store hosts at nothing: the tab then sits on the real Web Store
// URL with a network error page, which is exactly the state the extension's
// restricted-URL check has to recognise - and no request ever leaves the box.
const b = await launch(PORT, [
    '--host-resolver-rules=MAP chromewebstore.google.com ~NOTFOUND, MAP chrome.google.com ~NOTFOUND',
]);
const { ok, report } = scoreboard();
const step = (m) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
const BLOCKED_LABEL = 'Chrome blocks automation here';

/**
 * Wait for the panel to FINISH describing the tab.
 *
 * refreshCurrentTab() writes the bare URL first and only appends the blocked
 * note after GET_TAB_INFO answers, so reading straight after the URL appears
 * catches the intermediate state and reports a failure that is not real.
 */
const waitBlockedLabel = (d, needle) => until(`blocked label for ${needle}`, async () => {
    const t = await d.tabLabel();
    return t.includes(needle) && t.includes(BLOCKED_LABEL) ? t : null;
}, 15000).catch(async () => d.tabLabel());

/**
 * Confirm the panel really is pointed at the tab we think it is.
 *
 * Activating a target and reading the panel a moment later can catch the old
 * tab, which would run the whole action matrix against the wrong page and
 * report a pile of failures that say nothing about the product.
 */
async function assertPanelOn(d, needle) {
    const active = await until(`active tab ~ ${needle}`, async () => {
        const url = await d.ev(`chrome.windows.getCurrent()
            .then(w => chrome.tabs.query({ active: true, windowId: w.id }))
            .then(([t]) => t ? t.url : '')`);
        return url.includes(needle) ? url : null;
    }, 15000);
    await d.waitTab(needle);
    return active;
}

/** Every action the panel offers, with inputs that are valid on a normal page. */
const ACTIONS = [
    ['Navigate', (d) => d.fillAct({ 'nav-url': `http://127.0.0.1:${WEB}/?tag=R` }, 'nav-go')],
    ['Click', (d) => d.fillAct({ 'click-selector': '#inner' }, 'click-go')],
    ['Type', (d) => d.fillAct({ 'type-selector': '#field', 'type-text': 'hi' }, 'type-go')],
    ['Run JavaScript', (d) => d.fillAct({ 'eval-code': 'document.title' }, 'eval-go')],
    ['Scroll down', (d) => d.button('scroll-down')],
    ['Screenshot', (d) => d.tool('screenshot')],
    ['Extract Data', (d) => d.tool('extract')],
    ['Console Logs', (d) => d.tool('console')],
];

try {
    const { id: extId } = await b.send('Extensions.loadUnpacked', { path: EXT });
    const sw = await until('service worker', async () =>
        (await b.targets()).find((t) => t.type === 'service_worker' && t.url.includes(extId)));
    const swSend = await b.attach(sw.targetId);
    await swSend('Runtime.enable', {});
    await swSend('Log.enable', {});

    step('loaded ext ' + extId);
    // A normal page first, so the panel has a healthy baseline to fall from.
    const { targetId: fixtureId } = await b.send('Target.createTarget', { url: `http://127.0.0.1:${WEB}/?tag=R` });
    await sleep(1000);
    const { d } = await openPanel(b, extId, fixtureId, sleep);
    await d.waitTab('127.0.0.1');
    ok('baseline: the panel targets a normal page', !(await d.restrictedClass()));
    const baseline = await d.pageEval('document.title');
    ok('baseline: Run JavaScript works on a normal page', baseline.text.includes('Fixture R'), baseline.text.slice(0, 80));

    step('baseline done');
    // ---------------------------------------------------------------- chrome://
    const { targetId: versionId } = await b.send('Target.createTarget', { url: 'chrome://version' });
    await sleep(900);
    await b.send('Target.activateTarget', { targetId: versionId });
    await assertPanelOn(d, 'chrome://version');
    const versionLabel = await waitBlockedLabel(d, 'chrome://version');
    ok('chrome:// page is labelled as blocked', versionLabel.includes(BLOCKED_LABEL), versionLabel.slice(0, 90));
    ok('chrome:// page gets the is-restricted style', (await d.restrictedClass()) === true);

    for (const [name, run] of ACTIONS) {
        const r = await run(d); step('  chrome://version ' + name);
        ok(`chrome://version — ${name} reports the restricted error`,
            r.error === true && r.text.includes(RESTRICTED), `${r.status} | ${r.text.slice(0, 110)}`);
    }
    // End Session is the one action that skips the restricted-URL check, so it
    // leaks whatever chrome.debugger.detach happens to throw.
    const stillAlive = await d.tool('detach');
    ok('chrome://version — End Session does not wedge the panel',
        stillAlive.status !== 'Working...' && stillAlive.text.length > 0, `${stillAlive.status} | ${stillAlive.text.slice(0, 90)}`);
    ok('chrome://version — End Session explains itself like every other action',
        stillAlive.text.includes('No active session') || stillAlive.text.includes(RESTRICTED),
        `PRODUCT BUG: raw Chrome API error surfaced — ${JSON.stringify(stillAlive.text.slice(0, 90))}`);

    step('chrome://version done');
    // ------------------------------------- about:blank (deliberately NOT blocked)
    // The shipped build exempts about:blank from the restricted list on purpose
    // - Chrome does attach a debugger to it - so the panel must automate it, not
    // refuse it. Created through the extension so it lands in the panel's window.
    await d.ev(`chrome.tabs.create({ url: 'about:blank', active: true }).then(t => t.id)`);
    await sleep(1200);
    await assertPanelOn(d, 'about:blank');
    const blankLabel = await d.tabLabel();
    ok('about:blank is NOT labelled as blocked',
        !blankLabel.includes(BLOCKED_LABEL), blankLabel.slice(0, 90));
    ok('about:blank does not get the is-restricted style', (await d.restrictedClass()) === false);

    const blankEval = await d.pageEval(`String(location.href)`);
    ok('Run JavaScript really works on about:blank',
        !blankEval.error && blankEval.text.includes('about:blank'), `${blankEval.status} | ${blankEval.text.slice(0, 90)}`);
    const blankShot = await d.tool('screenshot');
    ok('Screenshot really works on about:blank',
        !blankShot.error && blankShot.text.includes('Screenshot captured'), blankShot.text.slice(0, 90));
    const blankNav = await d.fillAct({ 'nav-url': `http://127.0.0.1:${WEB}/?tag=R` }, 'nav-go');
    ok('Navigate turns about:blank into a real page',
        !blankNav.error && blankNav.text.includes('Navigated'), blankNav.text.slice(0, 90));
    const blankAfter = await d.pageEval('document.title');
    ok('the navigation really happened in the about:blank tab',
        !blankAfter.error && blankAfter.text.includes('Fixture R'), blankAfter.text.slice(0, 90));
    const blankDetach = await d.tool('detach');
    ok('End Session ends the session started on about:blank',
        blankDetach.text.includes('Session ended'), blankDetach.text.slice(0, 90));
    await d.ev(`chrome.windows.getCurrent()
        .then(w => chrome.tabs.query({ active: true, windowId: w.id }))
        .then(([t]) => chrome.tabs.remove(t.id))`);
    await sleep(1200);

    step('about:blank done');
    // ---------------------------------------------------------------- Web Store
    const { targetId: storeId } = await b.send('Target.createTarget', { url: STORE });
    await sleep(1500);
    const storeUrl = await d.ev(`chrome.tabs.query({}).then(ts => ts.map(t => t.url).find(u => u.includes('chromewebstore')) || 'NOT FOUND')`);
    ok('the Web Store tab really sits on the Web Store URL',
        storeUrl.startsWith(STORE), storeUrl.slice(0, 90));
    await b.send('Target.activateTarget', { targetId: storeId });
    await assertPanelOn(d, 'chromewebstore.google.com');
    const storeLabel = await waitBlockedLabel(d, 'chromewebstore.google.com');
    ok('the Chrome Web Store URL is labelled as blocked',
        storeLabel.includes(BLOCKED_LABEL), storeLabel.slice(0, 100));
    ok('the Web Store tab gets the is-restricted style', (await d.restrictedClass()) === true);
    const storeDetach = await d.tool('detach');
    ok('Web Store — End Session explains itself',
        storeDetach.text.includes('No active session') || storeDetach.text.includes(RESTRICTED),
        `PRODUCT BUG: raw Chrome API error surfaced — ${JSON.stringify(storeDetach.text.slice(0, 90))}`);
    for (const [name, run] of [ACTIONS[3], ACTIONS[5], ACTIONS[7]]) { // eval, screenshot, console
        const r = await run(d);
        ok(`Web Store — ${name} reports the restricted error`,
            r.error === true && r.text.includes(RESTRICTED), `${r.status} | ${r.text.slice(0, 110)}`);
    }

    step('web store done');
    // ---------------------------------------------------------------- new tab
    const newTabId = await d.ev(`chrome.tabs.create({}).then(t => t.id)`);
    await until('new tab settles', async () => {
        const info = await d.ev(`chrome.tabs.get(${newTabId}).then(t => t.url || '')`);
        return info ? info : null;
    });
    const newTabUrl = await d.ev(`chrome.tabs.get(${newTabId}).then(t => t.url)`);
    await assertPanelOn(d, 'chrome://newtab/');
    ok('a brand-new tab really is chrome://newtab/', newTabUrl === 'chrome://newtab/', newTabUrl);
    for (const [name, run] of ACTIONS) {
        const r = await run(d); step('  newtab ' + name);
        ok(`new empty tab — ${name} says "${EMPTY_TAB}"`,
            r.error === true && r.text.includes(EMPTY_TAB), `${r.status} | ${r.text.slice(0, 110)}`);
    }

    step('new tab done');
    // ---------------------------------------------------------------- recovery
    await b.send('Target.activateTarget', { targetId: fixtureId });
    await assertPanelOn(d, '127.0.0.1');
    const recovered = await d.pageEval('document.title');
    ok('the panel recovers on a normal tab after all of that',
        !recovered.error && recovered.text.includes('Fixture R'), recovered.text.slice(0, 90));

    // ------------------------------------------------- rapid tab switching
    // refreshCurrentTab() writes the label, then awaits GET_TAB_INFO before
    // deciding whether to mark the tab blocked. Two switches in flight at once
    // means two of those replies racing, so hammer it and check the panel ends
    // up describing the tab it is actually pointed at.
    const blankTabId = await d.ev(`chrome.tabs.query({ url: 'chrome://version/*' }).then(ts => ts[0] ? ts[0].id : null)`);
    const fixtureTabId = await d.ev(`chrome.tabs.query({ url: 'http://127.0.0.1:${WEB}/*' }).then(ts => ts[0] ? ts[0].id : null)`);
    ok('the switching stress test found both tabs', blankTabId !== null && fixtureTabId !== null, `${blankTabId} / ${fixtureTabId}`);

    let mismatch = null;
    for (let round = 0; round < 6 && !mismatch; round++) {
        const landOnBlank = round % 2 === 0;
        await d.ev(`(async () => {
            const ids = [${fixtureTabId}, ${blankTabId}, ${fixtureTabId}, ${landOnBlank ? blankTabId : fixtureTabId}];
            for (const id of ids) { await chrome.tabs.update(id, { active: true }); await new Promise(r => setTimeout(r, 120)); }
            return true;
        })()`);
        await sleep(3000); // well past any in-flight GET_TAB_INFO
        const state = await d.ev(`chrome.windows.getCurrent()
            .then(w => chrome.tabs.query({ active: true, windowId: w.id }))
            .then(([t]) => ({ url: t.url,
                label: document.getElementById('tab-url').textContent,
                restricted: document.getElementById('tab-url').classList.contains('is-restricted') }))`);
        // Same rule the shipped build applies: about:blank is exempt.
        const shouldBeBlocked = state.url !== 'about:blank' &&
            (state.url.startsWith('about:') || state.url.startsWith('chrome://'));
        const labelAgrees = state.label.startsWith(state.url);
        if (!labelAgrees || state.restricted !== shouldBeBlocked ||
            state.label.includes(BLOCKED_LABEL) !== shouldBeBlocked) {
            mismatch = { round, ...state, shouldBeBlocked };
        }
    }
    step('switch stress: ' + JSON.stringify(mismatch ?? 'consistent in all 6 rounds'));
    ok('after rapid tab switching the panel describes the tab it is pointed at',
        mismatch === null,
        `PRODUCT BUG: panel settled inconsistent — ${JSON.stringify(mismatch)}`);

    // and it must still ACT on the tab it names
    const finalUrl = await d.ev(`chrome.windows.getCurrent()
        .then(w => chrome.tabs.query({ active: true, windowId: w.id })).then(([t]) => t.url)`);
    const finalAct = await d.pageEval('document.title');
    const expectBlocked = finalUrl !== 'about:blank' &&
        (finalUrl.startsWith('about:') || finalUrl.startsWith('chrome://'));
    ok('after rapid switching the panel acts on the tab it names',
        expectBlocked ? (finalAct.error && finalAct.text.includes(RESTRICTED))
                      : (!finalAct.error && finalAct.text.includes('Fixture R')),
        `active=${finalUrl} | ${finalAct.status} | ${finalAct.text.slice(0, 80)}`);

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
report('restricted.mjs');
