# LocalAI dependency and receipt handoff

## Verified local evidence

`notice_summary(repository_root)` verified all 36 pinned payloads in the existing b11377 CPU source bundle. The accompanying source-bundle index brings the resource directory to 37 files. Five component attributions are exposed as a concise `NoticeSummary`; complete texts remain in packaged notice assets.

The local Python bundle contains Microsoft `vcruntime140.dll` and `vcruntime140_1.dll`, both version 14.42.34438.0. Read-only PE analysis found all 22 and 1 respectively required imports in their exports. Exact byte hashes, versions and symbol results are recorded in `local-ai-local-msvc-candidates.json` and `local-ai-msvc-import-export-audit.json`.

No original Microsoft redistribution license/list was located in the inspected runtime/Electron roots. `msvcp140.dll` is missing there. Symbol coverage does not establish loader compatibility, toolset compatibility or redistribution rights. No DLL was copied, loaded or executed.

## Remaining prerequisite

Provide a licensed, pinned Microsoft x64 `vc_redist.x64.exe` with an immutable Microsoft source URL, exact byte count/SHA-256/version, original license and redistribution list, Microsoft signature evidence, redistribution authority evidence and minimum toolset evidence. `LicensedRedistInput` defines this host-only input; `inspect_licensed_redist_input` verifies staged bytes only. It never downloads or installs, and does not grant signature/license/toolset approval.

Microsoft references: [supported redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170), [redistribution requirements](https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files?view=msvc-170).

Dependency and license closure remain false; execution remains unavailable. Complete source-linked license equivalence still requires review.

## Owner integration

Package the complete `apps/desktop/runtime/local-ai/b11377-cpu` directory at the matching resources-relative path, including all 37 files. Preserve the private manifest under `services/sidekick/runtime/local_ai/manifests/`. Packaging changes belong to the release owner.

Runtime inspect includes optional typed `setupManifest`, containing concise attributions and explicit skip/existing-provider choices. The controller/renderer owner must declare and consume this field without loosening DTO validation. A verified source bundle alone must not enable execution.

## Durable receipt contract

Private `localAi.runtime` request `{operation: "receipt", clientRequestId, purposeDigest}` reads only the existing scoped and actor-authorized bootstrap journal. Missing returns `state: "unknown", available: false`; saved pending/completed/failed outcomes return redacted persisted data. Historic receipts remain readable after review expiry, but never renew launch permission.

Receipt handling precedes host creation, cache/generation binding and runtime work. It performs no consent, freshness, hardware, preflight, compute admission, process probing or bootstrap. Targeted receipt tests are prepared for the coordinator's final test batch; none were run in this task.

## Verification boundary

This task used read-only source-byte/hash and PE import/export audits. No model weights, native runtime execution, installation, packaging run, signing, Git mutation or test suite execution occurred.
