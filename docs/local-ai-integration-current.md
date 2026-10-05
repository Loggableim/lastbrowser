# Local AI: current integration contract

Verified checkout evidence, 2026-10-04. This describes optional model-file setup,
not a working local inference engine or a packaged/offline release certificate.

## Ownership and entry points

- Main hardware adapter: `apps/desktop/src/main/local-ai-hardware.ts`.
- Main private controller: `apps/desktop/src/main/local-ai-controller.ts`.
- Backend private dispatch: `services/sidekick/web/api/independent.py`,
  operation `localAi.setup`.
- Setup leaf: `services/sidekick/web/api/local_ai_setup.py`.
- Immutable preferences/plans: `services/sidekick/runtime/local_ai/setup.py`.
- File downloader: `services/sidekick/runtime/local_ai/installer.py`.
- Hardware/runtime broker: `web/api/local_ai.py`, `runtime/local_ai/snapshots.py`.
- Pure recommendation contracts/registry: `runtime/local_ai/`.

No second Space identity, profile database, agent executor or inference scheduler
is created. Setup data and receipts use the actual ProfileHub's existing
`state.db`: `ia_connection_setup_flows` and `ia_request_results`. Download jobs
use existing `ia_resource_leases` with `run_id=NULL`; downloads consume no
ComputeAdmission inference slot. Their events use `connection_setup_changed`,
with `payload.capabilityId="local-ai"` and `payload.job`.

## Public DTO versus private authority

The native Assistant sends `{action:"setup", request:<selection>}`. Main resolves
the actual backend profile, native Space and browser profile from its existing
binding. It validates the sender/frame and rechecks ownership after awaits.
Renderer input contains no scope proof, permission object, URL, cache directory,
runtime path, hardware proof or human-authority flag.

The leaf callable is:

```python
handle_local_ai_setup(
    profile_hub, scope, actor, payload,
    private_human_action=None, cache_resolver=None, installer_runner=None,
) -> dict
```

`scope` is the actual immutable Scope, `actor` is the authenticated profile name.
Every access uses `ProfileHub.by_scope(scope, actor)`; there is no global active
profile/environment switch. Injected callbacks are host code, not JSON fields.
Trusted bootstrap may call `register_local_ai_setup_runner(profile_hub, runner)`
before the first setup operation. The exact registered runner's setup/catalog
is then shared by every operation, including get/select/plan/confirm. Registration
requires an actual matching ProfileHub and is idempotent only for the same runner;
an existing different owner or a shutting-down hub is rejected. This is not a
public catalog/transport injection endpoint.

| operation | Allowed request fields besides operation | Response field |
| --- | --- | --- |
| get | none | preferences |
| select | choice | preferences |
| plan | expectedRevision, clientRequestId | plan |
| confirm | planDigest, licenseDigests, clientRequestId | consent |
| start | planDigest, clientRequestId | job |
| cancel | jobId, clientRequestId | job |
| status | optional jobId, including null | job or jobs |

`choice` accepts `expectedRevision`, UUID `clientRequestId`, `decision` local/skip,
`preset` lightweight/balanced/max_local/hybrid/custom or null, and `artifactIds`.
Skip contains no local selection. Revisions use CAS; request UUIDs have durable,
atomic replay receipts. Reusing a UUID with changed content fails.

The response includes `operation`, the table's result, `skipAvailable:true` and
`existingProviderAvailable:true`. Those flags mean navigation choices exist;
they do not certify a connected provider or account authentication.

## Recommended First Launch and Settings flow

1. Read the current scoped preferences and obtain a fresh Main hardware scan.
   Render unknown measurements as unknown, not zero. Recommendation requests
   contain user goals/budgets, not supplied hardware/runtime/installed proofs.
2. Offer Skip/existing provider and the five presets. Show unsupported rows and
   reasons accessibly. A model selection does not grant any permission or prove
   runtime compatibility. Optional encoder/embed/vision roles require opt-in.
3. Save the exact selection with CAS and a fresh request UUID. On conflict,
   reread; do not overwrite another Assistant's newer choice.
