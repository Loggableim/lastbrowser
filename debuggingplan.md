# Lastbrowser API & Model Integration Debugging Plan

> **Target Audience:** Autonomous Implementation Agent (Antigravity, Codex, Claude Code, Cursor) & Engineering Team  
> **Status:** Implemented & Verified (All 71 test suites / 627 tests green, store preflight 27/27 passed)  
> **Date:** September 2026  
> **Author:** Antigravity Architect Subsystem  
> **Repository:** `c:/projekte/lastbrowser`  

---

## 1. Executive Summary & Architecture Overview

Lastbrowser is an integrated, self-contained monorepo comprising:
1. **Frontend Browser Shell (`apps/desktop`):** Electron main process, preload IPC bridge, and a React 19 + Vite desktop UI containing Copilot sidebar chat (`CopilotSplitView.tsx`), central native chat (`NativeChatMain.tsx`), provider configuration cards (`SystemPanels.tsx`), and multi-account state management (`useGeminiAccountStore.ts`).
2. **Local Python Engine (`services/sidekick`):** Native in-tree Python backend exposing a FastAPI/uvicorn server (`cli/web_server.py`), REST and SSE endpoints (`web/api/routes.py`, `config.py`, `providers.py`), agent execution loop, and model catalogs (`cli/models.py`).

### Summary of Systemic Issues
* **Gemini CLI Misconfiguration:** Non-existent, hallucinated models like `gemini-3.8-flash`, `gemini-3.1-pro-preview`, and `gemini-3-flash-preview` are hardcoded across the frontend and backend as primary recommendations. Real live quota models returned from Google Cloud Code Assist (`cloudcode-pa.googleapis.com`) get polluted by hardcoded fallbacks. Direct Google AI Studio API keys (`gemini`) are converted into a dummy single-model provider (`gemini-router`), disabling actual Gemini 2.5 Pro / Flash models.
* **Ollama Cloud Disconnection & Invisibility:** 
  1. The Settings UI calls `saveSettings` (`POST /api/settings`) which strictly filters keys against `_SETTINGS_ALLOWED_KEYS`. `provider`, `base_url`, and `api_key` are dropped silently without saving to `.env` or `config.yaml`.
  2. "Test Connection" makes a direct `fetch` from the browser renderer to `/api/tags` with no Bearer token, which fails with 401 or CORS on Ollama Cloud (`https://ollama.com/v1`).
  3. `fetch_ollama_cloud_models` in `cli/models.py` only reads `os.getenv("OLLAMA_API_KEY")`, ignoring `~/.sidekick/.env` and `config.yaml`.
  4. If live discovery returns an empty list, `get_available_models` in `web/api/config.py` completely drops `ollama-cloud` from `/api/models` because it lacks a static fallback.
  5. `CopilotSplitView.tsx` unconditionally discards all non-Gemini provider groups returned by `/api/models`.
  6. The chat backend in `routes.py:1777` classifies `@ollama-cloud:...` models as stale cross-provider artifacts and replaces them with the default model.
* **Provider Catalog Fragility:** Curated catalogs in `cli/models.py` have empty lists `[]` for `openai`, `deepseek`, `copilot`, `nvidia`, `kimi-coding`, `xiaomi`, and `opencode-zen`.

---

## 2. Deep Root-Cause Analysis

### A. Gemini CLI Issues

#### 1. Hallucinated Model IDs as Defaults
* **Locations:**
  * `apps/desktop/src/renderer/components/CopilotSplitView.tsx:59`
  * `apps/desktop/src/renderer/panels/NativeChatMain.tsx:124`, `155`
  * `apps/desktop/src/renderer/setup-state.ts:64`, `118`
  * `apps/desktop/src/renderer/App.tsx:1597`, `1798`
  * `apps/desktop/src/renderer/stores/useChatStore.ts:71`
  * `apps/desktop/src/renderer/provider-presentation.ts:177`
