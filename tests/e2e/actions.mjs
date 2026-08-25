/**
 * Action-level behaviour smoke.mjs does not reach:
 *   - Scroll actually moves the page (read back through Run JavaScript)
 *   - Typing into a non-typable element FAILS instead of claiming success
 *   - :has() is accepted (it is standard CSS, not a jQuery selector)
 *   - :contains() is still refused
 *   - Concurrency: overlapping actions never produce a false success and the
 *     panel never wedges on "Working..."
 *
 *   node actions.mjs
 */
import { launch, sleep, until, EXT } from './harness.mjs';
import { startFixtureServer, openPanel, scoreboard } from './common.mjs';

const PORT = 9414, WEB = 8154;
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

    const { targetId: pageId } = await b.send('Target.createTarget', { url: `http://127.0.0.1:${WEB}/?tag=C` });
    await sleep(1000);
    const { d } = await openPanel(b, extId, pageId, sleep);
    await d.waitTab('tag=C');

    // ------------------------------------------------------------- 7. Scroll
    const before = await d.pageEval('window.scrollY');
    ok('the page starts at the top', before.text.trim() === '0', before.text.slice(0, 40));

    const down = await d.button('scroll-down');
    ok('Scroll down reports success', !down.error && down.text.includes('Scrolled down'), down.text.slice(0, 80));
    const afterDown = await until('scrollY > 0', async () => {
        const r = await d.pageEval('window.scrollY');
        const n = Number(r.text.trim());
        return Number.isFinite(n) && n > 0 ? n : null;
    }, 20000);
    ok('the page really scrolled down', afterDown > 0, `window.scrollY = ${afterDown}`);

    const up = await d.button('scroll-up');
    ok('Scroll up reports success', !up.error && up.text.includes('Scrolled up'), up.text.slice(0, 80));
    // Wrapped in an object: scrolling back to 0 is the expected answer, and a
    // bare 0 is falsy, so until() would poll past a perfectly good result.
    const { y: afterUp } = await until('scrollY back up', async () => {
        const r = await d.pageEval('window.scrollY');
        const n = Number(r.text.trim());
        return Number.isFinite(n) && n < afterDown ? { y: n } : null;
    }, 20000);
    ok('the page really scrolled back up', afterUp < afterDown, `window.scrollY ${afterDown} -> ${afterUp}`);

    // ------------------------------------------ 8. Type into a non-typable node
    const typeH1 = await d.fillAct({ 'type-selector': 'h1', 'type-text': 'should-not-land' }, 'type-go');
    step('type h1: ' + typeH1.text.slice(0, 120));
    ok('typing into <h1> is reported as a FAILURE, not a success',
        typeH1.error === true && !typeH1.text.includes('Typed into'), `${typeH1.status} | ${typeH1.text.slice(0, 140)}`);
    ok('the <h1> failure explains what to do instead',
        /not accepted/i.test(typeH1.text) && /input|textarea|editable/i.test(typeH1.text), typeH1.text.slice(0, 160));
    const h1Text = await d.pageEval(`document.getElementById('heading').textContent`);
    ok('the heading text was not mangled by the attempt',
        h1Text.text.includes('Heading C') && !h1Text.text.includes('should-not-land'), h1Text.text.slice(0, 80));

    // control: the same action on a real field must still succeed
    const typeField = await d.fillAct({ 'type-selector': '#field', 'type-text': 'lands-fine' }, 'type-go');
    ok('control: typing into a real <input> still succeeds',
        !typeField.error && typeField.text.includes('Typed into'), typeField.text.slice(0, 80));
    const fieldValue = await d.pageEval(`document.getElementById('field').value`);
    ok('control: the value really landed', fieldValue.text.includes('lands-fine'), fieldValue.text.slice(0, 60));

    // ------------------------------------------------------------ 9. :has()
    await d.pageEval(`document.getElementById('marker').textContent = 'idle', 'reset'`);
    const hasClick = await d.fillAct({ 'click-selector': 'div:has(> button)' }, 'click-go');
    step('has(): ' + hasClick.text.slice(0, 120));
    ok(':has() is NOT refused as a jQuery selector',
        !/jQuery-style/i.test(hasClick.text), hasClick.text.slice(0, 140));
    ok(':has() click reports success', !hasClick.error && hasClick.text.includes('Clicked'), hasClick.text.slice(0, 100));
    const marker = await until('marker set', async () => {
        const r = await d.pageEval(`document.getElementById('marker').textContent`);
        return r.text.includes('wrap-clicked') ? r.text : null;
    }, 15000).catch(() => null);
    ok(':has() really clicked the matching element', marker !== null, String(marker).slice(0, 60));

    // contrast: a genuinely unsupported jQuery selector is still refused
    const containsClick = await d.fillAct({ 'click-selector': 'button:contains("Nope")' }, 'click-go');
    ok(':contains() with no matching text is still refused',
        containsClick.error === true, containsClick.text.slice(0, 140));

    // ------------------------------------------------------- 6. Concurrency
    // (a) through the real UI: several buttons pressed in the same tick.
    await d.clear();
    await d.ev(`document.getElementById('eval-code').value = 'document.title';
                document.getElementById('click-selector').value = '#inner';
                true`);
    const disabledDuring = await d.ev(`(() => {
        document.getElementById('eval-go').click();
        document.getElementById('click-go').click();
        document.getElementById('scroll-down').click();
        document.querySelector('[data-action="extract"]').click();
        return { evalDisabled: document.getElementById('eval-go').disabled,
                 status: document.querySelector('#status-indicator .status-text').textContent };
    })()`);
    ok('the panel disables its controls the moment an action starts',
        disabledDuring.evalDisabled === true, JSON.stringify(disabledDuring));
    const settled = await until('panel settles', async () => {
        const s = await d.status();
        const t = await d.out();
        const busy = await d.ev(`document.getElementById('eval-go').disabled`);
        return (!busy && s !== 'Working...' && t) ? { s, t, err: await d.isError() } : null;
    }, 30000);
    step('burst settled: ' + JSON.stringify(settled).slice(0, 160));
    ok('the panel does not wedge on "Working..." after a burst of clicks',
        settled.s === 'Done' || settled.s === 'Failed', JSON.stringify(settled).slice(0, 160));
    ok('the burst produced a real, non-empty result', settled.t.length > 0, settled.t.slice(0, 80));

    // (b) straight at the worker: genuinely simultaneous requests on one tab.
    const tabId = await d.ev(`chrome.windows.getCurrent()
        .then(w => chrome.tabs.query({ active: true, windowId: w.id }))
        .then(([t]) => t.id)`);
    const burst = await d.ev(`(async () => {
        const tabId = ${tabId};
        const send = m => chrome.runtime.sendMessage({ ...m, tabId });
        const results = await Promise.all([
            send({ type: 'CDP_EVALUATE', expression: 'document.title' }),
            send({ type: 'CDP_EVALUATE', expression: '20+22' }),
            send({ type: 'CDP_CLICK', selector: '#inner' }),
            send({ type: 'CDP_CLICK', selector: '#definitely-not-here' }),
            send({ type: 'EXTRACT_DATA' }),
            send({ type: 'CDP_SCREENSHOT' }),
            send({ type: 'GET_CONSOLE_LOGS' }),
        ]);
        return results.map(r => ({
            success: r.success,
            error: r.error ?? null,
            data: typeof r.data === 'string' ? r.data.slice(0, 60) : JSON.stringify(r.data ?? null).slice(0, 60),
        }));
    })()`);
    step('worker burst: ' + JSON.stringify(burst));
    const [title, sum, hit, miss, extract, shot, logs] = burst;
    ok('concurrent: document.title is correct', title.success && title.data.includes('Fixture C'), JSON.stringify(title));
    ok('concurrent: 20+22 is 42', sum.success && sum.data.includes('42'), JSON.stringify(sum));
    ok('concurrent: a real click succeeds', hit.success, JSON.stringify(hit));
    ok('concurrent: a selector matching nothing REPORTS FAILURE (no false success)',
        miss.success === false && !!miss.error, JSON.stringify(miss));
    ok('concurrent: Extract Data returns the page', extract.success && extract.data.length > 0, JSON.stringify(extract).slice(0, 90));
    ok('concurrent: Screenshot returns a PNG data URL',
        shot.success && shot.data.startsWith('data:image/png;base64,'), JSON.stringify(shot).slice(0, 90));
    ok('concurrent: Console Logs answers', logs.success, JSON.stringify(logs).slice(0, 90));
    ok('concurrent: nothing reported success with an error attached',
        burst.every(r => !(r.success && r.error)), JSON.stringify(burst.filter(r => r.success && r.error)));

    // the panel must still be usable afterwards
    const afterBurst = await d.pageEval('1+1');
    ok('the panel still works after the concurrency storm',
        !afterBurst.error && afterBurst.text.trim() === '2', `${afterBurst.status} | ${afterBurst.text.slice(0, 40)}`);

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
report('actions.mjs');
