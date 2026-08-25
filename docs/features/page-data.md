# Page Data & Console Logs

Two read-only tools for inspecting the tab you are on.

## 📋 Extract Data

Runs one expression in the page and returns a JSON summary of what is on it:

```json
{
  "title": "Example Domain",
  "url": "https://example.com/",
  "headings": [{ "tag": "h1", "text": "Example Domain" }],
  "links":    [{ "text": "More information...", "href": "https://www.iana.org/domains/example" }],
  "images":   [{ "alt": "", "src": "https://example.com/logo.png" }]
}
```

- `headings` comes from `h1, h2, h3`
- `links` comes from `a[href]`
- `images` comes from `img[src]`
- each list is capped at the first 50 elements

The JSON is printed in the panel's Output box. Select it and copy it — the
extension does not upload it, store it beyond the current output, or send it
anywhere.

Extract Data is a panel button; there is no right-click entry for it.

## 💻 Console Logs

Shows console output from the page: `console.*` calls
(`Runtime.consoleAPICalled`), browser log entries (`Log.entryAdded`) and
uncaught exceptions (`Runtime.exceptionThrown`), each with its level.

An uncaught exception is shown using `exceptionDetails.exception.description`,
which carries the real message and stack. Only if that is missing does it fall
back to `exceptionDetails.text`, which for a thrown error is the literal word
*"Uncaught"* and tells you nothing.

Objects and arrays logged with `console.log` have no plain value in the CDP
event, so they are rendered from their preview — `{ name: "x", count: 3 }`
rather than the bare word `Object`.

Two honest limitations:

- **Capture starts when the session attaches.** Messages logged before the
  extension connected to that tab are not there. If you need a page's startup
  logs, attach first (run any action) and then reload the page. When the buffer
  is empty the panel says so rather than showing a blank box.
- **The buffer holds the most recent 200 messages** per tab.

## Where the console buffer lives

Messages are buffered per tab in the service worker's memory *and* mirrored to
`chrome.storage.session` under the key `console:<tabId>`.

The mirror exists because a Manifest V3 service worker is recycled after roughly
30 seconds idle. Without it, the in-memory buffer would be thrown away in the
common case and the Console Logs button would come back empty. When the worker
restarts, the panel reads the stored copy instead.

The buffer is cleared by **End Session**, by closing the tab, or by closing
Chrome (session storage does not survive a browser restart). It is local to your
device and is never transmitted.
