# Manifest V3 Reference

> Complete reference for Chrome Extension Manifest V3 used by PraisonAI Browser Agent.

## Required Keys

| Key | Description |
|-----|-------------|
| `manifest_version` | Must be `3` |
| `name` | Extension name (max 75 chars) |
| `version` | Version string (e.g., "1.0.0") |

## Required for Chrome Web Store

| Key | Description |
|-----|-------------|
| `description` | Extension description (max 132 chars) |
| `icons` | 16, 48, 128 px icons |

---

## Optional Keys (Used by PraisonAI)

### `action`

Toolbar icon appearance and behavior.

```json
{
  "action": {
    "default_title": "PraisonAI Browser Agent",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  }
}
```

### `background`

Service worker for event handling.

```json
{
  "background": {
    "service_worker": "background.js",
    "type": "module"
  }
}
```

### `side_panel`

Default side panel configuration.

```json
{
  "side_panel": {
    "default_path": "sidepanel.html"
  }
}
```

### `content_scripts`

Scripts injected into web pages.

```json
{
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }]
}
```

### `permissions`

Required permissions.

```json
{
  "permissions": [
    "sidePanel",      // Side panel UI
    "activeTab",      // Current tab access
    "tabs",           // Tab information
    "scripting",      // Inject scripts
    "debugger",       // CDP access
    "storage",        // Local storage
    "contextMenus",   // Right-click menu
    "notifications",  // User notifications
    "offscreen"       // Offscreen documents
  ]
}
```

### `optional_permissions`

User-granted permissions.

```json
{
  "optional_permissions": ["history", "bookmarks"]
}
```

### `host_permissions`

Web page access.

```json
{
  "host_permissions": ["<all_urls>"]
}
```

### `commands`

Keyboard shortcuts.

```json
{
  "commands": {
    "_execute_action": {
      "suggested_key": {
        "default": "Ctrl+Shift+P",
        "mac": "Command+Shift+P"
      },
      "description": "Open PraisonAI panel"
    }
  }
}
```

### `externally_connectable`

External messaging.

```json
{
  "externally_connectable": {
    "matches": [
      "http://localhost:*/*",
      "https://praison.ai/*"
    ]
  }
}
```

### `web_accessible_resources`

Resources accessible from web pages.

```json
{
  "web_accessible_resources": [{
    "resources": ["icons/*"],
    "matches": ["<all_urls>"]
  }]
}
```

### `content_security_policy`

Security restrictions.

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

---

## Other Optional Keys

| Key | Description |
|-----|-------------|
| `author` | Extension author |
| `homepage_url` | Extension homepage |
| `minimum_chrome_version` | Minimum Chrome version |
| `short_name` | Short name (max 12 chars) |
| `version_name` | Display version (e.g., "1.0 beta") |
| `default_locale` | Default language |
| `devtools_page` | DevTools panel |
| `options_page` / `options_ui` | Options page |
| `omnibox` | Address bar integration |
| `oauth2` | OAuth 2.0 config |

---

## Chrome Web Store Requirements

1. **No remote code execution**
2. **Minimal permissions**
3. **Clear description**
4. **Privacy policy** (if collecting data)
5. **Accurate metadata**
6. **Tested and bug-free**

---

## References

- [Manifest Format](https://developer.chrome.com/docs/extensions/reference/manifest)
- [Permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
