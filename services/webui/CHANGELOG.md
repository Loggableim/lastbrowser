# Changelog — cids-hermes-webui

## 2026-05-16 — Consolidated Update (Working-Tree Changes)

[Earlier content preserved above this line]

---

## 2026-05-16 (2nd) — Spaces Management UI, Stream Stop, Cleanup

### Frontend — New Features

- **Spaces Management Panel (Complete Overhaul)**:
  - `renderSpacesPanel()` fully rewritten: styled sidebar list with color swatches, emoji icons, space name/meta/active badge
  - `renderSpaceDetail(space)` — main detail view with hero card (emoji, name, description, "Open chat" button), 4-column stats grid (chats, agents, model, provider), settings form (emoji, color, description, project directory), isolation contract card
  - `saveActiveSpaceDetails()` — saves emoji/color/description/project_dir via `POST /api/space/config`
  - `deleteActiveSpaceFromDetail()` — deletes space with confirm dialog
  - `_spaceEmoji()`, `_spaceBySlug()` — helper functions
  - `selectSpace()` now refreshes UI even when selecting the already-active space
  - Space panel refresh detection uses `_currentPanel === 'workspaces'` for reliability
  - Full CSS component: `.space-item` cards, `.space-hero-card`, `.space-stat-grid`, `.space-settings-card`, `.space-isolation-card`, responsive at 1100px/720px
  - `index.html` now includes `<link rel="stylesheet" href="static/spaces.css">`

- **Stream Stop Button**: Messages in progress now show a stop button (square icon) that calls `cancelStream()`. Stopped/cancelled messages show a "Stopped" badge. Both are defined before the footer HTML rendering in `ui.js`.

- **Window Controls Visibility Fix**: `initWindowControls()` now checks `navigator.windowControlsOverlay.visible` (not just existence). CSS hides window controls by default unless overlay or custom host bridge is detected.

- **Space-Scoped Projects API**: `sessions.js` now uses separate `projectParams` with workspace isolation for the `/api/projects` endpoint, replacing the old `allProfilesQS` variable.

### Frontend — Cleanup

- **Emoji/Unicode Cleanup**: All inline emoji removed from panel headers, buttons, and labels in `index.html`:
  - Gmail panel: header icon, loading states, compose buttons, filter chips, navigation icons
  - Discord panel: tab labels (Dashboard, Moderation, Settings, Logs) — no more emoji prefixes
  - Comments: Unicode box-drawing characters normalized to plain text
  - Gmail search button: `🔍` → `⌕` (more consistent cross-platform rendering)

- **Agent Panel Loading**: `switchPanel('agents')` now calls `loadAgents()` before `loadAgentsDashboard()` for proper initialization order.

### Tests

- **3 new tests in `test_gui_function_alignment.py`**:
  - `test_spaces_tab_renders_sidebar_cards_and_main_detail_panel()` — validates spaces.css link, all renderSpaceDetail functions, CSS classes for cards/detail shell
  - `test_chat_session_list_uses_url_params_without_stale_all_profiles_var()` — validates projectParams URL construction, asserts no leftover `allProfilesQS`
  - `test_chat_message_footer_defines_optional_controls_before_rendering()` — validates stopBtn/resultToggleHtml/stoppedBadgeHtml are defined before footHtml (correct rendering order)
