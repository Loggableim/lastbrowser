# Unsigned native package evidence

Snapshot artifact: `output/independent-offline-probe-8e47d2c929f84db18763d5535d641ea0/artifact/win-unpacked`.

The local offline `dir` build was unsigned, had no installer or publish step,
and used the installed Electron distribution. The bundled Python 3.12 runtime
successfully imported the earlier Native Chat and Local AI entry points in
isolated mode.

The expanded verifier currently fails intentionally against this older
snapshot: it does not contain `native_tool_paths.py`, `grill.py`, Local-AI
`model_manager.py`, `role_adapters.py`, `benchmark.py`, `legacy_runtime.py`,
or `web/api/grill.py`. This is an artifact/source snapshot mismatch, not a
claim that the current source is missing those modules. A new artifact is
required before asserting current-source packaging parity.