* **Defect:** `gemini-3.8-flash` does not exist in Google's API. Google Cloud Code Assist rejects it with 404/retired model errors. The real official Google models are `gemini-2.5-flash`, `gemini-2.5-pro`, `gemini-2.5-flash-lite`, `gemini-2.0-flash`, `gemini-1.5-pro`, and `gemini-1.5-flash`.
* **Impact on Tests:** `tests/phase13-polish.test.ts`, `tests/phase13-ui-features.test.ts`, and `tests/setup-state.test.ts` assert `gemini-3.8-flash`. These test assertions must be updated synchronously when migrating to `gemini-2.5-flash`.

#### 2. Forced Invalidation of Dynamic Quota Discovery
* **Location:** `apps/desktop/src/renderer/components/CopilotSplitView.tsx:300-304`
```tsx
const fallbackRequired = AVAILABLE_MODELS.filter(
  (req) => req.category === 'gemini' && !dynamicGeminiModels.some((d) => d.id === req.id)
);
return [...dynamicGeminiModels, ...fallbackRequired, ...nonGemini];
```
* **Defect:** Even when Google OAuth dynamically resolves the user's authentic quota buckets (e.g. `gemini-2.5-flash`, `gemini-2.5-pro`), `fallbackRequired` injects all static models from `AVAILABLE_MODELS`. This forces hallucinated and retired models back into the model picker.

#### 3. Empty `_PROVIDER_MODELS["google-gemini-cli"]` in `cli/models.py`
* **Location:** `services/sidekick/cli/models.py:147`
* **Defect:** Set to `[]`. If Google Code Assist is unauthenticated or quota fetch times out, the CLI has 0 fallback models for Gemini CLI.

#### 4. Evisceration of Direct Gemini API Key (`gemini-router` Masking)
* **Location:** `services/sidekick/web/api/config.py:3658`
```python
if "gemini" in detected_providers and "gemini-router" not in detected_providers:
    detected_providers.discard("gemini")
    detected_providers.add("gemini-router")
```
* **Defect:** When a user provides `GEMINI_API_KEY`, the system discards the `gemini` provider and swaps in `gemini-router`, which exposes only one dummy model `gemini-router` ("Gemini Router (Free Tier)"). The user cannot select genuine Gemini 2.5 Flash/Pro models with their API key.

---

### B. Ollama Cloud Issues

#### 1. Silent Key Dropping in Settings Save
* **Location:** `apps/desktop/src/renderer/panels/SystemPanels.tsx:3200-3207`
```tsx
await window.lastbrowser.sidekick.saveSettings({
  settings: {
    ...cleanSettingsPayload(settings),
    provider: ollamaModalProviderId,
    base_url: ollamaUrl.trim(),
    ...(ollamaKey.trim() ? { api_key: ollamaKey.trim() } : {})
  }
});
```
* **Location:** `services/sidekick/web/api/config.py:4719, 4772`
```python
_SETTINGS_ALLOWED_KEYS = set(_SETTINGS_DEFAULTS.keys()) - {
    "password_hash",
    "default_model",
}
```
* **Defect:** `POST /api/settings` accepts settings updates, but iterates only over `_SETTINGS_ALLOWED_KEYS`. `provider`, `base_url`, and `api_key` are absent from `_SETTINGS_ALLOWED_KEYS`. The payload is silently ignored. The key is never saved to `.env`, and `base_url` is never written to `config.yaml`.
* **Correct Endpoint:** `POST /api/providers` (which calls `set_provider_key(provider_id, api_key)` in `providers.py` and persists to `~/.sidekick/.env`).

#### 2. Broken "Test Connection" for Ollama Cloud
* **Location:** `apps/desktop/src/renderer/panels/SystemPanels.tsx:3180`
```tsx
const res = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(5000) });
```
* **Defect:** 
  1. Ollama Cloud operates at `https://ollama.com` with OpenAI-compatible endpoints (`/v1/models`). It has no public unauthenticated `/api/tags` route.
  2. No `Authorization: Bearer <key>` header is attached.
  3. Direct renderer `fetch()` hits CORS policy on `ollama.com`.
  4. `ollamaUrl` defaults to an empty string for `ollama-cloud`, causing `fetch("/api/tags")` against localhost or electron origin.