4. Request an immutable install plan. Display exact artifact revisions, file
   sizes, total bytes, license source/digest and current runtime-unavailable
   status. Review and license confirmation are separate from download Start.
5. Confirm this exact plan via an explicit human action. The Main receipt binds
   scope/profile, actual WebContents/mainFrame/navigation, selection epoch,
   digest, sorted license digests and a bounded review lifetime. The private
   backend callback must immediately attest `(scope, planDigest)`; it must not
   wait for UI/network inside the short DB transaction. Never pass a renderer
   `human=true`, executable path or download URL as authority.
6. Start only after the explicit download click and validated confirmation. The
   backend reads the currently approved plan again; the renderer cannot replace
   any manifest entry. New Start UUIDs are explicit attempts; replaying the same
   UUID returns its existing job, including its actual terminal state.
7. Poll scoped status or consume the existing scoped event stream. Cancel first
   shows `stopping`, then `cancelled` only after real downloader/FD exit. During
   a blocked read the UI can remain stopping up to the transport timeout.
8. After complete, show file installation separately from runtime availability.
   Later inference integration must verify the loader/backend/operation and
   artifact hashes again before claiming usable execution.

Use the existing eight-language copy in `onboarding_copy.py` and the renderer's
equivalent typed translations. Error codes are machine reasons to localize;
do not expose raw backend exception paths to the user. No separate model zoo
or assumed "Excellent" rating is required.

## Cache and download trust boundary

Main's `cacheDirectory()` derives `userData/local-ai/cache`, creates its own
components and checks canonical containment. The private backend dispatch
checks the actual absolute existing canonical root and rejects linked ancestors.
Main must bind the selected actual scope before its await/recheck sequence;
the private root cannot originate in renderer input. A shared application cache
is safe to address because planDigest includes the complete actual Scope;
job scope and the captured cache remain immutable across UI profile switches.

The installer accepts only the approved plan digest and a trusted constructor
`cache_resolver(scope)`. It captures that resolver's actual path before starting
the background task. It never accepts a renderer URL or executable path.

Plan validation binds catalogRevision, exact repo/model ID, 40-hex artifact repo
revision, filename, byte count, SHA256 and license digest/source. Incomplete
manifests, unknown integrity, modified catalogs and executable/runtime manifests
fail closed. Encoder weights without the complete task-head bundle stay blocked.
Displayed license-digest confirmation does not grant commercial redistribution
rights or establish that a runtime binary can legally be redistributed.

Product HTTP accepts only HTTPS, port 443/default, no userinfo/control characters,
and these exact redirect hosts: huggingface.co, cdn-lfs.huggingface.co,
cdn-lfs-us-1.huggingface.co, cdn-lfs-eu-1.huggingface.co,
cas-bridge.xethub.hf.co. A new CDN fails closed until explicitly reviewed.
Proxy environment, cookies and account credentials are not inherited.
The socket timeout is 20 seconds, reads at most 256 KiB, and manifest bytes bound
the stream. This is a per-read timeout, not an overall large-file download SLA.

Content-Length, identity Content-Encoding and exact 206 Content-Range are checked.
Duplicate size/range/encoding headers, a range attached to a 200 response,
truncation, excess bytes and hash mismatch fail. A 200 response to a resume request
restarts the partial file; a valid 206 resumes the exact offset. A final file
whose hash is wrong is rejected and is never silently overwritten.

Files stay inside planDigest/artifact-ID-hash paths. All Windows ancestor
directories are opened without FILE_SHARE_DELETE and with OPEN_REPARSE_POINT;
reparse/junction/symlink ancestors fail. Native tests show an actual cache rename
is blocked while a downloader is reading. File opens validate regular type,
single hardlink and matching inode/device; special DOS names, ADS/path traversal
and linked files fail. File checks and directory handles protect the Windows
path chain; a process with the user's own privileges can still edit user files.
The inference loader must therefore rehash its actual artifact handles, rather
than treating an old installed DTO as permanent security proof.

