# Side Panel

The side panel is the whole user interface. It uses Chrome's `sidePanel` API,
so it stays open while you switch tabs and does not close when you click into
the page.

## Opening it

- Click the PraisonAI toolbar icon
- Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> / <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>
- Right-click a page and choose **Open PraisonAI panel**

## Layout

| Area | What it shows |
| --- | --- |
| Header | The extension name and a status dot: *Ready*, *Working...*, *Done*, *Failed* or *No tab* |
| Tab info | The URL of the tab the panel is pointed at, plus *"Chrome blocks automation here"* if it is a restricted page |
| 🛠️ Tools tab | The four tool buttons and the five action forms |
| 📜 History tab | The last 50 actions, with a **Clear history** button |
| Output | The result of the last action, or the error if it failed |
| Footer | *"Runs locally in your browser. Nothing is sent anywhere."* |

## Which tab it acts on

Side panels are per-window. On open, the panel calls `chrome.windows.getCurrent()`
and remembers its own window id, then targets the **active tab of that window**
only. Tab switches in other windows are ignored, so two panels open in two
windows never fight over the same target.

It re-reads the target when you switch tabs in its window, or when the current
tab finishes loading. The URL in the header is always the tab your next action
will hit.

## Errors are visible

Every action either renders its result or renders its error in the same Output
box you are already looking at. A failed action sets the status to **Failed**;
it never shows a completed state for work that did not happen.

## One action at a time

While an action is running, every button in the panel is disabled and the status
reads *Working...*. Two overlapping actions on one tab would tear down each
other's CDP session, so the panel does not allow a second one to start until the
first has reported back.

## History

Successful Navigate, Click, Type, Scroll, Run JavaScript, Screenshot and
Extract Data actions are appended to a local history list, newest first, capped at 50
entries. It is stored with `chrome.storage.local` under the key `history` —
on your machine only. **Clear history** deletes it immediately, and
uninstalling the extension removes it too.

Console Logs and End Session are not recorded; they are not page actions.

## Keyboard shortcuts

| Shortcut | Command name | What it does |
| --- | --- | --- |
| <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> | `open-panel` | Opens the PraisonAI panel in the current window |
| <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> | `capture-screenshot` | Captures a screenshot of the active tab |

Both are handled in `chrome.commands.onCommand`; `open-panel` calls
`chrome.sidePanel.open({ windowId })` for the window the shortcut was pressed
in.

Chrome will not register a suggested shortcut that another extension already
claimed. Reassign at `chrome://extensions/shortcuts`.

## Context menu

There are exactly two items, both registered with `contexts: ['all']`, so they
appear whether you right-click the page, a link, an image or a text selection:

- **Capture screenshot** — captures the tab and posts a Chrome notification;
  the image waits in the panel
- **Open PraisonAI panel** — opens the panel

## The debugging banner

Using any tool attaches Chrome's debugger to that tab, and Chrome shows a
banner saying so for as long as it is attached. **⏏ End Session** detaches and
clears it. See [Browser Actions](cdp-automation.md#the-debugging-banner).
