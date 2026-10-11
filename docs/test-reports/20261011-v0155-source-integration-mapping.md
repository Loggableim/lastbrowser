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

## Local v0.1.55 VM candidate preparation

This section records a reversible handoff plan; no installer or portable executable has been built.

### Source and package binding

- Current PR55 branch head: `dd5c31bc79e0d671b47508c28e6047516756f37a`. It is a report/source integration snapshot, not the final VM candidate commit.
- Candidate source commit remains **pending** the independently reviewed standard-chat add-on, its integration, and a fresh full combined gate run. The eventual candidate must record that final full Git commit SHA and build only from that checkout.
- Root and desktop `package.json` both currently declare `0.1.53`. The intended source target is v0.1.55, but the package version binding is **open** until the owner-authorized version/CHANGELOG step. Do not label an output v0.1.55 while the embedded package version remains 0.1.53.
- Electron Builder writes under `apps/desktop/release` (ignored by Git). Planned absolute outputs, not created: `C:\Users\logga\.codex\worktrees\v0155-integration\lastbrowser\apps\desktop\release\Lastbrowser-0.1.55-x64-setup.exe` and `C:\Users\logga\.codex\worktrees\v0155-integration\lastbrowser\apps\desktop\release\Lastbrowser-0.1.55-x64-portable.exe`. Builder artifact names derive from package version, so the planned names require the owner version step first.
- `package:win` prepares Python, generates installer assets, builds the desktop, then builds NSIS and portable targets. Windows configuration includes `afterSign: scripts/evs-sign.cjs`, signature verification, a configured certificate thumbprint, and a custom signature-preservation hook. Consequently, invoking the package command can enter signing behavior; it was not invoked. No publisher/upload step was run.
- Dependencies are already installed in the isolated worktree (`apps/desktop/node_modules`); earlier source gates passed on `520fae6c770ea9a6e5ab12383d48fa9fb983009f`. The ignored Electron runtime had been copied for tests. These facts do not establish a built candidate or packaged dependency integrity. After the final source integration, rerun the required gates and prepare the packaging environment against that exact commit before producing the candidate.

### Candidate evidence still open

For each final executable, record the exact file name, absolute path, byte size, SHA-256, embedded/file/product version, Authenticode signer and timestamp verification result. Record the installation or portable launch path, installed version, upgrade source/version if applicable, and the exact installed executable hash. None of these package, signature, timestamp, or install observations exists yet. Keep any setup and portable evidence separate.

### P004 VM test matrix

Run only after the final candidate has been built and its source commit, version, hashes, signature, and timestamp are bound in the handoff. Use the existing VM tester and standard chat scope.

| Scenario | Required observation |
| --- | --- |
| Fresh install or controlled upgrade | Candidate file/hash and installed executable match; installed version is 0.1.55; startup completes. Record the exact installation path and whether the What's New view appears. |
| MiMo standard-chat send | Send a short prompt and a follow-up; capture successful response plus actual provider/model/session metadata. |
| Codex standard-chat send | Send using the selected Codex model; verify provider/model/session metadata and the profile-bound model context metadata. Do not infer routing from response text or the picker label. |
| Ollama standard-chat send | Attempt only if the existing account/service is usable. Record HTTP 403 or other account/service refusal as external and do not count it as product acceptance. |
| Model switch during a conversation | Switch to a second available model and verify the selected model and subsequent session metadata; no silent cross-provider fallback. |
| Stop and failed start | Stop an active response and verify the placeholder finalizes; a rejected/failed send retains the composer draft. |
| Restart and history | Restart, reopen the conversation, send a follow-up, and verify history and provider/model binding remain consistent. |

The pass/fail record must name the candidate hash used, distinguish product behavior from account/service blockers, and leave QuickChat deferred. The active VM tester remains uninterrupted; candidate testing is a later handoff.

### Owner sequence

1. Obtain independent review of the exact standard-chat add-on PR head; integrate only after that review.
2. Rerun focused regressions and every AGENTS gate on the resulting candidate source; record the final commit SHA.
3. Owner performs the version/CHANGELOG step to 0.1.55, then build the isolated VM candidate with the configured signing path.
4. Capture per-file hash/size/version and Authenticode signer/timestamp evidence, then pass the candidate and matrix to the existing VM tester for P004.
5. Keep merge, tag, public release, Store submission, and publication as separate owner decisions.

## A-033 follow-up evidence and PR56 status (latest update)

