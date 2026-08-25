# PraisonAI Browser Agent

A Chrome side panel that drives the tab you are looking at, using the Chrome
DevTools Protocol. Navigate, click, type, run JavaScript, scroll, capture a
screenshot, extract page data and read console output — from a panel that stays
open as you move between tabs.

**Version 1.0.4.** Everything runs locally in your browser. There is no server,
no account, no model and no network request of any kind.

## What it does

| Tool | What happens |
| --- | --- |
| Navigate to URL | Loads the URL you type in the active tab, waits for it to finish loading, and reports the network error if it fails |
| Click Element | Clicks the first element matching a CSS selector |
| Type Text | Clears a field matched by a CSS selector, types your text into it, and verifies the text landed |
| Run JavaScript | Evaluates one JavaScript expression in the page and shows the result |
| Scroll Page | Scrolls the page up or down |
| Screenshot | Captures the visible viewport and shows it in the panel with a **Save image** link |
| Extract Data | Returns the page title, URL, headings, links and images as JSON |
| Console Logs | Shows console messages captured since the panel connected to the tab |
| End Session | Detaches the debugger and removes Chrome's debugging banner |
| History | The last 50 actions, kept in `chrome.storage.local` on your machine |

The panel belongs to one browser window and drives that window's active tab.
Only one action runs at a time — the controls are disabled until it reports
back.

## Two things to know before you install

!!! warning "Chrome shows a debugging banner"
    To control a page the extension attaches Chrome's debugger to that tab.
    While it is attached, Chrome displays a bar reading
    **"PraisonAI Browser Agent started debugging this browser"** with a
    *Cancel* button. That banner is Chrome's, not ours, and it cannot be
    hidden. Click **End Session** in the panel (or *Cancel* in the banner) to
    detach and make it disappear. See [Debugging banner](features/cdp-automation.md#the-debugging-banner).

!!! warning "Chrome warns about access to all websites"

    At install, Chrome says this extension can *"Read and change all your data
    on all websites."* That comes from the `debugger` permission, which the
    DevTools Protocol requires. No host permissions are declared and no content
    script is installed, so there is no standing access to any site — the
    debugger attaches to one tab, only when you press a button. See
    [Privacy](privacy.md).

!!! warning "Some pages cannot be automated"
    Chrome refuses debugger access to its own pages, so the extension cannot
    act on `chrome://` pages, `chrome-extension://` pages, `devtools://`,
    `about:` pages (except `about:blank`), or the Chrome Web Store
    (`chromewebstore.google.com`). Open a normal `http(s)` website tab
    instead. The panel greys out the tab URL and says *"Chrome blocks
    automation here"* when you are on one of these. On a brand-new, empty tab
    the panel says *"Open a website in this tab first"* instead — there is
    simply no page to act on yet.

## Privacy in one line

Nothing leaves your browser. No telemetry, no analytics, no remote code. See
[Privacy](privacy.md).

## Download

<a href="https://github.com/MervinPraison/praisonai-chrome-extension/releases/latest/download/praisonai-extension.zip" class="md-button md-button--primary">
  Download latest release
</a>

Or build it yourself — see [Installation](getting-started/installation.md).

## Requirements

- Chrome 116 or newer (`minimum_chrome_version` in the manifest — that is the
  version that added `chrome.sidePanel.open()`, which the keyboard shortcut and
  the context-menu item both call)
- macOS, Windows or Linux
- Nothing else. No API key, no Python, no companion app.

## Where to go next

- [Installation](getting-started/installation.md)
- [Quick Start](getting-started/quick-start.md)
- [Browser Actions](features/cdp-automation.md)
- [Manifest & permissions](manifest-reference.md)
- [What was removed in 1.0.4](removed-features.md)