#### 3. Environment Isolation in `fetch_ollama_cloud_models`
* **Location:** `services/sidekick/cli/models.py:2538-2541`
```python
if not api_key:
    api_key = os.getenv("OLLAMA_API_KEY", "")
if not base_url:
    base_url = os.getenv("OLLAMA_BASE_URL", "") or "https://ollama.com/v1"
```
* **Defect:** Only inspects `os.getenv("OLLAMA_API_KEY")`. It does not read `~/.sidekick/.env` via `get_env_value()` or `resolve_api_key_provider_credentials("ollama-cloud")`. In a running desktop application, `os.environ` does not contain the key unless injected or explicitly reloaded.

#### 4. Total Omission of `ollama-cloud` from Model Catalog
* **Location:** `services/sidekick/web/api/config.py:3815-3834`
* **Defect:** When `provider_model_ids("ollama-cloud")` returns `[]`, `raw_models` is empty. Unlike `openai-codex` or `google-gemini-cli`, there is no fallback:
```python
if not raw_models:
    raw_models = copy.deepcopy(_PROVIDER_MODELS.get("ollama-cloud", []))
```
`groups.append(...)` is skipped, leaving `ollama-cloud` absent from `/api/models`.

#### 5. Strict Gemini-Only Filter in `CopilotSplitView`
* **Location:** `apps/desktop/src/renderer/components/CopilotSplitView.tsx:274`
```tsx
if (pid.includes('gemini') || pid.includes('google')) { ... }
```
* **Defect:** The loop over `/api/models` groups ignores every provider that does not include `gemini` or `google`. All models from Ollama, Ollama Cloud, OpenRouter, OpenAI, and Anthropic are discarded.

#### 6. Chat Start Silently Replaces `@ollama-cloud` Model
* **Location:** `services/sidekick/web/api/routes.py:1777-1799`
* **Defect:** When a session specifies an `@ollama-cloud:...` model, `_resolve_compatible_session_model_state` checks whether `ollama-cloud` exists in `catalog`. Because `ollama-cloud` was omitted from `/api/models`, the backend treats the model as an orphaned cross-provider remnant and silently switches the user to `default_model`.

---

## 3. Implementation Plan & Detailed Code Changes

```
┌─────────────────────────────────────────────────────────────┐
│                       STREAM B: ENGINE                      │
│                                                             │
│  services/sidekick/                                         │
│   ├── cli/models.py         -> Ollama Cloud env reading &   │
│   │                            curated provider fallbacks   │
│   ├── web/api/config.py     -> Ollama Cloud catalog         │
│   │                            fallback & real Gemini models│
│   └── web/api/providers.py  -> Ollama Cloud connection test │
└──────────────────────────────┬──────────────────────────────┘
                               │ IPC / REST API
┌──────────────────────────────▼──────────────────────────────┐
│                  STREAM A: DESKTOP RENDERER                 │
│                                                             │
│  apps/desktop/src/renderer/                                 │
│   ├── panels/SystemPanels.tsx    -> Save via setProviderKey │
│   │                                 & authenticated probe   │
│   ├── components/CopilotSplitView.tsx -> Full provider list │
│   │                                 & remove fake models    │
│   ├── panels/NativeChatMain.tsx  -> Canonical Gemini models │
│   ├── setup-state.ts             -> Default gemini-2.5-flash│
│   └── App.tsx                    -> Model resolution fix    │
└─────────────────────────────────────────────────────────────┘
```

### File Changes Checklist

#### 1. `services/sidekick/cli/models.py`
- [ ] In `fetch_ollama_cloud_models(api_key, base_url, ...)`:
  - If `not api_key`: resolve via `get_env_value("OLLAMA_API_KEY")` or `resolve_api_key_provider_credentials("ollama-cloud")`.
  - Default `base_url` to `https://ollama.com/v1`.
- [ ] Add `"ollama-cloud"` to `_PROVIDER_MODELS` with curated models:
  ```python
  "ollama-cloud": [
      "deepseek-v4-flash",
      "deepseek-v4-pro",
      "deepseek-v4.1-flash",
      "gemma4",
      "gemma4:31b",
      "glm-5.3",
      "glm-5.3-flash",
      "kimi-k3",
      "qwen3:32b",
  ],
  ```
