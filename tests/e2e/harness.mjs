import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

export const CHROME =
    process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/** The built extension, resolved from this file so the suite is portable. */
export const EXT = fileURLToPath(new URL('../../dist', import.meta.url));
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** A real page to automate: input, link, button, console output. */
export const TEST_PAGE = `<!doctype html><html><head><title>E2E Fixture</title></head>
<body style="font-family:sans-serif">
  <h1 id="heading">Fixture Heading</h1>
  <h2>Second Heading</h2>
  <input id="field" name="q" value="">
  <input id="quoted" name='single'>
  <textarea id="area"></textarea>
  <button id="btn" onclick="document.getElementById('out').textContent='clicked'">Press</button>
  <div id="out">idle</div>
  <a id="link" href="/second.html">Go second</a>
  <img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="pixel">
  <div style="height:3000px"></div>
  <script>console.log('fixture-log-line'); console.warn({a:1,b:'two'}); setTimeout(()=>{ throw new Error('fixture-boom'); },50);</script>
</body></html>`;

export function startServer(port) {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/second')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>Second Page</title><h1>Second</h1>');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(TEST_PAGE);
  });
  return new Promise(r => server.listen(port, '127.0.0.1', () => r(server)));
}

/**
 * Launch headless Chrome with the extension-debugging flag.
 *
 * `extraArgs` is appended before the start URL; existing callers pass nothing
 * and get exactly the command line they always had.
 */
export async function launch(port, extraArgs = []) {
  const profile = mkdtempSync(join(tmpdir(), 'cws-e2e-'));
  const chrome = spawn(CHROME, [
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    '--no-first-run', '--no-default-browser-check',
    '--disable-crash-reporter', '--disable-breakpad',
    '--enable-unsafe-extension-debugging',
    '--headless=new',
    ...extraArgs,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore'] });

  let wsUrl = null;
  for (let i = 0; i < 60; i++) {
    await sleep(250);
    try { const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); wsUrl = v.webSocketDebuggerUrl; if (wsUrl) break; } catch {}
  }
  if (!wsUrl) throw new Error('Chrome did not expose a debugging endpoint');

  const ws = new WebSocket(wsUrl);
  let id = 0; const pending = new Map(); const events = [];
  const raw = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const m = ++id; pending.set(m, { res, rej });
    ws.send(JSON.stringify({ id: m, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else if (msg.method) events.push(msg);
  };
  await new Promise(r => ws.onopen = r);
  await raw('Target.setDiscoverTargets', { discover: true });

  return {
    chrome, ws, events,
    send: raw,
    async close() { try { ws.close(); } catch {} chrome.kill('SIGKILL'); },
    async targets() { return (await raw('Target.getTargets')).targetInfos; },
    /** Attach to a target and return a session-scoped send(). */
    async attach(targetId) {
      const { sessionId } = await raw('Target.attachToTarget', { targetId, flatten: true });
      return (method, params) => raw(method, params, sessionId);
    },
  };
}

/** Poll until fn() returns truthy, or throw. */
export async function until(label, fn, timeoutMs = 15000, stepMs = 200) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e.message; }
    await sleep(stepMs);
  }
  throw new Error(`timeout waiting for ${label} (last: ${JSON.stringify(last)?.slice(0, 200)})`);
}
