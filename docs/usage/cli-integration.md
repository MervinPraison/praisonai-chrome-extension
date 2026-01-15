# CLI Integration

Run automation directly from terminal when extension is connected to the bridge server.

## Start Bridge Server

```bash
praisonai browser start
```

## Run a Goal

```bash
praisonai browser run "Go to google and search praisonai"
praisonai browser run "Find flights to Paris" --model gpt-4o
praisonai browser run "task" --debug  # Show all WebSocket messages
```

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
