# PraisonAI Browser Agent

A Chrome side panel that drives the active tab through the Chrome DevTools
Protocol. Navigate, click, type, run JavaScript, scroll, screenshot, extract
page data and read console output — all locally, with no server, no account and
no model.

Docs: **<https://chrome.praison.ai>**  ·  Version **1.0.4**

## Features

- **Navigate** — load a URL in the active tab, wait for it to finish loading,
  and fail with the network error if it does not
- **Click** — click the first element matching a CSS selector
- **Type** — clear a field matched by a selector, type into it, and verify the
  text landed
- **Run JavaScript** — evaluate one expression in the page and show the result
- **Scroll** — scroll the page up or down
- **Screenshot** — capture the viewport, shown in the panel with a *Save image*
  link (nothing is written to disk automatically)
- **Extract Data** — page title, URL, headings, links and images as JSON
- **Console Logs** — console output captured since the session attached, kept in
  `chrome.storage.session` so it survives the service worker being suspended
- **End Session** — detach the debugger and report what actually happened
- **History** — the last 50 actions, stored locally in `chrome.storage.local`

The panel scopes itself to its own browser window and disables its controls
while an action is running.

Keyboard shortcuts (both declared as `commands` in the manifest and handled in
`chrome.commands.onCommand`): `open-panel` on
<kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> opens the panel,
`capture-screenshot` on <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>
captures a screenshot. Two context-menu items — *Capture screenshot* and *Open
PraisonAI panel* — are registered with `contexts: ['all']`, so they appear on
the page and on links, images and selected text.

## Two disclosures up front

- **Chrome shows a debugging banner.** Controlling a page requires attaching
  Chrome's debugger, and Chrome displays *"PraisonAI Browser Agent started
  debugging this browser"* for as long as it is attached. That banner is
  Chrome's and cannot be hidden. Click **End Session** (or *Cancel* in the
  banner) to detach.
- **Chrome blocks automation on some pages.** `chrome://` pages, other
  extensions' pages, `devtools://`, `about:` pages (except `about:blank`) and the Chrome Web Store
  cannot be automated. The panel says so before you try. A brand-new, empty tab
  gets a different message — *"Open a website in this tab first"* — because
  there is no page to act on yet.

## Requirements

- Chrome 116+ (`chrome.sidePanel.open()`, used by the `open-panel` command and
  the context-menu item, was added in 116)
- Node 20+ to build from source

Nothing else. No API key, no Python, no companion app.

## Install

### From a release

1. Download
   [`praisonai-extension.zip`](https://github.com/MervinPraison/praisonai-chrome-extension/releases/latest/download/praisonai-extension.zip)
2. Unzip it
3. Open `chrome://extensions`, enable **Developer mode**
4. Click **Load unpacked** and select the unzipped folder

### From source

```bash
npm install
npm run build        # writes dist/
```

Then load `dist/` unpacked:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist` folder

Other scripts:

```bash
npm run dev          # watch build
npm run build:zip    # build + zip dist/ to praisonai-extension.zip
npm test             # vitest
npm run typecheck    # tsc --noEmit
npm run lint
```

## Usage

1. Open a normal `http(s)` page.
2. Open the panel (toolbar icon or <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>).
3. Run an action — try `document.title` in **Run JavaScript**.
4. Click **End Session** when you are done, to detach the debugger.

Failures are always reported in the panel's Output box; no action reports
success unless it ran.

## Architecture

```
Side panel  --chrome.runtime.sendMessage-->  Background service worker
                                                     |
                                              CDPClient (src/cdp/client.ts)
                                                     |
                                              chrome.debugger --> the tab
```

```
src/
├── background/
│   └── index.ts      # service worker: CDP sessions, message router, history,
│                     #   commands, context menus
├── cdp/
│   └── client.ts     # CDPClient — chrome.debugger.attach / sendCommand wrapper
└── sidepanel/
    ├── sidepanel.html
    ├── styles.css
    └── index.ts      # the entire UI
```

`vite.config.ts` builds exactly two entry points, `background` and
`sidepanel`, and copies `manifest.json`, `sidepanel.html`, `styles.css` and the
icons into `dist/`.

### `future/agent-mode/` is parked code

The repository keeps the agent-mode code that was removed in 1.0.4 under
`future/agent-mode/`, alongside a `RESTORE.md` explaining why it was cut and
what must be fixed first. **It is not built and not shipped** — it has
no entry point in `vite.config.ts` and never reaches `dist/` or the packaged
archive. See <https://chrome.praison.ai/removed-features/>.

## Permissions

Six, and no host permissions declared.

> **Chrome will still warn** that the extension can *"Read and change all your
> data on all websites."* That comes from `debugger`, which the DevTools
> Protocol requires — it is the ceiling of what the permission allows, not what
> the extension does. `chrome.permissions.getAll()` reports `origins: []`. The
> debugger attaches to one tab at a time and only in response to something you
> did, shows Chrome's banner throughout, and detaches on **End Session**, when
> the panel closes, or straight after a shortcut/right-click screenshot taken
> with the panel closed.

| Permission | Why |
|------------|-----|
| `sidePanel` | The extension is a side panel |
| `tabs` | Read the active tab's URL to target it and to warn when Chrome blocks automation there |
| `debugger` | Every action: navigate, click, type, evaluate, screenshot, via CDP |
| `storage` | Local action history (`local`), plus the most recent screenshot and each tab's captured console output (`session`) |
| `contextMenus` | Two right-click items, `contexts: ['all']` |
| `notifications` | Report the result of a screenshot taken while the panel is closed |

`chrome.runtime`, `chrome.commands` and `chrome.windows` are also used and need
no permission entry. That is the complete set of Chrome APIs the shipped code
touches: `runtime`, `tabs`, `windows`, `debugger`, `storage`, `sidePanel`,
`commands`, `contextMenus`, `notifications`.

Not requested: host permissions, `scripting`, content scripts, `downloads`,
`offscreen`, `alarms`, `activeTab`, `cookies`, `webRequest`,
`externally_connectable`.

## Privacy

- No network requests. No server, no account, no analytics, no telemetry.
- No remote code: CSP is `script-src 'self'; object-src 'self'`.
- History stays in `chrome.storage.local`; **Clear history** or uninstalling
  removes it.
- The last screenshot and each tab's captured console output stay in
  `chrome.storage.session`, which Chrome clears on exit. **End Session** or
  closing the tab drops that tab's console output immediately.
- The debugger attaches only to a tab you act on, only while you are using it,
  and Chrome shows a banner the whole time.

## Chrome Web Store build

```bash
npm run build:zip     # -> praisonai-extension.zip, built from dist/ only
```

## License

MIT