The same-plan native OS file lock prevents duplicate installation even across
processes. Partial bytes are flushed before reporting written progress, so an OS
process kill can resume the observed bytes. Full content is SHA/size verified,
fsynced, atomically renamed and checked again before claiming installation.
This proves tested process-crash recovery, not survival of every power failure.

Disk admission uses free bytes on the actual canonical cache volume and requires
two times the bytes of files still missing for conservative staging. Finished
files are reverified without a second network request or new staging capacity.
Relevant reasons include `cache_disk_insufficient_for_staging`,
`cached_file_hash_or_size_mismatch`, `resume_range_mismatch`,
`download_length_mismatch`, `ambiguous_download_headers`,
`download_encoding_rejected` and `download_origin_rejected`.

## Jobs, byte counts and shutdown

JobView contains actual scope, planDigest, jobId, revision, state, totalBytes,
nullable downloadedBytes/verifiedBytes, ownerPid/processStart/generation,
leaseId, timestamps, sanitized errorCode and `executionUnavailable:true`.
Initial byte counters are null. `downloadedBytes` measures newly written bytes
in this attempt, excluding partial bytes from earlier attempts. `verifiedBytes`
counts complete files whose hashes passed. Neither is a fabricated inference
benchmark; resumed jobs can transfer fewer bytes than the complete plan total.
Use phase plus verified totals for overall progress, and label new-transfer
counts explicitly. Byte events are coalesced at 250 ms/1 MiB; phase changes are
immediate. File integrity and current scope/consent are rechecked before publish.

```python
shutdown_local_ai_setup(profile_hub, timeout=20) -> bool
```

Stop new dispatches before invoking this host hook, and call it BEFORE
`ProfileHub.close()`. It rejects new Starts, requests own cancellation, joins
outside DB locks, and retains the global runner on false. It then inventories
all existing registered profile DBs readonly; a foreign live owner's active job
or unverifiable inventory also prevents a stopped ACK. No DB is created by
shutdown. Cleanup of the runner map happens only on true. If false, retain the
same hub/stores and retry after real IO exit; closing them early destroys the
ability to persist the final stop acknowledgement. A shutting-down hub stays
closed to new Starts; restart with the normal new host lifecycle.

Recovery compares actual OS PID plus creation identity (Windows process times;
Linux start ticks). Only a dead owner or a reused PID with a different start time
marks interrupted and releases its lease. Empty thread lists or a new local
runner generation are not crash evidence. The existing IndependentStore recovery
now excludes valid `local_ai_download` leases from generic manager-generation
cleanup; the download leaf owns their OS-proof recovery.

## Verification and remaining work

The local-AI test set covers real ProfileHub DB persistence/reopen/CAS/atomic
receipts, immutable plans and scoped consent, tiny in-memory downloads, local
loopback HTTP (fixture-only transport substitution), malformed HTTP responses,
actual socket timeout, native Windows file locks/junctions/ancestor pinning,
blocked IO cancellation and shutdown ACK, and two actual OS processes competing
for one plan, process kill, persisted interrupted state, partial resume and stale
consent. Product HTTPS restrictions are unchanged by the loopback fixture.
All child helpers are hidden on Windows and only their own Popen processes are
terminated. No external weights/runtime binaries or accounts are used.

The lifecycle/leaf subset now passes 29 tests; the final full test run is recorded
below. The command uses the existing embedded Python and available local pytest;
no dependency installation is performed.
Python syntax checks cover the changed leaf/downloader modules. These checks do
not prove renderer QA, real Hugging Face TLS/CDN downloads, a packaged installer,
fully offline runtime dependencies, commercial licensing or model quality.

Current in-tree inference inventory remains unavailable. GPU names/rendering
features do not prove inference support or GPU process memory budgets. A future
runtime package needs a pinned redistributable manifest, verified actual loader,
supported operations/tool adapter, process-owned memory measurements and scoped
quality/latency benchmarks. Model download completion must keep that distinction.

### Final current checkout verification

