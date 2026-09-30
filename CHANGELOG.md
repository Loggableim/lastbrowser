# Lastbrowser Changelog

All notable changes to Lastbrowser are documented in this file.
The project adheres to [Semantic Versioning](https://semver.org/).

---

## [0.1.39] - 2026-09-30

### Fixes
- Preserve provider-qualified model selection from the chat composer through Space preferences and Sidekick requests, and stream assistant text into the chat as tokens arrive.
- Isolate persistent-goal continuations by session, profile, and Space, recover valid continuations after backend restarts, and discard continuations cancelled before delivery.
- Route balanced Teamwork plans through the configured Ollama Cloud `deepseek-v4.1-flash` model when available and classify Flash models as fast.
- Extend the isolated desktop smoke flow to verify a real Ollama Cloud chat response and visible partial output without storing credentials in its temporary profile.

### Verification
- Desktop tests: 127 files, 1,111 passed; Store preflight: 27/27; desktop build and Python compile check passed.
- Sidekick tests: 2,341 passed, 105 skipped.
- Live Ollama Cloud desktop smoke: 7/7 checks passed, including visible assistant output while the request was still active.

## [0.1.38] - 2026-09-29

### Fixes
- Use a locally cached Castlabs EVS session for VMP signing when explicit CI credentials are absent, then verify the signed package.
- Keep release-mode EVS signing fail-closed when its required credentials are unavailable.


## [0.1.37] - 2026-09-28 (local installer build)

### Fixes
- Fixed Antigravity OAuth callback state construction and added local callback regression coverage.
- Prevented mismatched OAuth callback state from aborting a valid Antigravity login.
- Preserved provider identity through model selection, per-Space persistence, and chat request routing.
- Kept Antigravity visible in provider settings when runtime catalogs omit it, moved Google account round-robin management into Providers, and removed the separate Google accounts settings tab.
- Corrected Doctor's provider credential checks so Lastbrowser vault credentials are accepted and optional `.env` files do not create duplicate blocking errors.
- Prevented renderer bundles from accumulating across builds, cutting generated renderer assets from hundreds of stale files to the current six files.

This is a local install build, not a published release.

## [0.1.36] - 2026-09-28 (local installer build)

### Fixes
- Corrected provider verification so Antigravity is not shown as chat-tested based only on OAuth and onboarding; the UI now reports that inference reached quota and a successful chat is still unverified.

This is a local install build, not a published release.

---

## [0.1.35] - 2026-09-27

### Highlights
- **Window Controls & Detached Tab IPC:** Dynamically routes window actions per sender `webContents`. Closing an undocked or detached multiview tab cleanly destroys that secondary window without closing the main browser or triggering tray minimization.
- **Zen Sidebar 3-State Engine:** Enhanced Zen browsing mode with three distinct states (hidden, 48px slim icon dock, expanded). Left-edge hover sensor smoothly reveals the sidebar overlay; collapsing from the overlay retains Zen mode in the slim dock.
- **Tab Pinning, RAM Protection & Space Audio Continuity:** Pinned tabs are permanently exempt from background memory discarders. Tabs playing audio (YouTube Music, Spotify, web radio) remain active across Space switches through an unthrottled background webview (`backgroundThrottling=no`), eliminating audio cutoffs.
- **Appearance Engine & Accessibility:** 4-tier Glassmorphism system (solid, subtle, modern, deep), fully overhauled light theme contrast, new maximal-contrast *Vision Impaired* theme (high-contrast black/white/yellow/cyan, 16px minimum sans-serif font, 2px borders, 3px focus rings), custom skin colors, and global UI zoom/font scaling.
- **NovaDock Shell Decoupling:** Decoupled `<NovaDock />` from the left sidebar into a modular shell component with support for Top, Bottom, Right, and Floating Draggable overlay modes with orientation toggle and anti-clipping margins.
- **Chat & Copilot Layouts:** Refactored chat rendering into Bubbles, Compact Stream, and Expanded Document Canvas modes with strict horizontal overflow protection for syntax-highlighted code blocks, grounding badges, and process cards.
- **Sidekick Standalone Migration:** First-Run Setup Wizard automatically detects and imports standalone Sidekick configurations and Supermemory databases (`%USERPROFILE%\.sidekick`, `supermemory.db`) with filesystem hardening against symlink and directory-traversal vulnerabilities.
- **Google Gemini CLI Decommission:** Formally decommissioned the legacy `google-gemini-cli` subscription OAuth provider following Google's sunset of consumer Code Assist endpoints; hardened auxiliary client fallback routing and updated system architecture documentation.

### Verification
- Desktop: 98 test suites, 846/846 unit and integration tests passed (100% green).
- Microsoft Store certification preflight: 27/27 automated checks passed (`[PASS]`).
- Clean TypeScript and Vite production builds with 0 errors.
- Bundled and verified Castlabs Widevine VMP DRM signing and Authenticode code-signing.

## [0.1.34] - 2026-09-26

### Fixed
- Integrated Snap Layouts and Multiview layouts into the browser surface, with layout selection, drop previews, resizable panes, empty slots, and persistent assignments.
- Fixed detached-window tab transfers so the destination acknowledges its attached WebView before the source removes the tab; failed destinations are destroyed instead of hidden as tray windows.
- Kept detached windows from reloading the source profile's tabs after a transfer.
- Routed local Ollama requests to the configured OpenAI-compatible endpoint and kept local Ollama credentials separate from Ollama Cloud credentials.
- Persisted Space setup model choices per Space and applied them on Space changes.
- Connected Appearance glass and density controls to visible titlebar and sidebar styles.
- Improved Teamwork worker scaling and implemented its configured planner as a real planning pass.
- Rejected duplicate Space names and avoided selecting unavailable preset models.

### Security and behavior
- Gemini CLI OAuth uses the system browser; embedded OAuth no longer relies on browser identity spoofing. A successful Google login was not verified in this release run.
- Teamwork drops the ineffective autonomous-tools setting; no autonomous tool execution was added.

### Verification
- Desktop: 75 test suites, 656 tests passed; Store preflight 27/27; main and renderer build passed.
- Backend focused Ollama and Teamwork/Smart Track tests passed. Full backend suite: 2,084 passed, 14 failed, 101 skipped; the failures include environment/order-sensitive cases and remain unresolved.

## [0.1.33] - 2026-09-25

### Highlights
- **Google OAuth & Safe Login (Chromium Emulation & Security Header Sanitization):**
  - Resolved Google authentication block: *"Dieser Browser oder diese App ist unter Umständen nicht sicher. Verwenden Sie einen anderen Browser."*
  - Replaces Electron User-Agent with native Chrome 134 header (`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36`).
  - Dynamically sets `Sec-CH-UA`, `Sec-CH-UA-Mobile`, and `Sec-CH-UA-Platform` Client Hints matching genuine Chrome on Windows.
  - Strips `X-Requested-With` header on Google authentication endpoints.
  - Injects DOM-ready hardening script disabling `navigator.webdriver` and emulating native `window.chrome` properties (`csi`, `loadTimes`, `app`).
  - Added `"prompt": "select_account consent"` to Google OAuth URL builder in Sidekick backend for clean multi-account switching.
  - Wired Gemini account connecting directly to Electron secure OAuth auth window with auto-closing and token sync.

- **Multi-Agent Teamwork Orchestrator & Smart Track Mode:**
  - **Teamwork System:** Collaborative multi-model orchestrator with Lead Agent, Web Researcher, Deep Analyst, and Solution Critic roles. Supports configurable subagent concurrency, budget safety caps, and auto-fallback.
  - **Smart Track Mode:** Dynamic single-lane execution pipeline with adaptive effort tiers (Low / Medium / High). Automatically scans available providers (Gemini, Claude, Ollama, OpenAI) and routes tasks to the most cost- and performance-optimized model.
  - **Interactive Process Cards:** `TeamworkProcessCard.tsx` and `SmartTrackProcessCard.tsx` render live execution steps, token counters, time elapsed, and expandable step outputs directly inside the chat timeline.
  - **Dedicated Settings Panels:** Interactive configuration tabs in the Settings modal for both Teamwork and Smart Track with real-time model catalog detection.

- **Zen Mode Sidebar Hover Reveal:**
  - Added an 8px invisible hover detection zone (`.zen-left-hover-sensor`) along the entire left screen edge.
  - When the sidebar is in hidden/Zen mode (`sidebarMode === 'hidden'`), moving the mouse to the edge slides the sidebar into view as a floating overlay with smooth cubic-bezier transitions and backdrop blur without shifting or resizing web contents.
  - Automatically retracts after moving away with a debounced 350ms delay.

- **Collapsed Sidebar (NovaDock) Fisheye & Label Animation:**
  - Added dynamic scaling and opacity interpolation (`--item-scale`, `--item-opacity`).
  - Hovering an icon in collapsed dock mode expands the hovered icon to 1.18x and 100% opacity with a prominent title pill.
  - Neighboring items dynamically fade to 0.40–0.65 opacity with scaled reduction, providing a fluid macOS-style fisheye animation.

- **New Space Setup Assistant Wizard:**
  - Introduced `SpaceSetupModal.tsx`: A 3-step wizard for initializing new spaces.
  - Preset workflows: *Coding & Dev*, *Research & Writing*, *Media & Design*, and *Custom Blank*.
  - Space personalization: Custom name, local storage path, and 8 curated color swatches.
  - Model and pinned app presets: Pre-configure default AI models and pin relevant web apps (GitHub, ChatGPT, Notion, Linear, YouTube, Spotify).

- **Downloads Overlay & Dockable Floating Window:**
  - Redesigned downloads panel supporting Popover, Floating Window, and Docked modes (`dock-tabs`, `dock-topbar-left`, `dock-topbar-right`, `dock-sidekick`).
  - Draggable grip handle with persistent screen position.
  - Collapsible minimized pill badge showing active download speed and progress.

- **Live Instant Auto-Save for Appearance & Notifications:**
  - Replaced manual save button with debounced (150ms) auto-save in `SystemPanels.tsx`.
  - Immediate preview and persistence for themes (Dark, Light, OLED, System), skins, custom hex accents, font sizing (12–18px), page zoom, and notification toggles (`notifications_enabled`, `sound_enabled`, `show_token_usage`, `show_tps`, `show_thinking`).

---

## [0.1.32] - 2026-09-25

### Highlights
- **100% Space Session Partition Isolation:** Each workspace space runs in a strictly isolated Electron session partition (`persist:space_<name>_<profile>`).
- **Space Hub Dashboard:** Space overview on the new tab page with quick-switching, live tab counters, and workspace actions.
- **Castlabs Widevine DRM Integration:** Hardware DRM support with verified Widevine VMP signing for Netflix, Disney+, Spotify, and Amazon Prime.
- **Split-View Tab Switching:** Seamless switching between dual-tab split screen and standard tabs without viewport redraw glitches.
- **EV Code Signing:** Binaries signed with Certum Extended Validation Authenticode certificate.

---

## [0.1.31] - 2026-09-24

### Highlights
- **Unified Extension & Skill Hub:** Chrome MV3 Extensions and external MCP tools accessible via shortcut (`Ctrl+Shift+X`).
- **Modern Vector Brand Assets:** High-resolution 32px and 64px popart icons for sidebar navigation.
- **Grounding Anchors:** In-page contextual highlighting for agentic cross-referencing.

---

## [0.1.30] - 2026-09-22

### Highlights
- **Multi-Account Gemini CLI:** Round-robin load balancing and automated quota-limit recovery (HTTP 429) with status badges.
- **ConPTY Windows Terminal:** Embedded PowerShell and CMD terminal inside the browser shell.
- **Smart Tab Discarding:** Low-memory background hibernation for inactive tabs.
