# Screenshots & Recording

Capture page state for AI vision analysis and record browser sessions as video.

## Screenshots

### Purpose

Screenshots enable vision-capable AI models to:
- Understand the current page layout
- Identify interactive elements
- Make informed decisions about next actions

### Taking Screenshots

**Via CLI:**
```bash
# Save screenshot to file
praisonai browser screenshot -o page.png

# Get screenshot as base64
praisonai browser screenshot --base64
```

**Via Extension:**
Screenshots are automatically captured during Agent mode for AI analysis.

### How It Works

```
┌─────────────────┐
│  Current Tab    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  chrome.tabs    │  Capture visible tab
│  .captureVisibleTab()
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Base64 PNG     │  Send to vision LLM
└─────────────────┘
```

## Video Recording

### Features

- Record browser sessions as video
- Capture automation workflows
- Perfect for documentation and debugging

### Architecture

Video recording uses an offscreen document for canvas operations:

```
┌─────────────────┐
│  Offscreen Doc  │  offscreen/index.ts
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  MediaRecorder  │  Capture frames
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Video File     │  WebM output
└─────────────────┘
```

### Permissions

| Permission | Purpose |
|------------|---------|
| `offscreen` | Create offscreen document for video recording |
| `activeTab` | Access current tab for screenshots |

## Data Extraction

Extract structured data from pages using screenshots:

1. Take screenshot of data table/content
2. Vision AI identifies structure
3. Returns structured JSON data

**Example:**
```bash
praisonai browser run "Extract all product prices from this page" --output json
```
