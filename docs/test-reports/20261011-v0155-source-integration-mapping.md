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

## P004 initial live result on the exact v0.1.55 package (latest update)

This section supersedes the earlier statement that VM download/access and
installation were still pending. The tester confirmed authenticated download
of setup asset `630908836`; downloaded SHA-256 exactly matches
`b8ab33f2a495e524501cb097928f04f429b82dc96019170ae1969941dca68922`.
Authenticode is Valid with the expected signer and DigiCert SHA256 timestamp.
Installation exited 0 in 152.54 seconds. The installed executable reports
ProductVersion `0.1.55.0` and FileVersion `0.1.55`; installed EXE SHA-256 is
`a08507f223f61eac4d8437aff5003d33dee88dcd072840b02cb525950ef719fe` and ASAR
SHA-256 is `2a306192e5419bdac35088b372713c61273165d84ba38d4c0dad8c3c5cd99086`.

### Passed observations

- The What's New view for 0.1.55 appeared and Escape closed it.
- External URL navigation, Back, Forward, and Reload passed.
- Ctrl+1 and Ctrl+2 switched between the first and second tabs without an
  observed pinned-app side effect.
- After closing only an old invisible A-033 development process that held
  the singleton lock, the installed candidate launched. This initial process
  collision is not counted as a candidate startup failure.
- Composer draft retention passed on the failed synthetic QuickChat send and
  the failed Standardchat send.
- With the existing canonical MSIX user-data directory explicitly selected,
  the bound provider catalog loaded and prior profile history remained visible.
  This is diagnostic evidence for a default path-alias conflict, not a fix.

### Failed or blocked observations

- **Overall P004 candidate acceptance: FAIL.**
- QuickChat, on the retained Home Space with GPT-6 Luna, failed before an
  inference response with `Profile reference is ambiguous or has moved`. No
  provider success is claimed and the request was not repeated.
- Standard launch initially showed no matching models and disabled Send,
  although read-only state showed one active default profile. Explicitly
  selecting the existing canonical user-data directory restored catalog
  loading; the standard-launch profile-alias problem remains unresolved.
- Standardchat with Codex GPT-6 Luna failed its UI start at about 28 seconds
  with `route handler did not start a response in time`. Later backend/session
  evidence persisted `SC READY` and confirmed `openai-codex/gpt-6-luna`.
  Thus provider routing/backend completion occurred, but the user-facing send
  remains a failure and timeout recovery is not accepted.
- The OpenCode CLI is absent from PATH, so live CLI login/cancel/profile
  switching is blocked. No CLI was installed as part of this candidate test.
- At 1440px the QuickChat reasoning controls looked cramped/clipped; LB007
  responsive acceptance remains open. Keyboard zoom and audio/mute behavior
  were not confirmed (no audio fixture). History error retention and Stop
  completion/placeholder were not yet tested.

The existing VM tester is the sole authorized repair owner on branch
`codex/p004-chat-opencode-fix` based on `68c2cddf`. The installer run did not
authorize a source fix in this integration branch. Do not make competing
source edits. Any future fix must arrive as an exact commit with regression
and live evidence, receive independent review, pass combined gates, and be
bound to a newly built candidate before another VM run. PR #55 remains open;
no release merge or publication is authorized by this failed candidate run.

## Additional v0.1.55 integration point: provider workspace settings

Cid has selected mockup variant 3: implement an **Anbieter-Arbeitsbereich** in
AI & Local Models. Remove the separate Local AI Settings destination and
integrate Local AI under provider/local-model settings. Hide Advanced from this
settings flow. This scope is not present in the uploaded v0.1.55 package and
must not be attributed to its source, binary, or P004 results.

The existing Settings worker `01a12b1a-d194-75e0-a8db-6f0ce21f5c68` owns the
cohesive implementation PR and coordination with the P004 shared hotspots.
This integration branch makes no competing source edits. Treat the exact PR
head as a further v0.1.55 candidate dependency; integrate only after
independent exact-head review, combined regressions, and all AGENTS gates. If
integrated, bind it to a newly built and signed package before further VM
acceptance. Keep the current uploaded package and its source/hash binding
unchanged.

## Latest P004 repair progress (reported source build; candidate still fails)

