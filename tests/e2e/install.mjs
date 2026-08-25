/**
 * What Chrome itself reports about the installed extension.
 *
 * Everything here is read back from a live install rather than from the source,
 * so the permission and privacy claims in STORE_LISTING.md are reproducible
 * instead of asserted.
 */
import { launch, startServer, sleep, until, EXT } from './harness.mjs';

const PORT = 9571, WEB = 8231;
const server = await startServer(WEB);
const b = await launch(PORT);
const pass = [], fail = [];
const ok = (n, c, d = '') => (c ? pass : fail).push(n + (d ? ` — ${d}` : ''));

try {
  const { id: extId } = await b.send('Extensions.loadUnpacked', { path: EXT });
  const sw = await until('sw', async () =>
    (await b.targets()).find(t => t.type === 'service_worker' && t.url.includes(extId)));
  const swSend = await b.attach(sw.targetId);
  await swSend('Runtime.enable', {});
  await swSend('Log.enable', {});
  await swSend('Network.enable', {});

  const inSW = async expr => {
    const r = await swSend('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'sw eval threw');
    return r.result.value;
  };

  // ---- declared permissions, as Chrome granted them ------------------------
  const perms = await inSW(`chrome.permissions.getAll()`);
  ok('exactly six permissions are granted',
     perms.permissions.length === 6, JSON.stringify(perms.permissions));
  ok('no host permissions are granted', perms.origins.length === 0, JSON.stringify(perms.origins));

  for (const p of ['sidePanel', 'tabs', 'debugger', 'storage', 'contextMenus', 'notifications']) {
    ok(`${p} is granted`, perms.permissions.includes(p));
  }

  // ---- the removed APIs must not exist at runtime ---------------------------
  const removed = await inSW(`({
    alarms: typeof chrome.alarms, offscreen: typeof chrome.offscreen,
    tabCapture: typeof chrome.tabCapture, scripting: typeof chrome.scripting
  })`);
  for (const [name, t] of Object.entries(removed)) {
    ok(`chrome.${name} is undefined`, t === 'undefined', t);
  }

  // ---- commands actually bound ----------------------------------------------
  const cmds = await inSW(`chrome.commands.getAll()`);
  const byName = Object.fromEntries(cmds.map(c => [c.name, c.shortcut]));
  ok('open-panel is registered', 'open-panel' in byName);
  ok('capture-screenshot is registered', 'capture-screenshot' in byName);
  ok('open-panel has a bound shortcut', !!byName['open-panel'], byName['open-panel'] || '(unbound)');
  ok('capture-screenshot has a bound shortcut', !!byName['capture-screenshot'], byName['capture-screenshot'] || '(unbound)');

  // ---- side panel configuration ---------------------------------------------
  const opts = await inSW(`chrome.sidePanel.getOptions({})`);
  const behavior = await inSW(`chrome.sidePanel.getPanelBehavior()`);
  ok('side panel points at sidepanel.html', opts.path === 'sidepanel.html', opts.path);
  ok('the toolbar icon opens the panel', behavior.openPanelOnActionClick === true);

  // ---- context menus: exactly the two documented -----------------------------
  const menus = await inSW(`(async () => {
    const probe = async (id) => { try { await chrome.contextMenus.update(id, {}); return true; } catch { return false; } };
    return { screenshot: await probe('praisonai-screenshot'),
             panel: await probe('praisonai-open-panel'),
             bogus: await probe('praisonai-does-not-exist') };
  })()`);
  ok('the screenshot menu item exists', menus.screenshot === true);
  ok('the open-panel menu item exists', menus.panel === true);
  ok('no third menu item exists', menus.bogus === false);

  // ---- storage caps, exercised for real --------------------------------------
  const { targetId: pageId } = await b.send('Target.createTarget', { url: `http://127.0.0.1:${WEB}/` });
  await sleep(1200);
  const { targetId: panelId } = await b.send('Target.createTarget', { url: `chrome-extension://${extId}/sidepanel.html` });
  await sleep(800);
  await b.send('Target.activateTarget', { targetId: pageId });
  await sleep(800);
  const tabId = await inSW(`chrome.tabs.query({}).then(ts => (ts.find(t => (t.url||'').includes('127.0.0.1'))||{}).id)`);

  // Drive from the panel: a worker's own sendMessage does not reach its listener.
  const panelForActions = await b.attach(panelId);
  await panelForActions('Runtime.enable', {});
  const runActions = await panelForActions('Runtime.evaluate', {
    awaitPromise: true, returnByValue: true, timeout: 120000,
    expression: `(async () => {
      let ok = 0;
      for (let i = 0; i < 60; i++) {
        const r = await chrome.runtime.sendMessage({
          type: 'CDP_SCROLL', tabId: ${tabId}, direction: i % 2 ? 'up' : 'down' });
        if (r && r.success) ok++;
      }
      return ok;
    })()`,
  });
  ok('60 actions all succeeded', runActions.result.value === 60, String(runActions.result.value));

  await sleep(1500);
  const history = await inSW(`chrome.storage.local.get('history').then(o => (o.history||[]).length)`);
  ok('history is capped at 50 after 60 actions', history === 50, String(history));

  const localKeys = await inSW(`chrome.storage.local.get(null).then(o => Object.keys(o))`);
  ok('local storage holds only history', JSON.stringify(localKeys) === '["history"]', JSON.stringify(localKeys));

  // ---- the extension issues no network requests -------------------------------
  const swRequests = b.events.filter(e =>
    e.method === 'Network.requestWillBeSent' && e.sessionId === undefined);
  ok('the service worker made no network requests', swRequests.length === 0,
     swRequests.map(e => e.params?.request?.url).join(', ').slice(0, 120));

  // ---- CSP is enforced, not merely declared -----------------------------------
  const panel = await b.attach(panelId);
  await panel('Runtime.enable', {});
  const csp = await panel('Runtime.evaluate', {
    awaitPromise: true, returnByValue: true,
    expression: `(async () => {
      const out = {};
      try { const s = document.createElement('script'); s.textContent = 'window.__inline = true'; document.head.appendChild(s); } catch {}
      out.inlineBlocked = window.__inline !== true;
      try { await fetch('https://example.com/'); out.fetchBlocked = false; } catch { out.fetchBlocked = true; }
      return out;
    })()`,
  });
  ok('inline script is blocked by CSP', csp.result.value.inlineBlocked === true);
  ok('network fetch from the panel is blocked', csp.result.value.fetchBlocked === true);

  // ---- the panel renders at side-panel width, in both themes -------------------
  for (const scheme of ['light', 'dark']) {
    await panel('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
    await panel('Emulation.setDeviceMetricsOverride', { width: 360, height: 800, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    const m = await panel('Runtime.evaluate', {
      returnByValue: true,
      expression: `({
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        bg: getComputedStyle(document.body).backgroundColor,
        input: getComputedStyle(document.getElementById('nav-url')).backgroundColor
      })`,
    });
    const v = m.result.value;
    ok(`no horizontal overflow at 360px (${scheme})`, v.overflow === false);
    ok(`panel keeps its dark surface (${scheme})`, v.bg !== 'rgb(255, 255, 255)' && v.input !== 'rgb(255, 255, 255)',
       `body=${v.bg} input=${v.input}`);
  }

  // ---- no uncaught errors anywhere --------------------------------------------
  const errs = b.events.filter(e =>
    e.method === 'Runtime.exceptionThrown' ||
    (e.method === 'Log.entryAdded' && e.params?.entry?.level === 'error'));
  ok('no uncaught errors during install and first use', errs.length === 0,
     errs.map(e => e.params?.entry?.text ?? e.params?.exceptionDetails?.text).join(' | ').slice(0, 200));
} catch (e) {
  fail.push('HARNESS ERROR: ' + e.message);
} finally {
  await b.close(); server.close();
}

console.log('\n=== PASS (' + pass.length + ') ==='); pass.forEach(p => console.log('  ✓ ' + p));
if (fail.length) { console.log('\n=== FAIL (' + fail.length + ') ==='); fail.forEach(f => console.log('  ✗ ' + f)); }
process.exit(fail.length ? 1 : 0);
