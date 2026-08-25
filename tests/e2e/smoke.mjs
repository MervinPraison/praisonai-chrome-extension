import { launch, startServer, sleep, until, EXT } from './harness.mjs';

const PORT = 9361, WEB = 8123;
const server = await startServer(WEB);
const b = await launch(PORT);
const pass = [], fail = [];
const ok = (n, c, d = '') => (c ? pass : fail).push(n + (d ? ` — ${d}` : ''));

try {
  const { id: extId } = await b.send('Extensions.loadUnpacked', { path: EXT });
  ok('extension loads unpacked', !!extId, extId);

  const sw = await until('service worker', async () =>
    (await b.targets()).find(t => t.type === 'service_worker' && t.url.includes(extId)));
  ok('service worker starts', !!sw);

  // Watch the worker console for uncaught errors.
  const swSend = await b.attach(sw.targetId);
  await swSend('Runtime.enable', {});
  await swSend('Log.enable', {});

  // Open the fixture page, then the panel in the same window.
  const { targetId: pageId } = await b.send('Target.createTarget', { url: `http://127.0.0.1:${WEB}/` });
  await sleep(1200);
  const { targetId: panelId } = await b.send('Target.createTarget', { url: `chrome-extension://${extId}/sidepanel.html` });
  await sleep(800);
  // Make the fixture the active tab so the panel targets it, not itself.
  await b.send('Target.activateTarget', { targetId: pageId });
  await sleep(800);

  const panel = await b.attach(panelId);
  await panel('Runtime.enable', {});

  const evalPanel = async expr => {
    const r = await panel('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'panel eval threw');
    return r.result.value;
  };

  // --- the panel rendered and picked up the fixture tab ---
  const tabLabel = await until('panel tab label', async () => {
    const v = await evalPanel(`document.getElementById('tab-url').textContent`);
    return v && v !== 'No tab selected' ? v : null;
  });
  ok('panel targets the active tab of its window', tabLabel.includes('127.0.0.1'), tabLabel);

  const statusText = await evalPanel(`document.querySelector('#status-indicator .status-text').textContent`);
  ok('panel reaches Ready', statusText === 'Ready', statusText);

  // --- CRITICAL: the screenshot block must be hidden on a clean profile ---
  const shotBox = await evalPanel(`(() => {
    const el = document.getElementById('screenshot-result');
    const cs = getComputedStyle(el);
    return { display: cs.display, hidden: el.hasAttribute('hidden'), h: el.getBoundingClientRect().height };
  })()`);
  ok('screenshot block hidden before any capture',
     shotBox.display === 'none' && shotBox.h === 0, JSON.stringify(shotBox));

  // --- inputs must not be white system boxes ---
  const inputStyle = await evalPanel(`(() => {
    const cs = getComputedStyle(document.getElementById('nav-url'));
    return { bg: cs.backgroundColor, color: cs.color, pad: cs.paddingTop };
  })()`);
  ok('inputs carry the dark theme',
     inputStyle.bg !== 'rgba(0, 0, 0, 0)' && inputStyle.bg !== 'rgb(255, 255, 255)',
     JSON.stringify(inputStyle));

  // Blank the output before each action; otherwise a poll can match the
  // previous action's text and report a false pass (or a false failure).
  const clearOutput = () => evalPanel(`(() => { const o=document.getElementById('output-content'); o.textContent=''; o.classList.remove('is-error'); return true; })()`);
  const clickBtn = async (id) => { await clearOutput(); return evalPanel(`document.getElementById('${id}').click(); true`); };
  const clickTool = async (action) => { await clearOutput(); return evalPanel(`document.querySelector('[data-action="${action}"]').click(); true`); };
  const output = async () => evalPanel(`document.getElementById('output-content').textContent`);
  const waitOutput = (pred, label) => until(label, async () => { const t = await output(); return pred(t) ? t : null; });

  // ---------------- Run JavaScript (also proves CDP attach works) -------------
  await evalPanel(`document.getElementById('eval-code').value = 'document.title'`);
  await clickBtn('eval-go');
  const evalOut = await waitOutput(t => t.includes('E2E Fixture') || t.toLowerCase().includes('error'), 'eval output');
  ok('Run JavaScript executes in the page', evalOut.includes('E2E Fixture'), evalOut.slice(0, 120));

  // ---------------- Type (the selector-escaping regression) -------------------
  await evalPanel(`document.getElementById('type-selector').value = "input[name='q']"`);
  await evalPanel(`document.getElementById('type-text').value = 'hello e2e'`);
  await clickBtn('type-go');
  const typeOut = await waitOutput(t => t.includes('Typed into') || t.toLowerCase().includes('error') || t.includes('not accepted'), 'type output');
  ok("Type works with a single-quoted attribute selector", typeOut.includes('Typed into'), typeOut.slice(0, 160));

  // verify independently, through a different CDP domain
  await evalPanel(`document.getElementById('eval-code').value = "document.getElementById('field').value"`);
  await clickBtn('eval-go');
  const typed = await waitOutput(t => t.includes('hello e2e') || t === '' || t.includes('Error'), 'typed value');
  ok('typed text really landed in the field', typed.includes('hello e2e'), typed.slice(0, 120));

  // ---------------- Click ------------------------------------------------------
  await evalPanel(`document.getElementById('click-selector').value = '#btn'`);
  await clickBtn('click-go');
  const clickOut = await waitOutput(t => t.includes('Clicked') || t.toLowerCase().includes('failed'), 'click output');
  ok('Click reports success', clickOut.includes('Clicked'), clickOut.slice(0, 140));

  await evalPanel(`document.getElementById('eval-code').value = "document.getElementById('out').textContent"`);
  await clickBtn('eval-go');
  const clicked = await waitOutput(t => t.includes('clicked') || t.includes('idle'), 'click effect');
  ok('the click really fired the page handler', clicked.includes('clicked'), clicked.slice(0, 120));

  // ---------------- a selector that matches nothing must FAIL -----------------
  await evalPanel(`document.getElementById('click-selector').value = '#does-not-exist'`);
  await clickBtn('click-go');
  const missOut = await until('miss output', async () => {
    const t = await output();
    const err = await evalPanel(`document.getElementById('output-content').classList.contains('is-error')`);
    return (t && err) ? t : null;
  });
  ok('a selector matching nothing reports failure, not success', !!missOut, missOut.slice(0, 120));

  // ---------------- Extract Data ----------------------------------------------
  await clickTool('extract');
  const extractOut = await waitOutput(t => t.includes('Fixture Heading') || t.toLowerCase().includes('error'), 'extract output');
  ok('Extract Data returns real page structure', extractOut.includes('Fixture Heading'), extractOut.slice(0, 100));

  // ---------------- Screenshot -------------------------------------------------
  await clickTool('screenshot');
  const shot = await until('screenshot', async () => {
    const r = await evalPanel(`(() => {
      const el = document.getElementById('screenshot-result');
      const img = document.getElementById('screenshot-img');
      return { hidden: el.hasAttribute('hidden'), display: getComputedStyle(el).display,
               src: (img.src||'').slice(0,30), len: (img.src||'').length,
               href: (document.getElementById('screenshot-save').getAttribute('href')||'').slice(0,12) };
    })()`);
    return r.len > 1000 ? r : null;
  });
  ok('Screenshot captures a real PNG', shot.src.startsWith('data:image/png;base64,'), `${shot.len} chars`);
  ok('screenshot block becomes visible after capture', shot.display === 'flex' && !shot.hidden, JSON.stringify(shot));
  ok('save link gets a blob href', shot.href.startsWith('blob:'), shot.href);

  // ---------------- Console Logs -----------------------------------------------
  await clickTool('console');
  const consoleOut = await waitOutput(t => t.includes('fixture-log-line') || t.includes('No console output yet'), 'console output');
  ok('Console Logs returns the page console output', consoleOut.includes('fixture-log-line'), consoleOut.slice(0, 200));
  ok('Console Logs captures errors as well as logs', consoleOut.includes('fixture-boom'), consoleOut.slice(0, 200));

  // ---------------- Navigate + load wait ---------------------------------------
  await evalPanel(`document.getElementById('nav-url').value = 'http://127.0.0.1:${WEB}/second.html'`);
  await clickBtn('nav-go');
  const navOut = await waitOutput(t => t.includes('Navigated') || t.toLowerCase().includes('error'), 'navigate output');
  ok('Navigate reports success', navOut.includes('Navigated'), navOut.slice(0, 120));
  const navigated = await until('tab url changed', async () => {
    const t = (await b.targets()).find(x => x.targetId === pageId);
    return t && t.url.includes('second') ? t.url : null;
  });
  ok('the tab really navigated', !!navigated, navigated);

  // ---------------- bad scheme must be refused ---------------------------------
  await evalPanel(`document.getElementById('nav-url').value = 'chrome://settings'`);
  await clickBtn('nav-go');
  const badOut = await until('bad scheme', async () => {
    const err = await evalPanel(`document.getElementById('output-content').classList.contains('is-error')`);
    return err ? await output() : null;
  });
  ok('a non-http scheme is refused', badOut.toLowerCase().includes('valid url'), badOut.slice(0, 120));

  // ---------------- History -----------------------------------------------------
  await evalPanel(`document.querySelector('.mode-tab[data-mode="history"]').click(); true`);
  const hist = await until('history rows', async () =>
    await evalPanel(`document.querySelectorAll('#history-list .history-item').length`) || null);
  ok('History records the actions', hist >= 4, `${hist} rows`);

  // ---------------- End Session -------------------------------------------------
  await evalPanel(`document.querySelector('.mode-tab[data-mode="tools"]').click(); true`);
  await clickTool('detach');
  const detachOut = await waitOutput(t => t.includes('Session ended') || t.includes('No active session') || t.toLowerCase().includes('error'), 'detach output');
  ok('End Session reports the real outcome', detachOut.includes('Session ended') || detachOut.includes('No active session'), detachOut.slice(0, 120));

  // ---------------- no uncaught worker errors -----------------------------------
  const swErrors = b.events.filter(e =>
    (e.method === 'Runtime.exceptionThrown') ||
    (e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error'));
  ok('no uncaught errors in the service worker', swErrors.length === 0,
     swErrors.map(e => e.params?.entry?.text ?? e.params?.exceptionDetails?.text).join(' | ').slice(0, 300));

} catch (e) {
  fail.push(`HARNESS ERROR: ${e.message}`);
} finally {
  await b.close(); server.close();
}

console.log('\n=== PASS (' + pass.length + ') ===');
for (const p of pass) console.log('  ✓ ' + p);
if (fail.length) { console.log('\n=== FAIL (' + fail.length + ') ==='); for (const f of fail) console.log('  ✗ ' + f); }
process.exit(fail.length ? 1 : 0);
