# Manifest & Permissions

The shipped `manifest.json` for version 1.0.4, reproduced verbatim, followed by
an honest justification for each permission.

```json
{
    "manifest_version": 3,
    "name": "PraisonAI Browser Agent",
    "version": "1.0.4",
    "description": "Side panel browser automation. Navigate, click, type, run JavaScript, extract page data, and capture screenshots.",
    "homepage_url": "https://chrome.praison.ai",
    "minimum_chrome_version": "116",
    "permissions": [
        "sidePanel",
        "tabs",
        "debugger",
        "storage",
        "contextMenus",
        "notifications"
    ],
    "commands": {
        "open-panel": {
            "suggested_key": {
                "default": "Ctrl+Shift+P",
                "mac": "Command+Shift+P"
            },
            "description": "Open PraisonAI panel"
        },
        "capture-screenshot": {
            "suggested_key": {
                "default": "Ctrl+Shift+S",
                "mac": "Command+Shift+S"
            },
            "description": "Capture screenshot"
        }
    },
    "background": {
        "service_worker": "background.js",
        "type": "module"
    },
    "side_panel": {
        "default_path": "sidepanel.html"
    },
    "action": {
        "default_title": "PraisonAI Browser Agent",
        "default_icon": {
            "16": "icons/icon16.png",
            "32": "icons/icon32.png",
            "48": "icons/icon48.png",
            "128": "icons/icon128.png"
        }
    },
    "icons": {
        "16": "icons/icon16.png",
        "32": "icons/icon32.png",
        "48": "icons/icon48.png",
        "128": "icons/icon128.png"
    },
    "content_security_policy": {
        "extension_pages": "script-src 'self'; object-src 'self'"
    }
}
```

There is no `action.default_popup`: the toolbar button opens the side panel,
because the service worker calls
`chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`. With that
set Chrome never fires `chrome.action.onClicked`, so the extension deliberately
registers no listener for it.

## Permissions — six, and why each one is needed

| Permission | Used by | Justification |
| --- | --- | --- |
| `sidePanel` | The entire UI | The extension *is* a side panel. `side_panel.default_path` points at `sidepanel.html`; the toolbar icon opens it through `chrome.sidePanel.setPanelBehavior`, and the `open-panel` command and the **Open PraisonAI panel** context-menu item call `chrome.sidePanel.open({ windowId })`. |
| `tabs` | `refreshCurrentTab`, `getTabInfo` | The panel must know which tab it is pointed at, and must read that tab's URL to tell you *before* you act whether Chrome will allow automation there. Used via `chrome.tabs.query`, `chrome.tabs.get`, `onActivated`, `onUpdated` and `onRemoved`. |
| `debugger` | Every action | This is how the extension does its job. `chrome.debugger.attach` + `sendCommand` execute `Page.navigate`, `Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`, `Input.insertText`, `Runtime.evaluate` and `Page.captureScreenshot`. It attaches only to a tab you act on, only when you act, and Chrome shows its debugging banner the whole time. **End Session** calls `chrome.debugger.detach` on that tab. |
| `storage` | History, last screenshot, console buffer | `chrome.storage.local` holds the 50-entry action history. `chrome.storage.session` holds the most recent screenshot (`lastScreenshot`) so it can be shown when you open the panel, and a mirror of each tab's captured console output (`console:<tabId>`) so it survives Chrome suspending the service worker. All three are local to the device. |
| `contextMenus` | Right-click menu | Creates exactly two items — *Capture screenshot* and *Open PraisonAI panel* — registered with `contexts: ['all']`, so they appear on the page and on links, images and selected text too. |
| `notifications` | Screenshot feedback | A screenshot taken with the keyboard shortcut or the context menu happens while the panel may be closed. A single Chrome notification reports whether it succeeded and where to find it — otherwise the action would be silent. |

### Chrome APIs used without a permission

`chrome.runtime`, `chrome.commands` and `chrome.windows` need no entry in
`permissions`. The panel calls `chrome.windows.getCurrent()` once, to learn
which window it belongs to, so it only ever drives that window's active tab.
That is the complete list of Chrome APIs the shipped code touches:
`chrome.runtime`, `chrome.tabs`, `chrome.windows`, `chrome.debugger`,
`chrome.storage`, `chrome.sidePanel`, `chrome.commands`, `chrome.contextMenus`
and `chrome.notifications`.

## Permissions deliberately **not** requested

| Not requested | Consequence |
| --- | --- |
| `host_permissions` / `<all_urls>` | The extension has no standing access to any site. Access exists only inside a debugger session you started, on the tab you targeted. |
| `scripting` / content scripts | No code is injected into pages on load. The only code that runs in a page is the expression you type or the extraction snippet, both through `Runtime.evaluate` on demand. |
| `downloads` | Screenshots are never written to disk by the extension. The panel shows the image and offers a save link; you decide. |
| `offscreen` | No offscreen document, no background media capture, no recording. |
| `alarms` | Nothing runs on a timer. Every action is user-initiated. |
| `activeTab` | Not needed — the debugger session, gated behind `tabs` + `debugger`, is the access path. |
| `cookies`, `webRequest`, `history`, `bookmarks` | Never used. |
| `externally_connectable` | No website or other extension can message this one. |

## Commands

Both are declared in `manifest.json` and both are handled in
`chrome.commands.onCommand`.

| Command | Suggested key | Action |
| --- | --- | --- |
| `open-panel` | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> / <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> | Calls `chrome.sidePanel.open({ windowId })` for the window the shortcut was pressed in |
| `capture-screenshot` | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> / <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> | Captures a screenshot of the active tab and posts a notification |

There is no `_execute_action` command. Opening the panel needs a real window id,
so it is done explicitly and synchronously inside the `onCommand` listener —
`chrome.sidePanel.open()` requires the user gesture, which is spent as soon as
the handler awaits anything.

Chrome will not assign a suggested shortcut that is already taken; reassign at
`chrome://extensions/shortcuts`.

## Content security policy

```
script-src 'self'; object-src 'self'
```

Extension pages may load scripts only from the extension package. No remotely
hosted code is fetched or executed — there is no `fetch`, no `eval` of remote
content, no CDN script and no socket anywhere in the shipped code.

## `minimum_chrome_version`

`116`. The floor is `chrome.sidePanel.open()`, which the `open-panel` command
and the **Open PraisonAI panel** context-menu item both call, and which was
added in Chrome 116. (The `sidePanel` API itself is older — it shipped in
Chrome 114 — but a build that only declared `side_panel` would not be able to
open the panel programmatically.) Every CDP command used here is available well
before 116, and nothing else in this build needs a newer Chrome.

## Build output

`npm run build` produces exactly this in `dist/`:

```
dist/
├── manifest.json
├── background.js       (from src/background/index.ts)
├── sidepanel.js        (from src/sidepanel/index.ts)
├── sidepanel.html
├── styles.css
└── icons/
```

`vite.config.ts` declares only the `background` and `sidepanel` entry points,
so nothing under `future/` is compiled or packaged.
