# Private LocalAI transport and role adapter handoff

## Root delegation entry point

Use `web.api.local_ai_runtime_host.handle_local_ai_runtime(hub, scope, actor,
request, cache_root, repository_root, hardware_broker, private_human_action=None,
core_generation=...)`. The last generation is keyword-only and optional: without
it the helper resolves Root's existing independent service/manager and requires
the same ProfileHub. Root may pass its actual `_GENERATION` explicitly. No
synthetic generation or separate compute scheduler is created.

The private outer operation is `localAi.runtime`, payload `{request, cacheRoot}`.
Root validates canonical Main-owned cache/nonce and resolves actual Scope/actor.
The inner request forms are:

| operation | Strict request fields |
| --- | --- |
| inspect | operation |
| review | operation, artifactId, role, scanId; optional contextTokens <=4096, budgetSeconds <=30, ramLimitBytes |
| bootstrap | operation, purposeDigest, clientRequestId UUID |
| unload | operation, handleId UUID |

Review derives the actual current approved install plan from the existing setup
database and the current pinned artifact. A durable immutable purposeRef/record
binds scope, actor, actual Core generation, cache-approved plan/hash, role/model
adapter, fresh scan and private future owner key. Its digest includes this record
and expires within 30 seconds, or earlier at hardware scan expiry. It acquires no
compute during review. Missing native files or pending release/license closure
return honest unavailable state and do not mint a usable purpose.

The separate private Main human callback must attest the exact REVIEW RECORD
digest for the currently selected scope; renderer knowing a digest is not
authority. Bootstrap journals a running result before model IO, consumes the
purpose once, then acquires `ComputeAdmission.acquire_legacy` with the actual
scope and unique benchmark owner. Same UUID returns the durable result without a
second load; another UUID against the consumed review is denied before model IO.
Recovered running UUIDs remain running/unknown while the original host is alive
or unknown; actual host-death/PID-reuse yields interrupted, never automatic replay.
Internal journals/process identities and full measured evidence stay private.

Review projects purposeDigest, artifactId/artifactRevision, role, contextTokens,
parallelRequests, budgetSeconds, ramLimitBytes and runtimeBuildRef, plus purposeRef
and expiresAt. Bootstrap returns FLAT projected metrics and state, never nested
raw result/owner/PID/path/proofs. Unload echoes handleId and actual stopped.
`shutdown_local_ai_runtime(hub, timeout=20)` must return true BEFORE ProfileHub or
Core stores close; false retains ownership and requires retry. Compute is released
only after the operation has finished and real child/IO/file/lease exit is
acknowledged. Empty registries are not stopped proof: shutdown inventories active
model leases in all registered existing databases read-only.

One package-owned manifest metadata JSON lives under
`runtime/local_ai/manifests/b11377-cpu.json`. Existing pinned CPU executable assets
have now been explicitly copied offline into the expected native source directory
(see below); there are no automatic runtime/model downloads. Root retains ownership of packaging,
private bridge/controller transport, authentic user-click receipts and shutdown
ordering. `test_local_ai_runtime_host.py` provides executable endbatch checks;
this DI increment has been AST-parsed/imported and the manifest loaded, not
subjected to a new broad test run.

## Materialized native source bundle

`apps/desktop/runtime/local-ai/b11377-cpu` now contains all 32 manifest-pinned
native/library/original-license files, plus five source-bundle files:
THIRD-PARTY-NOTICES.txt, embedded-notices.json, native-imports.json,
runtime-build-manifest.json and source-bundle.json. The standalone original
llama.cpp MIT and LLVM OpenMP notices retain their exact original bytes/hashes;
the third-party notice contains the five actual embedded notices extracted from
the pinned release's llama.exe. Source-bundle metadata pins each payload file and
maps release/source/archive identity to these notices and external dependencies.

`materialize_cpu.materialize_existing_cpu` was explicitly invoked once for this
integration. It verified the existing CPU archive (19,352,210 bytes, SHA256
00b6a76bf3188a3c693c3f6bd4bff20b12d02780cc800d6f67397e69ad744d53), compared the
observed 32-file manifest against private expected metadata, pinned directories,
used exclusive file creation, fsynced and verified each target byte/hash. It
created 37 files; no existing target file was overwritten. There was no executable
start, model-weight load, network download, signing or System32 copy.

Packaging owner must include the complete directory and its notice/source-bundle
metadata through the existing offline resource hook. No packaging-owner file has
been changed here. The runtime release review ref remains pending and the
automatic unavailable license gate is preserved. Remaining external gates:
exact-source/complete linked and UI license equivalence, authorized Microsoft CRT
redistribution, and actual clean offline dependency closure. Materialized native
bytes alone do not satisfy those release conditions.

## Separate low-level leaf helpers

The following direct router helpers are not the product Root entry point above.
Their smaller BootstrapPurpose digest is separate from the durable Root review
record digest; use the Root host entry for production replay/one-use semantics.

Only authenticated Main reaches this leaf. Host derives Scope, actor,
ComputeAdmission owner/generation, scan, approved plan, cache and manifest.
Renderer never supplies paths, URLs, owner keys, scope IDs or runtime arguments.

