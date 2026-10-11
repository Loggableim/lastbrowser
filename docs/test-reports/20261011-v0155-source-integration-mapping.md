# v0.1.55 preparation: reviewed source integration map

Date: 2026-10-11 (Europe/Vienna). Integration owner: Codex.
Branch: `codex/v0155-integration-20261011`.
Target base: `release/v0.1.52` at `7d3d52bb58114296b66b7eeef290b67581b226bc`.
Source integration snapshot before this report commit: `a926d50bc5b7c1a8e68ca43eb7fc15c26cb5a00c`.

This is an isolated source-preparation branch. It contains only the reviewed
source heads listed below. The primary checkout and author worktrees were left
untouched. No version, CHANGELOG, package, signature, publication, deployment,
or release metadata change is part of this preparation. Interim combined
source gates have now run and are recorded below. This is a reviewable
intermediate state, not aggregate approval or merge authorization; PR50/54
remain pending.

## Applied reviewed source mapping

| PR | Scope | Exact reviewed source head/range | Integration commits | State |
| --- | --- | --- | --- | --- |
| 45 | A-030 Quickchat toolbar opens without switching assistant | `28c2153253e5d64777027769d98b62a249bea154` | `31a12c2e` | Applied |
| 48 | A-008b reserve Ctrl+1..8 for tab switching | `b8f9445311558b4a94ab29ab847435edd42331a6` → `2ea5abdd876ac759ff35d4b73be86eaa81757173` → `c863a20717dd0c51d4b34a2afcebcaf5f1f78165` | `4c390a31`, `80db92e5`, `e2cf9c7f` | Applied; three additive commits |
| 49 | A-008c synchronize keyboard zoom and toolbar state | `87ba3020e3b226488c58412c39246288510db617` | `7cac12c9` | Applied |
| 51 | P0 Active Models / QuickChat scope and failed-start behavior | `2e80dd1a539f9f766d8c53444470c8dc192d42af` → `8bf990ece43c309d9d3cf667996925a1acce70b3` → `ef0d6c5980cb3da3684a70490bca8b81c0a2e7df` | `829b742f`, `731da3da`, `9b9e0523` | Applied; QuickChat switch and failure-retention contracts retained |
| 52 | A-008d active-tab mute | `60f84674efdf3c0dd7b70d6f811bcd2bbc37d9b6` | `4a70f3e5` | Applied; retained alongside zoom wiring |
| 53 | A-032 background updates, downgrade-safe channel setter | `ee0583e9935c65555d7af86d341da5a696a1976a` → `a1472b66c0a2e1955032895c3ed607c93d9faf81` | `7a6bbe10`, `a926d50b` | Applied; downgrade correction included |

The six source PRs have independent technical review comments in GitHub,
reported as `COMMENTED`; those are not formal GitHub `APPROVED` reviews.
Their individual review/gate evidence remains scoped to each PR head and does
not establish a combined-branch pass. Recorded individual evidence includes:
PR48 220 files / 1,995 tests; PR49 220 files / 1,998 tests; PR51 220 files /
1,995 tests, 0 skips; PR52 221 files / 1,998 tests; PR53 220 files / 2,008
tests plus 26 corrected updater re-review tests. PR48, PR49, PR51, and PR53
reported build/Store checks on their own heads. These are PR-head results, not
current integration results.

Cherry-picks completed without content conflicts. The source mapping binds the
integration to the exact heads/range above; no other source commits are
included.

## Pending PR heads and review gates

None of these heads has been applied to the integration branch. Recheck the
current PR head and review status before any later integration.

| PR | Head | Scope | Current disposition |
| --- | --- | --- | --- |
| 50 | `a978bf516a41ac6d8d6b84ea0cba0c687fa02217` | Auth startup preflight | Pending independent reviewer result. The previous head `7935cb1f6d85421809e3b1948e3ecfca9666d037` is superseded and must not be integrated. Author reports 223 files / 2,024 tests passed on the new head. |
| 54 | `964214f4bb29ce05c5affac433686c9b2a01a8e0` | Startup gate UI | **Pending; do not integrate yet.** Startup worker is porting the corrected productive generation contract from PR50; wait for the new PR54 head and independent re-review. Prior review also identified auth-disabled early release and optional model/onboarding errors blocking the shell; require correction and re-review. |

The current CTO handoff identifies a P1 auth-lock race across PR50/PR54. PR50
now has the corrected head `a978bf516a41ac6d8d6b84ea0cba0c687fa02217` and a
reported author run of 223 files / 2,024 tests, but independent re-review is
active; keep it pending and do not use the superseded `7935cb1f` head. PR54 is
being updated to port PR50's productive generation contract and must publish
its new head for independent re-review. Earlier PR54 review additionally
identified that auth-disabled startup must preserve PR50's early release and
optional model/onboarding errors must not block the shell. All startup
readiness signals still need to gate shell readiness. PR50 and PR54 remain
unapplied. The CTO marks PR51/52/53 independently reviewed without code
blockers and authorizes those exact heads for this interim integration. No
aggregate-ready or merge status is asserted.

