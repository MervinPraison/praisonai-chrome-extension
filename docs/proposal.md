# Implementation Proposal — Closing Gaps

> Proposal for addressing identified gaps in PraisonAI Chrome Extension.

---

## Summary

The PraisonAI Chrome Extension is **80% complete** with all core features implemented:
- ✅ CDP automation
- ✅ Built-in AI (Gemini Nano)
- ✅ Side Panel UI
- ✅ Context menusw
- ✅ 30 passing tests

**Gaps identified from Google samples:**
1. **Keyboard shortcuts** — CRITICAL
2. **Lifecycle events** — MEDIUM

---

## Proposal 1: Add Keyboard Shortcuts

### Manifest Change

Add to `manifest.json`:

```json
{
  "commands": {
    "_execute_action": {
      "suggested_key": {
        "default": "Ctrl+Shift+P",
        "mac": "Command+Shift+P"
      },
      "description": "Open PraisonAI panel"
    },
    "start-agent": {
      "suggested_key": {
        "default": "Alt+A",
        "mac": "Option+A"
      },
      "description": "Start browser agent"
    }
  }
}
```

### Background Worker Change

Add handler for custom commands:

```typescript
chrome.commands.onCommand.addListener((command) => {
  if (command === 'start-agent') {
    // Start agent in current tab
  }
});
```

**Effort:** 15 minutes
**Impact:** HIGH — Required for accessibility

---

## Proposal 2: Add Lifecycle Events

### Background Worker Change

```typescript
// Track panel state
const panelState = new Map<number, boolean>();

chrome.sidePanel.onOpened?.addListener((info) => {
  console.log('Panel opened:', info.windowId, info.tabId);
  panelState.set(info.tabId ?? info.windowId, true);
});

chrome.sidePanel.onClosed?.addListener((info) => {
  console.log('Panel closed:', info.windowId, info.tabId);
  panelState.set(info.tabId ?? info.windowId, false);
  
  // Cleanup: stop agent if running
  if (info.tabId && agents.has(info.tabId)) {
    agents.get(info.tabId)?.stop();
    agents.delete(info.tabId);
  }
});
```

**Effort:** 10 minutes
**Impact:** MEDIUM — Better resource management

---

## Optional: Site-Specific Enabling

For future consideration — enable panel only on specific sites:

```typescript
const ALLOWED_ORIGINS = [
  'https://github.com',
  'https://google.com',
];

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;
  const url = new URL(tab.url);
  
  await chrome.sidePanel.setOptions({
    tabId,
    enabled: ALLOWED_ORIGINS.some(o => url.origin.includes(o))
  });
});
```

**Effort:** 20 minutes
**Impact:** LOW — Niche use case

---

## Files to Modify

| File | Change |
|------|--------|
| `manifest.json` | Add `commands` key |
| `src/background/index.ts` | Add lifecycle events + command handler |
| `tests/background.test.ts` | Add tests for new handlers |

---

## Verification Plan

1. Rebuild: `npm run build`
2. Run tests: `npm test`
3. Load in Chrome and verify:
   - `Ctrl+Shift+P` opens panel
   - Panel open/close events logged

---

## Timeline

| Phase | Task | Time |
|-------|------|------|
| 1 | Add keyboard shortcuts | 15 min |
| 2 | Add lifecycle events | 10 min |
| 3 | Tests | 15 min |
| 4 | Rebuild + verify | 5 min |
| **Total** | | **45 min** |

---

## Recommendation

**Implement Proposal 1 (keyboard shortcuts)** immediately — it's a Chrome Web Store requirement for accessibility.

**Implement Proposal 2 (lifecycle events)** — improves resource management and analytics.

**Skip site-specific enabling** — PraisonAI is designed for all sites.
