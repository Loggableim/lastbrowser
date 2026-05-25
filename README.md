# Lastbrowser

Lastbrowser is a Windows-first Electron browser shell with Sidekick integrated as a first-class browser sidebar. It is seeded from the Hermes Portable codebase, but the public product surface is Lastbrowser and Sidekick.

## Structure

- `apps/desktop` - Electron, TypeScript, Vite and React browser shell.
- `services/sidekick` - Sidekick agent service, currently based on the Hermes agent runtime for compatibility.
- `services/webui` - Existing WebUI embedded as the primary Sidekick sidebar surface.
- `installer` - Bootstrapper source copied from Hermes Portable for the Lastbrowser installer path.
- `brand` - Sidekick/Lastbrowser brand assets.

## Development

```powershell
npm install
npm run test:run
npm run build
```

For local UI work, run the renderer and Electron separately:

```powershell
npm run dev
npm --workspace apps/desktop run start:dev
```

## v1 Notes

- Electron is the product browser shell; Lastbrowser is not a Chromium fork.
- Sidekick/WebUI are local sidecar services. The Electron shell starts them through the service manager and embeds the WebUI as part of the browser UI.
- `LASTBROWSER_*` and `SIDEKICK_*` are the public environment names. `HERMES_*` aliases remain for compatibility while the inherited runtime is still being refactored.
