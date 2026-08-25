import { launch, startServer, sleep, until, EXT } from './harness.mjs';
const PORT=9381, WEB=8125;
const server = await startServer(WEB);
const b = await launch(PORT);
const pass=[], fail=[];
const ok=(n,c,d='')=>(c?pass:fail).push(n+(d?` — ${d}`:''));
try {
  const { id: extId } = await b.send('Extensions.loadUnpacked', { path: EXT });
  await until('sw', async () => (await b.targets()).find(t=>t.type==='service_worker'&&t.url.includes(extId)));
  const { targetId: pageId } = await b.send('Target.createTarget', { url: `http://127.0.0.1:${WEB}/` });
  await sleep(1000);
  const { targetId: panelId } = await b.send('Target.createTarget', { url: `chrome-extension://${extId}/sidepanel.html` });
  await sleep(700);
  await b.send('Target.activateTarget', { targetId: pageId });
  await sleep(700);
  const panel = await b.attach(panelId);
  await panel('Runtime.enable', {});
  const ev = async e => {
    const r = await panel('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'threw');
    return r.result.value;
  };
  await until('ready', async () => (await ev(`document.getElementById('tab-url').textContent`)).includes('127.0.0.1'));

  const clear = () => ev(`(()=>{const o=document.getElementById('output-content');o.textContent='';return true})()`);
  const out = () => ev(`document.getElementById('output-content').textContent`);

  // attach a session
  await clear();
  await ev(`document.getElementById('eval-code').value='document.title'; document.getElementById('eval-go').click(); true`);
  await until('eval done', async () => (await out()).includes('E2E Fixture'));

  // is the banner-bearing session actually attached now?
  const attachedNow = await ev(`(async () => {
     const r = await chrome.runtime.sendMessage({ type: 'GET_TAB_INFO' });
     return !!r;
  })()`);
  ok('panel can still reach the worker', attachedNow === true);

  // End Session IMMEDIATELY on the live session
  await clear();
  await ev(`document.querySelector('[data-action="detach"]').click(); true`);
  const detachOut = await until('detach out', async () => { const t = await out(); return t ? t : null; });
  ok('End Session on a LIVE session says it ended', detachOut.includes('Session ended'), detachOut);

  // pressing it again must say there is nothing attached
  await clear();
  await ev(`document.querySelector('[data-action="detach"]').click(); true`);
  const again = await until('detach again', async () => { const t = await out(); return t ? t : null; });
  ok('a second End Session reports no active session', again.includes('No active session'), again);

  // closing the panel must end sessions (the port teardown)
  await clear();
  await ev(`document.getElementById('eval-code').value='1+1'; document.getElementById('eval-go').click(); true`);
  await until('re-attached', async () => (await out()).includes('2'));
  await b.send('Target.closeTarget', { targetId: panelId });
  await sleep(1500);
  // Re-open a panel and ask: is anything still attached?
  const { targetId: panel2 } = await b.send('Target.createTarget', { url: `chrome-extension://${extId}/sidepanel.html` });
  await sleep(600);
  await b.send('Target.activateTarget', { targetId: pageId });
  await sleep(600);
  const p2 = await b.attach(panel2);
  await p2('Runtime.enable', {});
  const ev2 = async e => (await p2('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result.value;
  await until('panel2 ready', async () => (await ev2(`document.getElementById('tab-url').textContent`)).includes('127.0.0.1'));
  await ev2(`(()=>{const o=document.getElementById('output-content');o.textContent='';return true})()`);
  await ev2(`document.querySelector('[data-action="detach"]').click(); true`);
  const afterClose = await until('after close', async () => { const t = await ev2(`document.getElementById('output-content').textContent`); return t?t:null; });
  ok('closing the panel already ended the session', afterClose.includes('No active session'), afterClose);
} catch (e) { fail.push('HARNESS: '+e.message); }
finally { await b.close(); server.close(); }
console.log('\n=== PASS ('+pass.length+') ==='); pass.forEach(p=>console.log('  ✓ '+p));
if (fail.length){ console.log('\n=== FAIL ('+fail.length+') ==='); fail.forEach(f=>console.log('  ✗ '+f)); }
process.exit(fail.length?1:0);