The latest VM-thread report is commit `82f44f0eabc72527181e195a5cd3a98fd7d11909`
(`docs: record partial P004 candidate and chat repair validation`):
<https://github.com/Loggableim/lastbrowser/blob/codex/lastbrowser-electron-shell/docs/test-reports/2026-10-11-P004-0155-progress.md>.
These are tester-reported observations from a separate source build, not the
signed v0.1.55 package and not new acceptance for the uploaded candidate.

Reported improvements: Windows profile alias resolution via filesystem
identity; settings catalog acquisition under the mutation lock; zero lock wait
on the repaired start path; redundant AUTO catalog probes removed when a model
is fixed; MiMo first and follow-up responses with amber context plus correctly
rendered Markdown/code; GPT-5.6 Luna model switch with an amber response. The
OpenCode CLI is now installed, but a human login remains pending.

Remaining evidence: the full suite has 13 failures across 7 files and requires
individual baseline-versus-regression triage; no all-green suite claim. Stop,
restart, QuickChat, and History behavior remain open. The repaired start path
still needs a latency follow-up with provider/model binding and measured
response-start, lock, and catalog timing.

The VM tester remains the sole chat repair owner. As of this update the
integration host sees no remote ref for `codex/p004-chat-opencode-fix` and no
open PR with that head, so there is no exact reviewable fix head to incorporate.
Keep PR55's candidate failure and its uploaded source/package binding intact;
wait for the tester to provide the exact pushed commit/PR, independent review,
triaged combined gates, and new package evidence. No source change, merge,
re-sign, or release action is taken here.

## Latest local review and integration delta (2026-10-11 17:53 CEST)

This section supersedes earlier statements above that PR56 was waiting for a
review, that no remote P004 PR existed, and that PR58/60 work was not included
in the local integration branch. These are local source integrations only;
the current PR55 remote head and previously uploaded signed files are unchanged.

| PR | Exact reviewed head | Integration / review state |
| --- | --- | --- |
| 56 | `c65619aa9cd00ace7d0dde7ebed00884ca3a5311` | GitHub PR is closed, not merged. Its changes were already present in the earlier PR55 source snapshot. Independent exact-head re-review found the two reported OpenCode source issues fixed. VM acceptance remains open. |
| 58 | `2557dd54ced5a5a514749d030510d86aadf57c2f` | Independently reviewed; integrated locally by `b49fca75db312513bd6b6f24f5a23b020c91144f`. |
| 60 | `ff7e1b4658d52f2430e66cef39042a5d6af7aadc` | Independent review found no actionable source issue; integrated locally by `394dc5452a424e44cbeb53d64c978277d8508020f`. UI source review/screenshots are not packaged or VM acceptance. |
| 61 | `1b0a3d080fef5893a463ee23c0da90bac30ea029` | Local independent review found no actionable source defects; 37 focused Python tests passed, while 6 `test_native_chat_auto.py` cases could not import `pydantic` under worker Python 3.14. A second independent review raises two P2 follow-ups below. Integrated locally by `f2c113c506ac2756c4fd9ff4a06addad12fa9353`; not pushed. |
| 63 | `ebe3b0582a1611bba7bbcbb79ba3f43c5fb28fe7` | Not integrated. Independent review found a P2 titlebar overlap: the overlay inset follows `--titlebar-height`, but accessibility styles raise the rendered titlebar to 54/62px without changing that variable. Fix and exact-head re-review are required. |

### Remaining PR61 review and candidate blockers

A second independent review of PR61 notes that OpenCode Go chat has no
`x-opencode-session` header. This does not establish an inference failure, but
Go inference must remain unverified; human login and inference are also still
open. The same review could not audit the reported 15-failure split (10
baseline / 5 stale assertions): the referenced
`evidence/p004-0155-20261011/05-baseline-triage.md` is absent from the
published tree, and the full suite was not rerun after the assertion updates.
QuickChat early Stop also lacks a latest live retest. The independent reviewer
reported no complete candidate-acceptance verdict.

