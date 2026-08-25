# Browser Actions

Every action in the panel is a Chrome DevTools Protocol command sent to the
active tab through `chrome.debugger`. There is no content script, no injected
library and no host permission — the debugger session is the only way this
extension touches a page, and it exists only while you are using it.

## Attaching

The first action you run on a tab attaches the debugger at protocol version
`1.3` and enables four CDP domains:

| Domain | Why it is enabled |
| --- | --- |
| `DOM` | Element lookup for click and type |
| `Page` | `Page.navigate` and `Page.captureScreenshot` |
| `Runtime` | `Runtime.evaluate` for Run JavaScript and Extract Data; console events |
| `Log` | Browser log entries for the Console Logs tool |

Sessions are tracked per tab. Attaching a second time to the same tab reuses
the existing session.

## The debugging banner

While a session is attached, Chrome shows:

> **PraisonAI Browser Agent started debugging this browser.** *Cancel*

Chrome always shows this for any extension using the debugger API, and it
cannot be suppressed. **End Session** in the panel, or **Cancel** in the
banner, detaches and removes it. Chrome also detaches automatically when you
open DevTools on the same tab, when the tab navigates to a restricted page, or
when the tab closes.

## Pages that cannot be automated

The background worker refuses to attach to:

- `chrome://` and `chrome-extension://` pages
- `devtools://` and `about:` pages (except `about:blank`, which works normally)
- `edge://` pages
- `https://chromewebstore.google.com` and `https://chrome.google.com/webstore`

These are Chrome restrictions, not policy choices. The panel marks such tabs
before you try, and any action on them returns
*"Chrome does not allow automation on this page. Open a normal website tab and
try again."*

A brand-new or empty tab is a separate case: it has no URL yet (or it is
`chrome://newtab/`), so there is nothing to drive. Those actions return
*"Open a website in this tab first, then try again."*

## Navigate to URL

Sends `Page.navigate`, then waits for the new document to finish loading before
reporting success, so a follow-up click acts on the new page rather than the old
one.

- A bare host such as `example.com` is expanded to `https://example.com`.
- Only `http:` and `https:` are accepted. Anything else — including
  `javascript:` URLs — is rejected with *"Enter a valid URL, for example
  https://example.com"*.
- `Page.navigate` resolves successfully even when the load failed, reporting the
  reason in `errorText`. That is treated as a failure: a bad hostname returns
  *`net::ERR_NAME_NOT_RESOLVED`* rather than *"Navigated to …"*.
- The wait polls `document.readyState` and gives up after 10 seconds.

## Click Element

Takes a **CSS selector** and clicks the first match. It tries, in order:

1. Scroll the element into view, read its bounding box, and dispatch real
   `Input.dispatchMouseEvent` press/release events at its centre.
2. Fall back to `element.click()` in the page.
3. Fall back to focusing the element and dispatching <kbd>Enter</kbd>.

jQuery-style selectors are not CSS and are not supported. `:contains("text")`
is handled as a special case by searching links and buttons for that visible
text; other jQuery-isms (`$(...)`) return
*"Invalid selector (jQuery-style not supported)"*.

`:has(...)` **is** supported — it is standard CSS that `querySelector` has
accepted since Chrome 105, so it is passed straight through.

If nothing matches, or all three strategies fail, you get an error — never a
silent success. The message is *"All click methods failed for: `<selector>`"*.

## Type Text

Takes a selector and the text. It clicks the field to focus it, clears the
existing value (setting `.value = ''` and dispatching `input`/`change`, plus a
select-all-and-delete keystroke fallback), verifies the field is empty, then
inserts your text with `Input.insertText`.

Finally it **verifies the text actually landed**. `Input.insertText` succeeds at
the protocol level even when the focused node accepts no text, so the element is
re-read afterwards and the action fails with *"Text was not accepted by
`<tag>` "`<selector>`". Check that the selector points at an input, textarea or
editable element."* if the value does not contain what you typed.

## Run JavaScript

Evaluates **one expression** in the page with `Runtime.evaluate`
(`returnByValue: true`, `awaitPromise: true`) and prints the result. Promises
are awaited. A thrown exception is shown as an error, using
`exceptionDetails.exception.description` — the full message and stack — rather
than `exceptionDetails.text`, which for a thrown error is the literal word
*"Uncaught"*.

This runs code you type, in the page you are looking at. The extension does not
fetch or execute code from anywhere else — see
[Manifest reference](../manifest-reference.md#content-security-policy).

## Scroll Page

Dispatches a mouse-wheel event of ±500px, and reports whether the CDP command
succeeded.

## End Session

Calls `chrome.debugger.detach` on the tab directly, drops the cached session,
and clears that tab's captured console log — both the in-memory buffer and its
copy in `chrome.storage.session`.

It releases the cached client first and falls back to detaching the tab
directly, because a Manifest V3 service worker is recycled after roughly 30
seconds idle: the in-memory map is gone by then while Chrome still has the
debugger attached. Attached tabs are also recorded in `chrome.storage.session`,
so a later worker generation can still end a session it did not start.

The outcome is the real one, not an assumption. `chrome.debugger.detach` either
succeeds (*"Session ended. The debugging banner is gone."*), reports that
nothing was attached (*"No active session on this tab."* — still a success,
because there is nothing left to do), or fails and returns Chrome's own error
text. The panel prints whatever the worker returned, so those are the exact
strings you see.

## Where this lives in the code

`src/cdp/client.ts` (`CDPClient`) wraps the protocol; `src/background/index.ts`
owns the sessions and the message router. See
[Architecture](../architecture/overview.md).
