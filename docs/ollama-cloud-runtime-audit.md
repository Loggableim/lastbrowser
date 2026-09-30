# Ollama Cloud Runtime Audit — 2026-09-30

## Implemented and unit-tested

- Ollama Cloud key changes now invalidate both the live model catalog and cached auxiliary clients. Without client-cache eviction, a process could keep the previous `Authorization` header after the stored credential changed.
- Regression coverage checks cache invalidation when the credential is set or removed.
- The curated catalog exposes `deepseek-v4.1-flash`, which remains the configured default model.
- Focused provider, streaming, Smart Track, and Teamwork-host tests passed: **105 Python tests**. Targeted frontend provider/setup tests passed: **84 tests**.

## Live runtime evidence

An authorized call through the configured Sidekick runtime used the Ollama Cloud credential already stored for testing. The catalog request returned 17 models, including `deepseek-v4.1-flash`. The runtime completed a non-streaming answer, streamed a response with reasoning, and returned a tool call (`get_weather`).

These calls used Sidekick's provider/runtime functions directly. They do not prove a complete Electron chat interaction or the multi-agent Teamwork workflow against a live provider. The desktop application remained locked, so those UI workflows were not exercised.

The freshly packaged Python runtime was also checked offline: `openai` imports as version **2.54.0**, `runtime.auxiliary_client` imports successfully, and its Ollama Cloud default resolves to `deepseek-v4.1-flash`. This specifically guards against the previously observed missing-`openai` packaging failure.

No credentials are included in this report.