Final run: **103 passed, 0 skipped, 14.85 seconds**. The lifecycle/leaf subset
passed 29 tests, including the trusted factory shared by every public operation.
AST syntax checks passed for the changed setup leaf and downloader.

Test modules in the completed run:

```text
services/sidekick/tests/test_local_ai_system_lifecycle.py
services/sidekick/tests/test_local_ai_setup_leaf.py
services/sidekick/tests/test_local_ai_setup.py
services/sidekick/tests/test_local_ai_installer.py
services/sidekick/tests/test_local_ai_broker.py
services/sidekick/tests/test_local_ai_compatibility.py
```

The run used `apps/desktop/runtime/python/python.exe -B`, the existing local
pytest import path, and `pytest.main([...,'-q','-p','no:cacheprovider'])`.
These are source and controlled-IO tests, not a Store/package or real model
inference validation. Other agents' Main/private-dispatch wiring was inspected
for the scope/cache/shutdown contract; its separate end-to-end result belongs
to that integration owner.

## Native runtime build and resource boundary

New callables live in `runtime/local_ai/runtime_probe.py` and `resources.py`.
The actual packaged/runtime directory search found no llama-server, ggml,
Vulkan/CUDA runtime binaries or GGUF weights. The only llama name matches in the
Python package were test source filenames, which are not a runtime. No PATH
search, external provider query, model download or runtime installation was used.

The build pipeline must supply these explicit external inputs before native
preflight can become available:

- An existing directory such as
  `apps/desktop/runtime/local-ai/llama-cpp/<BUILD_ID>/`, deployed by the normal
  offline package builder, not cloned or synced by tests/runtime.
- A trusted `RuntimeBuildManifest`: buildRef, exact 40-hex sourceRevision,
  packageRelativeDir, target OS/architecture, declared cpu/vulkan/cuda variants,
  exact binary/library/license filenames, positive byte sizes and SHA256 for
  every file, expected version/help markers, licenseSource and the actual
  redistributionReviewRef. There is no accepted placeholder hash/default build.
- The actual llama-server executable plus the exact required ggml/backend/DLL
  closure for that build, its compiler/runtime dependencies, license files and
  an offline build/release attestation. The current Python wheelhouse alone is
  insufficient. Driver/GPU-process budget proof is a separate runtime input.
- Verified pinned model artifacts at the scoped approved-plan cache path,
  including projector/head/config assets where needed. Downloaded weights alone
  cannot establish supported model architecture, tool parsing or agent quality.

`inspect_runtime_build(root, manifest, scope, observed_at, run_preflight=False)`
returns immutable per-file actual hash/size facts and manifestDigest. When
explicitly requested and all integrity/platform checks pass, it runs only the
exact pinned binary with `--version` and `--help`, each within a bounded hidden
own-process budget. Output is capped at 64 KiB and stored as a digest rather than
unsanitized CLI diagnostics. Windows owns a KILL_ON_JOB_CLOSE Job Object for
the probe and its descendants; POSIX owns a process group. No executable comes
from renderer input, PATH or a remote model repository.

`integrity_verified` means bytes match the trusted manifest.
`preflight_verified` additionally means the bounded version/help commands
returned the expected markers. Neither means `operation_verified`:
`runtime_snapshot_from_preflight()` keeps state detected, backend unknown and
operations empty. Actual model-load/token/tool/vision tests and scoped memory
measurements must supply that later proof. Missing/drifting/unsafe inputs remain
unavailable/blocked, with no automatic cloud or downloaded runtime fallback.

`LocalAiResourceManager(setup, hardware_scans, cache_resolver, repository_root,
generation_provider=..., manifest_provider=..., operation_provider=...)` is a
read-only governor, not an executor, queue or new admission pool. Its private
`inspect()` binds the current approved plan and exact installed hashes to a fresh
actual Space hardware scan, existing ComputeAdmission owner/scope claims and
the real manager generation. Runtime operation proof must match a current pinned
runtime build AND its binary hash. Caller-supplied fingerprints, compute keys,
runtime manifests and evidence providers are not renderer request fields.

