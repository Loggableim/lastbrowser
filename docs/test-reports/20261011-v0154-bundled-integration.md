# v0.1.54 source integration: PR31–42

Date: 2026-10-11 (Europe/Vienna)<br>
Integration owner: Codex Worker 2<br>
Branch: `codex/v0154-bundle-20261011`<br>
Integration base: reviewed PR42 head `353146c3cdb50977b7b8938e800122be24e2b019`<br>
Target: `release/v0.1.52`

This branch combines PR31–35 with PR42. PR42 already contains the reviewed
changes from PR36–41; those six pull requests were not cherry-picked again.
The dirty primary checkout was left untouched. A single integration PR targets
`release/v0.1.52`, so the complete mapping below is merged atomically. The
GitHub release workflow runs only on `v*` tags; this branch merge does not run
that workflow. No tag, package, signature, upload, Store submission, or website
deployment is part of this integration.

## Pull request mapping

| PR | Source head / reviewed range | Integrated content |
| --- | --- | --- |
| 31 | `6bae8d70`, `bc8da121`, `e05d805` → `d548ad64`, `4fa39a0c`, `f3d7eb09` | Three additive commits: published v0.1.53 metadata, historical signing/runtime report, and public download contract. Website remains on published v0.1.53 until the candidate owner completes and approves v0.1.54. |
| 32 | Five website commits, integrated as `c3c1c7e4`, `caa4b510`, `3d6c43b5`, `509814e1`, `8f80c3ae` | Localized v0.1.53 pages and release metadata, RSS/proxy changes, and regression notes. No public deployment. |
| 33 | Reviewed source head `9e507619` | Legal inventory and supplied draft files corrected. A reproducible inventory generator and dated JSON snapshot record exact npm/Python manifests and hashes. Missing license metadata, absent `mcp==1.26.0`, Sidekick upstream rights, and `jo.wav` provenance remain unresolved. Drafts make no compatibility, ownership, CLA, or dual-licensing determination. GPL text matches the official GPLv3 text; legal draft status is retained. |
| 34 | Reviewed source head `06a42b78` | Chat analysis rewritten against current in-tree producer/consumer sources. It records supported event names and same-`stream_id` reconnect behavior, and explicitly leaves runtime, performance, and stability unverified. |
| 35 | Reviewed source head `54195917` | Release checklist and worker report corrected; `.gitignore` adds only `!docs/release/`. Version-history audit anchors published versions to tags and distinguishes GitHub test/prereleases 0.1.46–0.1.50 from the absence of regular releases 0.1.46–0.1.51. Changelog history for published v0.1.44/v0.1.45 is corrected; candidate bump remains with the candidate owner. |
| 36 | `a56cf7bb` → `d3f99581` | A007 navigation smoke, already present in PR42. |
| 37 | `2a417cb336d86c442f60414a980a620b7b630175` | A029b readable WebUI errors, already present in PR42. |
| 38 | `a4bdd2df011cec25042b98e88957c8740bdf6d9d` | A029a named profile persistence, already present in PR42. |
| 39 | `3e19d1b72d8db29e7aea3453fb4ce5237c95154c` | A008a Zen IPC shortcut, already present in PR42. |
| 40 | `b77dc15f` → `f1e1c441` → `1a3fec8f1dbbec340365456e5129926bbe1db774` | A026 retired provider, three reviewed additive commits, already present in PR42. |
| 41 | `72ae82ba` → `1d7ec1423a2291b0b33f9b40ab14ee519c5f7c01` | A027 active models, two reviewed additive commits, already present in PR42. |
| 42 | `353146c3cdb50977b7b8938e800122be24e2b019` | Aggregate reviewed source for PR36–41, including their conflict resolution and candidate test matrix. This exact head is the integration base. |

PR33–35 findings and their corrections are recorded in
`20261011-a020-license-audit-antigravity-worker-6.md`,
`20261011-a-019-antigravity-worker-7.md`, the legal draft inventory, chat
analysis, and release history audit. A later CTO review also identified
operative-sounding license, commercial offer, CLA, bot, and inventory claims
in the license-section, contributor-terms, notice, and inventory drafts.
These were marked as incomplete and non-operative, with conditional wording.
The Python snapshot was expanded to record all additional installed
distributions in the supplied interpreter: `pip==25.0.1` and local
`sidekick==0.8.84` (with its `direct_url`). The runtime set is still not a
complete dependency graph and says nothing about other interpreters or
development environments. The README's obsolete Store-preflight count was
removed; the current run reports 39 PASS and 2 WARN. `LICENSE` itself remains
the exact provided GNU GPLv3 text; legal authority remains unestablished.
PR42's original CTO review remains at
GitHub comment `6106822228`; the final integrated head requires a fresh
independent review.

## Current verification

All commands below ran in this integration worktree on 2026-10-11.

| Gate | Result |
| --- | --- |
| `npm ci` | Exit 0; 424 packages installed. npm reported 33 existing audit findings (2 low, 6 moderate, 22 high, 3 critical); no dependency manifests changed. The Electron binary was restored from the local package cache for Windows tests. |
| `npm test` | Exit 0; 220/220 files and 1,994/1,994 tests passed. |
| `npm run verify:store` | Exit 0; 39 PASS / 2 WARN / 0 FAIL. Warnings concern provisional screenshots/localization and the absent final signed package. This is a preflight, not Store certification. |
| `npm --workspace apps/desktop run build` | Exit 0; main TypeScript, renderer typecheck, and Vite build passed. Existing large-chunk warning remains. |
| `python -m compileall -q services/sidekick` | Exit 0 on retry. Initial run hit transient Windows access-denied errors while replacing `.pyc` files. |
| Focused nine-file backend pytest command from PR42 report | Exit 0; 153 passed, 2 websocket deprecation warnings. |
| `node --test lastbrowser.com/tests/download-counter.test.mjs` | Exit 0; 15/15 passed. |
| `git diff --check` | Exit 0 after report and README updates. Git emitted only the expected working-copy LF/CRLF normalization warning for `CHANGELOG.md`. |

The initial full test run could not launch two Electron suites because the
Windows executable was absent after `npm ci`. The matching `37.10.3+wvcus`
Windows package was present in the local Electron cache; restoring that ignored
runtime resolved the environment issue, and the full suite then passed.

## Candidate and merge ownership

At this source handoff, package version remains 0.1.53. The candidate worker
owns the final v0.1.54 package/changelog bump and the exact package, SimplySign,
EVS/VMP, installation, and start evidence. No signing or installation was
performed by the integration owner. Source merge alone does not establish a
signed, installed, started, provider-connected, or release-ready candidate.

Merge sequence: independently review and merge this complete [PR43](https://github.com/Loggableim/lastbrowser/pull/43)
into `release/v0.1.52`; then hand the resulting merge SHA and this report to
the candidate worker. Keep the website's public version at v0.1.53 until the
candidate is approved for public release. After the atomic merge, close each
original PR31–41 individually as superseded, including its source head and
the corresponding row above with the PR43 link in the closeout; do not close
an item with an unresolved material review finding. PR42's provenance is the
aggregate source head listed above and it closes through its inclusion in
PR43.
