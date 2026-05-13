# LastBrowser — Native Desktop App

"The last browser you'll ever need."

A modern AI-powered workspace browser combining browser, workspace manager, multi-account hub, AI operating system, automation platform, productivity environment, and agent orchestration layer.

Electron shell + Python backend + System Tray + Sidebar.

## Architecture

```
native/
├── main.js                   # Electron Main Process
├── preload.js                # Secure IPC Bridge
├── tray.js                   # System Tray + Context Menu
├── server-launcher.js        # Python WebUI Server Lifecycle
├── sidebar.html / .js / .css # Sidekick-style Sidebar
├── package.json              # Node deps + build scripts
├── electron-builder.config.js# electron-builder Configuration
├── assets/
│   ├── icon.svg              # App icon (SVG vector)
│   ├── icon-monochrome.svg   # Monochrome variant
│   ├── icon-tray.svg         # Tray icon (16x16)
│   ├── icon-splash.svg       # Splash screen logo
│   ├── favicon.svg           # Favicon
│   ├── icon.png              # Legacy app icon
│   ├── icon.ico              # Windows ICO (multi-size)
│   └── loading.html          # Splash screen during startup
└── src/
    ├── main/                 # Main process modules
    │   ├── ipc/router.js     # IPC handler registry
    │   ├── database/
    │   │   ├── store.js      # File-based JSON store
    │   │   └── migrations.js # Schema migrations
    │   ├── managers/         # Feature managers
    │   └── services/
    │       └── logger.js     # Structured logging
    ├── renderer/
    │   ├── app.js            # Main UI logic
    │   └── styles/main.css   # Design system
    └── shared/
        └── constants.js      # IPC channels, defaults, enums
```

## Features

- **Workspaces**: Isolated browser environments with session management
- **Multi-Account Apps**: Sidekick/Wavebox-style app accounts with per-account sessions
- **Vertical Tabs**: Compact vertical tab bar with pin, suspend, mute
- **Split View**: Multi-pane layouts (50/50, 70/30, 3-col, 2x2)
- **Focus Mode**: Pomodoro timer + distraction blocking
- **Command Palette**: Ctrl+K quick search and commands
- **AI Agents**: Built-in agent orchestration with per-account control
- **Kanban Board**: Task management with drag-and-drop cards
- **Cron Jobs**: Scheduled automation tasks
- **Worker Queue**: Background task processing with retry
- **Resource Saver**: Auto-suspend inactive tabs to save memory
- **Compact Modes**: Zen-style ultra-compact layout
- **System Tray**: Minimize-to-tray with context menu
- **Auto-Update**: Via GitHub Releases (electron-updater)

## Development

```bash
# Dev mode: starts Electron + Python Server
cd native && npm run dev

# Or via root workspace:
npm run desktop:dev
```

## Build

```bash
# Build installer (NSIS Setup .exe)
cd native && npm run build

# Directory only (portable, no installer)
cd native && npm run build:dir

# Release build (for GitHub Releases)
cd native && npm run dist
```

## Data Migration

LastBrowser automatically migrates settings from the legacy `.hermesbrowser` data directory on first run. Your existing workspaces, sessions, app accounts, and settings are preserved.

Old data at `~/.hermesbrowser/` remains untouched — only copied to the new `~/.lastbrowser/` location.

## Brand Identity

- **Primary domain**: lastbrowser.app
- **Tagline**: "The last browser you'll ever need."
- **Visual direction**: Matte dark UI, subtle depth, compact layout, monochrome base with elegant violet/blue accents
- **Design inspiration**: Linear, Arc, Raycast, Notion, Zen Browser

## License

MIT © Pup Cid