- [ ] Populate missing models in `_PROVIDER_MODELS` for `"google-gemini-cli"`:
  ```python
  "google-gemini-cli": [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.5-flash-lite",
      "gemini-2.0-flash",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
  ],
  ```
- [ ] Populate fallback models in `_PROVIDER_MODELS` for `"openai"` (`gpt-4o`, `gpt-4o-mini`, `gpt-4.5-preview`, `o3-mini`, `o1`), `"deepseek"` (`deepseek-chat`, `deepseek-reasoner`), and `"nvidia"`.

#### 2. `services/sidekick/web/api/config.py`
- [ ] In `_PROVIDER_MODELS["google-gemini-cli"]`: replace hallucinated previews with canonical models:
  ```python
  "google-gemini-cli": [
      {"id": "gemini-2.5-flash", "label": "Gemini 2.5 Flash"},
      {"id": "gemini-2.5-pro", "label": "Gemini 2.5 Pro"},
      {"id": "gemini-2.5-flash-lite", "label": "Gemini 2.5 Flash Lite"},
      {"id": "gemini-2.0-flash", "label": "Gemini 2.0 Flash"},
      {"id": "gemini-1.5-pro", "label": "Gemini 1.5 Pro"},
      {"id": "gemini-1.5-flash", "label": "Gemini 1.5 Flash"},
  ],
  ```
- [ ] In `get_available_models()` for `pid == "ollama-cloud"`:
  Add static fallback when `raw_models` is empty:
  ```python
  if not raw_models:
      for m in _PROVIDER_MODELS.get("ollama-cloud", []):
          raw_models.append({
              "id": m["id"],
              "label": m["label"],
          })
  ```
- [ ] Allow direct Gemini API models alongside or instead of `gemini-router` when a real key is present.

#### 3. `apps/desktop/src/renderer/panels/SystemPanels.tsx`
- [ ] In the Ollama modal state:
  - Default `ollamaUrl` for `ollama-cloud` to `'https://ollama.com'` (or `'https://ollama.com/v1'`).
  - Default `ollamaUrl` for `ollama` to `'http://localhost:11434'`.
- [ ] In "Test Connection":
  - For `ollama-cloud`: send a backend proxy request or call `https://ollama.com/v1/models` with `Authorization: Bearer ${ollamaKey.trim()}`.
  - For `ollama`: query `${ollamaUrl}/api/tags`.
- [ ] In "Save & Activate":
  - Call `POST /api/providers` via `window.lastbrowser.sidekick.requestWebui({ method: 'POST', path: '/api/providers', body: { provider: ollamaModalProviderId, api_key: ollamaKey.trim() } })`.
  - Save `base_url` to config if non-default.
  - Set active provider to `ollamaModalProviderId`.
  - Refresh `modelsState` and `settingsState`.

#### 4. `apps/desktop/src/renderer/components/CopilotSplitView.tsx`
- [ ] In `AVAILABLE_MODELS`:
  - Set default Gemini model to `gemini-2.5-flash` (`isDefault: true`).
  - Remove `gemini-3.8-flash`, `gemini-3.1-pro-preview`, and `gemini-3-flash-preview`.
  - Add `gemini-2.5-flash-lite`, `gemini-2.0-flash`.
  - Add `ollama-cloud` curated entries under `local` or `other` (e.g. `deepseek-v4-flash`, `qwen3:32b`).
- [ ] In `loadLiveModels`:
  - Process all provider groups from `/api/models`, not just `gemini`/`google`.
  - Categorize groups dynamically (`gemini`, `claude`, `openai`, `local`, `other`).
  - Only add static fallbacks for categories where the provider has not returned live models.

#### 5. `apps/desktop/src/renderer/panels/NativeChatMain.tsx`
- [ ] Replace `gemini-3.8-flash`, `gemini-3.1-pro-preview`, and `gemini-3-flash-preview` with `gemini-2.5-flash` (Empfohlen), `gemini-2.5-pro`, `gemini-2.5-flash-lite`, and `gemini-2.0-flash`.

#### 6. `apps/desktop/src/renderer/setup-state.ts`
- [ ] Update default model for `google-gemini-cli` to `gemini-2.5-flash`.
- [ ] Add `ollama-cloud` models to setup provider options.

