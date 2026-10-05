# D10 Compatibility Core — integration handoff

Implemented in the main checkout on 2026-10-04. These modules perform no I/O,
load no model, grant no agent rights and install nothing. They implement the
compatibility decision, metadata catalog, adaptive preset goals and immutable
residency contracts. A working inference server or First Launch UI is not
implied by a passing compatibility test.

## Callable interface and DTOs

```python
from runtime.local_ai.contracts import (
    HardwareSnapshot, RecommendationRequest, RuntimeSnapshot,
    MemoryProfile, BenchmarkEvidence,
)
from runtime.local_ai.registry import liquid_catalog
from runtime.local_ai.recommendations import recommend
from runtime.local_ai.onboarding_copy import local_ai_copy

# Broker-owned snapshots only: never accept renderer-supplied compatibility,
# installed hashes, cloud connection flags or compute availability as proof.
hardware = HardwareSnapshot.model_validate(hardware_dto)
request = RecommendationRequest.model_validate(request_dto)
result = recommend(hardware, liquid_catalog(), runtimes, memory_profiles,
                   benchmarks, request)
wire = result.model_dump(mode="json", by_alias=True)
copy = local_ai_copy(locale)  # de/en/it/es/fr/pt-BR/ru/ja
```

`Contract` is reused from the existing independent contracts. Input rejects
extra fields, coerced booleans/string byte values and non-UTC timestamps;
tuples stay immutable. DTOs serialize with camelCase. Measurement has
`value: number|null`, `status`, `source`, `observedAt`. Unknown/unavailable
cannot carry an invented number. Hardware carries CPU features plus an
explicit verified flag; GPU detection is distinct from a verified runtime
backend. Measurements older than 30 seconds cannot authorize an allocation.

`recommend(hardware,catalog,runtimes,memory_profiles,benchmarks,request)` is
deterministic for those exact inputs. `now` must be supplied by the broker.
RecommendationRequest includes preset, contextTokens, parallelRequests,
maxParallelModels, availableComputeSlots, per-role roleBudgets, optInRoles,
RAM/GPU ceilings, reserves, verified installed artifact identities and exact
download-consent artifact identities. No setting is written by this call.

Output includes hardwareScanId/catalogRevision, requestedPreset,
automaticRecommendation (nullable), state, selectedArtifactIds,
maxSimultaneousModels and cloudAllowed. Each artifact/role row carries support,
suitability, selectable, allocationReady, downloadReady, actual effective
contextTokens/parallelRequests, measured qualityTier (nullable), peak RAM/GPU
(nullable), download bytes (nullable), reasonCodes and evidenceRefs.

`supported` requires a verified runtime binary/build and exact
artifact-revision/role/placement operation evidence. Nominal GPU identity,
model name, a `/models` response, safetensors/ONNX/GGUF extension or parameter
count is insufficient. Binary/license/file integrity and installed state
remain separate. An estimated memory profile can guide a choice but cannot
produce allocationReady. No performance number or Excellent rating is invented.

## Presets and memory

Lightweight requests retrieval/extraction helpers. Balanced requests a verified
agent plus helpers, favoring measured SLO/quality and smaller total memory.
Max Local favors an actually benchmarked quality tier, never model size alone.
Hybrid requests helpers and permits cloud only when preset=hybrid,
cloudPolicy=explicit_allow and cloudConnectionVerified=true. Custom accepts
only explicitly selected known artifact IDs; unsupported items stay disabled.
Embedding, Vision and Encoder are opt-in roles, not automatically loaded extras.
Automatic recommendation is Balanced only with measured quality/SLO evidence
for an agent; otherwise Lightweight with supported helpers, explicitly permitted
Hybrid, or null. Skip/use-existing-provider must always remain reachable.

Agent context and retrieval chunk budgets are distinct. Supply roleBudgets
explicitly (e.g. retrieve=512), after an actual chunking adapter exists; the core
does not silently truncate a 4096-token task to fit a 512-token retrieval model.

