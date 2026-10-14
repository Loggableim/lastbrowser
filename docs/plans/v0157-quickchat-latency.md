# Quickchat latency policy — 0.1.57 next private candidate

Approved by the user on 2026-10-13. This describes source changes; it does not
claim live-provider latency, VM acceptance or a signed package.

## Selection

- Quickchat has its own browser-profile, Space and backend-profile preference.
  It never changes the standard chat's selected model.
- Automatic mode considers connected, native-supported, enabled models under
  the existing Stable/Beta eligibility policy. Unsupported direct adapters and
  autonomous orchestration are excluded.
- A valid explicit favorite overrides automation. An unavailable, disabled or
  malformed favorite blocks sending with an inline correction message; it
  does not silently send the prompt to another provider.
- User-designated fast defaults apply only when an eligible matching entry
  actually exists in the current catalog: GPT/Codex prefers **GPT-6 Luna**,
  MiMo prefers **MiMo v2.6 Flash**, and Ollama Cloud prefers **GPT-OSS 20B**.
  The matcher uses the actual ID and/or label and sends the original catalog
  ID. GPT-6.1 or other Luna versions do not match GPT-6 Luna. Ollama requires
  a Cloud provider/deployment or an actual model ID ending in `-cloud`,
  `:cloud`, or `/cloud`; a local GPT-OSS 20B is not this Cloud default.
- For each provider with an eligible designated default, automatic ranking
  considers that default rather than its other models. Other models remain
  manually selectable as favorites. If the designated entry is missing or
  ineligible, retain the provider's eligible fallback pool; never create an ID.
  These defaults are user choices, not new performance measurements.
- OpenCode has no seeded model winner. Until measured results exist, its
  models receive a neutral estimated rank, with deterministic identity order
  for ties. Fresh measured observations continue to decide the global winner
  across the resulting automatic pool.
- Rank eligible models with at least three successful local observations by
  median time to first visible text. Observations expire after seven days.
  Without observations, model-name speed classes are an initial estimate,
  never a measured fastest-model claim. No background inference probes occur.

## Preparation and requests

- Prepare scope and catalog when Quickchat opens, refresh while open, and
  invalidate on settings/profile/Space/runtime changes. Reuse a current
  preparation on send. Backend admission remains mandatory on every request.
- Use a short personality prompt and one direct provider request; no agent
  loop, tools, MCP, memory recall or background title generation.
- Default to the lowest confirmed reasoning level. An explicit supported
  Quickchat reasoning preference wins; unknown capabilities add no parameter.
- Small standalone questions use at most two recent messages / 2,000 history
  characters; other questions retain bounded context. Page material is included
  only when explicitly supplied, separately marked untrusted and bounded.
- Keep input editable while a response runs. A steer stops the previous stream
  and starts the next turn in the same conversation after stop confirmation.
- Remove the inert emoji button.

## Connections

Fresh SDK and admission wrappers retain per-request identity. Process-local
HTTP transports can reuse sockets for Quickchat and standard-chat requests
within the same process. Pools are bounded, scope/credential separated and
expire when idle. Stopping a request closes its stream/lease.

Current native turns run in separate short-lived worker processes, so sockets
cannot survive between Quickchat turns. Cross-turn reuse requires a separate
authenticated transport broker; it is not claimed by this implementation.

## Local measurements

Profile-local bounded observations contain provider/model IDs and timings,
never prompts, page content or credentials. Only successful completed requests
enter the ranking. Provider-first-visible, preflight and total durations remain
distinct. Local renderer debug logs add send acceptance and first-visible
timings. Nothing is uploaded and no latency controls are added to the UI.
