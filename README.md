# PraisonAI Chrome Extension

AI-powered browser automation with Side Panel and Built-in AI (Gemini Nano).

## Features

- 🤖 **Browser Agent** - Project Mariner-style AI agent that observes, decides, and acts
- 🧠 **Built-in AI** - On-device Gemini Nano for privacy-first AI features
- 🎯 **CDP Automation** - Chrome DevTools Protocol for precise browser control
- 📌 **Side Panel** - Persistent UI that stays open across tabs
- 📸 **Screenshots** - Capture page state for AI analysis
- 🎥 **Recording** - Record browser sessions as video
- 📋 **Data Extraction** - Extract structured data from pages
- 🌐 **Multi-language** - Translate and detect languages on-device

## Requirements

- Chrome 138+ (for Built-in AI APIs)
- macOS 13+, Windows 10/11, or Linux
- 22 GB free storage (for Gemini Nano model)

## Installation

### Development

```bash
# Clone and install
cd ~/praisonai-chrome-extension
npm install

# Build for development
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Load Extension

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist` folder

### Enable Built-in AI

1. Open `chrome://flags`
2. Enable `#prompt-api-for-gemini-nano`
3. Enable `#optimization-guide-on-device-model`
4. Restart Chrome

## Usage

### Agent Mode

1. Click the extension icon to open Side Panel
2. Enter a task goal (e.g., "Go to google.com and search for AI")
3. Click "Start Agent"
4. Watch the agent execute steps

### Tools Mode

Use individual tools:
- **Screenshot** - Capture current page
- **Summarize** - Summarize page content using AI
- **Extract Data** - Get structured data (headings, links, images)
- **Console Logs** - View captured console messages

### Quick Actions

- **Navigate** - Go to a URL
- **Click** - Click element by CSS selector
- **Type** - Type text into an element
- **Evaluate** - Run JavaScript in page context

### CLI Integration

Run automation directly from terminal when extension is connected:

```bash
# Start the bridge server
praisonai browser start

# Run a goal with live progress
praisonai browser run "Go to google and search praisonai" --debug

# Manage tabs
praisonai browser tabs

# Execute JavaScript
praisonai browser execute "document.title"

# Take screenshot
praisonai browser screenshot -o page.png
```

See [PraisonAI Browser Agent Docs](https://docs.praison.ai/docs/features/browser-agent) for full CLI reference.

## Architecture

```
src/
├── background/         # Service worker
│   └── index.ts       # Message routing, CDP sessions
├── cdp/               # Chrome DevTools Protocol
│   └── client.ts      # CDP client via chrome.debugger
├── ai/                # AI integration
│   ├── builtin.ts     # Gemini Nano APIs
│   └── agent.ts       # Browser agent
├── content/           # Content script
│   └── index.ts       # DOM interaction
├── sidepanel/         # Side Panel UI
│   ├── sidepanel.html
│   ├── styles.css
│   └── index.ts
└── offscreen/         # Offscreen document
    └── index.ts       # Video recording, canvas ops
```

## Permissions

| Permission | Purpose |
|------------|---------|
| `sidePanel` | Side Panel UI |
| `debugger` | CDP access for automation |
| `scripting` | Content script injection |
| `activeTab` | Current tab access |
| `tabs` | Tab information |
| `storage` | Save history |
| `contextMenus` | Right-click menu |
| `notifications` | User notifications |
| `offscreen` | Video recording |

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## Chrome Web Store

### Building for Submission

```bash
npm run build:zip
```

This creates `praisonai-extension.zip` ready for upload.

### Review Guidelines

This extension follows Chrome Web Store policies:
- ✅ No remote code execution
- ✅ Minimal permissions
- ✅ Clear privacy policy
- ✅ Transparent functionality
- ✅ On-device AI processing

## Privacy

- All AI processing uses on-device Gemini Nano
- No data sent to external servers
- History stored locally in browser storage
- CDP only attaches when user initiates action

## License

MIT