MemoryProfile binds artifact revision, runtime build and hardware scan and
contains fixed host/device allocations, context state coefficients, scratch per
request and tested context/parallel caps. Profiles older than 300 seconds or
outside their tested envelope cannot allocate. Total peaks include all request
state, scratch and 20% padding. Free RAM minus at least 1 GiB browser reserve
and GPU process budget minus current usage and at least 512 MiB reserve define
the limits, additionally bounded by user ceilings. Shared RAM/GPU usage consumes
one physical RAM budget. Shared GPU pools aggregate allocations with the
smallest observed pool budget. Parallel model count is constrained by combined
memory and the existing compute-admission snapshot. Unknown admission means
zero simultaneous models, not fabricated free slots. Game Mode still blocks
inference.

## Actual local evidence and model sources

Installed Electron package metadata is Castlabs 37.10.3+wvcus; its typings expose
app.getGPUInfo('basic'|'complete'), app.getGPUFeatureStatus(), and
process.getSystemMemoryInfo() (RAM values in KiB). No local AI Main adapter was
present in the inspected source. The embedded Python import lookup found
torch/transformers/onnxruntime/llama_cpp/sentence_transformers absent and openai
present. `llama-server` and `ollama` were absent from the queried PATH. This
does not prove no external server exists elsewhere or is running. Existing
`cli/runtime_provider.py` and `runtime/model_metadata.py` contain local-server
discovery; they do not prove embedded inference support. Do not read runtime
auth/config files just to display this hardware screen.

