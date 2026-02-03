# Side Panel

Persistent UI that stays open across tabs for AI-powered browser automation.

## Overview

The Side Panel provides a persistent interface for interacting with the Browser Agent, allowing you to control automation while navigating between tabs.

## Features

### Persistent Interface

Unlike popups that close when you click elsewhere, the Side Panel:
- Stays open as you navigate
- Persists across tab switches
- Maintains conversation history

### Agent Mode

Enter goals and watch the AI agent work:

1. Type your goal: "Find the cheapest flight to Paris"
2. Click "Start Agent"
3. Watch as the agent takes screenshots, analyzes, and acts

### Tools Mode

Manual control of browser automation tools:

- **Navigate** - Go to a specific URL
- **Click** - Click an element by CSS selector
- **Type** - Enter text into a field
- **Evaluate** - Run JavaScript code

## Opening the Side Panel

1. Click the PraisonAI extension icon in Chrome toolbar
2. The Side Panel will open on the right side of your browser

## Requirements

For Agent Mode to work, you need:

1. **Bridge Server Running**: `praisonai browser start`
2. **API Key Set**: `export OPENAI_API_KEY="your-key"`

> **Note:** Without the bridge server, Agent Mode is disabled. Tools Mode can still work for manual operations.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Submit goal/command |
| `Shift+Enter` | New line in input |
| `Escape` | Cancel current operation |
