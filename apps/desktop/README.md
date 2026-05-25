# Lastbrowser Desktop

The desktop app owns the user-facing browser experience:

- tab strip and address bar
- persistent Sidekick sidebar with WebUI and native Assist modes
- safe preload bridge for local service status/start/stop
- Windows packaging through `electron-builder`

The browser pane uses Electron webviews with Node integration disabled. The Sidekick sidebar embeds the existing local WebUI as the primary integrated surface and adds a native Assist mode for page-aware browser actions.
