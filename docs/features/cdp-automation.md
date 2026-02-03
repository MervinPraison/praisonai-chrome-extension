# CDP Automation

Chrome DevTools Protocol (CDP) integration for precise browser control.

## Overview

CDP Automation provides low-level browser control through Chrome's debugging protocol, enabling precise interactions that go beyond what content scripts can achieve.

## Features

### Element Interaction

- **Navigate** - Go to any URL
- **Click** - Click elements by CSS selector
- **Type** - Enter text into form fields
- **Scroll** - Scroll to elements or positions

### JavaScript Execution

```javascript
// Evaluate JavaScript in page context
praisonai browser execute "document.title"

// Get element contents
praisonai browser execute "document.querySelector('h1').textContent"
```

### Tab Management

```bash
# List all tabs
praisonai browser tabs

# Get current tab info
praisonai browser tabs --current
```

## How CDP Works

```
┌─────────────────────────────────────┐
│         Chrome Browser              │
│  ┌─────────────────────────────┐   │
│  │    Debugger Protocol        │   │
│  │    (chrome.debugger API)    │   │
│  └──────────────┬──────────────┘   │
└─────────────────┼──────────────────┘
                  │
    ┌─────────────┴─────────────┐
    │                           │
    ▼                           ▼
┌─────────────┐         ┌─────────────┐
│  CDP Client │         │  Extension  │
│  (client.ts)│         │  Background │
└─────────────┘         └─────────────┘
```

## Permissions Required

| Permission | Purpose |
|------------|---------|
| `debugger` | Access to Chrome DevTools Protocol |
| `activeTab` | Current tab access for automation |
| `scripting` | Content script injection |

## Example: Automating a Search

```bash
# Start the bridge server
praisonai browser start

# Navigate to Google
praisonai browser navigate "https://google.com"

# Type in search box
praisonai browser type "input[name='q']" "AI automation"

# Click search button
praisonai browser click "input[type='submit']"
```

## Security Considerations

- CDP only attaches when user initiates an action
- No persistent debugging connections
- All automation requires user consent
