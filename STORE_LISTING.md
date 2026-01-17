# Chrome Web Store Listing Content

## Store Listing Fields

### Title
```
PraisonAI Browser Agent
```

### Summary 
```
AI-powered browser automation with on-device AI. Navigate, click, type, screenshot, and control your browser with natural language.
```

### Description
```
🤖 PraisonAI Browser Agent - Your AI-Powered Browser Automation Companion

Transform the way you interact with the web. PraisonAI Browser Agent uses advanced AI to understand your goals and automatically navigate, click, type, and interact with any website - all through simple natural language commands.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ KEY FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 Natural Language Control
Simply describe what you want to accomplish:
• "Go to Amazon and search for wireless headphones"
• "Find flights to Paris for next weekend"
• "Fill out this contact form with my information"
• "Take a screenshot of this page"

🧠 Intelligent Automation
• Multi-step task execution with smart decision making
• Automatic element detection and interaction
• Self-correcting when actions fail
• Learns from context to complete complex workflows

🔒 Privacy-First Design
• On-device AI processing available (Gemini Nano)
• Your data stays in your browser
• No cloud storage of browsing history
• Optional server connection for enhanced models

⚡ Hybrid AI Architecture
• Works offline with Chrome's built-in AI (Gemini Nano)
• Connect to powerful cloud models (GPT-4, Claude, Gemini)
• Automatic fallback for seamless experience
• Choose your preferred AI provider

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛠️ CAPABILITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 Navigation & Search
• Navigate to any URL
• Perform searches on any search engine
• Follow links and explore websites
• Handle multi-page workflows

✍️ Form Interaction
• Fill out forms automatically
• Type text in any input field
• Select dropdown options
• Handle checkboxes and radio buttons

🖱️ Click & Scroll
• Click buttons, links, and any element
• Smart click fallbacks for tricky elements
• Scroll pages up, down, or to specific elements
• Handle infinite scroll pages

📸 Screenshots & Recording
• Capture full-page screenshots
• Record browser sessions
• Save visual evidence of completed tasks

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎮 HOW TO USE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Click the PraisonAI icon in your toolbar
2. Open the side panel (Ctrl+Shift+P / Cmd+Shift+P)
3. Type your goal in natural language
4. Watch as AI automates your task!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⌨️ KEYBOARD SHORTCUTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Ctrl+Shift+P / Cmd+Shift+P: Toggle side panel
• Alt+A / Option+A: Start agent
• Ctrl+Shift+S / Cmd+Shift+S: Capture screenshot

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 CONNECT WITH US
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

• Documentation: https://docs.praison.ai
• GitHub: https://github.com/MervinPraison/PraisonAI
• Website: https://praison.ai

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 PERMISSIONS EXPLAINED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This extension requires the following permissions:
• Active Tab: To interact with the current page
• Tabs: To manage browser tabs during automation
• Scripting: To execute automation scripts on pages
• Debugger: For advanced element detection (CDP)
• Storage: To save your preferences
• Notifications: To alert you when tasks complete

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Made with ❤️ by PraisonAI
AI-Powered
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

---

### Small Promo Tile (440x280) - Create with:
Design elements:
- PraisonAI logo centered
- Tagline: "AI Browser Automation"
- Dark background (#2D2D2D)
- JPEG or 24-bit PNG (no alpha)

### Marquee Promo Tile (1400x560) - Create with:
Design elements:
- PraisonAI logo on left
- "AI-Powered Browser Automation" headline
- Feature icons (navigate, click, type, screenshot)
- Dark gradient background
- JPEG or 24-bit PNG (no alpha)

---

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
This extension automates browser tasks using AI. Users describe goals in natural language, and the AI agent navigates websites, clicks elements, fills forms, and completes multi-step workflows automatically.
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
Required for background processing of screenshots and page content when the extension needs to analyze page state without affecting the visible browser tab. This enables efficient screenshot processing and content analysis for AI decision-making without interrupting the user's browsing experience.
```

### tabCapture
```
Required to capture visual screenshots of web pages for AI vision analysis. The AI agent uses screenshots to understand page layout, identify visual elements, and make decisions about how to interact with websites. Screenshots are processed locally or sent to the configured AI provider for analysis.
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
| Single purpose | Automates browser tasks using AI agents that navigate, click, and interact with websites based on natural language goals |
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
| host_permissions | See justification above |
| Remote code | No remote code execution |
| Data certification | Certify compliance |
