# Quick Start

This walkthrough takes about a minute and uses only what ships in the
extension. No setup, no key, no server.

## 1. Open a normal website

Open any `http` or `https` page — `https://example.com` is a good test.

!!! warning "Pages Chrome will not let the extension touch"
    Chrome blocks debugger access to its own surfaces. Automation will not run
    on `chrome://` pages, other extensions' pages (`chrome-extension://`),
    `devtools://`, `about:` pages (except `about:blank`), or the Chrome Web Store
    (`chromewebstore.google.com` / `chrome.google.com/webstore`).
    On those tabs the panel shows *"Chrome blocks automation here"* next to the
    URL and every action returns an error instead of pretending to work.

    A brand-new or empty tab is a different case — there is simply no page to
    drive yet, and actions return *"Open a website in this tab first, then try
    again."*

## 2. Open the panel

Click the PraisonAI toolbar icon, or press
<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> /
<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>.

The panel header shows the tab it is pointed at. It follows whichever tab you
focus **in the same window** — a panel belongs to one window and only ever
drives that window's active tab.

## 3. Run your first action

In **Run JavaScript**, type:

```js
document.title
```

and click **Run**. The page's title appears in the **Output** box.

## The debugging banner

The moment your first action runs, Chrome attaches the debugger to that tab and
shows a bar across the top of the browser:

> **PraisonAI Browser Agent started debugging this browser.**  &nbsp; *Cancel*

This banner is displayed by Chrome, not by the extension, and there is no way
for an extension to suppress it. It is Chrome telling you honestly that
something has debugger-level access to that tab.

It goes away when the session ends. You can end the session in three ways:

- click **⏏ End Session** in the panel,
- click **Cancel** in Chrome's banner,
- or close the tab.

Opening Chrome DevTools on the same tab also forcibly detaches the extension,
because Chrome allows only one debugger client per tab. If that happens, run
any action again to reattach.

## 4. Try the rest

| Field | Example input | Result |
| --- | --- | --- |
| Navigate to URL | `example.com` | Loads `https://example.com` in the tab, waits for it to finish loading, and fails with the network error if it does not |
| Click Element | `a` | Clicks the first link on the page |
| Type Text | selector `input[name=q]`, text `hello` | Clears that field, types `hello`, and checks the text actually landed |
| Run JavaScript | `location.href` | Prints the current URL |
| Scroll Page | ↑ / ↓ | Scrolls 500px up or down |

And the four tool buttons:

- **📸 Screenshot** — captures the visible viewport, shows it in the panel, and
  offers a **Save image** link. It is *not* written to disk automatically; you
  choose where it goes.
- **📋 Extract Data** — returns the page title, URL, headings, links and images
  as JSON (up to 50 of each).
- **💻 Console Logs** — shows console output captured *since the session
  attached*. A brand-new session legitimately has nothing yet; reload the page
  to capture its startup logs. The buffer is mirrored to `chrome.storage.session`,
  so it is still there after Chrome suspends the extension's background worker.
- **⏏ End Session** — detaches the debugger, clears the banner, and discards
  that tab's captured console output.

While an action is running every button is disabled and the status reads
*Working...*, so two actions can never overlap on the same tab.

## 5. Check your history

Switch to the **📜 History** tab. The last 50 actions are listed with a
timestamp. They are stored in `chrome.storage.local` on this machine and never
sent anywhere. **Clear history** removes them.

## Keyboard shortcuts

| Shortcut | Command | Action |
| --- | --- | --- |
| <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> | `open-panel` | Open the PraisonAI panel in the current window |
| <kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> | `capture-screenshot` | Capture a screenshot of the active tab |

Both can be reassigned at `chrome://extensions/shortcuts`.

## Right-click menu

There are exactly two items — **Capture screenshot** and **Open PraisonAI
panel** — and they appear on every right-click context: the page itself, and
also links, images and selected text.

A screenshot taken from the shortcut or the context menu while the panel was
closed is waiting for you the next time you open the panel, as long as you get
there within five minutes.

## When something does not work

The panel always reports failures — it never shows a success state for an
action that did not run. Common messages:

| Message | Meaning |
| --- | --- |
| *Chrome does not allow automation on this page.* | You are on a `chrome://`, extension, or Web Store page. |
| *Open a website in this tab first, then try again.* | The tab is brand new or empty — there is no page to act on yet. |
| *All click methods failed for: `<selector>`* | The CSS selector found nothing, or none of the three click strategies worked. Check it in DevTools with `document.querySelector(...)`. |
| *Text was not accepted by `<tag>` …* | The selector matched something that is not a text field. |
| *`net::ERR_NAME_NOT_RESOLVED`* | Navigate reached Chrome but the page did not load. The action fails rather than claiming success. |
| *That tab is no longer open.* | The target tab was closed. |
| *Debugger not attached* | The session was detached (DevTools opened, or Cancel was clicked). Run the action again. |