Registry snapshot observed 2026-10-04 01:01 UTC:
[Liquid Nanos collection](https://huggingface.co/collections/LiquidAI/liquid-nanos).
Public Hub `api/models/{repo}?blobs=true` supplied pinned commit revisions,
byte sizes and LFS SHA-256 values. Small pinned LICENSE texts were read and
hashed separately. No model weights, projectors or inference packages were
downloaded. The 2.6B LICENSE text has a different digest from the other checked
models; it is pinned independently. Hashes prove artifact identity, not legal
approval for redistribution.

| Artifact | Role and evidence boundary |
| --- | --- |
| [350M Extract GGUF](https://huggingface.co/LiquidAI/LFM2-350M-Extract-GGUF) | Structured extraction; 229310080-byte Q4_K_M weight file. Not an autonomous general agent. |
| [1.2B Tool](https://huggingface.co/LiquidAI/LFM2-1.2B-Tool) / GGUF | Toolcalling candidate; Pythonic tool template needs a verified product parser/adapter. |
| [2.6B](https://huggingface.co/LiquidAI/LFM2.5-2.6B) / GGUF | Agent candidate; card explicitly excludes agentic coding/knowledge-heavy recommendation. No imported benchmark speed is a local measurement. |
| [8B-A1B](https://huggingface.co/LiquidAI/LFM2.5-8B-A1B) / GGUF | MoE agent candidate; Q4_K_M weights are 5155564768 bytes. Active parameters do not define allocation size. |
| [ColBERT](https://huggingface.co/LiquidAI/LFM2.5-ColBERT-350M) / GGUF | Token vectors/MaxSim; distinct retrieval adapter, not a pooled embedding or chat endpoint. |
| [Embedding](https://huggingface.co/LiquidAI/LFM2.5-Embedding-350M) / GGUF | Single-vector embedding; memory indexing requires separate profile/Space opt-in. |
| [VL-450M Extract GGUF](https://huggingface.co/LiquidAI/LFM2.5-VL-450M-Extract-GGUF) | Pins matching F16 image projector in the same revision. Effective context and architecture remain null pending verified evidence. |
| [Encoder-230M](https://huggingface.co/LiquidAI/LFM2.5-Encoder-230M) | Masked bidirectional model, not a ready intent/risk classifier. Card context=8192, config max_position_embeddings=128000: conservative card limit retained. Task head missing and complete custom-code/tokenizer manifest not yet curated: disabled. |

Model architecture/context metadata is an advertised upper bound, not the
allocated server context. RuntimeOperation must independently prove its limit.
[Liquid llama.cpp guide](https://docs.liquid.ai/deployment/on-device/llama-cpp)
is format/deployment evidence, not an instruction to clone/download during
build. Runtime build artifacts remain in-tree, pinned, packaged offline.

## Precise next integration files (coordinate ownership before editing)

1. New apps/desktop/src/main/local-ai-hardware.ts: validate GPUInfo shape, timeout
   scans, report CPU/RAM via Node/Electron in bytes, and disk only for the actual
   model-cache volume. No device serial numbers. CPU features require a real
   native/runtime probe; CPU brand cannot set AVX2=true. GPUFeatureStatus is
   Chromium rendering capability, not proof of Vulkan/CUDA inference.
2. New in-tree Windows probe/runtime adapter only after its binary/architecture/
   hash/license is verified. `IDXGIAdapter3::QueryVideoMemoryInfo` returns
   **process-specific** Budget/CurrentUsage. The inference process must report
   its own budget, bound to RuntimeSnapshot.processRef and
   AdapterSnapshot.budgetOwnerRef. Main/probe process memory or 32-bit CIM
   AdapterRAM cannot be substituted. Unknown budget remains null and CPU
   diagnosis/skip remains available. See [Microsoft DXGI contract](https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_4/nf-dxgi1_4-idxgiadapter3-queryvideomemoryinfo).
3. Main main.ts/preload.ts, renderer/global.d.ts and sidekick-api.ts: scoped,
   sender/frame-validated scan/request broker, bounded read DTOs. New
   services/sidekick/web/api/local_ai.py owns GET catalog/hardware and POST
   recommendations; register in cli/web_server.py. Renderer passes selection
   goals, not hardware proof, file URLs, executable paths or consent authority.
4. New renderer/components/LocalAiSetupPane.tsx, integrate into existing
   components/FirstRunSetupPane.tsx. New Settings section via panels/
   SystemPanels.tsx (NativeSettingsMain)/App.tsx under renderer ownership. All eight locales
   supplied by onboarding_copy.py; either consume the exact exported catalog
   or generate equivalent typed TS translations. Display support and
   suitability separately, reasons/date/size, estimated vs measured. Unknown
   bytes use a localized unknown label; no zero-byte fake progress. Disabled
   unsupported rows retain accessible explanatory text; optional hiding is a
   display preference, not execution override. Keyboard/320px/long locale QA
   remains a renderer acceptance task.
5. Broker integrates ModelResidencyLeaseRequest/Snapshot with existing
   runtime/independent/manager.py ComputeAdmission and governance admission.
   existingComputeOwnerKey refers to the already held host admission. Verify
   scope, generation, plan/artifact/runtime revisions and process ownership
   atomically with residency admission; no second uncoordinated compute ledger
   and no duplicate acquisition causing parent/child deadlock. Leases are
   contracts only in this package: no model process was started or reserved.
   Profile-bound inference state/KV caches, pressure hysteresis, cancellation,
   revoke/startup cleanup and unknown side effects remain broker work.
6. Installer remains a separate broker action: immutable accepted plan + exact
   actor-bound consent + manifest hashes/bytes/licenses, .partial then verified
   atomic rename, cancellation bounded to its own process/files. This core's
   downloadReady is a precondition, never an install action. No live edit of
   existing runtime, account, environment, installer or provider configuration.

## Verification boundary

`test_local_ai_compatibility.py` uses synthetic immutable evidence and exercises
unknown/expired/foreign-process budgets, runtime/platform/ISA, artifact revision,
context/request limits, unified memory, combined parallel-model memory,
download/staging consent, five presets, measured quality ranking, role budgets,
Game Mode, eight-language copy and pure deterministic no-I/O behavior. It is not
a local model quality, inference performance, hardware scan or installer test.