Historical evidence remains scoped to each individual PR head. PR53's report
also records that the previous VM upgrade showed v0.1.52 ProductVersion after
a reported v0.1.52→v0.1.53 update, and that What's New did not appear. The cause
was not established; no VM update acceptance is claimed here. The missing VM
and What's New cause remain explicit limits for updater evidence.

## Conflict map against current integration

Read-only `git merge-tree --write-tree` simulations used the exact fetched PR
heads and the current three-PR integration HEAD. A clean simulation reports
textual mergeability only; it does not approve a pending PR or establish
semantic correctness.

| Pending PR | Result against current integration | Paths / follow-up |
| --- | --- | --- |
| 50 | Clean | No textual conflict. Review its startup policy alongside PR54 only after PR54's P1 corrections and re-review. |
| 51 | Conflicts, resolved | `App.tsx`, `CopilotSplitView.tsx`. Kept PR45's `onSwitchToSpaceAssistant` behavior and passed through PR51's boolean start result so failed starts retain the draft. |
| 52 | Conflicts, resolved | `App.tsx`. Kept PR49's `onZoomFactorChange` and PR52's `tabMuteControl` prop at both `BrowserMain` call sites and its interface. |
| 53 | Clean | Two commits applied; separate updater API and settings surfaces remain distinct from auth/startup APIs. |
| 54 | Clean textually against previous integration; not applied | P1 auth-lock race and startup review issues remain. |

Relevant pairwise simulations among pending/reviewed heads:

| Pair | Result | Required care |
| --- | --- | --- |
| PR45 + PR51 | Conflicts in `App.tsx` and `CopilotSplitView.tsx` | Preserve A-030 Quickchat behavior and P0 model failure/draft retention together. |
| PR49 + PR52 | Conflict in `App.tsx` | Preserve zoom state and active-tab mute state/wiring. |
| PR50 + PR54 | Conflict in `apps/desktop/src/main/main.ts` | Resolve auth-lock race in PR50 first; preserve disabled-auth early release and require all remaining startup readiness signals before shell release. |
| PR51 + PR52 | Textually clean | Still requires semantic review at shared model/chat/tab behavior boundaries. |
| PR53 + PR54 | Textually clean | Review separate updater, startup, and auth preload/global APIs together. |
| PR48 with PR50–54 | Textually clean | No content conflict found in pair simulations; review remains independently required. |

The PR50/PR54 main-process conflict involves auth startup policy/preflight and
startup-launch readiness IPC. The renderer conflicts above were resolved at
the shared component boundaries, preserving QuickChat, zoom, and mute behavior.

## Exclusions and next integration boundary

- PR46 is plan-only Sidekick personas and is outside this runtime integration.
- PR47 is closed/replaced by PR48 and is stale/divergent; it is excluded.
- PR44 carries v0.1.54 candidate metadata/evidence and is excluded. No version
  or CHANGELOG change is included for v0.1.55.
- PR50 and PR54 stay pending. Use only PR50 head
  `a978bf516a41ac6d8d6b84ea0cba0c687fa02217` after independent re-review;
  the former `7935cb1f` head is superseded. Wait for the PR54 port of the
  productive generation contract, its new head, and independent re-review.
  Preserve earlier PR54 feedback on auth-disabled early release and optional
  model/onboarding failures.
- PR51/52/53 are included at the exact reviewed heads above. This is an interim
  handoff: the combined branch needs its own requested gates and independent
  integration review before any merge decision.

## Combined interim gates

These commands ran on source snapshot `a926d50bc5b7c1a8e68ca43eb7fc15c26cb5a00c`
in this isolated integration worktree on 2026-10-11.

| Gate | Result |
| --- | --- |
| `npm ci` | PASS; 424 packages installed. npm reported 33 existing audit findings (2 low, 6 moderate, 22 high, 3 critical); package manifests and lockfiles were unchanged. |
| `npm test` | PASS; 221 test files and 2,021 tests passed. |
| `npm run verify:store` | PASS; 39 PASS / 2 WARN / 0 FAIL. Warnings: source-build screenshots remain provisional with documented localization gaps; no final package was supplied for binary signature checks. This is preflight, not Store certification. |
| `npm --workspace apps/desktop run build` | PASS; main-process TypeScript, renderer typecheck, and Vite build passed. Existing 2.44 MB renderer chunk advisory remains. |
| `python -m compileall -q services/sidekick` | PASS; no backend source was changed. |
| `git diff --check` | PASS for the report and source changes. |

After `npm ci`, the isolated worktree did not contain the Electron Windows
executable. The ignored `node_modules/electron/dist` runtime was copied from
the existing v0.1.54 integration worktree solely to execute these source tests;
`electron.exe` SHA-256 was
`096FEEBB1D27894727B1D07A66B87312CA84613BE1A321D7A26BB59318671EC1`, matching
the separately recorded Castlabs Electron runtime, and 76 runtime files were
present. No tracked dependency or author worktree was modified by that setup.

The Store warnings remain open candidate/release evidence. No signed package,
installation, VM upgrade, or What's New display was tested in this integration.
The earlier P-003 VM report's cause for the retained v0.1.52 ProductVersion and
missing What's New remains unknown. No VM or release acceptance is claimed.

No source merge, version bump, package creation, signing, upload, Store action,
publication, deployment, or release action was performed for this report. The
desktop source build listed above is a verification gate only.