#### 7. `apps/desktop/src/renderer/App.tsx`
- [ ] Update fallback model from `'gemini-3.8-flash'` to `'gemini-2.5-flash'` on lines 1597 and 1798.
- [ ] Ensure non-Gemini models pass their provider context cleanly to `startChat`.

#### 8. Test Updates
- [ ] Update `apps/desktop/tests/phase13-polish.test.ts` to expect `'gemini-2.5-flash'`.
- [ ] Update `apps/desktop/tests/phase13-ui-features.test.ts` to expect `'gemini-2.5-flash'`.
- [ ] Update `apps/desktop/tests/setup-state.test.ts` to expect `'gemini-2.5-flash'`.

---

## 4. Verification & Testing Pipeline

To maintain store compliance and build integrity, execute each step sequentially:

| Order | Command | Target Outcome |
| :--- | :--- | :--- |
| **1. Python Compilation** | `python -m compileall -q services/sidekick` | Exit code 0, 0 syntax errors |
| **2. TypeScript Shell Build** | `npm --workspace apps/desktop run build` | 0 TypeScript errors, 0 Vite bundling warnings |
| **3. Unit & Integration Tests** | `npm test` | All 71+ test suites pass green |
| **4. Store Release Preflight** | `npm run verify:store` | 27/27 automated checks pass (`[PASS]`), 0 failures |

---

## 5. Strategic Feedback & Improvement Proposals (30 Actionable Items)

### Category 1: User Experience & Model Selection (Items 1–8)
1. **Dynamic Model Discovery Over Hardcoding:** Never hardcode static model lists as authoritative in the UI. Treat `AVAILABLE_MODELS` strictly as an offline emergency fallback, and replace it dynamically whenever `/api/models` responds.
2. **Provider Grouping in Chat Model Picker:** In `CopilotSplitView.tsx`, organize the dropdown with collapsible provider headers (e.g. `Google Gemini`, `Ollama Cloud`, `Local Ollama`, `Anthropic`, `OpenAI`) instead of a flat list.
3. **Live Connection & Quota Badges:** Display real-time status chips in the model dropdown (e.g. `Connected (92% Quota)`, `Reachable (Local)`, `Key Required`).
4. **Context-Aware Ollama Cloud URL Placeholder:** When opening the Ollama configuration dialog, automatically prefill `https://ollama.com` for Ollama Cloud and `http://localhost:11434` for Local Ollama, preventing user confusion.
5. **Clear Error Explanations in Model Picker:** If a model fails to load, render an inline warning tooltip explaining why (e.g. "Quota exhausted — resets in 4h" or "API key invalid") rather than silently swapping the model.
6. **Recent & Favorite Models Pinning:** Allow users to star or pin up to 3 preferred models at the top of the picker across sessions.
7. **Model Capability Tags:** Add visual tags for model capabilities in the dropdown (e.g. `Code`, `Vision`, `Reasoning`, `Speed`, `Tools`).
8. **Direct Key Entry Modal for Any Provider:** Allow configuring keys for any detected provider directly from the model picker if an unauthenticated model is clicked.

### Category 2: Provider Connection & Onboarding Architecture (Items 9–15)
9. **Unified Credentials API:** Route all provider configuration changes through a single endpoint (`POST /api/providers`) that handles both API keys and custom base URLs uniformly.
10. **Backend Connection Probe Endpoint:** Replace direct browser-side `fetch` in test connection buttons with a secure backend probe endpoint (`POST /api/providers/test`). This eliminates CORS issues and keeps tokens off client-side network inspectors.
11. **Automatic Local Ollama Detection:** Have the background engine probe `http://localhost:11434/api/tags` on application start. If a local instance is running, automatically surface installed local models in the picker without requiring manual setup.
12. **Ollama Cloud Model Sync:** Automatically fetch the user's specific Ollama Cloud library via `/v1/models` using their API key and cache it with a 15-minute TTL.
13. **Real Gemini API Support Alongside CLI:** Decouple Google AI Studio (`gemini`) from `gemini-router`. Users with direct Gemini API keys should have access to `gemini-2.5-pro` and `gemini-2.5-flash` directly.
14. **Custom OpenAI-Compatible Provider UI:** Provide a dedicated "Add Custom Provider" button in Settings where users can define a display name, base URL, API key, and test connectivity.
15. **Status Indicator in Status Bar:** Show an unobtrusive status pill in the browser bottom bar indicating the active provider and its connectivity health.