Agent/tool-role admission requires at least **65,536 context tokens** in both
artifact capability and the actual verified runtime operation. A 32k artifact is
blocked, even if a tiny synthetic request would fit. Helpers keep their own role
budgets. A model-card context ceiling does not replace actual loader evidence.
Actual RAM/GPU-process observations and measured role memory profiles feed the
existing compatibility core; missing memory/backend/operation evidence stays
unknown or blocked. The report has explicit pressure state, current shared-owner
counts, available slots, integrity status and reasons, and never grants cloud.

This report is an observation, not an acquired inference lease. Before execution,
the actual owner must still revalidate its live generation, existing shared
ComputeAdmission ownership, artifact handles, hardware budget and actual runtime
operation. Nothing is automatically loaded during onboarding. The private
ModelRuntimeManager now manages explicitly acquired residency as described below.

Additional focused verification: seven runtime/resource tests passed, including
actual existing-Python hidden probes, output limit, native timeout and descendant
process exit acknowledgement, manifest/library drift, actual cache corruption,
real shared ComputeAdmission owner/scope/generation and 32k agent rejection.
These helper tests do not claim an installed llama runtime or model benchmark.

Combined current verification after this boundary was added: **110 passed,
0 skipped, 17.08 seconds**, including all seven runtime/resource tests and the
previous 103 setup/download/broker/core tests. All `runtime/local_ai/*.py` files
also passed AST syntax parsing. The runtime timeout test explicitly hides both
its parent helper and nested child on Windows.

## Scoped model residency and existing runtime reuse

`ModelRuntimeManager` exposes inspect/acquire/wait/execute/refresh/unload/close.
Handles freeze scope, approved plan, artifact revision, runtime binary hash,
existing ComputeAdmission owner and its actual generation. States are uninstalled,
downloaded, verified, loading, ready, evicting, stopped and failed. Loading holds
model and runtime file handles and pinned parent directories, verifies actual
bytes, starts only its owned hidden child and waits for authenticated loopback
health. Owner or scope-consent revocation evicts even an idle child. Unload denies
new operations and acknowledges stopped only after request drain, process exit,
file closure and release of its existing ProfileHub residency lease. A timed-out
close remains evicting and must be retried before closing the ProfileHub.

Root selected exactly one backend process owner, ModelRuntimeManager/LlamaCppSession.
Do not wire the global Main LocalAiManager in parallel. Root must call refresh with fresh
hardware evidence before further work and close before database shutdown. The
residency lease is deliberately fail-closed after a host crash; its presence
alone is not proof a process is dead and must not be cleared by generic recovery.

Typed adapters support agent/extract/vision and verified vector/matrix shapes
for embedding/retrieval. Product operation and memory evidence must bind the
same adapterRef; pooling and query/document prefixes come from that private
verified declaration. Tool calls are returned as data, never executed here.
Benchmarks require explicit opt-in and bounded sample counts, report measured
cold start, p95 and observed own-process working set. Quality/SLO proof remains
unknown and recommendationEligible stays false. Fixture children are explicitly
synthetic, never a model-quality or Smart recommendation proof.

The existing `.worktrees/local-ai-onboarding/apps/desktop/vendor/local-ai`
contains reusable pinned b11377 CPU and Vulkan archives and extracted runtime
files. Read-only inspection verified both archive hashes and all 51 CPU/52 Vulkan
file hashes, plus three existing license files. `legacy_runtime.py` projects those
pins and ZIP byte counts without extraction or execution. The CPU assets have now
been explicitly materialized in the active checkout at
`apps/desktop/runtime/local-ai/b11377-cpu`, with all original manifest byte/hash
pins preserved; no external download was needed. The legacy lock still lacks an exact source commit and
reviewed dependency license closure. Its three catalog models declare only 8192
context tokens, so they provide no 65536-token agent admission evidence. Reuse
the existing packaging producer while supplying actual role/context/memory
proof; do not invent provenance or automatically load its models.

## Explicit private bootstrap and actual b11377 preflight

