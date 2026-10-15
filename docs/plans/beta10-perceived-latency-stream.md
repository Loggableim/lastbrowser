# beta.10 — Perceived latency (fake stream start)

**Status:** Planned for beta.10 (with other beta.10 features). **Not** Auto-Router.

## Goal

After the user sends a message, show **immediate streamed text** (one of **12 fixed short sentences**) while the real model stream connects. Removes the “empty bubble” gap without faking provider tokens.

## Out of scope here

- OpenCode Auto-Router (later version).
- Standard-chat path shortening (separate owner).
- Changing the beta.10 **12 s TTFT gate** definition — gate still uses real `first_text`; fake stream is UX only.

## Implementation notes (for assignee)

- Trigger only after send acceptance (same surfaces as Quickchat / Standard today).
- Pick sentence deterministically or round-robin (product call).
- Replace or merge when first **real** token arrives (`applyLiveChatDelta` path).
- i18n: 12 strings × supported locales.
- Feature flag / build channel: beta.10 bundle only.

## QA

- TTFT harness unchanged (`docs/ttft-benchmarking.md`).
- Manual: user sees text &lt; 500 ms; real answer follows without duplicate bubbles.
