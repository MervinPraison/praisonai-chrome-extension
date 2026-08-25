# Replacement text for praison.ai/praisonai-browser-agent-privacy-policy/

The page currently live at that URL describes the **rejected** version. It states
that the extension collects data, sends screenshots to "the user-configured AI
provider (OpenAI/Anthropic/Google/Other)", automates tasks "using AI" from goals
described "in natural language", and justifies seven permissions the extension no
longer requests — `activeTab`, `scripting`, `offscreen`, `tabCapture`, `alarms`,
`host_permissions` and a "PraisonAI bridge server". It also carries a tester
guide telling reviewers to press `Alt+A` to "start agent", a command that does
not exist.

That page is the extension's declared privacy policy. Left as-is it reproduces
both rejection reasons on its own, and it contradicts a "does not collect user
data" declaration in the dashboard.

**Either repoint the listing's privacy-policy field to
`https://chrome.praison.ai/privacy/`, or replace the page body with the text
below.** Replacing is better: the URL is already indexed and may be linked
elsewhere.

---

## Paste from here

**PraisonAI Browser Agent — Privacy Policy**

*Last updated: 25 August 2026. Applies to version 1.0.4.*

**Does this extension collect user data?** No.

The extension makes no network requests of any kind. It has no server, no
account, no analytics and no telemetry. Nothing you do in it leaves your browser.

**What is stored, and where**

Three things are kept, all locally, using Chrome's storage API:

- **Action history** — the action name, a short detail such as a URL, selector or
  expression, and a timestamp. The last 50 entries. Stored with
  `chrome.storage.local`. Cleared by the panel's "Clear history" button or by
  uninstalling.
- **The most recent screenshot**, with the time it was taken, so a capture made
  with the keyboard shortcut is visible when you next open the panel. Stored with
  `chrome.storage.session`; it is only displayed if it is under five minutes old,
  and it is discarded when Chrome closes.
- **Console messages, up to 200 per tab**, for the Console Logs tool, stored with
  `chrome.storage.session` so output survives Chrome suspending the extension's
  background worker. Cleared by "End Session", closing the tab, or closing Chrome.

That is the complete list. Page data you extract and JavaScript results are shown
in the panel and are not persisted.

**What is not collected**

- No page content is uploaded anywhere.
- No browsing history is read. The extension reads the URL and title of the tab
  you have focused, in order to display it and to check whether Chrome permits
  automation there.
- No cookies, credentials, form data or personal information are collected.
- No identifiers, no usage statistics, no crash reporting.
- Nothing is sold or shared, because nothing is collected.

**Permissions**

The extension requests six permissions and no host permissions:

- **sidePanel** — the panel is the entire user interface.
- **tabs** — reads the `url` and `title` of the active tab, to show which page the
  panel is attached to and to warn before attempting a page Chrome blocks.
- **debugger** — the Chrome DevTools Protocol is how every action is performed:
  navigation, trusted input events, page screenshots, JavaScript evaluation and
  console capture.
- **storage** — the three local items listed above.
- **contextMenus** — two right-click entries: Capture screenshot, and Open
  PraisonAI panel.
- **notifications** — one notification confirming a screenshot taken with the
  keyboard shortcut, which works while the panel is closed.

**About the permission warning**

Chrome shows two warnings at install: "Access the page debugger backend" and
"Read and change all your data on all websites". Both come from the `debugger`
permission, which the DevTools Protocol requires. They describe the ceiling of
what the permission allows, not what the extension does. No host permissions are
declared and no content script is installed, so there is no standing access to
any site: the debugger attaches to one tab, only in response to something you
did, shows a banner for as long as it is attached, and detaches when you press
"End Session" or close the panel.

**Remote code**

None. The content security policy is `script-src 'self'; object-src 'self'`, and
the shipped code contains no `fetch`, no socket and no remote script. The only
code that runs which you supply is the expression you type into the Run
JavaScript box; it runs in the page you are looking at and goes nowhere else.

**Limited Use**

The use of information received from Google APIs will adhere to the Chrome Web
Store User Data Policy, including the Limited Use requirements. In practice this
is trivially satisfied: the extension transmits nothing, to Google or anyone else.

**Contact**

https://github.com/MervinPraison/praisonai-chrome-extension/issues

## Paste to here
