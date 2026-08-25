/**
 * Compose store screenshots: the real page on the left, the real side panel on
 * the right, at the proportions Chrome actually docks them. Both halves are
 * genuine captures of the running extension — nothing is mocked.
 */
import { launch, sleep, until, EXT } from '../tests/e2e/harness.mjs';
import { writeFileSync } from 'node:fs';

const W = 1280, H = 800, PANEL = 420, PAGE = W - PANEL;
const b = await launch(9561);
const out = [];
try {
  const { id: extId } = await b.send('Extensions.loadUnpacked', { path: EXT });
  await until('sw', async () => (await b.targets()).find(t => t.type === 'service_worker' && t.url.includes(extId)));

  const { targetId: pageId } = await b.send('Target.createTarget', { url: 'https://example.com/' });
  await sleep(3000);
  const { targetId: panelId } = await b.send('Target.createTarget', { url: `chrome-extension://${extId}/sidepanel.html` });
  await sleep(900);
  await b.send('Target.activateTarget', { targetId: pageId });
  await sleep(900);

  const page = await b.attach(pageId);
  await page('Emulation.setDeviceMetricsOverride', { width: PAGE, height: H, deviceScaleFactor: 2, mobile: false });

  const panel = await b.attach(panelId);
  await panel('Runtime.enable', {});
  await panel('Emulation.setDeviceMetricsOverride', { width: PANEL, height: H, deviceScaleFactor: 2, mobile: false });
  const ev = async e => {
    const r = await panel('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'threw');
    return r.result.value;
  };
  const text = () => ev(`document.getElementById('output-content').textContent`);
  const settle = (l, p) => until(l, async () => { const t = await text(); return t && p(t) ? t : null; }, 25000);
  const clear = () => ev(`(()=>{const o=document.getElementById('output-content');o.textContent='';return true})()`);
  await until('ready', async () => (await ev(`document.getElementById('tab-url').textContent`)).includes('example.com'));

  const shoot = async (name) => {
    const [p, s] = await Promise.all([
      page('Page.captureScreenshot', { format: 'png' }),
      panel('Page.captureScreenshot', { format: 'png' }),
    ]);
    out.push([name, p.data, s.data]);
  };

  await clear();
  await ev(`document.getElementById('eval-code').value='document.title'; document.getElementById('eval-go').click(); true`);
  await settle('runjs', t => t.includes('Example Domain'));
  await shoot('01-run-javascript');

  await clear();
  await ev(`document.querySelector('[data-action="extract"]').click(); true`);
  await settle('extract', t => t.includes('headings'));
  await shoot('02-extract-data');

  await ev(`document.querySelector('[data-action="screenshot"]').click(); true`);
  await until('cap', async () => (await ev(`document.getElementById('screenshot-img').src.length`)) > 1000);
  await sleep(500);
  await shoot('03-screenshot');

  await ev(`document.querySelector('.mode-tab[data-mode="history"]').click(); true`);
  await sleep(700);
  await shoot('04-history');
} finally { await b.close(); }

for (const [name, pageB64, panelB64] of out) {
  writeFileSync(`store_assets/tmp-${name}-page.png`, Buffer.from(pageB64, 'base64'));
  writeFileSync(`store_assets/tmp-${name}-panel.png`, Buffer.from(panelB64, 'base64'));
  console.log('captured', name);
}
