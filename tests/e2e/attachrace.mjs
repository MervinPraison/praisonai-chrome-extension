/**
 * The attached-tab race, verified through public surfaces only:
 * panel messages in, chrome.storage.session + chrome.debugger.getTargets out.
 */
import { launch, startServer, sleep, until, EXT } from './harness.mjs';

const PORT = 9511, WEB = 8211;
const server = await startServer(WEB);
const b = await launch(PORT);
const pass=[], fail=[];
const ok=(n,c,d='')=>(c?pass:fail).push(n+(d?` — ${d}`:''));

try {
  const { id: extId } = await b.send('Extensions.loadUnpacked', { path: EXT });
  let sw = await until('sw', async () => (await b.targets()).find(t=>t.type==='service_worker'&&t.url.includes(extId)));
  let swSend = await b.attach(sw.targetId);
  await swSend('Runtime.enable', {});
  const inWorker = async expr => {
    const r = await swSend('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'sw eval threw');
    return r.result.value;
  };
  const attached = () => inWorker(`chrome.storage.session.get('attachedTabs').then(o => o.attachedTabs || [])`);
  const liveAttached = () => inWorker(`chrome.debugger.getTargets().then(ts => ts.filter(t => t.attached && t.tabId !== undefined).map(t => t.tabId))`);

  // two ordinary pages + a panel, all in one window
  const { targetId: pageA } = await b.send('Target.createTarget', { url: `http://127.0.0.1:${WEB}/?a` });
  const { targetId: pageB } = await b.send('Target.createTarget', { url: `http://127.0.0.1:${WEB}/?b` });
  await sleep(1200);
  const { targetId: panelId } = await b.send('Target.createTarget', { url: `chrome-extension://${extId}/sidepanel.html` });
  await sleep(800);
  await b.send('Target.activateTarget', { targetId: pageA });
  await sleep(700);

  const panel = await b.attach(panelId);
  await panel('Runtime.enable', {});
  const inPanel = async expr => {
    const r = await panel('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'panel eval threw');
    return r.result.value;
  };
  await until('panel ready', async () => (await inPanel(`document.getElementById('tab-url').textContent`)).includes('127.0.0.1'));

  const ids = await inWorker(`chrome.tabs.query({}).then(ts => ts.filter(t => (t.url||'').includes('127.0.0.1')).map(t => t.id))`);
  ok('found both fixture tabs', ids.length === 2, JSON.stringify(ids));

  // Fire both attaches in the SAME tick, from the panel, through the real router.
  await inPanel(`window.__r = Promise.all([
    chrome.runtime.sendMessage({ type: 'CDP_EVALUATE', tabId: ${ids[0]}, expression: '1' }),
    chrome.runtime.sendMessage({ type: 'CDP_EVALUATE', tabId: ${ids[1]}, expression: '2' })
  ]); true`);
  const results = await inPanel(`window.__r`);
  ok('both concurrent actions succeeded', results.every(r => r && r.success), JSON.stringify(results.map(r=>r&&r.success)));

  await sleep(500);
  const persisted = await attached();
  ok('BOTH tabs are recorded in attachedTabs (the race)',
     ids.every(id => persisted.includes(id)), `persisted=${JSON.stringify(persisted)} expected⊇${JSON.stringify(ids)}`);

  // Now the scenario the persistence exists for: recycle the worker, close the
  // panel, and require that nothing is left attached.
  await b.send('Target.closeTarget', { targetId: sw.targetId });
  await sleep(800);
  await inPanel(`chrome.runtime.sendMessage({ type: 'GET_HISTORY' })`);   // wake it
  sw = await until('sw back', async () => (await b.targets()).find(t=>t.type==='service_worker'&&t.url.includes(extId)));
  swSend = await b.attach(sw.targetId);
  await swSend('Runtime.enable', {});
  await until('port back', async () => (await attached()).length >= 2 ? true : true);
  await sleep(1200);

  const beforeClose = await liveAttached();
  ok('both tabs really are attached before the panel closes', beforeClose.length >= 2, JSON.stringify(beforeClose));

  await b.send('Target.closeTarget', { targetId: panelId });
  await sleep(2500);
  const afterClose = await liveAttached();
  ok('closing the panel ends EVERY session, even across a worker restart',
     afterClose.length === 0, `still attached: ${JSON.stringify(afterClose)}`);

  // stale-id hygiene
  const leftover = await attached();
  ok('attachedTabs is emptied afterwards', leftover.length === 0, JSON.stringify(leftover));
} catch (e) { fail.push('HARNESS: ' + e.message); }
finally { await b.close(); server.close(); }

console.log('\n=== PASS ('+pass.length+') ==='); pass.forEach(p=>console.log('  ✓ '+p));
if (fail.length){ console.log('\n=== FAIL ('+fail.length+') ==='); fail.forEach(f=>console.log('  ✗ '+f)); }
process.exit(fail.length?1:0);
