# FIX AGENT 3 — Chat Composer polish

## Implemented

- Grouped slash/mode, `@tabs`, and model controls; toolbar and control groups wrap with explicit `min-width: 0` constraints instead of colliding.
- Constrained the selected-model and reasoning selects, added ellipsis/title text for long model names, and kept the reasoning explanation available through its full tooltip.
- Replaced the multi-line “choose model manually” trigger with a compact icon + localized short label; the full localized instruction remains the accessible name and tooltip. Added short copy for all eight shipped locales.
- Moved the model-catalog failure notice into the composer and visually suppresses its detached duplicate from the existing NativeChatMain sibling. `NativeChatMain.tsx`, Goal/session flows, model selection callbacks, and dispatch behavior were not changed.
- Fixed the manual picker focus race: the search input now receives focus after the open state commits; Escape still closes the picker and restores focus to its trigger.
- Added scoped [chat-composer.css](../apps/desktop/src/renderer/panels/chat-composer.css) and [chat-composer-visual-smoke.cjs](../apps/desktop/tests/chat-composer-visual-smoke.cjs).

## Verification

- `node apps/desktop/tests/chat-composer-visual-smoke.cjs` — passed in Electron with a new temp `userData`: renderer viewports 1034×526, 768×526, and 320×526; DE/JA at each size, all eight locales at 1034 px. Long model names, selector/title bounds, toolbar overlap, inline notice, viewport bounds, picker/search focus, Escape/focus return, and renderer console errors are checked.
- Screenshots: [German 1034 px](../output/chat-composer-visual-smoke/composer-de-1034-64994276.png), [German 768 px](../output/chat-composer-visual-smoke/composer-de-768-64994276.png), [German 320 px](../output/chat-composer-visual-smoke/composer-de-320-64994276.png), [Japanese 1034 px](../output/chat-composer-visual-smoke/composer-ja-1034-64994276.png).
- `npm --workspace apps/desktop run typecheck:renderer` — passed.
- `node_modules/.bin/vitest run apps/desktop/tests/japanese-catalog.test.ts apps/desktop/tests/chat-reasoning-effort.test.ts --pool=threads --maxWorkers=1` — passed; Vitest reported 3 files / 14 tests, including the workspace-local onboarding test copy.
- `git diff --check` — passed (no whitespace errors; shared dirty files still have Git's LF→CRLF advisory only).

The visual run observed zero horizontal overflow and no toolbar-group/control intersections at the requested sizes; the composer remained fully within the viewport. No build, broad suite, commit, or push was performed.
