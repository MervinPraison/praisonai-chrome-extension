# Chrome Web Store Listing Content

## Store Listing Fields

### Title
```
PraisonAI Browser Agent
```

### Summary 
```
Browser automation with side panel, screenshots, and session recording. Navigate websites, click elements, fill forms using the intuitive side panel interface.
```

### Description
```
PraisonAI Browser Agent - Browser Automation Made Simple

Automate your browser tasks with an intuitive side panel interface. Navigate websites, interact with page elements, capture screenshots, and record browser sessions.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ KEY FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎛️ Side Panel Interface
• Convenient side panel that stays open while browsing
• Enter automation goals and see real-time progress
• View history of completed actions
• Quick access via toolbar icon or keyboard shortcut

📸 Screenshot Capture
• Capture screenshots with one click or keyboard shortcut
• Right-click context menu for quick capture
• Notifications confirm successful captures
• Screenshots saved for your records

🎬 Session Recording
• Record browser sessions as video
• Capture both video and audio from tabs
• WebM format for easy sharing
• Start/stop recording from side panel

🖱️ Page Interaction
• Click buttons and links on any page
• Fill form fields automatically
• Scroll pages up and down
• Navigate to URLs

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎮 HOW TO USE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Click the PraisonAI icon in your toolbar to open side panel
2. Or use keyboard shortcut: Ctrl+Shift+P (Cmd+Shift+P on Mac)
3. Use the interface to control browser automation
4. Right-click on any page for quick actions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⌨️ KEYBOARD SHORTCUTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Ctrl+Shift+P / Cmd+Shift+P: Open side panel
• Alt+A / Option+A: Start automation
• Ctrl+Shift+S / Cmd+Shift+S: Capture screenshot

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 PERMISSIONS EXPLAINED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Side Panel: Main user interface
• Active Tab: Interact with current page
• Tabs: Manage tabs during automation
• Scripting: Execute page interactions
• Debugger: Advanced element detection
• Storage: Save preferences
• Notifications: Alert on task completion
• Offscreen: Process recordings and images
• Tab Capture: Record browser sessions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 SUPPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Documentation: https://docs.praison.ai
• Issues: https://github.com/MervinPraison/PraisonAI/issues
• Website: https://praison.ai

Made with ❤️ by PraisonAI
```

### Language
```
English
```

---

## URLs

### Homepage URL
```
https://docs.praison.ai
```

### Support URL
```
https://github.com/MervinPraison/PraisonAI/issues
```

## Mature Content
```
No (uncheck)
```

## Item Support
```
On
```

---

# Privacy Practices Tab

## Single Purpose Description
```
This extension provides browser automation tools including a side panel interface for controlling page interactions, screenshot capture via keyboard shortcuts and context menu, and session recording capabilities. Users can navigate websites, click elements, fill forms, and capture screenshots through the intuitive interface.
```

---

## Permission Justifications

### activeTab
```
Required to interact with the currently active tab when the user initiates a browser automation task. The extension reads page content (DOM elements, text, URLs) and executes actions (clicks, typing) only on the tab the user is actively working with. This is triggered only by explicit user action (clicking "Start Agent" or using keyboard shortcuts).
```

### tabs
```
Required to manage browser tabs during multi-step automation workflows. The extension may need to open new tabs, switch between tabs, or close tabs as part of completing user-requested tasks. For example, when searching for information that spans multiple pages or when the user's goal requires navigating to different websites.
```

### scripting
```
Required to execute automation scripts on web pages. The extension injects scripts to identify interactive elements (buttons, links, input fields), read page content, and perform actions (clicking, typing text) as directed by the AI agent. Scripts are only executed on pages where the user has initiated an automation task.
```

### debugger
```
Required for advanced element detection and interaction using Chrome DevTools Protocol (CDP). This enables precise identification of clickable elements, form fields, and interactive components on complex web pages. The debugger API provides reliable browser automation capabilities that are not possible through content scripts alone.
```

### storage
```
Required to save user preferences such as preferred AI model, server connection settings, and session history. All data is stored locally on the user's device using Chrome's storage API. No user data is transmitted to external servers unless the user explicitly configures a connection to the PraisonAI bridge server.
```

