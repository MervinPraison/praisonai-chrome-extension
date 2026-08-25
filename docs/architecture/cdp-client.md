# CDP Client

`src/cdp/client.ts` exports `CDPClient`, the only thing in the extension that
talks to `chrome.debugger`. One instance exists per attached tab.

```ts
const client = new CDPClient(tabId);
await client.attach();
await client.navigate('https://example.com');
await client.detach();
```

Every method returns the same shape, so callers never have to guess whether
something worked:

```ts
interface CDPResult<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
}
```

## Methods

| Method | CDP used | Notes |
| --- | --- | --- |
| `attach()` | `chrome.debugger.attach` (v1.3) then `DOM.enable`, `Page.enable`, `Runtime.enable`, `Log.enable` | `Log.enable` is what makes `Log.entryAdded` fire for the Console Logs tool |
| `detach()` | `chrome.debugger.detach` | Safe to call when not attached |
| `send(method, params)` | `chrome.debugger.sendCommand` | Returns an error result if not attached |
| `navigate(url)` | `Page.navigate` | The caller validates and normalises the URL. Fails if the response carries an `errorText` (e.g. `net::ERR_NAME_NOT_RESOLVED`), then waits for `document.readyState === 'complete'` (10 s cap) before returning |
| `captureScreenshot(format)` | `Page.captureScreenshot` | PNG, `captureBeyondViewport: false` |
| `click(x, y)` | `Input.dispatchMouseEvent` ×2 | Raw press/release at viewport coordinates |
| `clickElement(selector)` | mixed | Bounding-box click, then `element.click()`, then focus + <kbd>Enter</kbd> |
| `type(text)` | `Input.insertText` | Single insert, so no double-typing |
| `typeInElement(selector, text)` | mixed | Click to focus, clear, verify empty, insert, then verify the text landed |
| `scroll(dx, dy)` | `Input.dispatchMouseEvent` (`mouseWheel`) | Returns the command's real result |
| `evaluate(expression)` | `Runtime.evaluate` | `returnByValue: true`, `awaitPromise: true`; surfaces `exceptionDetails.exception.description` as the error, falling back to `exceptionDetails.text` |
| `isAttached()` | — | Local flag |

## Design notes

- **Failures are values, not exceptions.** Nothing here throws past the caller,
  and nothing returns `success: true` for a command that did not run. The
  background worker forwards the error text straight to the panel.
- **`clickElement` degrades in the open.** If all three strategies fail it
  returns `All click methods failed for: <selector>` rather than reporting a
  click that never happened.
- **`typeInElement` verifies the clear, and then the write.** After clearing it
  re-reads `.value` and forces it empty if content survived, so text is not
  appended to whatever was there. After inserting, it re-reads the element again
  and fails with an explanatory error if the text is not there —
  `Input.insertText` returns success at the protocol level even when the focused
  node accepts no text, so without this check the panel would report a write
  that never happened.
- **`navigate` does not trust `Page.navigate`.** The command resolves
  successfully for a failed load and reports the reason in `errorText`, so that
  field is checked and turned into a failure. It then waits for the document to
  reach `readyState === 'complete'`.
- **`evaluate` surfaces the useful message.** For a thrown error
  `exceptionDetails.text` is the literal string `"Uncaught"`; the real message
  and stack live on `exceptionDetails.exception.description`, which is what the
  panel is given.
- **Only four domains are enabled**, matching the shipped tools exactly.

## What it does not do

`CDPClient` has no methods for downloading, recording, network interception,
cookie access or any form of persistent monitoring. It sends commands, one at a
time, in response to a click in the panel.