`bootstrap_benchmark(manager, BootstrapPurpose, actor=..., private_human_action=...)`
breaks the first-load cycle without changing ordinary acquire's admission gate.
The private single-use permit binds the manager and the entire immutable load
request; a renderer cannot supply it. Human consent binds scope and the purpose
digest. The approved pinned files, existing owner/generation, CPU adapter,
fresh measured available RAM with 1 GiB browser reserve, native preflight and
configured limit are required before startup. CPU bootstrap permits one request,
at most 4096 configured context tokens and 30 seconds, with observed own-process
RAM monitoring and actual exit/IO acknowledgement.
Windows also enforces own-process and aggregate Job Object committed-memory
ceilings; this complements the sampled working-set guard for mapped pages.
All inputs are fixed controlled strings or a fixed tiny image, not user data. Scope/owner revocation retains the
ordinary lifecycle guards. Bootstrap handles are never advertised available.

The result returns a role-specific typed operation proof with the tested token
bound and a fresh actual working-set observation. Synthetic sessions return no
product operationProof. Neither a sparse prompt nor a peak sample proves the
maximum context/scratch envelope: memoryEnvelopeVerified/contextCapacityVerified
remain false, and qualityPassed/sloPassed unknown. Root must retain these missing
gates rather than promote this observation into a full MemoryProfile or Smart
recommendation. Agent/encoder bootstrap remains blocked pending the actual
tool/head adapter test. A 32k model remains blocked for the 64k agent role.

The new private leaf `create_local_ai_runtime_router` exposes inspect/bootstrap/
unload. Host dependencies authenticate Main and derive scope, actor and the whole
bootstrap purpose; there are no renderer runtime/cache/owner overrides. Root
owns transport registration and lifecycle integration.

On 2026-10-04 the actual b11377 CPU runtime passed hidden `--version` and `--help`
from copied, own staging with 3-second command budgets and no weights. Staging and
all probe processes were removed after real exit. The private manifest at
`docs/local-ai-runtime-b11377-private-manifest.json` pins 32 actual server/library/
license files. It includes the bundled LLVM OpenMP license (Apache 2.0 with LLVM
exceptions) and the existing llama.cpp MIT license. Native PE import inventory in
`docs/local-ai-runtime-b11377-native-imports.json` records all 30 native files,
including delay imports. External imports include Windows system/CRT API DLLs,
msvcp140.dll, vcruntime140.dll and vcruntime140_1.dll. Running on this machine is
not proof these dependencies are bundled or available on clean/offline Windows.

The [official release](https://github.com/ggml-org/llama.cpp/releases/tag/b11377)
links [exact source commit](https://github.com/ggml-org/llama.cpp/commit/9bf55f4a3677af697d914d959eaa70f93cfdc494),
verified live. Exact-source LICENSE/vendor files could not be retrieved through
the available read-only web fetch; no master-branch license is substituted. The
remaining statically linked vendor attribution closure and Microsoft runtime
redistribution provenance remain explicit packaging gates. The manifest's
redistributionReviewRef is inventory-only/pending, not a release approval.

Model residency leases now persist host PID/OS creation identity before launch
and child PID/creation identity immediately after Job Object assignment, before
health. `recover_model_leases(store, scope)` releases only after OS evidence that
both original processes are dead or their PIDs have been reused. Live, unknown,
missing identity, launchPending and scope/resource mismatch remain blocked.
Generic store recovery must exempt active local_ai_model/run_id NULL/ownerKind
local_ai_model leases, just as download leases. No process is killed by recovery.

Current combined verification: 139 local-AI tests passed, zero skipped, in 34.10
seconds; AST parsing passed for every local_ai module and the new runtime leaf.
This includes actual fixture startup/health timeout, oversized child memory
failure, actual process/creation identity, two-process recovery conditions,
private consent/purpose gates, scope-isolated leaf routes and PE import parsing.
Only the separate native version/help probe used real b11377 binaries; all model
operation tests used explicitly synthetic fixtures. No weights were loaded.
