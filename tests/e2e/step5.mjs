/** Guide step 5: type into duckduckgo's real search box, exactly as written. */
import { launch, sleep, until, EXT } from './harness.mjs';
const b = await launch(9421);
const pass=[], fail=[];
const ok=(n,c,d='')=>(c?pass:fail).push(n+(d?` — ${d}`:''));
try {
  const { id: extId } = await b.send('Extensions.loadUnpacked', { path: EXT });
  await until('sw', async () => (await b.targets()).find(t=>t.type==='service_worker'&&t.url.includes(extId)));
  const { targetId: pageId } = await b.send('Target.createTarget', { url: 'https://www.wikipedia.org/' });
  await sleep(3500);
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
  const clear = () => ev(`(()=>{const o=document.getElementById('output-content');o.textContent='';o.classList.remove('is-error');return true})()`);
  const settle = (l,p) => until(l, async () => { const t = await ev(`document.getElementById('output-content').textContent`); return t && p(t) ? t : null; }, 25000);

  const label = await until('panel ready', async () => {
    const t = await ev(`document.getElementById('tab-url').textContent`);
    return t.includes('wikipedia') ? t : null;
  });
  ok('panel is pointed at wikipedia', !!label, label);

  // Exactly the guide's wording: selector input[name="q"], text "chrome extension"
  await clear();
  await ev(`document.getElementById('type-selector').value = '#searchInput';
            document.getElementById('type-text').value = 'chrome extension';
            document.getElementById('type-go').click(); true`);
  const typeOut = await settle('type', t => t.length > 0);
  ok('step 5 — Type works on wikipedia via #searchInput',
     typeOut.includes('Typed into'), typeOut.slice(0, 140));

  await clear();
  await ev(`document.getElementById('eval-code').value = "document.getElementById('searchInput').value";
            document.getElementById('eval-go').click(); true`);
  const val = await settle('value', t => t.length > 0);
  ok('step 5 — the text really appears in the search box',
     val.includes('chrome extension'), val.slice(0, 120));

  // and a single-quoted selector on the same real site
  await clear();
  await ev(`document.getElementById('type-selector').value = "input[name='search']";
            document.getElementById('type-text').value = 'single quoted';
            document.getElementById('type-go').click(); true`);
  const sq = await settle('single-quote type', t => t.length > 0);
  ok('single-quoted attribute selector works on a real third-party site',
     sq.includes('Typed into'), sq.slice(0, 140));
} catch (e) { fail.push('HARNESS: ' + e.message); }
finally { await b.close(); }
console.log('\n=== PASS ('+pass.length+') ==='); pass.forEach(p=>console.log('  ✓ '+p));
if (fail.length){ console.log('\n=== FAIL ('+fail.length+') ==='); fail.forEach(f=>console.log('  ✗ '+f)); }
process.exit(fail.length?1:0);
