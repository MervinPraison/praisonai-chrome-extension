# PraisonAI Browser ↔ Chrome extension integration

End-to-end **AI browser agent**: the extension drives the tab (CDP); [`praisonai-browser`](https://github.com/MervinPraison/PraisonAI/tree/main/src/praisonai-browser) runs the WebSocket bridge and vision LLM.

## Architecture

```
┌─────────────────────┐     ws://127.0.0.1:8765/ws     ┌──────────────────────────┐
│ Chrome extension    │ ◄──────────────────────────────► │ praisonai-browser        │
│ (side panel +       │   observation / action / status  │ BrowserServer (FastAPI)  │
│  background +       │                                  │ BrowserAgent (LLM)       │
│  offscreen WS)      │                                  └──────────────────────────┘
└──────────┬──────────┘
           │ chrome.debugger (CDP)
           ▼
     Active https tab
```

| Component | Repo / path |
|-----------|-------------|
| Extension (this repo) | [praisonai-chrome-extension](https://github.com/MervinPraison/praisonai-chrome-extension) |
| Bridge + agent | [PraisonAI `src/praisonai-browser`](https://github.com/MervinPraison/PraisonAI/tree/main/src/praisonai-browser) |
| Wire messages | `praisonai_browser/protocol.py` ↔ `src/bridge/client.ts` |

**Note:** Upstream extension **1.0.4** removed shipped agent-mode (see `future/agent-mode/` on GitHub). This workspace build still includes bridge + agent UI for integration with `praisonai-browser`.

## Prerequisites

- Chrome 116+
- Node 20+ (build extension)
- Python 3.10+ with `pip install "praisonai-browser[all]"` or `pip install "praisonai[browser]"`
- `OPENAI_API_KEY` (or model configured for `BrowserAgent`)

## Golden path (manual E2E)

### 1. Start bridge

```bash
praisonai browser start --port 8765
# or: praisonai-browser start --port 8765
```

Health: `http://127.0.0.1:8765/health`

### 2. Build and load extension

```bash
npm install
npm run build
```

Chrome → `chrome://extensions` → Developer mode → **Load unpacked** → select `dist/`.

Use **one** install (Store **or** unpacked), not both.

### 3. Run agent

1. Open a normal `https://` page (not `chrome://`, Web Store, or `127.0.0.1/health`).
2. Open side panel (toolbar or Ctrl/Cmd+Shift+P).
3. Enter a goal → **Start agent** (bridge must show connected).
4. **End session** when done (detaches debugger).

### 4. Doctor

```powershell
$env:PYTHONIOENCODING = 'utf-8'
praisonai browser doctor
```

Expect bridge + WebSocket pass when step 1 is running; CDP/extension checks need Chrome with debugging if you use launcher flows.

## CLI without side panel

```bash
praisonai browser run "Go to example.com and read the main heading"
```

Uses bridge + extension when available; may fall back to CDP/Playwright per `--engine`.

## Protocol (summary)

| Message | Direction | Purpose |
|---------|-----------|---------|
| `start_session` | → server | Goal + model |
| `observation` | ext → server | URL, screenshot, elements, step |
| `action` | server → ext | click, type, navigate, done, … |
| `status` / `error` | both | Lifecycle |

Extension default URL: `ws://localhost:8765/ws` (`src/bridge/client.ts`, offscreen duplicate).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Bridge not connected | Start `praisonai browser start`; check firewall on 8765 |
| Debugger / automation blocked | Use https tab; End Session; reload extension |
| Two extensions | Disable Store copy if using unpacked dev build |
| Built-in AI unavailable | Normal for agent path; LLM runs on **Python bridge**, not Gemini Nano in-panel |

## Tests

**Python (protocol + mocks):**

```bash
pytest src/praisonai-browser/tests/browser/test_protocol_compliance.py
pytest src/praisonai-browser/tests/browser/test_extension_integration.py
```

**Extension:**

```bash
npm test
npm run typecheck
```

## Related upstream issues

- Browser doctor / extension detection: [PraisonAI#5785](https://github.com/MervinPraison/PraisonAI/issues/5785)
- Release gate smoke: [#5780](https://github.com/MervinPraison/PraisonAI/issues/5780)