This section supersedes the earlier statement that actual Codex routing was not verified. The A-033 follow-up commit `ffe82dda9426` records real standard-chat Codex routing to `openai-codex/gpt-6-luna`; the VM trace also observed MiMo's first real response. This does not close the live-send blocker: the GPT-6 Luna end-to-end send failed at the UI start timeout, with a 21.360-second route against a 20-second header limit and 12.328 seconds spent waiting for the lock. A MiMo follow-up hit the same timeout even though the backend later completed and stored the response; reloading history made the visible error disappear. The current evidence therefore shows routing and backend completion on those attempts, alongside a failed UI outcome and lost error visibility.

PR56 (`a9371aaaa8cf04169489d4b441d9808cf574deec`) is the separate production-fix PR against `release/v0.1.52`. GitHub currently reports it open and mergeable, with no formal review decision, reviews, or check runs recorded. The existing model-fix worker is reconciling the latest VM deltas represented by `ffe82dda9426` with PR56. That follow-up commit is a tester-side report/patch snapshot, not the PR56 head or an independently reviewed fix. Do not integrate PR56 until the exact reconciled fix head has independent review; then rerun the combined regressions and every AGENTS gate before preparing a candidate.

The shared API model catalog work is deferred to v0.1.56 planning and is outside the v0.1.55 candidate. The current v0.1.55 blocker is specifically the standard-chat timeout/recovery and error-retention behavior. QuickChat remains deferred; Ollama Cloud remains unavailable under the reported HTTP 403 and must not be counted as product acceptance.

## Additional v0.1.55 review dependency: OpenCode Auth/Login

Cid has assigned a separate OpenCode Auth/Login implementation to worker `01a12b1a-d194-75e0-a8db-6f0ce21f5c68`. The worker is analyzing the official OpenCode CLI auth contract against LastBrowser's existing Zen/Go key-provider paths and is preparing a minimal separate PR with credential isolation, status, discovery, and standard-chat routing coverage. This work is **not included** in PR55 or the current candidate source.

Treat the exact OpenCode PR head as an additional v0.1.55 integration dependency. Require independent review of that exact head and rerun the combined relevant regressions and all AGENTS gates after integration. Keep account actions within existing explicit authorization; do not infer OAuth behavior or import a generic `auth.json`. No version/CHANGELOG change, merge, signing, or release action is authorized by this task. The shared API model-catalog redesign remains deferred to v0.1.56 planning.

## Fresh PR56 snapshot and integration preparation

Freshly fetched GitHub state for PR56 now points to `683ff163e8de249c1bdb3fde50ba63bcbd80b68b`. This head contains the A-033 standard-chat scoped-catalog commits plus a new commit titled `Add profile-scoped OpenCode CLI login`; the OpenCode work is currently on PR56, not on a separate PR. Its diff from the verified release base touches 23 files (782 insertions, 28 deletions). The previously cited `dbfd6ff7` review/documentation point predates this OpenCode delta and does not review it. GitHub currently reports no submitted reviews or check runs for the new head; the separately activated OpenCode reviewer has not yet produced a review visible on the PR. Require a positive review of exactly `683ff163e8de249c1bdb3fde50ba63bcbd80b68b` or a later reviewed head before integration.

A read-only merge-tree preparation against current PR55 identified three shared-file conflicts to reconcile after review: `apps/desktop/src/renderer/i18n/keys.ts`, `apps/desktop/src/renderer/i18n/locales/ja.ts`, and `apps/desktop/src/renderer/panels/SystemPanels.tsx`. No candidate source merge has been applied. After positive review, resolve these while preserving both PR55's existing Settings/provider behavior and PR56's OpenCode UI, then run combined relevant regressions and all AGENTS gates on the resulting exact PR55 commit.

The standard-chat UI timeout/recovery, history error retention, Stop behavior, and OpenCode live-login validation remain open. PR56 source tests do not replace those VM/live observations. Candidate packaging remains blocked on reviewed integration, full combined gates, and the owner version step.

## PR56 integrated test snapshot and new OpenCode review findings

Per Cid's explicit test-build direction, PR56 head `683ff163e8de249c1bdb3fde50ba63bcbd80b68b` is now integrated locally into PR55 as merge commit `02b7684eeacb9302593ab2d98ba6fbffb8079807`. The three read-only merge-tree overlap candidates (`i18n/keys.ts`, Japanese translations, and `SystemPanels.tsx`) merged automatically without textual conflict; the integrated changes were inspected for conflict markers. This is a provisional source snapshot, not a ready or final package. The integration commit is the source freeze point for the pre-fix baseline; any authorized follow-up remains a distinct, traceable commit.

