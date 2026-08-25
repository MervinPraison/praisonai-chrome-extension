# Real-browser end-to-end suite

These tests drive the **built extension in a real Chrome**, not a mock. They
exist because the unit suite cannot see whether `chrome.debugger` actually
clicks, types or detaches — and several bugs in this extension were only ever
visible from a live browser.

## Running

```bash
npm run build        # tests load dist/, so build first
node tests/e2e/smoke.mjs
node tests/e2e/all.mjs        # every suite, sequentially
```

Set `CHROME_PATH` if Chrome is not at the macOS default location.

## How the harness works

Recent Chrome **ignores `--load-extension`**. The harness launches with
`--enable-unsafe-extension-debugging` and loads the extension through the CDP
`Extensions.loadUnpacked` call on the browser target, which returns the
extension id.

To drive the real UI it opens the fixture page in one tab and
`chrome-extension://<id>/sidepanel.html` in a second tab of the same window,
then activates the *fixture* tab so the panel targets it rather than itself.
Panel buttons are clicked with `Runtime.evaluate`.

Two rules worth knowing before adding a test:

- **Blank `#output-content` before each action.** Otherwise polling matches the
  previous action's text and you get a false pass.
- **Never attach your own debugger to the fixture tab** — it collides with the
  extension's own session.

## Suites

| File | Covers |
| --- | --- |
| `smoke.mjs` | every advertised feature, end to end |
| `reviewer-guide.mjs` | the numbered steps from `STORE_LISTING.md`, against real sites |
| `step5.mjs` | typing into a real third-party page (wikipedia) |
| `restricted.mjs` | `chrome://`, the Web Store, `about:blank`, a new tab, rapid switching |
| `windows.mjs` | two windows, one panel each — per-window scoping |
| `tabs.mjs` | two tabs, independent sessions and console buffers |
| `actions.mjs` | scroll via `window.scrollY`, non-typable targets, `:has()`, concurrency |
| `worker.mjs` | forced service-worker restart, port lifetime, idle survival |
| `attachrace.mjs` | concurrent attaches, and that closing the panel ends every session |
| `detach.mjs` | session lifecycle |
| `menus.mjs` | command and context-menu registration, side-panel behaviour |
