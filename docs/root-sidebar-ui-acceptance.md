# Sidebar UI acceptance evidence

Fresh isolated Electron checks run on 2026-10-05. Both use controlled renderer fixtures and their own temporary `userData`; they do not validate a packaged build or alter the user’s normal app profile.

## Drawer navigation and edge-scroll

Command: `node apps/desktop/tests/sidebar-drawer-navigation-smoke.cjs`

Result: **PASS**. Expanded sidebar measured 234px (scroll client 174px, content 301px). Back/Next section controls worked in DE, EN, IT, ES, FR, PT-BR, RU, JA. The test exercised horizontal button paging, edge-hover auto-scroll, horizontal wheel, keyboard focus/activation, `touch-action: pan-x`, and tool visibility after movement. After unmount, pending animation frames were 0 and renderer errors were 0.

## Pinned-app addition callback

Command: `node apps/desktop/tests/sidebar-tab-pinned-ui-smoke.cjs`

Result: **PASS**. Pinned-App Plus fired exactly one callback; the fixture tab was removed; renderer errors were 0.

Limits: neither test asserts the full production App’s real profile/sidebar lifecycle or a packaged executable. The pinned-app smoke does not measure Plus hover/active geometry. The source-App probe and package state remain separate evidence.
