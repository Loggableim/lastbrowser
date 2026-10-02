# Lastbrowser v0.1.43 verification evidence

Verified on 2026-10-02. This records executed checks and their limits.

## Source and publication

- Code fix: `eafdb33`; release source/tag: `d7df0a5d6612a0e6a44ed58f8bea0adb4da5a2a9`.
- Public release: https://github.com/Loggableim/lastbrowser/releases/tag/v0.1.43 (four assets, not a draft).
- Local files: `apps/desktop/release-local-0.1.43-20261001-194823/`.
- Website source on `main`: `8008544cab8ca5f3efcc8b0e14a8a271b89d1d8f`; Cloudflare production deployment: `8fa974d0.lastbrowser-website.pages.dev`.

## Automated checks

- Desktop: 134 suites, 1,178 tests passed.
- Sidekick full suite: 2,493 passed, 105 skipped. The first run exposed a changed HTTP 401 message; the message was corrected and the entire suite rerun successfully.
- Store preflight: 27/27; Main and Renderer build passed; Python compileall passed.
- Vite still warns about the existing approximately 1.67 MB renderer bundle.

## Live provider and packaged-app checks

- Alibaba workspace catalog returned 89 text-generation models using DashScope's native catalog and `capabilities=TG`. A minimal `qwen3.8-flash` call through the current Sidekick resolver returned HTTP 200 and `OK`.
- Alibaba credentials were used transiently for source-backend tests. No key was committed or saved by those tests. A direct packaged live test with a key in the shell command was rejected by automatic approval review. No saved Alibaba credential was available for a safer packaged test.
- Packaged Sidekick Auth, Models, Doctor, Provider, API-route, and Teamwork source hashes match the tested in-tree files; packaged provider modules import successfully.
- The signed, unpacked v0.1.43 app passed 21/21 isolated live Ollama checks using the existing configured credential without printing it. Catalog: 17 models; model: `deepseek-v4.1-flash`. First answer token: 16,820 ms. Token and reasoning deltas reached the renderer before completion, the final response persisted, and cancellation made the stream inactive within 30 seconds.
- Teamwork completed with planner/worker/critic/synthesizer pinned to the same live Ollama model. A persistent goal recovered after renderer reload and completed in two separate assistant turns. Temporary sessions/profile were removed by the smoke harness.
- Earlier broad UI smokes covered Appearance, Downloads, Space creation/selection, the same audio WebView guest across Space switches, snap drag/resize/empty slots and split detach/history. The combined full UI-plus-chat smoke was not completed; its ambiguous Chat selector was corrected and the separate packaged provider/goal smoke above passed. This is not a complete UI acceptance claim.

## Signing and uploaded bytes

Setup, portable and unpacked app passed Authenticode verification against Certum thumbprint `1AD3C19A7338BBC3FFE4D62853411AD73E139857`, with timestamps. The app passed Castlabs VMP verification. Final blockmap/latest.yml were regenerated after signing; GitHub asset digests and sizes matched all local final files.

| Asset | SHA-256 |
| --- | --- |
| Setup | `FF5A8C6C9986BC34D8D781686644974F41624FDE1D24C4C0A8D1F5C872F1DE62` |
| Portable | `DD94C2BFB654F840CE2EFA1FDF166399463892401BB3DF07D5B538A4139AFD56` |
| Setup blockmap | `6557EE4D5290576DD49CBD6A73FF42508D48BE390165285CBA6E72DA26976AA8` |
| latest.yml | `8FE0B756C8A9B913A9E529EE7784D368820E8E10160A4192F928F5D19513CB55` |

All seven public download pages returned HTTP 200, v0.1.43 links and the correct setup/portable hashes. Setup and portable proxy GET responses returned the correct filenames; the proxy latest.yml bytes matched the local SHA-256. RSS included v0.1.43. Deploying from the repository root had omitted the Pages Function; redeploying from `lastbrowser.com/` compiled and uploaded the function, and the live proxy was rechecked.

## Remaining limits

- Installation over the user's existing profile has not been performed.
- Alibaba live use from the packaged app remains unverified; the source-backend live call is verified.
- The full browser/provider acceptance surface and every failure condition are not proven by these checks. Google/Codex/Anthropic login status must not be inferred from this Ollama smoke.
- GitHub Release workflow run `36957371456` failed closed at its missing CI-signing-secret gate. This release used the independently verified local Certum/Castlabs path.
