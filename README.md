# PraisonAI Chrome Extension

AI-powered browser automation with Side Panel and PraisonAI Agent integration.

## Features

- 🤖 **Browser Agent** - AI agent that observes screenshots, decides, and acts
- 🌉 **Bridge Server** - Connects to PraisonAI for vision-capable LLMs (GPT-4o, Gemini, Claude)
- 🎯 **CDP Automation** - Chrome DevTools Protocol for precise browser control
- 📌 **Side Panel** - Persistent UI that stays open across tabs
- 📸 **Screenshots** - Capture page state for AI vision analysis
- 🎥 **Recording** - Record browser sessions as video
- 📋 **Data Extraction** - Extract structured data from pages

> **Note:** Gemini Nano (Chrome's built-in AI) is **disabled for Agent mode** because it's text-only and cannot process screenshots. Use the CLI with bridge server for reliable automation.

## Requirements

- Chrome 120+ 
- Python 3.10+ with `praisonai` installed
- API key for vision-capable LLM (OpenAI, Gemini, or Anthropic)


## Quick Install

### Option 1: Direct Download (Recommended)

[![Download Extension](https://img.shields.io/badge/Download-Extension-blue?style=for-the-badge&logo=googlechrome)](https://github.com/MervinPraison/praisonai-chrome-extension/releases/latest/download/praisonai-extension.zip)

1. **[Download praisonai-extension.zip](https://github.com/MervinPraison/praisonai-chrome-extension/releases/latest/download/praisonai-extension.zip)**
2. Unzip the downloaded file
3. Open `chrome://extensions` in Chrome
4. Enable **Developer mode** (top right toggle)
5. Click **Load unpacked**
6. Select the unzipped folder

### Option 2: From GitHub Actions (Latest Build)

1. Go to [GitHub Actions](https://github.com/MervinPraison/praisonai-chrome-extension/actions)
2. Click the latest successful **Build Extension** workflow
3. Download the `praisonai-extension` artifact
4. Follow steps 2-6 above

> **Note:** The extension will also be available on Chrome Web Store once approved.

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

### Agent Mode (Recommended: CLI)

The most reliable way to use the browser agent:

```bash
# Install praisonai if not already
pip install praisonai

# Set your API key
export OPENAI_API_KEY="your-key"
# or: export GEMINI_API_KEY="your-key"

# Launch browser automation
praisonai browser launch "Go to google.com and search for AI"
praisonai browser launch "Find flights to Paris" --model gpt-4o
```

This automatically:
1. Starts the bridge server
2. Launches Chrome with the extension
3. Runs your goal with vision-capable AI

### Side Panel (Requires Bridge Server)

If using the side panel directly:

1. First start the bridge server: `praisonai browser start`
2. Click the extension icon to open Side Panel
3. Enter a task goal
4. Click "Start Agent"

> **Important:** Without the bridge server, you'll see an error. Side panel fallback to Gemini Nano is disabled because it cannot process screenshots.

### Tools Mode


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