The independent reviewer then identified two P2 OpenCode source findings on PR56 head `683ff163e8de249c1bdb3fde50ba63bcbd80b68b`: the Cancel endpoint reports success even when `taskkill` fails, and an in-flight login scoped to an old profile can leave login controls disabled after the user switches profiles. The existing OpenCode worker is implementing minimal fixes with regressions on PR56. Neither finding is closed or reviewed on a post-fix head yet. Do not describe this snapshot as reviewed/ready. Run the combined gates now on the frozen pre-fix merge for baseline evidence; if the fixes land before upload, integrate the newer exact PR56 head and rerun all gates before packaging.

The live OpenCode login, standard-chat timeout/recovery, History error retention, and Stop flow remain VM acceptance tasks. No version bump, package, signature, timestamp, or upload has occurred.

## Final v0.1.55 candidate record (2026-10-11)

This section supersedes the earlier provisional status above. PR56 exact head
`c65619aa9cd00ace7d0dde7ebed00884ca3a5311` is integrated in PR55. The
independent exact-head re-review found no remaining source blocker from the two
reported OpenCode cancellation/profile-scope findings; this is technical
review evidence, not a formal GitHub `APPROVED` state. PR55's pushed source and
versioned candidate commit is `68c2cddf4a0f787f6adc858d181a3e0c8898c867`.
It contains the earlier integrated PRs in the source map and PR56 as a
first-parent add-on; PR57 remains planning-only and outside runtime scope.

### Final source gates

- `npm test`: PASS, 228 test files / 2,073 tests.
- `npm run verify:store`: PASS, 39 PASS / 2 WARN / 0 FAIL. Warnings are
  provisional localized Store screenshots and absent final package input to
  that preflight; binary signatures were verified separately below.
- `npm --workspace apps/desktop run build`: PASS; existing Vite large-chunk
  advisory remains (renderer bundle about 2.47 MB).
- `python -m compileall -q services/sidekick`: PASS.
- Focused backend regressions for scoped models, reasoning transport, OpenCode
  login/runtime, and fixed-process chat: PASS, 56 tests.
- The first full-suite run after the authorized version bump exposed one
  release-flow assertion still hard-coded to 0.1.53. The assertion was updated
  for 0.1.55 and the final full suite above passed.

### Built package and cryptographic evidence

Built on Windows x64 from candidate source commit
`68c2cddf4a0f787f6adc858d181a3e0c8898c867`, with `--publish never`, into the
unique ignored output directory
`apps/desktop/release-local-0.1.55-20261011-r1`.
The package builder signed the files with the configured Authenticode
certificate. EVS/VMP streaming signing and its verification succeeded for the
application executable. Final executable signatures both report `Valid` and
have DigiCert SHA256 timestamp certificates.

| Artifact | Size | SHA-256 | Authenticode | Version |
| --- | ---: | --- | --- | --- |
| `Lastbrowser-0.1.55-x64-setup.exe` | 167,717,976 bytes | `b8ab33f2a495e524501cb097928f04f429b82dc96019170ae1969941dca68922` | Valid, DigiCert timestamp | File/Product 0.1.55 |
| `Lastbrowser-0.1.55-x64-portable.exe` | 167,354,560 bytes | `dc8960e1f22908f1c40d3232cfbd7f165884428e44ad6fd762fc6361680dee7d` | Valid, DigiCert timestamp | File/Product 0.1.55 |

### Private draft append and VM scope

Both 0.1.55 artifacts were appended to the existing private draft alongside
its original 0.1.54 setup and portable artifacts. The 0.1.54 assets and their
hashes remain intact. Draft title now identifies both test versions and still
says not to publish:
<https://github.com/Loggableim/lastbrowser/releases/tag/untagged-db01e8964de38692c212>.

The VM agent has not yet confirmed download/access or performed installation;
no VM acceptance is claimed. Keep the candidate and tested hash bound throughout
P004. The updated acceptance scope includes both QuickChat and Standardchat,
first/follow-up sends, model changes and actual provider/session metadata;
startup/auth; browser basics/navigation; shortcuts, zoom and mute; provider and
model persistence; LB006 composer/draft retention and LB007 responsive layout;
timeout recovery, History error retention and Stop completion; OpenCode live
login, cancellation and profile switching; and update What's New plus displayed
EXE version. Do not retry the known Ollama Cloud HTTP 403. Record each tested
feature and each PR's coverage separately; report live/package observations
separately from source gates.