### sidePanel
```
Required to display the main user interface. The side panel provides the primary interaction point where users enter their goals, view automation progress, and see the history of completed actions. This panel remains accessible while browsing, allowing users to monitor and control automation tasks without switching windows.
```

### contextMenus
```
Required to add right-click menu options for quick access to extension features. Users can right-click on page elements to quickly trigger automation actions, such as "Fill this form" or "Click this element". This provides a convenient alternative to opening the side panel for simple tasks.
```

### notifications
```
Required to alert users when automation tasks complete, fail, or require attention. Notifications inform users of task completion when the browser is not in focus, ensuring they are aware of the automation status without constantly monitoring the side panel.
```

### offscreen
```
Required for browser session recording functionality. The offscreen document hosts MediaRecorder API to capture tab video/audio streams, process recorded video data into WebM format, and handle Base64 encoding of media files. This is necessary because MediaRecorder and Canvas APIs are not available in service workers (Manifest V3 requirement). The offscreen document is created when user initiates recording via the side panel.
```

### tabCapture
```
Required for the session recording feature. When users initiate recording from the side panel, tabCapture provides the media stream ID needed to capture video and audio from the active tab. This stream is processed by the offscreen document's MediaRecorder to create WebM video files. Also used for capturing screenshots of the current tab.
```

### alarms
```
Required to keep the service worker alive during long-running automation tasks. Manifest V3 service workers can be terminated after 30 seconds of inactivity. The alarms API provides periodic wake-up calls to prevent termination during multi-step automation workflows that may take several minutes to complete.
```

### host_permissions (<all_urls>)
```
This is a browser automation tool that must work on any website the user chooses. Users describe goals like "search Google", "book flights", or "fill this form" - requiring the ability to interact with arbitrary websites. The extension only accesses pages when the user explicitly initiates an automation task via the side panel or keyboard shortcut.
```

---

## Remote Code Justification
```
This extension does not execute remote code. All JavaScript code is bundled within the extension package during build time. The extension may connect to:

1. Local PraisonAI bridge server (localhost) - for AI agent communication
2. AI provider APIs (OpenAI, Anthropic, Google) - for language model inference

These connections transmit data for AI processing but do not download or execute code. All automation scripts are pre-bundled in the extension.
```

---

## Data Usage Certification

### Does this extension collect user data?
```
Yes - The extension collects:
- Page URLs and titles (to provide context to AI)
- DOM element information (to enable automation)
- Screenshots (for AI vision analysis, if enabled)
- User-entered goals and preferences

This data is:
- Processed locally on the user's device, OR
- Sent to the user-configured AI provider (OpenAI/Anthropic/Google) for processing
- NOT sold or transferred to third parties
- NOT used for advertising
```

### Privacy Policy URL
```
https://praison.ai/praisonai-browser-agent-privacy-policy/
```

---

## Privacy Practices

| Field | Value |
|-------|-------|
| Single purpose | Browser automation with side panel, screenshots, and session recording |
| activeTab | See justification above |
| tabs | See justification above |
| scripting | See justification above |
| debugger | See justification above |
| storage | See justification above |
| sidePanel | See justification above |
| contextMenus | See justification above |
| notifications | See justification above |
| offscreen | See justification above |
| tabCapture | See justification above |
| alarms | See justification above |
| host_permissions | See justification above |
| Remote code | No remote code execution |
| Data certification | Certify compliance |

---

# TESTER VERIFICATION GUIDE

This section provides step-by-step instructions for Chrome Web Store reviewers to verify each feature and permission.

## Quick Verification Checklist

| Feature | How to Verify | Expected Result |
|---------|---------------|-----------------|
| Side Panel | Click toolbar icon | Side panel opens on right side |
| Screenshot | Press Ctrl+Shift+S | Notification appears "Screenshot Captured" |
| Context Menu | Right-click any page | "PraisonAI" menu with options appears |
| Keyboard Shortcuts | Press Ctrl+Shift+P | Side panel toggles open/closed |
| Storage | Open side panel, change settings | Settings persist after browser restart |

## Detailed Verification Steps

