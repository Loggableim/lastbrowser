# LocalAI product role route

Implemented `runtime/local_ai/role_pipeline.py` and host methods `bind_product_roles`, `execute_role`, `cancel_role`. These use the existing host ModelRuntimeManager, installed artifact SHA validation, approved plan, native adapter/runtime pins, ComputeAdmission owner/generation, actual residency leases, memory/operation evidence and authenticated local server. This is a normal production acquire/execute path, not a bootstrap permit or benchmark.

## Root integration contract

Once per actual LocalAiRuntimeHost, call:

```python
host.bind_product_roles(resolve_current_profile_binding,
                        operation_provider=read_verified_runtime_and_memory_evidence)
```

The resolver `(scope, actor, task)` reads the persisted current profile and returns **ScopedRoleBinding** with actor, profileRevision, task and ModelLoadRequest. Root supplies the actual existing Core owner, generation, current hardware scan, installed approved plan/revision and runtime pins. Neither callback nor ModelLoadRequest may come from the renderer. The evidence provider `(scope)` returns `(tuple[RuntimeSnapshot], tuple[MemoryProfile])`; bootstrap-only measurements do not establish complete production evidence. Empty evidence blocks loads safely.

With that existing scoped owner retained, invoke:

```python
host.execute_role(scope, actor, {
    'operation': 'executeRole', 'clientRequestId': request_uuid,
    'task': 'browser.extract', 'profileRevision': current_revision,
    'input': {'role': 'extract', 'texts': [bounded_page_text]},
    'budgetSeconds': 20,
}, cancel=existing_run_cancel_event)
```

Result returns task, request ID, profile revision and validated role data; no PID/path/private proof. It does not execute tool declarations or save memory. Root should expose a separately allowlisted authenticated task route with only RoleTaskRequest fields, after reusing the current host and existing owner. Runtime lifecycle already closes the product pipeline before manager shutdown.

`cancel_role(scope, actor, request_uuid)` validates the active identity and stops actual model resources. False/`local_role_cleanup_pending` requires retaining the Core compute owner and retrying cleanup; success alone is not a durable model availability claim. Cancellation/deadline/profile change stops actual server resources. A pending cleanup prevents another pipeline load. Loads are sequential, parallel=1; each task unloads before returning. Product handle reuse never bypasses before/after profile revision and resource validation.

## Concrete existing caller adapters

* `tools/independent_browser_tool.py`: page text -> `browser.extract`; approved PNG/JPEG -> `browser.vision`. Keep its existing browser authority and bounded page/screenshot source. No implicit webpage fetch in this route.
* `runtime/independent/native_chat_host.py`: scoped task/tool consumers -> `task.extract` JSON results; current chat provider continues unchanged. Tool effects remain with existing approvals, not local tool-call data.
* `runtime/memory_provider.py` / `memory_manager.py`: scoped `on_memory_write`/`sync_turn` may explicitly request `memory.embed` (`inputKind: document`), then store vectors through existing profile storage; this pipeline never performs the write. `prefetch` may request `retrieval.query` (`query`) after pinned ColBERT support exists.
* `runtime/context_compressor.py` currently calls `auxiliary_client.call_llm`; this route's JSON extraction contract is not a transparent replacement for free-text compression. Owner must explicitly choose an extraction schema/consumer rather than switch a provider behind the user's back.

FirstLaunch presets/Auto must persist the selected role bindings/profile revision and use existing hardware/compatibility recommendations. This module does not create another selection source or modify presets/UI.

## Honest current limits

`task.extract` is bounded extraction, not an Agent capability; non-agent route context is capped at 4096. Agent still requires 65536 through the existing manager. Encoder remains blocked by missing task-head adapter; ColBERT remains blocked by missing approved token padding/skiplist sidecar. Current DLL/license/evidence gaps still prevent readiness. No cloud/network/model download/provider switch is introduced. No existing Browser/Chat/Memory caller has yet been edited to invoke this route: shared owner integration is required above.

No tests, builds, packaging, native model execution or Git mutations were performed for this package.

## Implemented consumer integration (subsequent package)

The prior shared-owner caller gap above is now closed in source for independent runs:

* Registered `independent_browser_extract` / `independent_browser_vision` in the existing browser tool file. Additive Policy ToolSpecs validate only selector/prompt; scope, browser target and model loads cannot be selected by the worker.
* Existing Manager `_execute_tool` preserves governance, read authority, action journals and browser gateway execution. It obtains actual DOM/screenshot output through the original lease, then invokes `web.api.independent.consume_local_ai_tool`. Origin and navigation epoch are revalidated before/after local analysis.
* Registered explicit `independent_memory_recall` in the existing memory tool module. It reads the original resolved Space's configured memory location (`MEMORY.md` or `USER.md`) through existing authorized-file roots; no ambient active Space/profile lookup. Bounded document/query embedding uses matching confirmed `memory.embed` and `memory.query` artifacts and profile revision. It returns cosine-ranked snippets, writes nothing, and does not claim ColBERT support.
* `product_profiles.py` persists confirmed task selections in existing scoped setup flows; approved plan/setup/artifact revisions invalidate stale bindings. `localAi.roleProfile` supports read/draft/confirm in the private backend dispatch. Reads/drafts do not require a model/cache. Confirmation digest binds actor plus exact strict choice. **Main owner must expose this operation only through an actual reviewed human confirmation purpose; do not add a generic renderer forwarding whitelist.** UI/Main confirmation wiring remains outside this backend scope.
* `product_consumers.py` resolves actual stored RunContext, original backend profile/Space binding, current run state and existing ComputeAdmission owner. ContextVar propagation into the pipeline watchdog preserves the same actual parent owner. No second owner is acquired.
* Runtime host factory is shared between original runtime operations and product consumers. Existing host operation/memory evidence provider is preserved; the current default empty provider blocks all model loads. Bootstrap measurements are not substituted.
* Additive Core release hooks unload original-run model handles before admission release. Pending cleanup retains the owner and retries actual cleanup before releasing. A `failed` model state now requires actual cleanup acknowledgement, not just its label.

Actual call chain: tool registry -> ExecutionGuard -> existing worker broker request -> Manager policy/governance/journal -> actual browser lease or scoped memory read -> `consume_local_ai_tool` -> persisted confirmed profile -> `execute_for_run` -> original host `execute_role` -> production manager acquire/execute/unload.

External prerequisites remain: installed exact approved weights/license files; complete MSVC x64 dependency/license closure (missing MSVCP140 + original licensed redist evidence); real operation and bounded memory-profile evidence; fresh private hardware scan. Encoder task head, pinned ColBERT padding/skiplist and agent64K evidence remain blocked. No native weights execution, downloads, tests or builds were performed. Read-only AST parsing found all ten changed Python sources syntactically valid.
