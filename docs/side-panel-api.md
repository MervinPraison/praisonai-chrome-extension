# Message Reference

This page documents the internal messages the side panel sends to the
background service worker. It is here for people reading the source; it is not
a public API.

!!! note "Not reachable from outside the extension"
    The manifest declares no `externally_connectable`, so no website and no
    other extension can send these messages. They travel over
    `chrome.runtime.sendMessage` between the extension's own panel and its own
    service worker.

## Envelope

Request:

```ts
{
  type: string;        // one of the types below
  tabId?: number;      // required for every tab-scoped action
  url?: string;        // CDP_NAVIGATE
  selector?: string;   // CDP_CLICK, CDP_TYPE
  text?: string;       // CDP_TYPE
  expression?: string; // CDP_EVALUATE
  direction?: 'up' | 'down'; // CDP_SCROLL
}
```

Response — always this shape:

```ts
{ success: true, data?: unknown }
{ success: false, error: string }
```

An unknown `type` returns `{ success: false, error: 'Unknown action: …' }`.

## Tab actions

| Type | Extra fields | Returns | History entry |
| --- | --- | --- | --- |
| `CDP_NAVIGATE` | `url` | `"Navigated to <url>"` | Navigate |
| `CDP_CLICK` | `selector` | `"Clicked <selector>"` | Click |
| `CDP_TYPE` | `selector`, `text` | `"Typed into <selector>"` | Type |
| `CDP_SCROLL` | `direction` | `"Scrolled up"` / `"Scrolled down"` | ✓ |
| `CDP_EVALUATE` | `expression` | The evaluated value | Run JavaScript |
| `CDP_SCREENSHOT` | — | `data:image/png;base64,…` | Screenshot |
| `EXTRACT_DATA` | — | JSON string: title, url, headings, links, images | Extract Data |
| `GET_CONSOLE_LOGS` | — | `Array<{ level, text }>` | — |
| `GET_TAB_INFO` | — | `{ id, url, title, restricted }` | — |
| `DETACH` | — | `"Session ended. The debugging banner is gone."`, or `"No active session on this tab."` | — |

Each of these attaches a CDP session to `tabId` if one is not already open, and
fails with a readable message if the tab is gone, the tab has no page loaded
yet, or Chrome forbids automation on it.

`CDP_NAVIGATE`, `CDP_CLICK`, `CDP_TYPE` and `CDP_SCROLL` all forward the real
outcome of the underlying CDP call: the success strings above are only returned
when the command actually reported success.

- `CDP_NAVIGATE` waits for `document.readyState === 'complete'` (up to 10 s)
  before returning, and fails outright if `Page.navigate` comes back with an
  `errorText` such as `net::ERR_NAME_NOT_RESOLVED`.
- `CDP_TYPE` re-reads the target element after inserting the text and fails if
  the text did not land.

`DETACH` calls `chrome.debugger.detach` on the tab directly rather than relying
on the in-memory session map, which the service worker loses when it is
suspended. It also drops that tab's console buffer from memory and from
`chrome.storage.session`.

## Storage actions

| Type | Returns |
| --- | --- |
| `GET_HISTORY` | `Array<{ action, detail, at }>`, newest first, max 50 |
| `CLEAR_HISTORY` | `"History cleared"` |
| `GET_LAST_SCREENSHOT` | `{ dataUrl, capturedAt }` or `null` |

`GET_HISTORY` and `CLEAR_HISTORY` read and write `chrome.storage.local`;
`GET_LAST_SCREENSHOT` reads `chrome.storage.session`. The panel calls
`GET_LAST_SCREENSHOT` once on open and only displays the image if
`capturedAt` is less than five minutes old.

## Error strings you may see

| Error | Cause |
| --- | --- |
| `No tab selected.` | The message carried no `tabId` |
| `That tab is no longer open.` | `chrome.tabs.get` failed |
| `Open a website in this tab first, then try again.` | The tab is brand new or empty — it has no URL yet, or it is `chrome://newtab/` |
| `Chrome does not allow automation on this page. Open a normal website tab and try again.` | Restricted URL |
| `Failed to attach debugger: …` | Chrome refused the attach (another debugger client, for instance) |
| `Debugger not attached` | A command was sent after the session detached |
| `Enter a valid URL, for example https://example.com` | Empty or non-http(s) URL |
| `net::ERR_NAME_NOT_RESOLVED` (and other `net::` codes) | `Page.navigate` reported `errorText`; the page did not load |
| `Enter a CSS selector, for example #submit or .btn-primary` | Empty selector |
| `All click methods failed for: <selector>` | The selector matched nothing, or none of the three click strategies worked |
| `No element matched <selector>` | Fallback wording when the click or type failed without its own message |
| `Invalid selector (jQuery-style not supported): …` | `$(...)` and friends. `:has(...)` is standard CSS and is accepted |
| `Text was not accepted by <tag> "<selector>". Check that the selector points at an input, textarea or editable element.` | The text was inserted but did not land in the element |

## Non-message entry points

| Trigger | Handler |
| --- | --- |
| Toolbar icon | `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` — Chrome opens the panel itself, so there is no `chrome.action.onClicked` listener |
| <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> | `chrome.commands.onCommand` with command `open-panel` → `chrome.sidePanel.open({ windowId })` |
| <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> | `chrome.commands.onCommand` with command `capture-screenshot` → capture screenshot + notification |
| Context menu items (`contexts: ['all']`) | `chrome.contextMenus.onClicked` → capture screenshot, or open the panel |
| Debugger detached / tab closed | `chrome.debugger.onDetach`, `chrome.tabs.onRemoved` → drop the session (and, on tab close, the tab's console buffer) |
