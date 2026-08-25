/**
 * Shared fixtures + panel driver for the extended e2e suite.
 *
 * Nothing here talks to the extension directly: every assertion in the test
 * files is made by reading the real side-panel DOM or the real browser state.
 */
import http from 'node:http';
import { until } from './harness.mjs';

/** A page with everything the extended tests need, tagged so tabs are telling apart. */
export const fixturePage = (tag) => `<!doctype html><html><head><title>Fixture ${tag}</title></head>
<body style="font-family:sans-serif;margin:0">
  <h1 id="heading">Heading ${tag}</h1>
  <input id="field" name="q" value="">
  <div id="wrap" style="padding:8px;border:1px solid #999"><button id="inner" type="button">Inner ${tag}</button></div>
  <div id="marker">idle</div>
  <div style="height:4000px">tall</div>
  <script>
    document.getElementById('wrap').addEventListener('click', function () {
      document.getElementById('marker').textContent = 'wrap-clicked';
    });
    console.log('log-from-${tag}');
  </script>
</body></html>`;

/** Serves /?tag=X (and /) - the tag lands in the title, h1 and console output. */
export function startFixtureServer(port) {
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const raw = url.searchParams.get('tag') ?? 'X';
        const tag = raw.replace(/[^A-Za-z0-9_-]/g, '') || 'X';
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(fixturePage(tag));
    });
    return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}

/**
 * Drive one side panel through its real DOM.
 *
 * `clear()` before every action: the poller would otherwise match the previous
 * action's text and report a result that never happened.
 */
export function driver(send) {
    const ev = async (expression) => {
        const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) {
            throw new Error(r.exceptionDetails.exception?.description ?? 'panel eval threw');
        }
        return r.result.value;
    };

    const d = {
        ev,
        out: () => ev(`document.getElementById('output-content').textContent`),
        isError: () => ev(`document.getElementById('output-content').classList.contains('is-error')`),
        status: () => ev(`document.querySelector('#status-indicator .status-text').textContent`),
        tabLabel: () => ev(`document.getElementById('tab-url').textContent`),
        restrictedClass: () => ev(`document.getElementById('tab-url').classList.contains('is-restricted')`),
        clear: () => ev(`(() => { const o = document.getElementById('output-content');
            o.textContent = ''; o.classList.remove('is-error'); return true; })()`),

        /** Wait until the panel shows a tab whose label contains `needle`. */
        waitTab: (needle, ms = 20000) =>
            until(`panel tab label ~ ${needle}`, async () => {
                const t = await d.tabLabel();
                if (!t) return null;
                // Blank surfaces (chrome://newtab/ and friends) are labelled by
                // state rather than by URL.
                const blank = /^chrome:\/\/(newtab|new-tab)/.test(needle)
                    && /Open a website in this tab first/i.test(t);
                return t.includes(needle) || blank ? t : null;
            }, ms),

        /** Run one action and return everything the panel says about it. */
        async act(clickExpr, ms = 30000) {
            await d.clear();
            await ev(`${clickExpr}; true`);
            const text = await until('panel output', async () => (await d.out()) || null, ms);
            return { text, error: await d.isError(), status: await d.status() };
        },
        tool: (action, ms) => d.act(`document.querySelector('[data-action="${action}"]').click()`, ms),
        button: (id, ms) => d.act(`document.getElementById('${id}').click()`, ms),

        /** Fill an input then press its button. */
        async fillAct(fills, buttonId, ms) {
            for (const [id, value] of Object.entries(fills)) {
                await ev(`document.getElementById(${JSON.stringify(id)}).value = ${JSON.stringify(value)}; true`);
            }
            return d.button(buttonId, ms);
        },

        /** Run an expression in the PAGE through the panel's Run JavaScript tool. */
        async pageEval(expression, ms) {
            return d.fillAct({ 'eval-code': expression }, 'eval-go', ms);
        },
    };
    return d;
}

/** Standard scoreboard. */
export function scoreboard() {
    const pass = [], fail = [];
    return {
        pass, fail,
        ok: (name, cond, detail = '') => (cond ? pass : fail).push(name + (detail ? ` — ${detail}` : '')),
        report(label) {
            console.log(`\n=== ${label}: PASS (${pass.length}) ===`);
            pass.forEach((p) => console.log('  ✓ ' + p));
            if (fail.length) {
                console.log(`\n=== ${label}: FAIL (${fail.length}) ===`);
                fail.forEach((f) => console.log('  ✗ ' + f));
            }
            process.exit(fail.length ? 1 : 0);
        },
    };
}

/** Open a panel tab in the current window and return an attached driver. */
export async function openPanel(b, extId, activateTargetId, sleep) {
    const { targetId } = await b.send('Target.createTarget', { url: `chrome-extension://${extId}/sidepanel.html` });
    await sleep(800);
    if (activateTargetId) {
        await b.send('Target.activateTarget', { targetId: activateTargetId });
        await sleep(800);
    }
    const send = await b.attach(targetId);
    await send('Runtime.enable', {});
    return { targetId, d: driver(send) };
}
