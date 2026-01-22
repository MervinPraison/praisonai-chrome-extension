# PraisonAI Chrome Extension - CLI Test Commands

This document provides CLI commands to test all features of the Chrome extension.

## Prerequisites

```bash
# Install PraisonAI with browser support
pip install praisonai[browser]

# Or from source
cd ~/praisonai-package
pip install -e ".[browser]"
```

## Feature Test Commands

### 1. Basic Browser Automation (Extension Mode)

```bash
# Simple search task
praisonai browser launch "search for AI on google" --engine extension --max-steps 5

# With debug logging
praisonai browser launch "search for praisonai" --engine extension --debug

# With profiling
praisonai browser launch "search for python" --engine extension --profile
```

### 2. Multi-Step Navigation

```bash
# Navigate and search within a site
praisonai browser launch "go to google, search for wikipedia, click wikipedia link" --engine extension --max-steps 10

# Complex task
praisonai browser launch "go to google, search for machine learning, click first result" --engine extension --timeout 60 --max-steps 15
```

### 3. CDP Mode (Fallback)

```bash
# Direct CDP mode (no extension)
praisonai browser launch "search for AI" --engine cdp --max-steps 5

# Auto mode (tries extension first, falls back to CDP)
praisonai browser launch "search for AI" --engine auto
```

### 4. Screenshot Capture

```bash
# Capture screenshot of current page
praisonai browser screenshot

# With specific tab
praisonai browser screenshot --tab-id 1
```

### 5. Page Navigation

```bash
# Navigate to URL
praisonai browser navigate "https://www.google.com"

# Navigate specific tab
praisonai browser navigate "https://github.com" --tab-id 1
```

### 6. JavaScript Execution

```bash
# Execute JS in page
praisonai browser js "document.title"

# Execute in specific tab
praisonai browser execute "document.body.innerText.slice(0, 100)" --tab-id 1
```

### 7. DOM Inspection

```bash
# Get DOM tree
praisonai browser dom

# Get page content as text
praisonai browser content
```

### 8. Console Logs

```bash
# Get console logs from page
praisonai browser console
```

### 9. Tab Management

```bash
# List all tabs
praisonai browser tabs

# List all pages
praisonai browser pages
```

### 10. Session Management

```bash
# List sessions
praisonai browser sessions

# Show session history
praisonai browser history

# Clear session history
praisonai browser clear
```

### 11. Extension Management

```bash
# Reload extension
praisonai browser reload

# Extension info
praisonai browser extension
```

### 12. Chrome Management

```bash
# Chrome info
praisonai browser chrome

# Health diagnostics
praisonai browser doctor
```

### 13. Benchmarks

```bash
# Run benchmarks
praisonai browser benchmark
```

## Debug Options

| Flag | Description |
|------|-------------|
| `--debug` / `-d` | Enable debug logging |
| `--verbose` / `-v` | Verbose output |
| `--profile` | Performance profiling |
| `--deep-profile` | cProfile trace |
| `--log-file PATH` | Save logs to file |

## Engine Options

| Engine | Description |
|--------|-------------|
| `extension` | Use Chrome extension (recommended) |
| `cdp` | Direct Chrome DevTools Protocol |
| `auto` | Try extension first, fallback to CDP |

## Common Options

| Option | Description |
|--------|-------------|
| `--timeout` / `-t` | Timeout in seconds (default: 120) |
| `--max-steps` | Maximum automation steps (default: 20) |
| `--model` / `-m` | LLM model (default: gpt-4o-mini) |
| `--headless` | Run Chrome headless |
| `--no-server` | Don't start bridge server |

## Verification Checklist

Run these commands to verify all features work:

```bash
# 1. Basic automation
praisonai browser launch "search for test" --engine extension --max-steps 3

# 2. Consecutive runs (should not timeout)
praisonai browser launch "search for AI" --engine extension --max-steps 3
praisonai browser launch "search for ML" --engine extension --max-steps 3

# 3. Screenshot
praisonai browser screenshot

# 4. Tab listing
praisonai browser tabs

# 5. Health check
praisonai browser doctor
```

## Troubleshooting

### Timeout Issues
- Increase `--timeout` value
- Check if bridge server is running
- Use `--debug` to see detailed logs

### Connection Issues
- Run `praisonai browser doctor` for diagnostics
- Check Chrome is running with `--remote-debugging-port=9222`
- Verify extension is loaded

### Extension Not Connecting
- Reload extension: `praisonai browser reload`
- Check logs with `--debug` flag
- Verify WebSocket connection to `ws://localhost:8765/ws`
