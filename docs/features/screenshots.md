# Screenshots

The extension captures the **visible viewport** of the active tab as a PNG,
using the CDP command `Page.captureScreenshot` with
`captureBeyondViewport: false`.

## Three ways to capture

- Click **📸 Screenshot** in the panel
- Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> / <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>
- Right-click the page — or a link, an image or a text selection — and choose
  **Capture screenshot**

## What happens to the image

The image is returned to the panel as a `data:image/png;base64,…` URL and
displayed there, with a **Save image** link underneath.

!!! note "Nothing is saved to disk automatically"
    The extension does not have the `downloads` permission and never writes a
    file on its own. The image is shown in the panel; clicking **Save image**
    is what puts it on disk, through Chrome's normal download flow. Chrome
    notifications from the shortcut and the context menu say
    *"Open the PraisonAI panel to view and save it"* for exactly this reason.

The most recent capture is also kept in `chrome.storage.session` under
`lastScreenshot`, together with the time it was taken, so a screenshot taken
with the keyboard shortcut or the context menu while the panel was closed is
shown the next time you open the panel.

The panel only restores it if it is **less than five minutes old** — old enough
to still be the shot you just took, and no older. A stale capture is left alone
and the Output box shows its normal placeholder instead. Session storage itself
is cleared when Chrome closes.

## Limits

- Visible viewport only. There is no full-page stitching and no scrolling
  capture.
- PNG only.
- Restricted pages (`chrome://`, extension pages, the Chrome Web Store) cannot
  be captured, because the debugger cannot attach there.
- Capturing attaches the debugger, so Chrome's debugging banner appears. Use
  **End Session** when you are done.

## Not included

The extension captures no video and keeps no ongoing recording of your
browsing. A capture happens only when you explicitly ask for one.