| Operation | Input | Result |
| --- | --- | --- |
| GET /local-ai/runtime/review | none | purposeDigest, artifactId, artifactRevision, role, contextTokens, parallelRequests, budgetSeconds, ramLimitBytes, runtimeBuildRef |
| POST /local-ai/runtime/bootstrap | `{ "purposeDigest": "64 lowercase hex characters" }` | Private measured result/evidence; 409 if host-derived review changed, 403 without authentic human approval |
| GET /local-ai/runtime/inspect | none | Sanitized handles: handleId, artifactId, artifactRevision, role, state, revision, available, synthetic, reasonCode, coldStartMs |
| POST /local-ai/runtime/unload | `{ "handleId": "UUID" }` | stopped boolean; false requires retry and forbids database shutdown |

`resolve_bootstrap(scope, main_auth)` returns `(BootstrapPurpose, actor)`.
Purpose contains purpose=`controlled-local-role-benchmark`, the immutable
ModelLoadRequest, budgetSeconds (1..30), ramLimitBytes (16 MiB..16 GiB).
Digest is `digest_json(purpose)`: canonical typed JSON including full scope,
plan/artifact revision, runtime build/hash, role/context/parallel, scan and existing
owner/generation. Main must persist an authentic user click for that exact scope
and digest; `private_human_action(scope, digest)` checks it. Knowing the review
digest does not grant consent. Changed scan/owner/plan/settings require new review.

The full bootstrap result stays private for Root evidence storage. Before sending
to Renderer, use `project_bootstrap_result`: evidenceRef, observedAt, coldStartMs,
p95Ms, samples, peakObservedResidentBytes, operationShapeVerified, synthetic,
qualityPassed, sloPassed, recommendationEligible, contextCapacityVerified,
memoryEnvelopeVerified. No compute keys, PID, configuration paths, input or raw
model response are exposed by that projection. Consent and proof stores are not
implemented by this leaf; Root owns them.

## Exact model role plans

`model_adapter_plan(artifact, role, manifest)` accepts only an unchanged artifact
from the pinned Liquid catalog and the exact b11377 CPU build/source. Its
prepared state is a launch/payload declaration, never actual operation support.
`bind_model_manifest` supplies the single selected model's adapter to the same
backend process owner. Artifact ID/revision bind adapter and subsequent evidence.

| Pinned model family | Role plan | Remaining gate |
| --- | --- | --- |
| LFM2-350M-Extract GGUF | Text extraction through /v1/chat/completions with JSON-object output constraint | Actual weights/typed output, memory/context and quality proof |
| LFM2.5-Embedding-350M GGUF | CLS pooling, query/document prefixes, 1024-dimensional vector, 512 token input ceiling | Actual weights and shape/memory proof |
| LFM2.5-ColBERT-350M GGUF | Native /embedding, pooling none, 128-dimensional token matrices | Pinned tokenizer pad ID and skiplist configuration missing: blocked |
| LFM2.5-VL-450M-Extract GGUF | Inline image and pinned projector; projector GPU offloading explicitly disabled | Actual weights/projector, image/context/memory proof; unknown catalog context stays unknown |
| Agent models | Blocked | Actual 64k tool/agent adapter test; no metadata inflation |
| Encoder | Blocked | Actual classifier/task head and its adapter |

There is no separate free-text helper role in the current catalog; text support
here means the declared extraction role. No extraction model silently becomes an
agent or general chat fallback.

The [dense model card](https://huggingface.co/LiquidAI/LFM2.5-Embedding-350M)
documents CLS output and asymmetric prefixes. The
[ColBERT model card](https://huggingface.co/LiquidAI/LFM2.5-ColBERT-350M-GGUF)
documents native token embedding requests. `execute_colbert` implements bounded
query padding, document truncation/skiplist filtering, matrix alignment and L2
normalization, requiring an exact artifact-bound host-verified token policy.
Registry admission remains blocked until those configuration bytes are pinned in
an approved artifact plan. Generic OpenAI vector responses cannot substitute for
the native token matrix. Current official server documentation is supporting
API reference, not proof that real b11377 weights have been exercised. Exact
revision model-card/source fetches remained unavailable; live card observations
are explicitly not immutable operation evidence.

## Actual release notices

`native_licenses.embedded_release_notices` verifies cpu/llama.exe against the
existing archive/file pins and reads its embedded notices without executing it.
The actual file contains LLVM OpenMP, llama.cpp, jsonhpp, BoringSSL and cpp-httplib
notices (36,313 bytes); individual notice bytes/hashes and text are preserved in
`local-ai-runtime-b11377-embedded-notices.json`. This fills the observed static
attribution inventory beyond the two original standalone license files.
Exact-source equivalence, complete linked/UI dependency attribution, Microsoft
CRT redistribution and clean offline dependency closure remain unverified.
No System32 files were copied and no installer/signing changes were made.

Focused validation: 22 adapter/ColBERT/bootstrap tests passed in 6.47 seconds.
The preceding focused model-manager/adapter/bootstrap run passed 31 tests in
16.50 seconds. No new broad suite or real model-weight load was performed.
