# Lastbrowser Changelog

All notable changes to Lastbrowser are documented in this file.
The project adheres to [Semantic Versioning](https://semver.org/).

---

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
