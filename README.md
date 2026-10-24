# Lastbrowser

Lastbrowser is a Windows-first Electron browser shell with Sidekick integrated as a first-class browser sidebar. It is seeded from the Hermes Portable codebase, but the public product surface is Lastbrowser and Sidekick.

## Structure

- `apps/desktop` - Electron, TypeScript, Vite and React browser shell (`src/main/` and `src/renderer/`).
- `services/sidekick` - In-tree Sidekick Python backend engine, FastAPI server, CLI tools, runtime & skills.
- `assets/store` - Microsoft Store certification asset pack (512/1024 icons, 1920x1080 screenshots).
- `brand` - Vector brand assets, icons, and logos.
- `docs` - Technical architecture, Microsoft Store listing metadata, and release planning.
- `lastbrowser.com` - Official product landing page, GDPR/Store privacy policy, and support portal.

## Development & Verification

This repository uses pnpm with a shared content-addressable store. Dependencies are hardlinked from the store instead of copied, which keeps `node_modules` small. Install pnpm 10.34.7 (see the `packageManager` field) before installing.

```powershell
pnpm install --frozen-lockfile
pnpm test                 # 514+ Vitest unit & integration tests
pnpm run verify:store     # Automated Microsoft Store release readiness preflight (27 checks)
pnpm run build            # Build main TypeScript and renderer Vite bundles
```

For local UI work, run the renderer and Electron separately:

```powershell
pnpm run dev
pnpm --filter @lastbrowser/desktop run start:dev
```

## Architecture Notes

- Lastbrowser is a **fully integrated Monorepo**: `services/sidekick` is maintained in-tree as the native Python engine.
- See [`AGENTS.md`](./AGENTS.md) and [`GEMINI.md`](./GEMINI.md) for mandatory agent conventions and workflow boundaries.
- Offline-ready: Builds and packaging do not depend on external repository syncing.

