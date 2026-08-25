# Privacy Policy

*Last updated: 25 August 2026 — applies to PraisonAI Browser Agent 1.0.4*

## The short version

The extension makes no network requests. It has no server, no account, no
analytics and no telemetry. Nothing you do in it leaves your browser.

## What is stored, and where

| Data | Storage | Why | Cleared by |
| --- | --- | --- | --- |
| Action history — the action name, a short detail (URL, selector or expression) and a timestamp, last 50 entries | `chrome.storage.local` | So the History tab can show what you ran | **Clear history**, or uninstalling |
| Most recent screenshot, with the time it was taken | `chrome.storage.session` | So a screenshot taken with the shortcut or context menu is visible when you next open the panel — it is only displayed if it is under five minutes old | Closing Chrome, or uninstalling |
| Console messages, last 200 per tab | `chrome.storage.session` | The Console Logs tool, so output survives Chrome suspending the extension's background worker | **End Session**, closing the tab, closing Chrome, or uninstalling |

That is the complete list. Extracted page data and JavaScript results are shown
in the panel and are not persisted.

## What is not collected

- No page content is uploaded anywhere.
- No browsing history is read. The extension reads the URL of the tab you have
  focused **in the panel's own window**, in order to display it and to check
  whether Chrome permits automation there. It learns which window that is with
  a single `chrome.windows.getCurrent()` call when the panel opens.
- No cookies, credentials, form data or personal information are collected.
- No identifiers, no usage statistics, no crash reporting.
- Nothing is sold or shared, because nothing is collected.

## Access to pages

Chrome warns that this extension can "Read and change all your data on all
websites". That warning comes from the `debugger` permission, which the Chrome
DevTools Protocol requires; it is the ceiling of what the permission allows, not
a description of what the extension does. `chrome.permissions.getAll()` reports
no origins at all.

The extension declares no host permissions. It reaches a page only through a
Chrome debugger session that you start by running an action, on the tab you
targeted. Chrome displays a banner for as long as that session is attached, and
you can end it at any time from the panel or from the banner itself.

## Remote code

None. The content security policy is `script-src 'self'; object-src 'self'`,
and the shipped code contains no `fetch`, no socket and no remote script.

The one place code runs that you supply is the **Run JavaScript** box — that
expression is yours, it runs in the page you are looking at, and it goes
nowhere else.

## Limited Use

The use of information received from Google APIs will adhere to the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
including the Limited Use requirements.

In practice this is trivially satisfied: the extension transmits nothing, to
Google or to anyone else.

## Contact

Questions about this policy:
[github.com/MervinPraison/praisonai-chrome-extension/issues](https://github.com/MervinPraison/praisonai-chrome-extension/issues)
