# Agent Mode — parked for later

This directory holds the AI agent + PraisonAI bridge code that was removed from the
shipped extension in v1.0.4. **Nothing here is built or packaged.** `vite.config.ts`
has no entry point under `future/`, and the store ZIP is built from `dist/` only, so
this code cannot reach a reviewer.

It is parked, not deleted, so it can come back once the store listing is approved.

## Why it was removed

Chrome Web Store rejected v1.0.3 twice:

| Ref | Violation | Cause |
| --- | --- | --- |
| Red Potassium | Inaccurate Description — Non functional | The advertised "AI-powered browser automation" had exactly two execution paths, and a reviewer could reach neither. |
| Purple Potassium | Use of permissions | `offscreen` (22 Jan) and `alarms` (30 Jan) were declared for features that were unreachable or absent. |

The deeper problem was not the manifest. On a clean profile:

1. The offscreen document dialled `ws://localhost:8765/ws`, which was refused. No UI reflected this.
2. Browser-only mode fell back to Gemini Nano, which needs Chrome 138+ and a ~4 GB model
   download. `manifest.json` declared `minimum_chrome_version: 116`.
3. `agent.ts:281` caught the resulting error and logged it to the service-worker console.
4. The panel painted a green **"Completed"** pill.
5. The error text was written to `#output-content`, which lives inside the *Tools* tab —
   a `display: none` subtree while the Agent tab is open.

So the extension claimed success while doing nothing, with every error routed somewhere
invisible. That is the exact shape of the policy they cited.

## What is in here

| Path | What it was |
| --- | --- |
| `src/bridge/` | WebSocket client + protocol for the PraisonAI CLI bridge |
| `src/ai/agent.ts` | `BrowserAgent` — the observe/decide/act loop |
| `src/ai/builtin.ts` | Chrome Built-in AI (Gemini Nano / Prompt API) wrapper |
| `src/ai/hybrid.ts` | Bridge-or-local routing |
| `src/offscreen/` | Offscreen document hosting the persistent WebSocket |
| `src/content/` | Content script — a full page-automation API that nothing ever called |
| `src/background-index.full.ts` | The complete pre-cut background service worker |
| `src/sidepanel*.full.*` | The pre-cut side panel with the Agent tab |
| `ai.test.ts` | Tests for the built-in AI wrapper |

## Before bringing any of it back

These are the conditions that made the old code non-compliant. Fix them in the code, not
in the listing.

- [ ] **A typed goal must do something on a clean profile** — no server, no model, no flags.
      Ship a deterministic executor and treat AI as an accelerator on top of it.
- [ ] **Never report success on failure.** `agent.ts:281` swallowed the throw and the panel
      still showed "Completed".
- [ ] **Errors must render in the tab the user is looking at.** The old error sink was inside
      a hidden `.mode-content`.
- [ ] **Show connection state in the UI.** The panel never listened for `BRIDGE_STATE`, so a
      dead socket was invisible.
- [ ] **Pass `onStep`.** `agent.run(goal)` was called without it, so "real-time progress"
      could never render even on the happy path.
- [ ] **Match `minimum_chrome_version` to the API you actually need** (138+ for `LanguageModel`).
- [ ] **`builtin.ts` bugs**: `checkCapabilities` counts `'downloadable'` as available, so the
      footer could claim "Gemini Nano Ready" with no model present; and `create({ systemPrompt })`
      uses the obsolete `window.ai` option name — Chrome 138+ expects `initialPrompts`, so the
      system prompt was silently dropped.
- [ ] **Re-declare permissions only alongside working, reachable features**, and make each
      store justification describe what the code does — not what it was going to do.
- [ ] **Restore the CSP and `externally_connectable` entries** only if the localhost bridge is
      genuinely part of the shipped product. If the bridge is developer-only, it does not belong
      in a store build at all — ship it as an unpacked dev build.

## Restoring

```bash
git mv future/agent-mode/src/ai      src/ai
git mv future/agent-mode/src/bridge  src/bridge
git mv future/agent-mode/src/offscreen src/offscreen
git mv future/agent-mode/src/content src/content
git mv future/agent-mode/ai.test.ts  tests/ai.test.ts
```

Then re-add the `offscreen` and `content` entry points to `rollupOptions.input` in
`vite.config.ts`, re-add the `offscreen.html` copy target, and re-add the matching
permissions and manifest keys.
