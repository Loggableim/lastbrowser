# Bonsai Image browser trial and store estimates

Source basis: `ff12244e`, branch `codex/v0157-bonsai-image-trial-20261014`.

## User flow

Open Local AI → model store → Bilder → **WebGPU-Demo im Browser öffnen**.
The same action appears in the curated Bonsai Image Gemlite entry's details.
The action creates a normal LastBrowser tab named **Bonsai Image · WebGPU-Test**
and switches to the browser panel. It navigates to the official WebML Community
Space only after a click. No remote scripts run in the settings renderer.

The external demo owns model selection, token input, download, local browser
storage, generation and optional sharing. LastBrowser does not read or supply a
token. Its privacy cannot be inferred from the demo's local-inference badge.
The official source currently saves its own token in its origin's local storage
and exposes a Share to Hugging Face action. The page's stated conditions apply.

Start manually with 512 × 512 and 4 steps. Device support is unverified.
LastBrowser does not enable the unsafe WebGPU flag suggested by the demo. A
missing supported WebGPU path means the device trial remains unavailable.

## Primary-source inspection

Read on 2026-10-14 without executing the demo or fetching model weights:

- [WebML Community Space](https://huggingface.co/spaces/webml-community/bonsai-image-webgpu)
- [Official Space metadata](https://huggingface.co/api/spaces/webml-community/bonsai-image-webgpu): static SDK, source SHA `e0c8de64e86a2085c22de476b52ec3939ff7e85c`.
- [HTML at inspected SHA](https://huggingface.co/spaces/webml-community/bonsai-image-webgpu/blob/e0c8de64e86a2085c22de476b52ec3939ff7e85c/index.html): explicit Load model CTA, ternary/binary selector, token field, optional sharing, unsafe-flag advice.
- [Script at inspected SHA](https://huggingface.co/spaces/webml-community/bonsai-image-webgpu/blob/e0c8de64e86a2085c22de476b52ec3939ff7e85c/assets/index-Bf-HmMxp.js): `tryDemoBtn` and `continueBtn` click handlers; startup hydrates state and hardware information. Token validation uses the HF model API. Model IDs are `prism-ml/bonsai-image-ternary-4B-mlx-2bit` and `prism-ml/bonsai-image-binary-4B-mlx-1bit`.
- [Ternary MLX model card](https://huggingface.co/prism-ml/bonsai-image-ternary-4B-mlx-2bit): Apache 2.0; compressed diffusion transformer plus text encoder and VAE; MLX native format. Its memory measurements concern Apple Silicon, not this Windows browser.
- [Publisher native demo](https://github.com/PrismML-Eng/Bonsai-Image-Demo): MLX on Apple Silicon and Gemlite/HQQ for NVIDIA. This does not establish support in LastBrowser's bundled stable-diffusion.cpp engine.

The WebGPU trial, Bonsai Image Gemlite store record and Bonsai 2 27B text GGUF
record are distinct execution paths. No catalog artifact, license receipt,
integrity pin or runtime qualification is created for this external trial.

## More useful display estimates

Previously `assessStoreGpuEstimate` required the upper curated VRAM and RAM
estimate plus the nominal recommended GPU class. All other entries disappeared
under the default filter. A GPU that can handle a compact configuration could
therefore show only a few small models.

`within` retains those conditions. `trial` additionally displays a model when
the lower curated RAM and VRAM estimates fit and the existing GPU headroom is
preserved: estimated VRAM ≤ 75% of remaining measured process budget (dedicated
capacity is a preliminary fallback), plus twice the upper download estimate on
disk. A measured zero budget now counts as zero rather than falling back to
capacity. This is a display estimate only, labelled **Ausprobierbar · kompakte
Konfiguration ungeprüft**.

For example, the catalog's Bonsai 2 27B PQ2_0 record has an 8–10.5 GiB VRAM
range and a nominal 16 GiB recommendation. A hypothetical 12 GiB measured
remaining budget offers 9 GiB after headroom: the lower estimate can qualify as
`trial`, while the upper estimate cannot qualify as `within`. This example is
not a measurement on the user's device. Quantization and shorter context can
reduce weights and KV-cache demand; no particular context is assumed by this
display classification.

The store's native text process still uses its pinned artifact's GPU-layer
setting, or zero GPU layers for CPU mode, and its fixed 4096-token context.
The actual Vulkan process must retain its own D3DKMT budget, exact adapter
identity and system RAM reserve. Engine, artifact, license and hash gates are
unchanged; `trial` never enables install, benchmark, activation or inference.

## Validation boundary

`git diff --check`: PASS. Strict scoped TypeScript check of the three changed
renderer files and their imports (`--noEmit --jsx react-jsx --module NodeNext
--target ES2022 --skipLibCheck --strict`): PASS, exit 0.
Full renderer TypeScript check: FAIL because existing
`NativeRichText.tsx` imports cannot resolve `mermaid` and `katex` from the local
dependencies; no diagnostics point to the changed files. No dependencies were
installed. No model downloads, provider calls, generation, VM/device runtime
tests, packaging, signing, commits or pushes were performed.

The external demo's success inside the packaged LastBrowser browser remains
unverified until the user deliberately opens it and starts its download/test.
