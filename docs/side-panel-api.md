# Side Panel API Reference

> Documentation of Chrome's `chrome.sidePanel` API for the PraisonAI Browser Agent extension.

## Availability

- **Chrome 114+** for basic Side Panel
- **Chrome 116+** for `sidePanel.open()` programmatic opening
- **Chrome 140+** for `getLayout()` and `Side` type
- **Chrome 141+** for `onOpened` event
- **Chrome 144+** for `onClosed` event

## Permissions

```json
{
  "permissions": ["sidePanel"]
}
```

## Manifest Configuration

```json
{
  "side_panel": {
    "default_path": "sidepanel.html"
  }
}
```

---

## Methods

### `setPanelBehavior(behavior)`

Configure whether clicking the action icon opens the side panel.

```javascript
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
```

### `getPanelBehavior()`

Get current panel behavior configuration.

```javascript
const { openPanelOnActionClick } = await chrome.sidePanel.getPanelBehavior();
```

### `setOptions(options)`

Configure side panel for specific tabs or globally.

```javascript
// Global panel
await chrome.sidePanel.setOptions({ path: 'sidepanel.html' });

// Tab-specific panel
await chrome.sidePanel.setOptions({
  tabId: 123,
  path: 'tab-sidepanel.html',
  enabled: true
});

// Disable for specific tab
await chrome.sidePanel.setOptions({
  tabId: 123,
  enabled: false
});
```

### `getOptions(options)`

Get current panel options.

```javascript
const { path, enabled } = await chrome.sidePanel.getOptions({ tabId: 123 });
```

### `open(options)` — Chrome 116+

Programmatically open the side panel. **Must be called in response to user action.**

```javascript
// Open for entire window
await chrome.sidePanel.open({ windowId: tab.windowId });

// Open for specific tab
await chrome.sidePanel.open({ tabId: tab.id });
```

### `close(options)` — Chrome 141+

Close the side panel.

```javascript
// Close for specific tab
await chrome.sidePanel.close({ tabId: 123 });

// Close for window
await chrome.sidePanel.close({ windowId: 456 });
```

### `getLayout()` — Chrome 140+

Get the panel's current layout (left or right side).

```javascript
const { side } = await chrome.sidePanel.getLayout();
// side: "left" | "right"
```

---

## Events

### `onOpened` — Chrome 141+

Fired when the side panel is opened.

```javascript
chrome.sidePanel.onOpened.addListener((info) => {
  console.log('Panel opened:', info.path, info.windowId, info.tabId);
});
```

### `onClosed` — Chrome 144+

Fired when the side panel is closed.

```javascript
chrome.sidePanel.onClosed.addListener((info) => {
  console.log('Panel closed:', info.path, info.windowId, info.tabId);
});
```

---

## Types

### `PanelBehavior`

```typescript
interface PanelBehavior {
  openPanelOnActionClick?: boolean;
}
```

### `PanelOptions`

```typescript
interface PanelOptions {
  tabId?: number;    // Apply to specific tab (optional)
  path?: string;     // HTML file path
  enabled?: boolean; // Enable/disable panel
}
```

### `OpenOptions`

```typescript
interface OpenOptions {
  tabId?: number;    // Open for specific tab
  windowId?: number; // Open for entire window
}
```

### `CloseOptions` — Chrome 141+

```typescript
interface CloseOptions {
  tabId?: number;
  windowId?: number;
}
```

### `Side` — Chrome 140+

```typescript
type Side = "left" | "right";
```

---

## Common Patterns

### 1. Global Side Panel (All Sites)

```javascript
// manifest.json
{
  "side_panel": { "default_path": "sidepanel.html" },
  "permissions": ["sidePanel"]
}

// service-worker.js
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
```

### 2. Site-Specific Side Panel

```javascript
const ALLOWED_ORIGIN = 'https://example.com';

chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!tab.url) return;
  const url = new URL(tab.url);
  
  await chrome.sidePanel.setOptions({
    tabId,
    path: 'sidepanel.html',
    enabled: url.origin === ALLOWED_ORIGIN
  });
});
```

### 3. Multiple Side Panels

```javascript
const welcomePage = 'sidepanels/welcome.html';
const mainPage = 'sidepanels/main.html';

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const { path } = await chrome.sidePanel.getOptions({ tabId });
  if (path === welcomePage) {
    await chrome.sidePanel.setOptions({ path: mainPage });
  }
});
```

### 4. Open from Content Script

```javascript
// content-script.js
button.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'open_side_panel' });
});

// service-worker.js
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'open_side_panel') {
    chrome.sidePanel.open({ tabId: sender.tab.id });
  }
});
```

### 5. Context Menu Integration

```javascript
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'openSidePanel',
    title: 'Open side panel',
    contexts: ['all']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'openSidePanel') {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});
```

---

## Best Practices

1. **User Gesture Required**: `sidePanel.open()` must be called in response to user action
2. **Tab vs Window**: Use `tabId` for tab-specific panels, `windowId` for global
3. **Error Handling**: Always use `.catch()` for async operations
4. **Performance**: Side panels have full access to Chrome APIs but share resources
5. **Persistence**: Side panel remains open when navigating between tabs (unless disabled)

---

## References

- [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)
- [Side Panel Samples](https://github.com/GoogleChrome/chrome-extensions-samples/tree/main/functional-samples)
