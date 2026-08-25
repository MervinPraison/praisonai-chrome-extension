# Installation

The extension is a normal Manifest V3 Chrome extension. It has no companion
app, no server and no configuration.

## Requirements

- Chrome 116 or newer
- macOS, Windows or Linux

Nothing else is required. There is no API key to set and nothing to install
alongside it.

## Option 1 — install a released build

1. Download
   [`praisonai-extension.zip`](https://github.com/MervinPraison/praisonai-chrome-extension/releases/latest/download/praisonai-extension.zip)
   from the [GitHub releases page](https://github.com/MervinPraison/praisonai-chrome-extension/releases).
2. Unzip it.
3. Open `chrome://extensions`.
4. Turn on **Developer mode** (top right).
5. Click **Load unpacked** and select the unzipped folder.

## Option 2 — build from source

```bash
git clone https://github.com/MervinPraison/praisonai-chrome-extension
cd praisonai-chrome-extension
npm install
npm run build
```

`npm run build` writes the extension to `dist/`. Then:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select the `dist` folder.

To produce an uploadable archive instead, run `npm run build:zip`, which builds
`dist/` and zips it to `praisonai-extension.zip`.

!!! note "`future/agent-mode/` is not part of the build"
    The repository contains a `future/agent-mode/` directory holding code that
    was removed from the shipped extension. It has no entry point in
    `vite.config.ts` and is never copied into `dist/`, so it is not built and
    not shipped. See [What was removed in 1.0.4](../removed-features.md).

## Open the panel

Click the PraisonAI toolbar icon, press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>
(<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> on macOS), or right-click and choose
**Open PraisonAI panel**.

The shortcut is the extension's `open-panel` command. If it is already taken by
another extension, Chrome silently drops it — you can reassign it at
`chrome://extensions/shortcuts`.

## What you will see the first time you run an action

Chrome shows a banner: **"PraisonAI Browser Agent started debugging this
browser."** That is expected — the extension uses Chrome's debugger API to
control the page, and Chrome always announces that. Click **End Session** in
the panel to detach and dismiss it. Details in
[Quick Start](quick-start.md#the-debugging-banner).

## Uninstalling

Remove it from `chrome://extensions`. Uninstalling deletes the extension's
storage, which is the only place the extension keeps anything: your action
history in `chrome.storage.local`, and the most recent screenshot plus the
captured console output in `chrome.storage.session`.
