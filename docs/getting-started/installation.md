# Installation

## Requirements

- Chrome 138+ (for Built-in AI APIs)
- macOS 13+, Windows 10/11, or Linux
- 22 GB free storage (for Gemini Nano model)

## Development Setup

```bash
# Clone and install
cd ~/praisonai-chrome-extension
npm install

# Build for development
npm run dev

# Build for production
npm run build
```

## Load Extension

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist` folder

## Enable Built-in AI

1. Open `chrome://flags`
2. Enable `#prompt-api-for-gemini-nano`
3. Enable `#optimization-guide-on-device-model`
4. Restart Chrome
