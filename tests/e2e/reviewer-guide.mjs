/**
 * Executes the numbered steps of the Reviewer Verification Guide in
 * STORE_LISTING.md against a real Chrome, using the same real sites a reviewer
 * would use. If a step here fails, a reviewer following the guide sees it fail.
 */
import { launch, sleep, until, EXT } from './harness.mjs';

const PORT = 9391;
const b = await launch(PORT);
const pass = [], fail = [];
const ok = (n, c, d = '') => (c ? pass : fail).push(n + (d ? ` — ${d}` : ''));

try {
  const { id: extId } = await b.send('Extensions.loadUnpacked', { path: EXT });
  await until('sw', async () => (await b.targets()).find(t => t.type === 'service_worker' && t.url.includes(extId)));

  const { targetId: pageId } = await b.send('Target.createTarget', { url: 'about:blank' });
  await sleep(600);
  const { targetId: panelId } = await b.send('Target.createTarget', { url: `chrome-extension://${extId}/sidepanel.html` });
  await sleep(600);
  await b.send('Target.activateTarget', { targetId: pageId });
  await sleep(600);

  const panel = await b.attach(panelId);
  await panel('Runtime.enable', {});
  const ev = async e => {
    const r = await panel('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'panel eval threw');
    return r.result.value;
  };
  const clear = () => ev(`(()=>{const o=document.getElementById('output-content');o.textContent='';o.classList.remove('is-error');return true})()`);
  const out = () => ev(`document.getElementById('output-content').textContent`);
  const isErr = () => ev(`document.getElementById('output-content').classList.contains('is-error')`);
  const status = () => ev(`document.querySelector('#status-indicator .status-text').textContent`);
  const settle = (label, pred) => until(label, async () => { const t = await out(); return t && pred(t) ? t : null; }, 25000);

  await until('panel ready', async () => (await ev(`document.getElementById('tab-url').textContent`)) !== 'No tab selected');

  // ---- step 2: Navigate to example.com --------------------------------------
  await clear();
  await ev(`document.getElementById('nav-url').value='example.com'; document.getElementById('nav-go').click(); true`);
  const navOut = await settle('navigate', t => t.length > 0);
  ok('step 2 — Navigate reports the resolved URL',
     navOut.includes('Navigated to https://example.com/'), navOut.slice(0, 90));
  const realUrl = await until('tab url', async () => {
    const t = (await b.targets()).find(x => x.targetId === pageId);
    return t?.url?.includes('example.com') ? t.url : null;
  });
  ok('step 2 — the tab really loaded example.com', !!realUrl, realUrl);

  // ---- step 3: Run JavaScript ----------------------------------------------
  await clear();
  await ev(`document.getElementById('eval-code').value='document.title'; document.getElementById('eval-go').click(); true`);
  const titleOut = await settle('title', t => t.length > 0);
  ok('step 3 — Run JavaScript returns "Example Domain"', titleOut.includes('Example Domain'), titleOut.slice(0, 90));

  // ---- step 6: Extract Data --------------------------------------------------
  await clear();
  await ev(`document.querySelector('[data-action="extract"]').click(); true`);
  const exOut = await settle('extract', t => t.length > 0);
  ok('step 6 — Extract Data returns title, url, headings',
     exOut.includes('Example Domain') && exOut.includes('headings'), exOut.slice(0, 70).replace(/\n/g, ' '));

  // ---- step 7: Screenshot ----------------------------------------------------
  await clear();
  await ev(`document.querySelector('[data-action="screenshot"]').click(); true`);
  const shot = await until('screenshot', async () => {
    const r = await ev(`(()=>{const i=document.getElementById('screenshot-img');const a=document.getElementById('screenshot-save');
      return {len:(i.src||'').length, png:(i.src||'').startsWith('data:image/png;base64,'), save:(a.getAttribute('href')||'').slice(0,5), text:a.textContent};})()`);
    return r.len > 1000 ? r : null;
  });
  ok('step 7 — image appears with a "Save image" link',
     shot.png && shot.save === 'blob:' && /save/i.test(shot.text), JSON.stringify(shot).slice(0, 90));

  // ---- step 10: selector matching nothing ------------------------------------
  await clear();
  await ev(`document.getElementById('click-selector').value='#nope'; document.getElementById('click-go').click(); true`);
  await settle('nope', t => t.length > 0);
  ok('step 10 — a missing selector turns the box red and status "Failed"',
     (await isErr()) === true && (await status()) === 'Failed', `err=${await isErr()} status=${await status()}`);

  // ---- step 11: failed navigation --------------------------------------------
  await clear();
  await ev(`document.getElementById('nav-url').value='this-host-does-not-exist.example'; document.getElementById('nav-go').click(); true`);
  const dnsOut = await settle('dns', t => t.length > 0);
  ok('step 11 — a dead hostname reports the network error, not success',
     /ERR_NAME_NOT_RESOLVED|ERR_/.test(dnsOut) && !dnsOut.includes('Navigated to'), dnsOut.slice(0, 90));
  ok('step 11 — status reads Failed', (await status()) === 'Failed', await status());

  // back to example.com for the remaining steps
  await clear();
  await ev(`document.getElementById('nav-url').value='https://example.com/'; document.getElementById('nav-go').click(); true`);
  await settle('renav', t => t.includes('Navigated'));

  // ---- step 4: Click a link ---------------------------------------------------
  await clear();
  await ev(`document.getElementById('click-selector').value='a'; document.getElementById('click-go').click(); true`);
  const clickOut = await settle('click', t => t.length > 0);
  ok('step 4 — Click reports "Clicked a"', clickOut.includes('Clicked a'), clickOut.slice(0, 90));

  // ---- step 12: type into something that is not a field ------------------------
  await clear();
  await ev(`document.getElementById('nav-url').value='https://example.com/'; document.getElementById('nav-go').click(); true`);
  await settle('renav2', t => t.includes('Navigated') || t.includes('ERR'));
  await clear();
  await ev(`document.getElementById('type-selector').value='h1'; document.getElementById('type-text').value='zzq-not-a-field'; document.getElementById('type-go').click(); true`);
  const badType = await settle('bad type', t => t.length > 0);
  ok('step 12 — typing into an <h1> is refused, not reported as typed',
     !badType.includes('Typed into') && /not accepted|input, textarea|editable/i.test(badType), badType.slice(0, 110));

  // ---- step 9: Console Logs ----------------------------------------------------
  await clear();
  await ev(`document.getElementById('eval-code').value="console.log('reviewer-guide-line'); 'done'"; document.getElementById('eval-go').click(); true`);
  await settle('log emitted', t => t.length > 0);
  await clear();
  await ev(`document.querySelector('[data-action="console"]').click(); true`);
  const logsOut = await settle('console', t => t.length > 0);
  ok('step 9 — Console Logs shows output or explains why it is empty',
     logsOut.includes('reviewer-guide-line') || /No console output yet/i.test(logsOut), logsOut.slice(0, 110).replace(/\n/g, ' | '));

  // ---- step 16: History ---------------------------------------------------------
  await ev(`document.querySelector('.mode-tab[data-mode="history"]').click(); true`);
  const rows = await until('history', async () => await ev(`document.querySelectorAll('#history-list .history-item').length`) || null);
  const actions = await ev(`Array.from(document.querySelectorAll('#history-list .history-action')).map(e=>e.textContent)`);
  ok('step 16 — History lists the successful actions', rows >= 5, `${rows} rows: ${[...new Set(actions)].join(', ')}`);
  ok('step 16 — Console Logs and End Session are not recorded',
     !actions.includes('Console Logs') && !actions.includes('End Session'), [...new Set(actions)].join(', '));

  // ---- step 17: End Session -------------------------------------------------------
  await ev(`document.querySelector('.mode-tab[data-mode="tools"]').click(); true`);
  await clear();
  await ev(`document.querySelector('[data-action="detach"]').click(); true`);
  const endOut = await settle('end', t => t.length > 0);
  ok('step 17 — End Session confirms the session ended', endOut.includes('Session ended'), endOut.slice(0, 90));

  // ---- step 14: a brand-new tab (the New Tab Page, not about:blank) ----------
  const { targetId: ntpId } = await b.send('Target.createTarget', { url: 'chrome://newtab/' });
  await sleep(1200);
  await b.send('Target.activateTarget', { targetId: ntpId });
  await until('panel follows ntp', async () => {
    const t = await ev(`document.getElementById('tab-url').textContent`);
    // The header now names the state rather than echoing chrome://newtab/.
    return /newtab|new-tab|Open a website in this tab first/i.test(t) ? t : null;
  });
  await clear();
  await ev(`document.getElementById('eval-code').value='document.title'; document.getElementById('eval-go').click(); true`);
  const ntpOut = await settle('ntp', t => t.length > 0);
  ok('step 14 — a brand-new tab says to open a website first',
     /Open a website in this tab first/i.test(ntpOut), ntpOut.slice(0, 100));

  // ---- about:blank must NOT be refused (regression) ---------------------------
  const { targetId: blankId } = await b.send('Target.createTarget', { url: 'about:blank' });
  await sleep(800);
  await b.send('Target.activateTarget', { targetId: blankId });
  await until('panel follows blank', async () => {
    const t = await ev(`document.getElementById('tab-url').textContent`);
    return t.includes('about:blank') ? t : null;
  });
  await clear();
  await ev(`document.getElementById('nav-url').value='example.com'; document.getElementById('nav-go').click(); true`);
  const fromBlank = await settle('nav from blank', t => t.length > 0);
  ok('a blank tab can still be navigated (was wrongly refused)',
     fromBlank.includes('Navigated to https://example.com/'), fromBlank.slice(0, 100));

} catch (e) {
  fail.push('HARNESS ERROR: ' + e.message);
} finally {
  await b.close();
}

console.log('\n=== PASS (' + pass.length + ') ==='); pass.forEach(p => console.log('  ✓ ' + p));
if (fail.length) { console.log('\n=== FAIL (' + fail.length + ') ==='); fail.forEach(f => console.log('  ✗ ' + f)); }
process.exit(fail.length ? 1 : 0);