The local PR55 integration head is now
`f2c113c506ac2756c4fd9ff4a06addad12fa9353` (merge commits for #58, #60, and
#61 atop remote base `1fcc2ca00d3d81a8d82e5fe5537baa9424db1957`). This local
head has not yet received the combined AGENTS gate run or been pushed. Do not
build or upload the next installer until the PR63 correction and any remaining
v0.1.55 Settings/Plugins worker PR are reviewed and integrated, the suite
failure evidence is reconciled, and the full combined gates pass on the exact
final source/version commit. Keep the existing signed candidate and its P004
FAIL binding intact. The authorized next artifact is a separately named,
visibly UNSIGNED private VM installer; no public release or release-branch
merge is part of this handoff.

## Follow-up after latest exact-head reviews (2026-10-11)

PR #61 advanced from `1c8ea6dccd16955cc58f2051917ecb60f27b36c9` to
`74d2e54722e43859c4485e3a9db47453491d53c3`. Independent exact-head review
found no blocking source defect in the native provider catalog, wire-model IDs,
grant persistence, profile binding, or session-header paths. The new source
head was integrated locally in merge commit `818ac12f`. This is source-level
evidence only. OpenCode human login and real inference remain unverified; the
owner reports renewed human approval is needed after the earlier version
discarded the grant.

The follow-up review noted that the backend's sanitized catalog details
(`field_names`, `packages`, `gateway_paths`) are currently dropped by the
renderer; the UI retains only the safe error code. This is a diagnostic
handoff gap, not a newly identified auth/scope defect. It remains useful to
clarify before claiming actionable diagnostics.

PR #63 remains outside the local branch at head
`510a734bc96c9d11326725257468c1628ef14eb4`. Its CSS fix passed source-level
re-review, including accessibility titlebar minimums, but the added test
checks CSS text rather than calculated geometry. A computed sensor/overlay
geometry probe is still required before integration.

PR #64 remains outside the local branch at head
`8cd7d7bfc0942b0fadb70288bb8f604cae90054f`. Its two reviewed P2s remain open:
provider selection can survive a profile switch from the previous profile,
and Extensions tabs are not semantically connected to their panels.

The PR61 owner still owes an auditable per-test locale baseline triage, a full
suite result on the final combined head, and QuickChat early-Stop live evidence.
The suite is reported as 2,135 passed / 10 locale failures, with those ten said
to reproduce on the base; this report does not treat that as a green suite or
as independently reproduced evidence. At the time this status section was written, the combined gates had not been run on merge commit `818ac12f`; see the incremental gate result below. Keep the existing signed
candidate and its VM FAIL binding intact. The authorized next artifact remains
a newly named, visibly UNSIGNED installer for the existing VM tester only.

### Incremental combined gates on `818ac12f`

This gate run covers the local integration through PR61 `74d2e547`; PR63 and
PR64 remain excluded. `npm test` passed all 234 files / 2,160 tests. The ten
failures cited by the earlier PR61 report were not reproduced in this run; the
base comparison artifact is still absent, so the historical baseline claim is
not independently auditable. `npm run verify:store` passed 39 checks with 0
failures and 2 warnings. The desktop build passed TypeScript and Vite, with
the existing large-chunk advisory. `python -m compileall -q services/sidekick`
passed. Focused OpenCode device and inference tests passed 38/38 when invoked
from `services/sidekick`, which gives their subprocess the expected package
root; an initial invocation from the repository root had 1 subprocess import
failure because the child process did not inherit pytest's conftest-only
`sys.path` change. No installer package was built.

## Combined v0.1.55 follow-up: PR63/64 and renderer evidence (2026-10-11)

The local integration now includes the reviewed PR63 head
`510a734bc96c9d11326725257468c1628ef14eb4` and PR64 head
`8cd7d7bfc0942b0fadb70288bb8f604cae90054f`. PR56 remains closed/unmerged on
GitHub; its reviewed fix is already an ancestor of the local integration.
PR61 head `74d2e54722e43859c4485e3a9db47453491d53c3` remains included. These
are local source integrations; no GitHub merge or publication is implied.

The PR64 follow-up resets ProviderWorkspace selection when the resolved
provider changes after a profile switch, and links each Extensions tab to its
tabpanel with selected-tab focus and arrow-key navigation. The corresponding
Electron renderer smokes passed on the final working tree. The PR63 geometry
smoke loaded the actual renderer stylesheet in Electron and measured the
titlebar, edge sensor, and sidebar overlay for all three densities with the
enlarged topbar off, at 54px, and at 62px: all nine combinations stayed aligned.

| Final combined gate | Result |
| --- | --- |
| `npm test` | PASS; 238 test files / 2,167 tests. Includes profile-switch renderer smoke, extension tab/panel and keyboard smoke, and nine computed Zen geometry cases. A few DOM tests reported Vite dev-server port fallback because another local listener occupied 5173/5174; tests completed successfully. |
| `npm run verify:store` | PASS; 39 passed / 2 warnings / 0 failures. The warnings remain provisional Store screenshot localization and no final package supplied for binary signature inspection. |
| `npm --workspace apps/desktop run build` | PASS; main TypeScript, renderer typecheck, and Vite production build. Existing 2.50 MB JS chunk advisory remains. |
| `python -m compileall -q services/sidekick` | PASS; exit code 0. |
| `git diff --check` | PASS before merge completion. |

The full source suite did not reproduce the previously reported ten locale
failures, but the original per-test base-triage evidence is still absent, so
that historical comparison is not independently confirmed. Live OpenCode
login/inference and QuickChat early-Stop remain unverified. This gate set is
source-level evidence only; the new private VM installer has not yet been
built or tested. The previous signed candidate's P004 FAIL remains bound to
that earlier artifact and is not revised by these source tests.

## Private unsigned VM candidate (2026-10-11)

**Source binding:** commit
`ca564a91d453623c96740c629cd00320c0455034` on
`codex/v0155-integration-20261011`; root and desktop package versions are both
`0.1.55`. The working tree was clean at package start. PR56's fix and reviewed
heads for PR58, PR60, PR61, PR63, and PR64 are ancestors of this commit. PR56
remains closed/unmerged on GitHub. PR62 and PR57 target v0.1.56 and were
excluded. PR55's remote head was not advanced by this private test handoff.

The offline preview was built with
`node scripts/package-feature-preview.cjs` into
`output/feature-preview-2026-10-11T17-05-58-119Z-38ad0181`; its receipt reports
10,235 resource files, `blocked: []`, `unsigned: true`, `published: false`, and
`fullAcceptanceVerified: false`. A scan of packaged resources found no
`.db`, SQLite sidecars, `.gguf`, `auth.json`, or `config.yaml`. The app
executable reports `NotSigned`. The installer/portable files were then created
from this exact unpacked preview with
`node scripts/package-dist-preview.cjs
output/feature-preview-2026-10-11T17-05-58-119Z-38ad0181`; the builder log
confirms signing skipped and no publish target was used.

| Artifact | Path in this worktree | Bytes | SHA-256 | Version | Authenticode |
| --- | --- | ---: | --- | --- | --- |
| Setup | `output/dist-preview-2026-10-11T17-05-58-119Z-38ad0181/Lastbrowser-0.1.55-UNSIGNED-VMTEST-ca564a91-x64-setup.exe` | 167,156,908 | `680622c72e4b613a9feea3326f69dc2dc9ad7280c0653de827214ff1d068e337` | File/Product 0.1.55 | NotSigned |
| Portable | `output/dist-preview-2026-10-11T17-05-58-119Z-38ad0181/Lastbrowser-0.1.55-UNSIGNED-VMTEST-ca564a91-x64-portable.exe` | 166,802,667 | `82275076b2ade012919ad149940de76bc48f511521f1865ecf9b37e9e9f4c8c2` | File/Product 0.1.55 | NotSigned |

Both artifacts were uploaded to the existing GitHub draft release
[v0.1.54 + v0.1.55 VM-Testkandidaten (NICHT VEROEFFENTLICHEN)](https://github.com/Loggableim/lastbrowser/releases/tag/untagged-db01e8964de38692c212).
After upload, the release still reported `isDraft: true`; GitHub's asset byte
sizes and SHA-256 digests matched the local files above. The draft still also
contains older signed candidates, so the VM handoff calls out the unique
`UNSIGNED-VMTEST-ca564a91` names explicitly. No public release was created.

**Local executable evidence:**
`scripts/probe-preview-executable.cjs` passed against the exact unpacked
preview (`output/direct-exe-3b1a5d93-2dd1-498f-8941-72d58f256b8a.json`), and
`scripts/probe-portable-executable.cjs` passed against the exact portable
(`output/portable-exe-ef351fbc-4539-49b3-8ae2-03339357d2c4.json`). Both
observed the app shell and first-run view with bundled Sidekick ready, used an
owned temporary profile/runtime, exited 0, and cleaned that temporary data.
These are host launch probes; no NSIS installation or VM interaction was
performed here.

**VM evidence reconciliation and handoff:** the earlier P004 failure remains
attached to the previous signed candidate bound to source `68c2cddf` and its
recorded hashes. It is not carried forward as a result for this build, which
is currently **untested in the VM**. The existing P004 Slack task was updated
with source commit, exact uploaded asset names/links, sizes, hashes, and PR
coverage. Cid's direct instruction for this handoff specifies an unsigned
private installer, so the old P004 trigger's valid-signature requirement is
superseded for these two assets only: the tester was asked to verify the
expected `NotSigned` state, stop if the VM blocks unsigned execution without
bypassing policy, and bind every result to this source/package hash. The
existing VM tester remains the sole owner; no second VM was driven. The P004
task requests the full existing matrix, including both chat paths and the
new Zen geometry, profile-switch, extension-tab, startup/password, avatar,
and OpenCode review points. No VM PASS is claimed until that report arrives.

The source gates above passed before packaging: 238 files / 2,167 tests;
Store preflight 39 PASS / 2 WARN / 0 FAIL; desktop build passed with the
existing 2.50 MB JS chunk advisory; Python compileall passed. These results
remain source/package-preparation evidence and do not certify VM behavior,
live model inference, or public release readiness.

## Exact VM intake pins and fetchable source

The VM tester reported that a direct fetch by SHA failed because the source
commit was not advertised as a ref. The exact source commit is now reachable by
a normal fast-forward push on `refs/heads/codex/v0155-integration-20261011`;
the pushed branch tip is `e63641ebaa4dd0ea538c1ff49b7d7571e5e757f6`, whose
parent is the unchanged build commit `ca564a91d453623c96740c629cd00320c0455034`.
Fetch that branch first, then check out the build commit itself. No force push
or source rewrite was used, and no rebuild was performed.

The VM's observed `resources/app.asar` independently matches the local unpacked
candidate: 73,124,546 bytes, SHA-256
`ed6a385a5c85a591875fec23a735f2a32264afe5aa11458eafd8929aa73df165`. The
packaged resource inventory is
`output/feature-preview-2026-10-11T17-05-58-119Z-38ad0181/resource-hashes.json`
(1,452,591 bytes, SHA-256
`d4d3700de50f48b4293444e06281b8a47cf220f98849319eaedbf01962b3ea17`); it
contains individual hashes for the 10,235 packaged resource files. Key entries
include `services/sidekick-source.json` (171 bytes,
`b78375e6b68f0dd61443170c33008db097ab84023087dc8fe9182de182ae61e5`) and
`runtime/python/python.exe`
(`4d6f5f81a4bca11191c4c7c6b43632694d0a4ce74e068619d8fdc161d469859a`). The
packaged build marker is `resources/lastbrowser-build-variant.json` (67 bytes,
SHA-256 `f2d2a0a7c244d7ebf81415ecb00c19d728133253323f833a71dccd5ca0b4e765`)
and states schema 1, `offline-test`, appVersion `0.1.55`.

The offline build receipt is
`output/feature-preview-2026-10-11T17-05-58-119Z-38ad0181/preview-result.json`
(184 bytes, SHA-256
`33dee33105a5c33dbbf3cbf6d0872b0edfef276cd33507eea83f79ec6e6285c7`); it
records 10,235 resources, no blocked resources, unsigned true, published
false, and fullAcceptanceVerified false. Its `artifacts` array is empty, so
the receipt does not itself cryptographically bind the installer or portable
EXE. This report supplies the explicit outer mapping from that receipt and
inventory to the unchanged source build commit, the matching app.asar, and the
setup/portable SHA-256 values listed above. The installers remain `NotSigned`;
the VM tester must still report its own run before any acceptance claim.
