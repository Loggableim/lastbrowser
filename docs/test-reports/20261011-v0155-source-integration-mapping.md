# v0.1.55 preparation: reviewed source integration

Date: 2026-10-11 (Europe/Vienna). Integration owner: Codex.
Branch: `codex/v0155-integration-20261011`.
Target base: `release/v0.1.52` at `7d3d52bb58114296b66b7eeef290b67581b226bc`.
Integrated source snapshot: `520fae6c770ea9a6e5ab12383d48fa9fb983009f`.
Overall review PR: [#55](https://github.com/Loggableim/lastbrowser/pull/55),
targeting the exact base SHA above.

This is an isolated source integration for review. The primary checkout and
author worktrees were left untouched. No version, CHANGELOG, package,
signature, publication, deployment, or release metadata change is included.
The combined source gates have passed. This report is not an authorization to
merge into `release/v0.1.52` or to create a release artifact.

**Open release blocker:** PR51's source fix is not a verified live-send fix.
The A-033 tester withdrew the earlier Codex live PASS after session metadata
still identified Xiaomi/MiMo. A separate standard-chat production fix is being
prepared and is not included here; QuickChat live validation is deferred.

## Integrated source map

| PR | Scope | Reviewed source head/range | Integration commits | State |
| --- | --- | --- | --- | --- |
| 45 | A-030 Quickchat toolbar opens without switching assistant | `28c2153253e5d64777027769d98b62a249bea154` | `31a12c2e` | Applied |
| 48 | A-008b reserve Ctrl+1..8 for tab switching | `b8f9445311558b4a94ab29ab847435edd42331a6` → `2ea5abdd876ac759ff35d4b73be86eaa81757173` → `c863a20717dd0c51d4b34a2afcebcaf5f1f78165` | `4c390a31`, `80db92e5`, `e2cf9c7f` | Applied; three additive commits |
| 49 | A-008c synchronize keyboard zoom and toolbar state | `87ba3020e3b226488c58412c39246288510db617` | `7cac12c9` | Applied |
| 51 | P0 Active Models / QuickChat scope and failed-start behavior | `2e80dd1a539f9f766d8c53444470c8dc192d42af` → `8bf990ece43c309d9d3cf667996925a1acce70b3` → `ef0d6c5980cb3da3684a70490bca8b81c0a2e7df` | `829b742f`, `731da3da`, `9b9e0523` | Applied as source fix; live-send blocker remains open |
| 52 | A-008d active-tab mute | `60f84674efdf3c0dd7b70d6f811bcd2bbc37d9b6` | `4a70f3e5` | Applied |
| 53 | A-032 background updates, downgrade-safe channel setter | `ee0583e9935c65555d7af86d341da5a696a1976a` → `a1472b66c0a2e1955032895c3ed607c93d9faf81` | `7a6bbe10`, `a926d50b` | Applied; downgrade correction included |
| 50 | Auth startup preflight, included in PR54's reviewed stack | `597f6c9647718129cd7179dd520dc7f096a3dce8` is an ancestor of PR54 | No separate cherry-pick; included once by merge `520fae6c` | Standalone PR50 is superseded for this integration; its earlier open findings are resolved by PR54's stack |
| 54 | Startup readiness UI and auth generation consumer | `176221f49e1e88b773426d8a43953aa8eb72d034`, stacked on PR50 | Merge commit `520fae6c770ea9a6e5ab12383d48fa9fb983009f` | Applied once with PR50 ancestry; no duplicate cherry-pick |

The original six PR heads (45, 48, 49, 51, 52, 53) were independently
reviewed and cleared by the CTO handoff. Their GitHub technical review
comments are reported as `COMMENTED`, not formal `APPROVED` states. Individual
PR gate results remain scoped to their source heads: PR48 220 files / 1,995
tests; PR49 220 / 1,998; PR51 220 / 1,995 with 0 skips; PR52 221 / 1,998;
PR53 220 / 2,008 plus 26 corrected updater re-review tests. These do not
replace the combined results below.

## PR50 / PR54 review and ancestry

PR54 head `176221f49e1e88b773426d8a43953aa8eb72d034` contains PR50 head
`597f6c9647718129cd7179dd520dc7f096a3dce8` in its ancestry. PR50's standalone
head was not cherry-picked. The stack was merged once so the auth preflight,
generation reducer, startup readiness, and post-login policy form one combined
source result.

The startup reviewer reported no findings and 17/17 focused tests. The Auth
re-review on exact head `176221f4` reported no open findings in the stacked
scope and confirmed the missing/invalid `auth_enabled` contract is fail-closed
for status, password login, retry, and the browser-shell gate. It also
confirmed lock/scope generation invalidates stale responses and disabled auth
continues to permit browsing if Sidekick is unavailable. The reviewer did not
rerun broad gates; they are recorded separately below. This was a technical
review comment, not a formal GitHub `APPROVED` review.

The prior Auth re-review on `3dcd45b3` had identified password login accepting
`logged_in: true` without explicit `auth_enabled`. The follow-up at `176221f4`
requires an explicit Boolean policy after login and adds a regression; the
reviewer confirmed no open Auth findings on that final head. PR50's standalone
head is therefore superseded for this integration. No PR close or merge action
was taken on the source PRs.

## Conflict map and resolution

Read-only `git merge-tree --write-tree` checks found the current PR54 stack
textually clean against the current integration. The subsequent merge
auto-merged `main.ts`, `preload.ts`, `App.tsx`, and `global.d.ts` without
content conflicts. PR50 was included through PR54 ancestry once.

Earlier renderer conflicts were resolved at the shared component boundaries:

| Integration point | Preserved behavior |
| --- | --- |
| PR45 + PR51: `App.tsx`, `CopilotSplitView.tsx` | Kept PR45's QuickChat assistant switch action and PR51's boolean start result, so failed starts retain the draft. |
| PR49 + PR52: `App.tsx` | Kept keyboard zoom synchronization and active-tab mute state at both `BrowserMain` call sites and the shared interface. |
| PR50 + earlier PR54: `main.ts` | Earlier stack had a textual conflict. Current stack keeps disabled-auth early release, requires the remaining startup readiness signals, and uses generation checks to discard stale auth responses. |
| PR53 + PR54: preload/global APIs | Current merge kept updater settings and startup/auth APIs separate. |

Pair simulations are textual evidence only; they do not establish semantic
correctness or reviewer clearance. The current PR54 stack and actual merge are
recorded above.

## Combined regression and AGENTS gates

These commands ran on integrated source snapshot
`520fae6c770ea9a6e5ab12383d48fa9fb983009f` in this isolated worktree on
2026-10-11.

| Gate | Result |
| --- | --- |
| Focused scope/auth/startup/mute/updater regressions | PASS; 14 test files, 145 tests. Covered active-model scope, QuickChat, lock/preflight, stale auth responses, missing `auth_enabled`, startup readiness, active-tab mute, and updater behavior. |
| `npm test` | PASS; 227 test files and 2,071 tests passed. |
| `npm run verify:store` | PASS; 39 PASS / 2 WARN / 0 FAIL. Warnings: source-build screenshots remain provisional with documented localization gaps; no final package was supplied for binary signature checks. This is preflight, not Store certification. |
| `npm --workspace apps/desktop run build` | PASS; main-process TypeScript, renderer typecheck, and Vite build passed. The existing large-chunk advisory remains; the renderer bundle is about 2.46 MB. |
| `python -m compileall -q services/sidekick` | PASS; no backend source changed. |
| `git diff --check` | PASS for integrated source and report. |

After `npm ci`, this isolated worktree lacked the Electron Windows executable.
The ignored `node_modules/electron/dist` runtime was copied from the existing
v0.1.54 integration worktree solely to run source tests. `electron.exe` SHA-256
was `096FEEBB1D27894727B1D07A66B87312CA84613BE1A321D7A26BB59318671EC1`, and
76 runtime files were present. No tracked dependency or author worktree was
modified by that setup.

## Remaining evidence boundaries

The Store warnings remain candidate/release evidence. No signed package,
installation, VM upgrade, or What's New display was tested in this
integration. The earlier P-003 VM report's cause for the retained v0.1.52
ProductVersion and missing What's New remains unknown. No VM or release
acceptance is claimed.

## Open release blocker: live standard-chat send

The A-033 VM report says PR51 alone still fails the live send path. The earlier
`CODEX OK` observation was withdrawn after the QuickChat session metadata still
showed `provider=xiaomi/model=mimo-v2.6-flash`; actual Codex routing is **not
verified**. MiMo's real first and follow-up responses were observed in that
tester run, while Ollama returned HTTP 403 for an external past-due
subscription. That account response is an external blocker, not product
acceptance. Cid's latest scope is standard chat only; QuickChat testing is
deferred.

The A-033 thread reports an `Invalid backend profile for chat binding` in
standard chat when the renderer sends an empty `backendProfileName`. Omitting
that empty optional hint changed a focused regression from 1/5 failing to 5/5
passing, and the latest MiMo standard-chat request started, but its response
was still pending. The thread also identifies a Codex catalog path that omits
profile-bound context metadata and a Stop path that can leave a `Working on
it…` placeholder. These are tester-reported findings; they are not changes in
this integration.

The earlier interim Codex PASS is withdrawn. The corrected A-033 report is
identified by commit `94d5df683404`; the tester and existing model-fix worker
are coordinating a separate minimal production PR. It has no reviewed PR head
yet. Keep this blocker open and do not add that fix to PR55 until its exact
head has independent review. After the reviewed change is incorporated, rerun
the combined scope/auth/startup/live-send focused regressions and all AGENTS
gates above. The current 2,071-test source suite does not prove live provider
routing or response delivery.

PR46 is plan-only Sidekick personas and excluded. PR47 is closed/replaced by
PR48 and stale/divergent. PR44 contains v0.1.54 candidate metadata and is
excluded. No version or CHANGELOG change is included for v0.1.55.

This branch is prepared for one reviewable overall PR against
`release/v0.1.52`. No version bump, package creation, signing, upload, Store
submission, publication, deployment, or merge into the release branch was
performed.