### 1. SIDE PANEL (sidePanel permission)
**Steps:**
1. Install the extension
2. Click the PraisonAI icon in the Chrome toolbar
3. The side panel should open on the right side of the browser

**Expected:** Side panel displays with PraisonAI interface showing input field and controls.

### 2. SCREENSHOT CAPTURE (activeTab, tabCapture, notifications permissions)
**Steps:**
1. Navigate to any website (e.g., https://www.google.com)
2. Press Ctrl+Shift+S (or Cmd+Shift+S on Mac)
3. OR right-click on the page and select "PraisonAI" → "Capture Screenshot"

**Expected:** A notification appears confirming "Screenshot Captured" with message "Screenshot saved successfully".

### 3. CONTEXT MENU (contextMenus permission)
**Steps:**
1. Navigate to any website
2. Right-click anywhere on the page
3. Look for "PraisonAI" in the context menu

**Expected:** Context menu shows "PraisonAI" with sub-options including "Capture Screenshot".

### 4. KEYBOARD SHORTCUTS (commands)
**Steps:**
1. Press Ctrl+Shift+P (or Cmd+Shift+P on Mac) to toggle side panel
2. Press Alt+A (or Option+A on Mac) to start agent
3. Press Ctrl+Shift+S (or Cmd+Shift+S on Mac) to capture screenshot

**Expected:** Each shortcut performs its designated action.

### 5. STORAGE (storage permission)
**Steps:**
1. Open the side panel
2. If there are any settings/preferences, modify them
3. Close and reopen the browser
4. Open the side panel again

**Expected:** Settings are preserved between browser sessions.

### 6. OFFSCREEN DOCUMENT (offscreen permission)
**Purpose:** Used for session recording with MediaRecorder API (not available in service workers).

**Steps to verify offscreen is used:**
1. Open Chrome DevTools (F12)
2. Go to Application tab → Service Workers
3. The extension registers an offscreen document for recording functionality
4. The offscreen.html file is included in the extension package

**Technical verification:** The offscreen document contains MediaRecorder code for video capture, which requires DOM APIs unavailable in Manifest V3 service workers.

### 7. DEBUGGER (debugger permission)
**Purpose:** Used for Chrome DevTools Protocol (CDP) to reliably detect and interact with page elements.

**Steps:**
1. Open side panel
2. Navigate to a website with interactive elements
3. The extension uses CDP to identify clickable elements, form fields, etc.

**Expected:** Extension can detect and list interactive elements on the page.

### 8. TABS (tabs permission)
**Purpose:** Manage browser tabs during multi-step automation.

**Steps:**
1. Open side panel
2. The extension can read tab URLs and titles to provide context
3. During automation, it may open/switch tabs as needed

**Expected:** Extension displays current tab information in side panel.

### 9. SCRIPTING (scripting permission)
**Purpose:** Inject content scripts to interact with page elements.

**Steps:**
1. Navigate to any website
2. The content script (content.js) is automatically injected
3. This enables the extension to read page content and execute actions

**Expected:** Extension can read and interact with page elements.

### 10. HOST PERMISSIONS (<all_urls>)
**Purpose:** Browser automation tool must work on any website the user chooses.

**Justification:** Users may want to automate tasks on any website (shopping, booking, forms, etc.). The extension only accesses pages when user explicitly initiates an action via side panel, keyboard shortcut, or context menu.

## Files in Extension Package

| File | Purpose |
|------|---------|
| manifest.json | Extension configuration and permissions |
| background.js | Service worker handling events and CDP |
| content.js | Content script for page interaction |
| sidepanel.html/js | Side panel user interface |
| offscreen.html/js | MediaRecorder for session recording |
| icons/ | Extension icons (16, 32, 48, 128px) |

## No Remote Code Execution

All JavaScript code is bundled within the extension package at build time. The extension does not download or execute any remote code. Network connections are only used for:
- Optional local development server (localhost only)
- User-configured AI API endpoints (if user chooses to configure)

## Privacy

- All processing happens locally in the browser
- No data is sent to external servers unless user explicitly configures an AI provider
- No browsing history is stored or transmitted
- Screenshots and recordings are saved locally only
