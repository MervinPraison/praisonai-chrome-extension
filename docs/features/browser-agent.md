# Browser Agent

The Browser Agent is an AI-powered automation system that observes screenshots, makes decisions, and takes actions in your browser.

## Overview

The Browser Agent uses vision-capable LLMs (like GPT-4o, Gemini, or Claude) to understand what's on your screen and interact with web pages intelligently.

## How It Works

```
┌─────────────────┐
│  User Goal      │  "Find flights to Paris"
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Take Screenshot│  Capture current page state
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  AI Analysis    │  Vision LLM understands the page
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Decide Action  │  Click, type, navigate, scroll
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Execute via CDP│  Chrome DevTools Protocol
└────────┬────────┘
         │
         ▼
   Loop until goal complete
```

## Usage

### Via CLI (Recommended)

```bash
# Install praisonai
pip install praisonai

# Set your API key
export OPENAI_API_KEY="your-key"

# Launch browser automation
praisonai browser launch "Go to google.com and search for AI"
praisonai browser launch "Find flights to Paris" --model gpt-4o
```

### Via Side Panel

1. Start the bridge server: `praisonai browser start`
2. Click the extension icon to open Side Panel
3. Enter a task goal
4. Click "Start Agent"

## Supported LLMs

| Provider | Model | Vision Support |
|----------|-------|----------------|
| OpenAI | gpt-4o | ✅ |
| OpenAI | gpt-4o-mini | ✅ |
| Google | gemini-1.5-pro | ✅ |
| Google | gemini-1.5-flash | ✅ |
| Anthropic | claude-3-opus | ✅ |
| Anthropic | claude-3-sonnet | ✅ |

> **Note:** Gemini Nano (Chrome's built-in AI) is text-only and cannot process screenshots, so it's disabled for Agent mode.

## Best Practices

1. **Be Specific**: Clear goals lead to better results
2. **Use Vision Models**: Only vision-capable LLMs work with the agent
3. **Start Simple**: Begin with straightforward tasks before complex workflows