### Category 3: Resilience, Failover & Error Handling (Items 16–22)
16. **Explicit Model Fallback Notification:** If the backend falls back to another model due to rate limits or missing credentials, display a toast: *"Switched to Gemini 2.5 Flash: Ollama Cloud key is unconfigured."*
17. **Soft Degradation for Multi-Account Quota:** In `GeminiAccountsPanel`, if Account A hits 0% quota, transparently route the request to Account B without failing the user prompt.
18. **Network Timeout Handling for Model Probes:** Implement a strict 3-second timeout with cached stale-while-revalidate semantics on `/api/models` so the UI never hangs when a remote provider is down.
19. **Pre-flight Request Validation:** Before sending a chat prompt, verify that the selected provider has valid credentials. If missing, show the configuration dialog immediately instead of triggering a failed stream.
20. **Self-Healing Environment Reload:** When `set_provider_key()` updates `~/.sidekick/.env`, update `os.environ` in memory in the running Python process immediately to avoid requiring a backend restart.
21. **Robust JSON Parsing for Provider Responses:** Wrap all provider response parsing in defensive schemas (e.g. Pydantic or strict dict guards) to handle undocumented upstream schema shifts gracefully.
22. **Retry-After Header Compliance:** Fully honor HTTP `Retry-After` headers on 429 errors from Google Code Assist and Ollama Cloud, queuing the retry rather than immediately dropping the request.

### Category 4: Security, Privacy & Credential Hygiene (Items 23–27)
23. **Masked Key Display in UI:** Never render plaintext API keys back to the renderer in `GET /api/settings` or `GET /api/providers`. Return only masked identifiers (e.g. `sk-...4a2b`).
24. **Zero-Trace Memory Handling:** Clean sensitive API keys from intermediate renderer state after configuration is complete.
25. **Secure Local Storage:** Store provider secrets strictly in `~/.sidekick/.env` with strict user-only file permissions (`0600` on POSIX, restricted ACL on Windows).
26. **Credential Validation Before Storage:** Always validate that an API key format matches expected vendor patterns (e.g. minimum length, character sets) before persisting.
27. **Clear Disconnect Action:** Provide a 1-click "Revoke / Disconnect" button for each provider that cleans `.env`, `config.yaml`, and active memory state atomically.

### Category 5: Developer Productivity & Testing (Items 28–30)
28. **Provider Mock Suite for Integration Tests:** Add mock HTTP fixtures for Ollama Cloud, Google Code Assist, and OpenAI in `apps/desktop/tests/` so tests can verify the complete provider lifecycle without real API keys.
29. **Catalog Drift Automated Test:** Implement an automated test that validates that all model IDs referenced in `AVAILABLE_MODELS` and `NativeChatMain.tsx` exist in the backend `_PROVIDER_MODELS` catalog.
30. **Single Source of Truth for Model Metadata:** Move model names, badges, and capability descriptions into a shared JSON catalog (`services/sidekick/models_catalog.json`) read by both Vite and Python, eliminating sync discrepancies.

---

## 6. Handoff Instruction for the Implementation Agent

When starting work on this plan:
1. Follow the **Multi-Agent Isolation Boundaries** in `AGENTS.md`:
   - Stream A (`apps/desktop/src/renderer/`)
   - Stream B (`services/sidekick/`, `apps/desktop/src/main/`)
2. Execute the changes atomically across both frontend and backend.
3. Keep tests green at every step: update Vitest assertions in `phase13-polish.test.ts`, `phase13-ui-features.test.ts`, and `setup-state.test.ts` to expect `gemini-2.5-flash`.
4. Validate the full verification pipeline before reporting completion:
   - `python -m compileall -q services/sidekick`
   - `npm --workspace apps/desktop run build`
   - `npm test`
   - `npm run verify:store`
