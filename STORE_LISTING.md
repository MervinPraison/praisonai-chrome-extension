# Chrome Web Store Listing — v1.0.4

> **Read this first.** The rejected submission has the *entire* contents of a file
> like this one pasted into the **Description** field — permission justifications,
> remote-code notes, data-usage certification and all. That is very likely where
> the reviewer's quoted phrase *"AI-powered browser automation server websocket
> url"* came from, since the description still contained "Local PraisonAI bridge
> server (localhost)" and "server connection settings".
>
> **Only paste the block under "Description" into the Description field.**
> Everything else here belongs in its own dashboard field, or is a note to you.

Every claim below is reproducible on a clean Chrome profile with no server, no
model, no flags and no sign-in.

---

## Dashboard: change these, field by field

The dashboard still holds the rejected listing. These are the edits.

| Field | What it holds now | Change it to |
| --- | --- | --- |
| **Package** | v1.0.3 | Upload `praisonai-extension-v1.0.4.zip` **first** — it rewrites Title and Summary from the manifest, and it re-generates the permission-justification boxes |
| **Description** | 9,678 chars: the old blurb *plus* permission justifications, remote-code notes and a data-collection certification | Replace with the Description block below, and nothing else |
| **Homepage URL** | `https://docs.praison.ai` — the PraisonAI **framework** docs, full of "AI Agent", "Multi-Agent", "LLM", "OpenAI" | `https://chrome.praison.ai` |
| **Support URL** | `github.com/MervinPraison/PraisonAI/issues` — the Python project | `https://github.com/MervinPraison/praisonai-chrome-extension/issues` |
| **Privacy policy URL** | `praison.ai/praisonai-browser-agent-privacy-policy/`, which says the extension *"automates browser tasks using AI"*, users *"describe goals in natural language"*, and that screenshots are *"Sent to the user-configured AI provider"* | `https://chrome.praison.ai/privacy/` — or rewrite that page to match |
| **Data collection** | *"Yes — Page URLs and titles (to provide context to AI)… Screenshots (for AI vision analysis)… Sent to the user-configured AI provider"* | **No.** The extension makes no network requests at all |
| **Permission justifications** | Boxes for `activeTab`, `scripting`, `offscreen`, `tabCapture`, `alarms`, `host_permissions` — none of which the extension requests any more | Six boxes only; text below |
| **Screenshots** | none uploaded | The four in `store_assets/v1.0.4/` |
| **Category** | Tools | Fine as-is |
| **Language** | English (United Kingdom) | Fine as-is |
| **Official URL** | `praison.ai` | Fine, provided that page does not describe an AI browser agent |

> The three URL fields matter as much as the copy. Google defines this
> violation's "metadata" as the title, icon, description, screenshots **and other
> developer-provided information** — a Homepage URL pointing at an AI-agent
> framework is exactly the mismatch that was cited.

---

---

## Pages outside this repository that still describe the rejected version

The package and `chrome.praison.ai` are clean. These are not, and a reviewer can
reach every one of them from the listing. Ranked by risk.

