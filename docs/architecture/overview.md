# Architecture Overview

The extension has three moving parts and one data path. Nothing else exists —
no content script, no offscreen document, no network client.

```
  Side panel (sidepanel.html + sidepanel.js)
        |
        |  chrome.runtime.sendMessage({ type: 'CDP_CLICK', tabId, selector })
        v
  Background service worker (background.js)
        |
        |  CDPClient.send('Input.dispatchMouseEvent', ...)
        v
  chrome.debugger  ->  the tab you targeted
```

The response travels back the same way: the worker replies to the message and
the panel renders the result — or the error — in the Output box.

## The pieces

| File | Role |
| --- | --- |
| `src/sidepanel/sidepanel.html`, `styles.css`, `index.ts` | The entire UI. Reads the active tab of its own window, sends one message per action, renders every outcome. |
| `src/background/index.ts` | Service worker. Owns CDP sessions per tab, routes messages, records history, handles commands and context menus. |
| `src/cdp/client.ts` | `CDPClient` — a thin typed wrapper over `chrome.debugger.attach` / `sendCommand`. |
| `manifest.json` | MV3 manifest: side panel, service worker, two commands, six permissions. |

Only two entry points are built (`vite.config.ts`): `background` and
`sidepanel`. `manifest.json`, `sidepanel.html`, `styles.css` and the icons are
copied verbatim into `dist/`.

## The flow, step by step

1. You click a button in the panel. The panel disables every button for the
   duration, so two actions cannot overlap on one tab.
2. The panel calls `chrome.runtime.sendMessage` with a typed message and the id
   of the active tab **in the panel's own window** — for example
   `{ type: 'CDP_EVALUATE', tabId: 42, expression: 'document.title' }`.
3. `handleMessage` in the service worker switches on `type`.
4. `ensureCDP(tabId)` returns the existing `CDPClient` for that tab, or checks
   the tab still exists, has a page loaded, and is not a restricted URL, then
   attaches a new one.
5. The client issues the CDP command through `chrome.debugger.sendCommand`.
6. The worker returns `{ success, data }` or `{ success: false, error }` —
   never a success for a failed command. Navigate, click, type and scroll all
   forward the real CDP outcome rather than assuming it worked.
7. On success the action is appended to history in `chrome.storage.local`.
8. The panel renders the data, or renders the error and sets the status to
   **Failed**, then re-enables the buttons.

## Session lifecycle

- A session is created lazily on the first action against a tab and cached in a
  `Map<tabId, CDPClient>`.
- `attach()` enables `DOM`, `Page`, `Runtime` and `Log`.
- Console events arriving on `chrome.debugger.onEvent` are buffered per tab,
  capped at 200 entries, and mirrored to `chrome.storage.session` so they
  survive the service worker being suspended.
- Sessions are torn down by **End Session** (`DETACH`, which calls
  `chrome.debugger.detach` on the tab directly and reports the real outcome), by
  `chrome.debugger.onDetach` (Chrome detaches when DevTools opens on the tab or
  the page becomes restricted), or by `chrome.tabs.onRemoved`.
- The worker is recycled after roughly 30 seconds idle, which loses the
  `CDPClient` map while Chrome keeps the debugger attached. `attachCDP` detects
  the resulting *"already attached"* error, detaches the orphaned session and
  attaches again.
- While a session lives, Chrome shows its debugging banner. That is the
  visible, user-cancellable signal that the extension has access to the tab.

## State and storage

| Where | What | Lifetime |
| --- | --- | --- |
| `chrome.storage.local` | `history` — last 50 actions (`action`, `detail`, timestamp) | Until you clear it or uninstall |
| `chrome.storage.session` | `lastScreenshot` — the most recent capture as a data URL, with its timestamp | Until Chrome closes (the panel only *displays* it if it is under 5 minutes old) |
| `chrome.storage.session` | `console:<tabId>` — that tab's captured console output, last 200 entries | Until **End Session**, the tab closes, or Chrome closes |
| Service worker memory | Per-tab `CDPClient` map and a live copy of the console buffer | Until the session detaches or the worker is suspended; the console copy is re-read from session storage after a restart |

Nothing is written anywhere else, and nothing leaves the browser.

## What is deliberately absent

- **No content script.** No code is injected into pages at load time; the only
  code that runs in a page is the expression you type, or the small extraction
  snippet, both via `Runtime.evaluate` on demand.
- **No host permissions declared.** Access is scoped to the tab you act on,
  through the debugger, for as long as the session lasts. Chrome nonetheless
  warns about access to all websites, because `debugger` implies it — see
  [Privacy](../privacy.md).
- **No network.** The service worker makes no `fetch`, opens no socket and
  talks to no server. The content security policy is `script-src 'self'`, so no
  remote code can be loaded.

Code that used to sit outside this diagram — an autonomous agent, a connection
to local software, a hidden background page — was removed in 1.0.4 and is
parked, unbuilt, in `future/agent-mode/`. See [What was removed](../removed-features.md).
