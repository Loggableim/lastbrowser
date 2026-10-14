# 0.1.57: simple AI navigation and optional features

Approved by Cid on 2026-10-13. This work is isolated from the signed private
0.1.56 feedback candidate. The working tree starts at 1b4057c7 and overlays the
immutable final 0.1.56 feedback source snapshot; these inherited changes are
not a separate merged commit yet.

## Product decisions

- Fresh AI navigation shows the companion chat and recent conversations.
- Additional assistants are disabled until enabled in Extension & Skill Hub.
- Skills belong in that Hub; agent profiles live under assistants' advanced settings.
- Gmail AI and Discord Agents are disabled by default, available through the Hub,
  and explicitly labelled **Beta / untested**.
- Memory & Knowledge is optional and defaults off. Existing data remains available
  for manual inspection, editing, and deletion. Disabling stops automatic retrieval
  and writes; it does not delete data.
- Cloud search has separate consent and defaults off. Google embeddings and remote
  Ollama must not receive memory text without that consent.
- The first supported consent scope is the resolved backend profile. Space-level
  consent must not be advertised until implemented end to end.
- Memory presents About me, Knowledge, and Controls. Chat provenance identifies
  sources actually supplied to the model, not a claim the model relied on them.
  Source previews display the currently saved version and are loaded only on click.
- AI settings put Local AI, tested models, and untested betas in the inner left
  navigation. Right-hand content uses numbered pages based on available height,
  preserving mounted input state. An indivisible control remains reachable through
  an accessibility overflow fallback at extreme height/zoom.
- Chat rows expose delete/archive/pin mini icons on hover, keyboard focus, and touch.
- Deletion uses two clicks at the same icon with an inline confirmation, cancelled
  by Escape, pointer leave, timeout, or context change. Shift selects a range;
  Ctrl selects individual chats. Batch deletion keeps failed items selected.
- Aufgaben combines current chat steps and scheduled jobs. Kanban is an optional,
  disabled-by-default Beta board plugin. Existing boards remain inspectable.
- Insights & Usage lives under Tools. A profile-owned provider-call ledger records
  actual model/provider/token data; unavailable metrics remain unknown. Subscription
  billing is distinguished from a zero itemized price. Daily charts use call dates.
- Quickchat uses a short dedicated companion prompt without the full Sidekick work
  playbook, project/skills/environment context, memory, or tools. The button label is
  Reset Chat. No latency improvement has yet been measured.
- Ollama Cloud is categorized as cloud. Local/remote/unknown deployment metadata is
  shared by Quickchat, standard chat, and model settings without exposing endpoint URLs.
- Personality avatars: Nova 01, Analyst 04, Coder 03, Brainstormer 02, Mentor 06.
  Sidekick 05 is reserved. Space companion names are Nova, Orion, Patch, Spark, Zen;
  names remain user-customizable. Choice is offered at first setup and Space creation,
  and can be changed by clicking the Quickchat header avatar/name. Normal chats keep
  their full base profile with only a short additive response-style preference.
- The public name is **Zen Mode** across desktop and website. Internal preference
  identifiers remain compatible.

## Implementation boundaries

Composio MCP was added to the 0.1.57 scope on 2026-10-13. The Hub offers an
optional, disabled-by-default OAuth/HTTP preset. See `v0157-composio-mcp.md`.
The public roadmap structure is approved as Next release / Later / Under
consideration; individual public announcements remain subject to user selection.

Renderer, backend, and Electron upgrade were developed in coordinated streams.
Native IPC carries explicit profile selection for policy, memory, and assistant
operations; responses from stale UI scopes must not replace current state.

The security auditor's source changes are incorporated: loopback Host validation
when ASGI starts directly, and a renderer CSP prohibiting external scripts.
Mermaid 12.2.0 and KaTeX 0.19.0 are now pinned and bundled locally, including CSS
and fonts. Strict rendering settings and sanitization retain plain-text fallbacks.

## Electron

Castlabs 44.5.1+wvcus / Chromium 152 was the historical intermediate upgrade.
The current Beta target is Castlabs 45.0.0-alpha.14+wvcus / Chromium 156, meeting
the requested Chromium minimum 155. See `docs/electron-v0157-upgrade.md` for
runtime provenance and provisioning, and `docs/dependency-maintenance-policy.md`
for the explicit prerelease exception. Compilation does not prove runtime
compatibility, VMP/signing acceptance or Store certification.

## Delivery evidence

No full test suites were run. Build/syntax results are reported in the task
handoff. This source work is not a signed 0.1.57 installer, a VM acceptance result,
or a public deployment.

Historical intermediate preparation: combined Main/Renderer TypeScript and Vite build Exit 0
using actual Electron 44.5.1 dependencies; this does not verify the later Electron 45
target. AST syntax check of 1,114 Python files
passed; git diff --check passed. Targeted isolated Insights debugging fixtures and
ledger migration verification passed under the user's specific verification request.
No full test suite was run.

The prepared version is `0.1.57-beta.1`; stable/public is the default update
channel and Beta is opt-in. See `docs/v0157-beta-public-channels.md` for the rolling
one-version lag and rebuild/sign requirements when a prior Beta becomes public.

Store history: the intermediate Chromium 152 runtime was below the required
window. The current Chromium 156 target meets the requested minimum 155, but the
Electron 45 Alpha runtime is a prerelease and is not Store-certified. Engine
version compliance alone does not establish Store eligibility or acceptance.