| Page | What it says | Do |
| --- | --- | --- |
| **praison.ai/praisonai-browser-agent-privacy-policy/** | The declared privacy policy. Says the extension collects data, sends screenshots to "the user-configured AI provider (OpenAI/Anthropic/Google/Other)", "automates browser tasks using AI" from goals "in natural language", and justifies `activeTab`, `scripting`, `offscreen`, `tabCapture`, `alarms` and `host_permissions`. Also carries a tester guide telling reviewers to press <kbd>Alt</kbd>+<kbd>A</kbd> to "start agent" — a command that no longer exists. | **Replace the page** with `PRIVACY_POLICY_REPLACEMENT.md`, or repoint the privacy field to `chrome.praison.ai/privacy/`. This page alone reproduces both rejection reasons. |
| **praison.ai/docs/tools/chrome-extension** | Titled "Chrome Extension" and reads as the authoritative doc for *this* item. "AI-powered browser automation… Bridge server starts on localhost:8765… AI agent sends actions, extension executes them", and a permissions table claiming `offscreen`, `activeTab` and `<all_urls>`. Two clicks from the Homepage URL, and the top search result for "PraisonAI Chrome extension". | Rewrite to describe the Python CDP tooling only, rename away from "Chrome Extension", or add a note that the Web Store item is a separate local-only product at chrome.praison.ai. |
| **praison.ai/docs/features/browser-agent** (+ `browser-agent-deep-dive`, `praisonai-browser-package`, `cli/browser`) | "AI-powered browser automation using Chrome Extension and PraisonAI agents", "Chrome Extension ↔ WebSocket ↔ Bridge Server ↔ PraisonAI Agent", `--model gpt-4o`, and — most damaging — ties the shipping shortcut to a bridge session: "A run can start from either the CLI or the side panel (Ctrl+Shift+P)". | Disambiguate: these describe the Python `praisonai-browser` package, not the Web Store item. |
| **docs.praison.ai** → redirects to praison.ai/docs | "AI Agents That Work For You, 24/7 — self-improving multi-agent teams". Nothing about this extension, and it is the direct path to the two rows above. | Currently the dashboard **Homepage URL**. Change to `chrome.praison.ai`. |
| **github.com/MervinPraison/PraisonAI** | The Python framework: "Hire a 24/7 AI Workforce… autonomous self-improving agents… 100+ LLMs". No mention of this extension. | Currently the dashboard **Support URL**. Change to the extension repo's issues. |
| **praison.ai** | "Multi-Agent Systems. Managed." Advertises a different product; its footer privacy page says the site collects name, email and usage data. | Currently the dashboard **Official URL**. Change to `chrome.praison.ai`, or add an extension section that links there. |

> Fixing the three dashboard URLs is quick. Fixing the two `praison.ai/docs`
> pages matters even after that, because they are indexed under the extension's
> own name and still claim `<all_urls>` and a bridge server.

---


## Store Listing Fields

### Title

```
PraisonAI Browser Agent
```

### Summary (132 char limit)

```
Control any tab from a side panel: navigate, click by CSS selector, type text, run JavaScript, and capture screenshots.
```

### Category

Developer Tools

### Description

**Paste only what is between the fence markers — nothing above or below it.**

```
PraisonAI Browser Agent — a side panel toolkit for driving web pages by hand.

Open the side panel and control the active tab directly: go to a URL, click an
element by CSS selector, type into a field, run a JavaScript expression, read the
page's console output, pull its structure out as JSON, or capture a screenshot.
Everything runs locally in your browser using the Chrome DevTools Protocol.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT YOU CAN DO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Navigate — enter a URL and load it in the current tab
• Click — target any element with a CSS selector
• Type — enter text into an input or textarea by selector
• Scroll — move the page up or down
• Run JavaScript — evaluate an expression in the page and see the result
• Extract Data — get the page title, URL, headings, links and images as JSON
• Console Logs — read console output and uncaught errors from the page
• Screenshot — capture the page from the panel, a keyboard shortcut, or the
  right-click menu, then save the image from the panel
• End Session — detach from the tab and clear Chrome's debugging banner
• History — the panel remembers the actions you ran, stored on your device

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO USE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Click the PraisonAI icon in your toolbar to open the side panel
   (or press Ctrl+Shift+P, Cmd+Shift+P on Mac, or right-click and choose
   "Open PraisonAI panel")
2. Fill in a URL, selector, text or expression and press the button
3. Results appear in the Output box below
4. Press "End Session" when you are finished with a tab

The panel belongs to the window it was opened in and drives that window's
active tab. While an action is running the buttons are disabled, so two
actions never overlap on the same tab.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEYBOARD SHORTCUTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Ctrl+Shift+P (Cmd+Shift+P) — open the side panel
• Ctrl+Shift+S (Cmd+Shift+S) — capture a screenshot

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GOOD TO KNOW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Automation uses the Chrome DevTools Protocol, so Chrome shows a
  "PraisonAI Browser Agent started debugging this browser" banner while the
  panel is driving a tab. Press "End Session", or close the banner, to stop.
• Chrome does not allow automation on chrome:// pages, the Chrome Web Store, or
  other extensions' pages. The panel tells you when the current tab is off limits.
  On a brand-new, empty tab it asks you to open a website first.
• Console output is captured from the moment the panel connects to a tab. Reload
  the page to capture its start-up logs. "End Session" or closing the tab clears
  what was captured.
• Screenshots are shown in the panel with a Save link. Nothing is written to your
  disk unless you save it yourself.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT THE PERMISSION WARNING MEANS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Chrome shows two warnings at install: "Access the page debugger backend" and
"Read and change all your data on all websites". Both come from the debugger
permission, which is what the Chrome DevTools Protocol requires. It is the honest ceiling of what the
permission allows, and we would rather explain it than let it surprise you.

What the extension actually does with it:
• It attaches to one tab at a time, and only in response to something you did:
  a button in the panel, the screenshot shortcut, or the right-click menu
• Chrome shows a "started debugging this browser" banner the whole time
• Press "End Session", or close the panel, and the session ends immediately.
  A screenshot taken by shortcut or right-click with the panel closed detaches
  as soon as it is done, so it leaves no session behind
• It declares no host permissions and installs no content script, so it has no
  standing access to any site and does nothing in the background
• It makes no network requests, so nothing it reads can go anywhere
• Actions report what actually happened. A URL that does not resolve, a selector
  that matches nothing, and text a field would not accept are all reported as
  failures — never as success.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIVACY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• No account and no sign-in
• No servers — the extension makes no network requests of any kind
• No analytics and no tracking
• Three things are stored, all locally, using Chrome storage: your action
  history, the most recent screenshot, and the console output captured from the
  tab you are working on. Nothing is transmitted.
• No host permissions are declared. Chrome still shows "Read and change all your
  data on all websites" at install, because the debugger permission implies it —
  see "What the permission warning means" below.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUPPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Documentation: https://chrome.praison.ai
• Issues: https://github.com/MervinPraison/praisonai-chrome-extension/issues
```

---

## Permission Justifications

**These go in the six per-permission boxes on the Privacy tab — one each. They do
not belong in the Description.** The boxes appear only after the v1.0.4 package
is uploaded; before that the dashboard still shows boxes for permissions the
extension no longer requests.


Six permissions. Each one has a call site in the shipped bundle and a control in
the side panel that reaches it.

### sidePanel

Provides the extension's entire user interface. The side panel is where the user
enters a URL, selector, text or JavaScript expression, triggers the Screenshot /
Extract Data / Console Logs tools, and reviews their action history. The toolbar
icon opens it through `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`;
the `open-panel` keyboard command and the "Open PraisonAI panel" context-menu
item call `chrome.sidePanel.open({ windowId })`. Verify by clicking the toolbar
icon or pressing Ctrl+Shift+P.

### tabs

Required specifically to read the `url` and `title` properties of the active
tab, which the API does not expose without it. The panel displays the URL of the
tab it is attached to, and checks it to warn the user before attempting to
automate a `chrome://`, Chrome Web Store or extension page, where Chrome blocks
the DevTools Protocol. No tab data leaves the device.

### debugger

The Chrome DevTools Protocol is what makes this extension work at all.
`Input.dispatchMouseEvent`, `Input.dispatchKeyEvent` and `Input.insertText`
generate trusted input events; events synthesised from a content script carry
`isTrusted: false` and are ignored by most login forms, payment fields and modern
web frameworks. `Page.navigate` drives the Navigate tool,
`Page.captureScreenshot` captures the page image, `Runtime.evaluate` powers the
Run JavaScript and Extract Data tools (and the verification steps that make
Click and Type report honestly), and `Log.entryAdded`,
`Runtime.consoleAPICalled` plus `Runtime.exceptionThrown` power the Console Logs
tool. The debugger attaches only to a tab the user has explicitly targeted from
the panel. End Session calls `chrome.debugger.detach` on that tab and reports
the actual result, and Chrome also detaches when the tab is closed.

### storage

Three local stores, nothing transmitted anywhere.

- `storage.local` — the user's recent actions, so the History tab survives
  browser restarts (capped at 50 entries). Cleared by the "Clear history"
  button or by uninstalling.
- `storage.session` (`lastScreenshot`) — the most recent screenshot, so it can
  be shown when the panel is opened after using the keyboard shortcut or the
  context menu. The panel only displays it if it is under five minutes old.
- `storage.session` (`console:<tabId>`) — the console output captured from the
  tab being worked on, last 200 entries. A Manifest V3 service worker is
  suspended after roughly 30 seconds idle, which would discard an in-memory
  buffer and leave the Console Logs button empty; mirroring it to session
  storage is what makes the tool work. Cleared by End Session, by closing the
  tab, or by closing Chrome.

### contextMenus

Adds exactly two right-click entries — Capture screenshot, and Open PraisonAI
panel — so a user can capture the current page, or reach the panel, without
going to the toolbar first. Both are registered with `contexts: ['all']`, so
they are available on the page background and also on links, images and
selected text, wherever the user happens to right-click.

### notifications

Shows a desktop notification after a screenshot is captured with the
Ctrl+Shift+S / Cmd+Shift+S shortcut or the "Capture screenshot" context-menu
item. Both work while the side panel is closed, so without the notification the
user gets no feedback at all. The notification says whether the capture
succeeded and where to view it; it does not claim the file was saved. Reproduce
it with Ctrl+Shift+S on any ordinary web page with the panel closed.

### Host permissions

**None declared.** `chrome.debugger` requires no host permissions, and the
extension ships no content script, so it has no standing access to any site and
no host-permission justification box should appear for this item.

Note for review: Chrome nonetheless surfaces "Read and change all your data on
all websites" in the install prompt, because the `debugger` permission implies
that capability. `chrome.permissions.getAll()` returns `origins: []`. The store
description discloses this warning and explains it rather than claiming narrower
access than Chrome shows the user.

### APIs used without a permission entry

`chrome.runtime` (messaging between the panel and the service worker),
`chrome.commands` (the two keyboard shortcuts) and `chrome.windows` need no
declared permission. `chrome.windows.getCurrent()` is called once when the panel
opens, so the panel knows which window it belongs to and only ever drives that
window's active tab. The complete set of Chrome APIs in the shipped bundle is:
`runtime`, `tabs`, `windows`, `debugger`, `storage`, `sidePanel`, `commands`,
`contextMenus`, `notifications`.

---

## Single Purpose

```
A side panel that lets the user drive the current browser tab — navigate, click,
type, scroll, run JavaScript, read console output, extract page structure, and
capture screenshots — using the Chrome DevTools Protocol, entirely on the user's
own machine.
```

---

## Privacy Practices

**These are dashboard form selections, not description text.**


**Does this item collect user data?** No.

| Category | Collected | Notes |
| --- | --- | --- |
| Personally identifiable information | No | |
| Health information | No | |
| Financial and payment information | No | |
| Authentication information | No | |
| Personal communications | No | |
| Location | No | |
| Web history | No | Action history is stored locally on the device and never transmitted. |
| User activity | No | |
| Website content | No | Page content is read only to answer an action the user just triggered, is shown back to that user, and is never transmitted. |

Certifications:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Remote code:** No. The extension executes no remote code. Its
`content_security_policy` is `script-src 'self'; object-src 'self'`, it declares
no host permissions, and it makes no network requests.

---

## Reviewer Verification Guide

**This goes in the "Test instructions" tab — not the Description.**


Fresh profile, no setup of any kind required.

1. **Open the panel.** Click the toolbar icon, or press Ctrl+Shift+P
   (Cmd+Shift+P). The side panel opens and shows the current tab's URL.
2. **Navigate.** In "Navigate to URL" enter `example.com` and press Go.
   *Expected:* Chrome shows the debugging banner, the tab loads example.com, and
   the Output box reads `Navigated to https://example.com/`.
3. **Run JavaScript.** In "Run JavaScript" enter `document.title` and press Run.
   *Expected:* Output reads `Example Domain`.
4. **Click.** In "Click Element" enter `a` and press Click.
   *Expected:* Output reads `Clicked a` and the page follows the link.
5. **Type.** Navigate to `wikipedia.org`, then in "Type Text" enter selector
   `#searchInput` and text `chrome extension`, and press Type.
   *Expected:* Output reads `Typed into #searchInput` and the text appears in
   the search box. (`input[name='search']` works there too, if you prefer an
   attribute selector.)
6. **Extract Data.** Press "Extract Data".
   *Expected:* Output shows JSON with the page title, URL, headings, links and
   images.
7. **Screenshot.** Press "Screenshot".
   *Expected:* The captured image appears in the panel with a "Save image" link.
8. **Screenshot by shortcut.** Close the panel and press Ctrl+Shift+S
   (Cmd+Shift+S). *Expected:* A desktop notification titled "Screenshot
   captured", with the body "Open the PraisonAI panel to view and save it."
   Reopen the panel; the image is there. (If the shortcut does nothing, check
   `chrome://extensions/shortcuts` — Chrome silently drops a suggested key that
   collides with another extension. The Screenshot button in the panel does the
   same thing.)
9. **Console Logs.** Press "Console Logs".
   *Expected:* Either the page's console output, or a message explaining that
   capture begins when the panel connects and to reload the page. Leave the
   browser idle for a minute so Chrome suspends the service worker, then press
   it again — the output is still there, because it is mirrored to
   `chrome.storage.session`.
10. **Error handling.** Enter a selector that matches nothing, e.g. `#nope`, and
    press Click. *Expected:* The Output box turns red with an explanatory error
    and the status reads "Failed". The extension never reports success for an
    action that did not happen.
11. **Failed navigation.** In "Navigate to URL" enter a hostname that does not
    exist, e.g. `this-host-does-not-exist.example`, and press Go.
    *Expected:* The Output box shows the network error
    (`net::ERR_NAME_NOT_RESOLVED`) and the status reads "Failed" — not
    "Navigated to …".
12. **Type into something that is not a field.** On `example.com`, in
    "Type Text" enter selector `h1` and text `zzq-not-a-field`.
    *Expected:* An error explaining that the text was not accepted and that the
    selector should point at an input, textarea or editable element — not
    "Typed into h1".
13. **Restricted page.** Switch to a `chrome://extensions` tab.
    *Expected:* The panel marks the tab as one Chrome blocks automation on, and
    any action returns that explanation rather than failing silently.
14. **Empty tab.** Open a brand-new tab (Chrome's New Tab Page) and run any
    action. *Expected:* "Open a website in this tab first, then try again."
    A plain `about:blank` tab is different and *can* be automated — entering a
    URL and pressing Go navigates it normally.
15. **Right-click menu.** Right-click the page, then right-click a link and an
    image. *Expected:* "Capture screenshot" and "Open PraisonAI panel" appear in
    all three cases — the items are registered with `contexts: ['all']`.
16. **History.** Open the History tab.
    *Expected:* The successful actions from the steps above are listed with
    timestamps. Console Logs and End Session are deliberately not recorded;
    they are not page actions.
17. **End Session.** Press "End Session".
    *Expected:* The debugging banner disappears. The button calls
    `chrome.debugger.detach` on the tab directly, so it also works after Chrome
    has suspended the service worker and thrown away its in-memory session map —
    which is exactly the case where a banner used to be left stranded.

---

## Changes in v1.0.4

*Notes for you and for the Test instructions field. Not description text.*


Submitted in response to violation reference IDs **Red Potassium** (Inaccurate
Description — Non functional) and **Purple Potassium** (Use of permissions).

**Permissions reduced from eleven to six.**

| Removed | Reason |
| --- | --- |
| `alarms` | Never called anywhere in the source or the bundle. |
| `tabCapture` | Only call site was in a function nothing invoked; the bundler removed the code entirely. |
| `offscreen` | Its only purpose was a persistent WebSocket to a local server, which has been removed. |
| `scripting` | Its only call site was the Summarize tool, which has been removed. |
| `activeTab` | No longer needed — nothing requires host access. |
| `host_permissions: <all_urls>` | No longer needed — `chrome.debugger` requires no host permissions. |

Also removed: the content script that was injected into every page (nothing ever
sent it a message), `externally_connectable` (no external message listener
existed), `web_accessible_resources` (no resource was ever requested), and the
`ws://localhost:*` and `http://localhost:*` entries from the content security
policy.

**Functionality now matches the description.**

- The AI agent and the local PraisonAI bridge server have been removed. Both
  required something the user had to set up separately — a local server, or a
  downloaded on-device model — so neither was reproducible on a clean profile.
  Everything the extension now advertises works immediately after install.
- "Record sessions" has been removed from the description. The feature was not
  present in the shipped build.
- Screenshots are shown in the panel with a Save link. The previous notification
  said "Screenshot saved successfully" when nothing had been saved; it now
  reports what actually happened.
- Failed actions are now reported as failures, in the panel, with the reason.
  The previous build could display "Completed" after an action had failed.
- The Console Logs tool now works. The required CDP domain was never enabled.
  The captured output is also mirrored to `chrome.storage.session`, so it is not
  lost when Chrome suspends the service worker.
- Removed the `start-agent` keyboard command and the context menu entries that
  pointed at removed features.
- Debug logging that echoed the user's typed text to the console has been removed.

**Every remaining action now reports its real outcome.**

| Was | Now |
| --- | --- |
| Navigate reported success even when the page failed to load | Waits for the load to complete and fails on `errorText`, e.g. `net::ERR_NAME_NOT_RESOLVED` |
| Type reported success even when the target accepted no text | Re-reads the element and fails with an explanation if the text did not land |
| Click, type and scroll returned unconditional success | Return the actual result of the CDP command |
| A thrown JavaScript error showed the literal word "Uncaught" | Shows `exception.description` — the real message and stack |
| End Session relied on an in-memory map the service worker loses when suspended, leaving the banner stranded | Calls `chrome.debugger.detach` on the tab directly and reports the real outcome, including "No active session on this tab." |
| The panel followed the last focused window, so two panels fought over one tab | Scopes to its own window via `chrome.windows.getCurrent()` |
| Overlapping actions could tear down each other's CDP session | The panel disables its controls while an action runs |
| A stale screenshot could be restored into the panel indefinitely | Restored only if it was captured within the last five minutes |
| A brand-new tab produced the `chrome://` restriction message | Says "Open a website in this tab first, then try again." |

Also in this build: the `_execute_action` command was replaced by an explicit
`open-panel` command handled in `chrome.commands.onCommand`
(<kbd>Ctrl/Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> is unchanged), and the two
context-menu items moved from `contexts: ['page']` to `contexts: ['all']` so
they are reachable from a right-click on a link, an image or a selection.

The parked agent and bridge source lives in `future/agent-mode/`, which is not an
entry point in the build and is not included in the package. See
`future/agent-mode/RESTORE.md`.

---

## Store Assets

**Everything needed is in `store_assets/v1.0.4/`.** See `store_assets/README.md`.

| Asset | File | Status |
| --- | --- | --- |
| Screenshot 1 | `screenshot_01-run-javascript_1280x800.png` | Ready |
| Screenshot 2 | `screenshot_02-extract-data_1280x800.png` | Ready |
| Screenshot 3 | `screenshot_03-screenshot_1280x800.png` | Ready |
| Screenshot 4 | `screenshot_04-history_1280x800.png` | Ready |
| Small promo tile | `small_promo_tile_440x280.jpg` | Ready |
| Marquee tile | `marquee_promo_tile_1400x560.jpg` | Ready (optional) |
| Store icon | shipped in the package (`icons/icon128.png`) | Ready |

The screenshots are real captures of the built extension driving a live
`example.com` — the left half is the page, the right half is the side panel, at
the proportions Chrome docks them. Regenerate with `node store_assets/compose.mjs`.

The assets from the rejected submission have been deleted from the repository —
the old screenshot showed the removed Agent tab and both tiles carried
"AI-Powered Browser Automation" baked into the image.
