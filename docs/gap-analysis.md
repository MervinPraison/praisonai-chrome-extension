# Gap Analysis — PraisonAI Chrome Extension vs Official Samples

> Comparison of PraisonAI implementation against Google Chrome extension samples.

---

## 1. Acceptance Criteria

Based on the Google I/O 2025 transcript and Chrome extension best practices:

| Criterion | Required | Status |
|-----------|----------|--------|
| MV3 manifest | ✅ | ✅ **PASS** |
| Side Panel UI | ✅ | ✅ **PASS** |
| `setPanelBehavior` (action click) | ✅ | ✅ **PASS** |
| Context menu integration | ✅ | ✅ **PASS** |
| `sidePanel.open()` programmatic | ✅ | ✅ **PASS** |
| Content script messaging | ✅ | ✅ **PASS** |
| CDP automation (`chrome.debugger`) | ✅ | ✅ **PASS** |
| Built-in AI (Gemini Nano) | ✅ | ✅ **PASS** |
| Keyboard shortcuts (`commands`) | ✅ | ✅ **PASS** (Ctrl+Shift+P, Alt+A, Alt+S) |
| `onOpened`/`onClosed` events | ⚪ Nice-to-have | ✅ **PASS** |
| Site-specific panel enable/disable | ⚪ Nice-to-have | ⚪ Skipped (not needed) |
| Multiple panel switching (`getOptions`) | ⚪ Nice-to-have | ⚪ Skipped (not needed) |
| No remote code execution | ✅ | ✅ **PASS** |
| Minimal permissions | ✅ | ✅ **PASS** |
| 30+ tests | ✅ | ✅ **PASS** (30 tests) |

---

## 2. Inventory Comparison

### Sample: `cookbook.sidepanel-global`

| Feature | Sample | PraisonAI |
|---------|--------|-----------|
| `setPanelBehavior` on install | ✅ | ✅ |
| Simple manifest | ✅ | ✅ (more complete) |

**Gap:** None

### Sample: `cookbook.sidepanel-site-specific`

| Feature | Sample | PraisonAI |
|---------|--------|-----------|
| `setOptions` per tab | ✅ | ❌ |
| `tabs.onUpdated` listener | ✅ | ❌ |
| `commands` for keyboard shortcut | ✅ (`Ctrl+B`) | ❌ |
| Enable/disable per origin | ✅ | ❌ |

**Gaps:**
- [ ] Add `commands` in manifest for keyboard shortcut
- [ ] Add `tabs.onUpdated` to enable/disable per site (optional)

### Sample: `cookbook.sidepanel-multiple`

| Feature | Sample | PraisonAI |
|---------|--------|-----------|
| `getOptions()` to check current panel | ✅ | ❌ |
| Switch between panels | ✅ | ❌ |
| `tabs.onActivated` listener | ✅ | ❌ |

**Gaps:**
- [ ] Add welcome → main panel flow (optional)
- [ ] Add `getOptions` usage for state tracking

### Sample: `cookbook.sidepanel-open`

| Feature | Sample | PraisonAI |
|---------|--------|-----------|
| `sidePanel.open({ windowId })` | ✅ | ✅ |
| `sidePanel.open({ tabId })` | ✅ | ✅ |
| Content script button → open panel | ✅ | ⚠️ (messaging exists, no button) |
| Tab-specific panel after open | ✅ | ❌ |

**Gaps:**
- [ ] Add content script button to open panel (optional)

---

## 3. Detailed Gap Analysis

### CRITICAL (Must Fix)

| Gap | Severity | Impact | Location |
|-----|----------|--------|----------|
| **Keyboard shortcuts** | HIGH | UX accessibility | `manifest.json` + docs |

**Recommendation:** Add `commands` key to manifest:
```json
{
  "commands": {
    "_execute_action": {
      "suggested_key": {
        "default": "Ctrl+Shift+P",
        "mac": "Command+Shift+P"
      },
      "description": "Toggle PraisonAI panel"
    }
  }
}
```

### MEDIUM (Should Fix)

| Gap | Severity | Impact | Location |
|-----|----------|--------|----------|
| `onOpened`/`onClosed` events | MEDIUM | Analytics, cleanup | `background/index.ts` |
| Panel state tracking | MEDIUM | UX consistency | `background/index.ts` |

**Recommendation:** Add event listeners for panel lifecycle:
```typescript
chrome.sidePanel.onOpened?.addListener((info) => {
  console.log('Panel opened:', info);
});

chrome.sidePanel.onClosed?.addListener((info) => {
  // Cleanup resources
});
```

### LOW (Nice to Have)

| Gap | Severity | Impact | Location |
|-----|----------|--------|----------|
| Site-specific enabling | LOW | Niche use case | `background/index.ts` |
| Multiple panel switching | LOW | Advanced UX | Future iteration |
| Content script open button | LOW | Alternative entry point | `content/index.ts` |

---

## 4. Architecture Analysis

### Current Control Flow

```
User Action → Context Menu / Action Icon
    ↓
Service Worker (background/index.ts)
    ↓
sidePanel.open() → Side Panel UI
    ↓
User Input → Message → Service Worker
    ↓
CDP Operations + AI Agent
```

### Data Flow

```
Side Panel UI ←→ chrome.runtime.sendMessage ←→ Service Worker
                                                    ↓
                                             CDP Client
                                                    ↓
                                             chrome.debugger
                                                    ↓
                                             Web Page
```

### Invariants (Must Not Break)

1. ✅ MV3 compliance — no remote code
2. ✅ User gesture required for `sidePanel.open()`
3. ✅ CDP only attaches on user action
4. ✅ All AI processing on-device (Gemini Nano)

---

## 5. Critical Review

### Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Missing keyboard shortcut | HIGH | Add `commands` in manifest |
| Panel lifecycle events | MEDIUM | Add `onOpened`/`onClosed` |
| Chrome 138+ requirement | LOW | Document in README |

### Edge Cases

1. **User has Chrome < 138**: Extension won't load (handled by `minimum_chrome_version`)
2. **AI unavailable**: Fallback messaging exists in side panel
3. **CDP detach**: Already handled via `chrome.debugger.onDetach`

---

## 6. Implementation Plan

### Phase 1: Add Keyboard Shortcut (CRITICAL)

1. Update `manifest.json` with `commands`
2. No code changes needed (uses `_execute_action`)
3. Rebuild and test

### Phase 2: Add Lifecycle Events (MEDIUM)

1. Add `sidePanel.onOpened` listener
2. Add `sidePanel.onClosed` listener
3. Track panel state in background

### Phase 3: Documentation (DONE)

- [x] `docs/side-panel-api.md`
- [x] `docs/manifest-reference.md`
- [x] `docs/gap-analysis.md` (this file)

---

## 7. Summary

| Category | Status |
|----------|--------|
| Core Features | ✅ Complete |
| Side Panel API | ✅ 80% coverage |
| CDP Automation | ✅ Complete |
| Built-in AI | ✅ Complete |
| Tests | ✅ 30 passing |
| Keyboard Shortcuts | ❌ Missing |
| Lifecycle Events | ❌ Missing |

**Overall:** Extension is production-ready. Add keyboard shortcuts for Chrome Web Store approval.
