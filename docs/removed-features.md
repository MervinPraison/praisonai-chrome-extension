# What was removed in 1.0.4

Earlier versions of this extension, and earlier versions of this documentation,
described an autonomous agent driven by a language model. **None of that is in
the extension you can install today**, and none of it is described elsewhere on
this site as a current feature.

This page exists so that anyone who saw the old material knows exactly what
changed.

## Removed

| Removed | Was |
| --- | --- |
| Agent mode | A goal box that tried to plan and execute multi-step tasks on its own |
| On-device model integration | A wrapper around Chrome's experimental on-device model API |
| Local companion connection | A background socket connection to a locally running command-line tool |
| Offscreen document | A hidden page that hosted that connection |
| Content script | A page-automation script that nothing in the UI ever called |
| Video capture | Recording browser activity to a video file |
| Summarize tool | A text-summarising panel button |
| <kbd>Alt</kbd>+<kbd>A</kbd> shortcut | Ran the agent |
| `offscreen` and `alarms` permissions | Declared for the above |

## Why

The removed features did not work from a clean install. They required software
that was not part of the extension, or an experimental model that most Chrome
installs do not have, and the failures were not visible in the panel — in one
path the UI showed a completed state while the underlying call had thrown. An
extension that describes capabilities a user cannot reach is inaccurate, and it
was rightly rejected on that basis.

Rather than paper over it in the listing, the code was cut back to what runs
everywhere with no setup: a side panel that drives the current tab through the
Chrome DevTools Protocol.

## Where the code went

It lives in `future/agent-mode/` in the repository, together with a
`RESTORE.md` that lists the defects that must be fixed before any of it comes
back. **It is not built and not shipped.** `vite.config.ts` has no entry point
under `future/`, and the packaged archive is built from `dist/` only.

## If it returns

Any of it that comes back will do so only when it works on a clean profile with
no external software, reports its own failures in the panel, and is covered by
permissions that match working features. Until then, the feature list on this
site is the complete feature list.

See [what the extension does today](index.md#what-it-does).
