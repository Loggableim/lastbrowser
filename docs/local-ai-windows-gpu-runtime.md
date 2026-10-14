# Local AI: Windows GPU runtime boundaries

The Store's bundled engines currently target Windows x64. Linux requires its own
engine artifacts and platform integration; Windows executable bundles are not a
Linux fallback.

## Inventory and recommendations

Main invokes the bundled Python inventory helper with a fixed executable and
arguments. The helper loads system DXGI/Vulkan libraries, identifies physical
adapters by DXGI LUID and Vulkan device UUID, and excludes software adapters.
Names and Electron array positions do not establish device identity.

Dedicated capacity is a hardware measurement. The recommendation allowance is
75% of that capacity, without adding separate GPUs' memory together. Inventory
does not claim an inference-process budget or successful model execution.
Multiple dedicated adapters require an unambiguous selection; the current
launcher does not guess between them.

Both pinned ggml implementations interpret `GGML_VK_VISIBLE_DEVICES` as a raw
Vulkan physical-device filter. The private child environment exposes exactly
the verified adapter. Its subsequent `Vulkan0` alias refers to that filtered
device, not the computer's unqualified default GPU.

## Process admission

1. Verify scope, model/license/engine identity, current resources and adapter
   identity. Assign the suspended child to its own Windows Job with its RAM cap
   before resuming it. Retain 4 GiB of system RAM.
2. Enter a bounded `INITIALIZING` phase. A fresh suspended Windows process can
   return `STATUS_INVALID_PARAMETER` from D3DKMT until its OS loader runs. This
   phase is not a successful process-budget observation.
3. Poll the held own-process handle for at most one second. Tolerate only that
   initialization status; cancellation, other failures or timeout stop the child.
   Bind the first successful observation to its PID, creation time and LUID.
4. Require projected total use `max(planned use, observed use)` to fit within
   75% of dedicated capacity and 75% of the actual process budget. Include
   allocations already made during initialization; do not subtract them from
   accounting as an ignored baseline.
5. Continue monitoring usage, budget, process identity and adapter mapping.
   No SDK response is accepted before admission. A failed check stops only the
   owned process and releases its compute lease after confirmed exit.

SD's `--max-vram`/auto-fit and llama's fixed context, slot and batch settings are
engine planning controls. They are not an OS-enforced aggregate VRAM hard cap.
The bounded loader window and sampled watchdog do not guarantee that no GPU
allocation occurs before the first parent observation, or between samples.

## Evidence

Tests cover inventory contracts, scoped process ownership, initialization
failures, budget arithmetic and cleanup. A real inventory or tiny-process budget
probe does not qualify a model. Qualification additionally requires the actual
pinned model/engine to produce valid text, tool calls or media on that device.
Store receipts keep those evidence levels separate.
