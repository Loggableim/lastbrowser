# Local AI onboarding

Lastbrowser bundles llama.cpp b11377 for Windows x64 (CPU and Vulkan). First launch and Settings → Providers offer an optional hardware scan, pinned GGUF download or import, runtime/tool test, and independent Space defaults/fallback consent. Existing Ollama and LM Studio connections remain available.

## Ownership and contracts

- Electron owns one authenticated loopback server on `127.0.0.1:11435`. Runtime code and DLLs ship inside the application; first launch only downloads model weights.
- `apps/desktop/vendor/local-ai/runtime-lock.json` fixes official archive hashes and every extracted file. `prepare-local-ai.mjs` verifies and extracts offline. No build-time download or external backend checkout is used.
- Model URLs include immutable Hugging Face revisions. Downloads and imports require exact length and SHA256 before atomic installation. Interrupted downloads retain partial bytes and validate the entire resumed file. No arbitrary URL/model path is accepted from renderer IPC; import uses a native file picker.
- The local key stays in the application home and is supplied by key file rather than process arguments. Renderer status/configuration never returns it. The dedicated `lastbrowser-local` provider does not overwrite cloud API keys or accept an external base URL.
- Model files/runtime are shared. Space configuration is hashed by its exact workspace path and holds `modelId`, `useAsDefault`, and `allowFallback`. Explicit model picker choices take precedence over the Space default. Disabling a Space does not delete shared weights.
- Engine operations and active local chat usage are exclusive. Chat ownership is retained on an uncertain backend outcome. The engine unloads after five idle minutes and is stopped on application shutdown. A port conflict fails explicitly instead of reusing another server.
- The local agent has an 8192-token context, up to six steps, and only `read_file`, `search_files`, `clarify`, and `browser_snapshot`. Existing tool/browser permission handling remains in force. External auxiliary compression is disabled. Long conversations should start a new chat.
- Fallback requires Space consent, an authenticated model match, and a desktop-reserved engine. Cloud requests can proceed when local fallback is unavailable/busy. The runtime displays the provider switch. After any tool has started or response text has begun, automatic local fallback is refused; an uncertain tool outcome is not replayed.

## Model selection and actual evidence

All models remain candidates for complex tasks; a successful short test is not a broad agent capability guarantee. No model is downloaded without the user's action.

| Model | Download | License | Actual result |
| --- | --- | --- | --- |
| LFM2.5-1.2B Q4_K_M | 730,895,168 bytes | LFM Open License; commercial restrictions, see bundled license | Actual Sidekick file read and correct German result on CPU and Vulkan. A combined arithmetic/tool instruction was not followed reliably. Small limited fallback option. |
| Qwen3-0.6B Q8_0 | 639,446,688 bytes | Apache-2.0 | Simple tool schema passed, but the full agent invented file contents. Blocked for default/fallback activation. Available only for evaluation/import tests. |
| Qwen3-1.7B Q8_0 | 1,834,426,016 bytes | Apache-2.0 | Actual Sidekick file read and correct German result on CPU and Vulkan. Larger limited option. |

On the test machine (Ryzen 9 5950X, Intel Arc A770), the simple schema test measured roughly 33–37 tokens/s for LFM on CPU and around 196 on Vulkan; Qwen 1.7B measured around 14 tokens/s on CPU. These are short measurements, not universal performance promises. GPU VRAM from Windows CIM remains unknown rather than using its unreliable 32-bit memory field. RAM/disk estimates retain a browser/OS reserve, and unknown disk capacity blocks download recommendations.

The full CPU agent smoke blocked non-loopback DNS and socket connections. Both usable candidates returned the file's actual value, used a real read tool, and attempted no external connections. German exact-format and multi-step quality tests exposed the limitations above.

## Reproduction

From the repository root:

```powershell
$env:CI='true'
npm test
npm run verify:store
npm --workspace apps/desktop run build
python -m compileall -q services/sidekick
$env:PYTHONPATH=(Resolve-Path services/sidekick).Path
python -m pytest services/sidekick/tests/test_local_inference.py -q
```

Developer live evaluation requires deliberately downloaded/imported pinned models in an ignored local model directory:

```powershell
node apps/desktop/scripts/evaluate-local-ai.mjs ./output/local-ai-evaluation cpu
node apps/desktop/scripts/evaluate-local-ai.mjs ./output/local-ai-evaluation vulkan
node apps/desktop/scripts/smoke-local-ai.mjs ./output/local-ai-evaluation
```

The Electron smoke explicitly sets a separate application home, tests two Space configurations, and runs an actual renderer → preload → Electron → in-tree backend → local model chat. It does not use the user's existing mail credentials or spaces. Python runtime preparation uses the release's exact wheel lock and an already provisioned wheelhouse; no dependency downloads occur during packaging.

## Release boundary

The local Windows unpacked test package contains both engines, their DLLs/licenses, the model catalog, and the complete Python backend. It does not include model weights or development archives. Only the server executable is included for each backend; unrelated conversion/benchmark executables are excluded.

`verify-local-ai-signatures.cjs` is a read-only `afterPack` gate: when `EVS_REQUIRED=1`, every bundled local AI executable and DLL must have a valid Authenticode signature before a release can proceed. The existing installer signature checks alone do not cover these embedded components.

The user authorized an additional invocation of the already used `Azure/trusted-signing-action@v0.5.1`, with the same Azure signing secrets, before installer packaging. The release workflow selects explicit server/DLL paths, signs them, verifies them, then packages them. See `local-ai-signing-proposal.md`. Functional unsigned development packages are available; signed Store-release readiness is not claimed until this signing path and resulting signatures are verified in CI. A workflow entry alone does not prove Azure account or certificate setup.

UI labels are German/English with English fallback for other locales. First-launch explanations disclose AI-generated output and link to the existing support portal for reporting. Store submission, publisher declarations, and model license eligibility remain release-owner actions.
