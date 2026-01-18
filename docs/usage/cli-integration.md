# CLI Integration

Run automation directly from terminal using the PraisonAI bridge server.

> **Recommended:** Use `praisonai browser launch` which handles everything automatically.

## Quick Start (Recommended)

```bash
# Set your API key
export OPENAI_API_KEY="your-key"

# Launch automation (starts server + Chrome automatically)
praisonai browser launch "Go to google and search praisonai"
praisonai browser launch "Find flights to Paris" --model gpt-4o
```

## Manual Setup

### Start Bridge Server

```bash
praisonai browser start
```

### Run a Goal


### Example Output

```
🚀 Starting browser agent
   Goal: Go to google and search praisonai
   Model: gpt-4o-mini

Session: 4a703667

Step 0: ▶ TYPE → textarea#APjFqb
        📍 https://www.google.com/

Step 1: ▶ CLICK

Step 2: ▶ CLICK
        📍 https://www.google.com/search?q=praisonai

✅ Task completed!
```

## Tab Management

```bash
praisonai browser tabs              # List all tabs
praisonai browser tabs --new https://google.com
praisonai browser tabs --close TAB_ID
praisonai browser tabs --focus TAB_ID
```

## Execute JavaScript

```bash
praisonai browser execute "document.title"
praisonai browser execute "document.querySelectorAll('a').length"
```

## Screenshots

```bash
praisonai browser screenshot -o page.png
praisonai browser screenshot --fullpage -o full.png
```

## Navigate

```bash
praisonai browser navigate "https://github.com"
praisonai browser navigate "https://docs.praison.ai" --tab TAB_ID
```

## Troubleshooting

### Agent returns "wait" action repeatedly

This usually means:
1. **Missing API key** - Set `OPENAI_API_KEY` or `GEMINI_API_KEY`
2. **Wrong model** - Use a vision-capable model (gpt-4o, gemini-2.0-flash)

Run diagnostics:
```bash
praisonai browser doctor api-keys
praisonai browser doctor flow
```

### Extension not connected

Make sure you:
1. Used `praisonai browser launch` (recommended)
2. Or started the bridge server first: `praisonai browser start`

> **Note:** Gemini Nano fallback is disabled. The extension requires the bridge server for Agent mode.
