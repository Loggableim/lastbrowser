# First-run Local AI model bootstrap

## Verified default artifact

- Repository: `LiquidAI/LFM2.5-230M-GGUF`
- File: `LFM2.5-230M-QAD-Q4_0.gguf`
- Immutable Hub revision: `b27f8147d98080b0d6f063ff41de6e381ea9a530`
- Exact size: `149081056` bytes
- SHA-256: `e75f83268de11b2a1bcfab5f3b5c5c0c97569ddbbc0990aad88437e45b8ba292`
- Format/architecture: GGUF Q4_0 / LFM2; the QAD file differs from the regular Q4_0 file.
- License: LFM Open License v1.0. The license places a $10M annual-revenue threshold on commercial use by a legal entity; do not hide this limitation from users.
- Manufacturer deployment evidence: Liquid AI documents this GGUF for llama.cpp. This confirms upstream compatibility, not a Lastbrowser runtime.

The facts above come from the official [Hugging Face file page](https://huggingface.co/LiquidAI/LFM2.5-230M-GGUF/blob/main/LFM2.5-230M-QAD-Q4_0.gguf), the verified artifact-addition commit, the [official model card](https://huggingface.co/LiquidAI/LFM2.5-230M-GGUF), and its [LICENSE](https://huggingface.co/LiquidAI/LFM2.5-230M-GGUF/blob/main/LICENSE). No weights were downloaded during this verification.

## Current integration boundary

The existing setup endpoint (`localAi.setup`) requires a Space scope for plans and jobs. Its `confirm` operation accepts only an actual private human review bound to the plan digest and license digests. The installer consumes only approved plans. Do not synthesize `private_human_action`, fabricate an individual consent record, or weaken those checks to implement an automatic default download.

The installation-wide 230M bootstrap contract reports `executionUnavailable: true`; it only catalogs/downloads this artifact through `LocalAiInstaller`, and it does not qualify or start that model. A successful download therefore means verified files available, never a ready/runnable local model. The separate scoped 350M qualification path uses the existing pinned in-tree runtime and its own bounded product evidence.

## Implemented integration boundary

`localAi.bootstrap` is an installation-wide operation: Main sends it without a Space scope through the default Sidekick profile and supplies only its canonical `%APPDATA%/Lastbrowser/local-ai/cache` path. Sidekick stores bootstrap state beneath its app-owned state directory, uses the separate `first_run_default_router_v1` policy for exactly the pinned model+license manifest, and delegates file transfer, hash/size verification, locking, and atomic publish to `LocalAiInstaller`. It does not create a Space consent or a `private_human_action` record.

The earlier Main behavior automatically started the 230M file download after the Sidekick handshake. That startup call has now been removed: the 230M model failed its router-quality probe and is not a qualified chat model, so installing it in the background gave the wrong default signal. The installation-wide status/start/retry/cancel API remains for legacy/manual access; existing state and files are untouched. The scoped setup recommendation now exposes a separate exact-pinned 350M chat candidate, which remains unavailable until a fresh per-Space benchmark and profile binding succeed.

No inference runtime is installed or started by this feature. A completed download is verified files available, not a ready local model. No model weights were downloaded during implementation checks.

## Verification status

Main/Sidekick bounded chat qualification and capability projection are implemented and focused tests pass; the FIX2 standard wizard wiring, package build, and current packaged-app smoke remain open. No package build, preview launch, model download, commit, or push was part of this follow-up. This is not a release-readiness claim.

## Follow-up: Windows cache path and actual readiness

The production cache root is derived from Electron's `app.getPath('userData')` after `app.setName('Lastbrowser')`, then Main appends `local-ai\\cache`. For the current default Windows profile, the complete expected weight path is 213 UTF-16 code units:

`C:\\Users\\logga\\AppData\\Roaming\\Lastbrowser\\local-ai\\cache\\<64-char-plan-digest>\\<64-char-artifact-id-hash>\\LFM2.5-350M-QAD-Q4_0.gguf`

The 350M candidate's filename is the same length. This default path is below the legacy 260-character `MAX_PATH` boundary, so changing the cache layout or migrating existing downloads is not warranted by the measured default. A custom or unusually long redirected Windows user-data root was not exercised; this check does not certify such a path.

The old automatic startup download of the 230M artifact is disabled. Its explicit installation-wide API remains available for compatibility/manual access and still verifies only the pinned weights and license. The scoped wizard is responsible for selecting/downloading the 350M candidate and running a separate current-Space qualification; its 3-answer proof is not produced by the global download status.

The default 230M artifact is not admitted to local chat or automatic routing. The recorded router-label probe hit 0/3 expected labels, and the user has separately reported 0/3 on answer-quality fixtures; the latter was not independently rerun in this path audit. Product code requires a trusted chat capability with fresh chat-quality, runtime, adapter, and resource evidence before local short-chat dispatch. The separately qualified 350M candidate's real product-host probe is not evidence that the default 230M model is ready. Keep the 230M setup state and UI wording limited to download/verification status, and keep routing it out of chat until it independently passes the required gates.

## Follow-up: bounded chat qualification contract

The private scoped setup recommendation now returns `chatQualificationCandidate` for only the pinned 350M artifact. Its states describe platform, measured disk space, and measured RAM eligibility for a download; `qualifiedForDevice` and `productAvailable` are always false. This candidate is never evidence that the model router can classify requests. The normal setup plan still requires the existing exact-license review and explicit confirmation before it starts downloading.

Main accepts a runtime review only for that exact 350M artifact/revision, with a 1K context, one request, at most 48 output tokens, 25 seconds, and 768 MiB. A completed response is projected as `productChatQualified=true` only when all three fixed chat answers pass and their typed runtime, adapter, quality, SLO, and measured memory evidence agree. The separate `chat.answer` profile binding is fixed to 1K. A read-only scoped `capability` request reports ready only after that profile and fresh evidence are both present; it advertises local short-chat plus the deterministic simple-task AUTO route, never model-based router classification.

Main also rejects Windows cache paths whose worst-case pinned 350M filename would cross legacy `MAX_PATH`, before creating the Local AI cache or dispatching install/runtime work. The response code is `local_ai_path_too_long`; existing cache contents are preserved. Current default profile was measured at 213 UTF-16 characters.

The desktop renderer has not yet been wired to compose these scoped operations into its ordinary setup wizard. It must present the 350M candidate, license and bounded-test consent, show qualification separate from downloaded bytes, confirm the exact `capability` response before claiming readiness, and omit the old 230M bootstrap from the normal recommendation.
