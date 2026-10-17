# Tagesbeta release pipeline (unsigned beta channel)

Daily beta builds for the **Beta** update channel use unsigned Windows installers. Stable releases continue to use the signed tag workflow in [release.md](release.md).

## Version line

- Package versions use `0.1.58-beta.N` (and later daily betas per the rolling plan in [dependency-maintenance-policy.md](dependency-maintenance-policy.md)).
- Git tags for published betas: `v0.1.58-beta.N` (must match `apps/desktop/package.json`).

## Channel feeds

| Channel | Settings value | Updater feed | Signing |
| --- | --- | --- | --- |
| Stable / Public | `stable` | `latest.yml` | Required (`.github/workflows/release.yml`) |
| Beta / Tagesbeta | `beta` | `beta.yml` | Optional; tagesbeta workflow publishes **unsigned** artifacts |

`scripts/resolve-release-channel.mjs` maps tags to channel and expected package versions.

## Manual tagesbeta build (GitHub Actions)

1. Bump `package.json` / `apps/desktop/package.json` to the target `0.1.58-beta.N`.
2. Run `npm run test:run` and `npm run verify:store` locally when possible.
3. Trigger **Tagesbeta (unsigned)** (`.github/workflows/tagesbeta.yml`) on the release branch with the same version string.
4. The workflow runs tests, builds NSIS + portable with `--publish never`, skips Authenticode/VMP signing, uploads `beta.yml` + installers as a **draft** prerelease.
5. Do **not** merge to `main`, tag stable, or sign without Cid/Felix approval.

## Gratis models only

Tagesbeta candidates for 17.10.2026 are cut from branches that ship keyless / free-tier provider rows only (OpenCode Go Free, OpenRouter free routes). Paid provider defaults stay out of the daily beta scope unless explicitly approved on the board.
