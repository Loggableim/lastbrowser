# Focused onboarding and cursor acceptance: A37/A38

Date: 2026-10-05. This checks current backend contracts only. No provider account, user profile, desktop app, or package was used; no product code or existing test was modified. One new race regression was added at `services/sidekick/tests/test_root_onboarding_cursor.py` because the existing A38 test covered only an event appended after stale-cursor recovery returned.

## A37 — existing provider when binding a new Space

The existing `ProfileHub` test fixtures bind a fresh Space under a profile that already has a model/provider in its `config.yaml`. `provider_selection()` takes the Space override when present and otherwise keeps the bound Home's current model/provider. Model-selection GET reports that current pair. The configuration-only read performs no catalog worker call and writes no configuration; explicit selection tests separately verify the Space-level change is scoped and idempotent. Current evidence:

- `test_independent_scoped_models.py::test_get_uses_bound_worker_and_redacts_public_catalog`
- `test_independent_scoped_models.py::test_configuration_only_read_has_no_worker_no_config_write_and_does_not_claim_connection_health`
- `test_independent_scoped_models.py::test_set_is_atomic_preserves_other_settings_and_retry_survives_reopen`
- `test_independent_scope_binding.py::test_context_metadata_is_captured_only_for_its_actual_bound_model_provider`

These backend tests support the current provider selection and no-extra-global-write contract. They do not demonstrate that the complete new-Space desktop onboarding UI avoids showing a duplicate setup step. No provider is authenticated or contacted by this test group.

## A38 — stale event cursor and watermark

Existing `test_independent_migrations.py::test_old_event_cursor_returns_atomic_snapshot_and_monotonic_watermark` trims retention, requests cursor 0, verifies a resync snapshot whose watermark matches, then appends the next event and reads it after that watermark. Existing API scope/version coverage remains in `test_independent_api.py::test_actual_router_snapshot_and_events_are_scoped_and_versioned`.

The new race test opens two independent SQLite store connections. It pauses the recovery path after the old-cursor decision has established its read transaction but before the snapshot query, commits a new event through the second connection, then resumes the snapshot. The response keeps the old snapshot watermark; the concurrently committed event is exactly the next sequence and is returned by `events_after(watermark)`. This exercises the transaction boundary without a full Electron/SSE reconnect.

## Verification

Bundled Python 3.12.10 and the existing offline pytest overlay; plugin autoload disabled, `-I -B`, no pytest cache. The targeted command from the repository root:

```powershell
$py='C:\projekte\lastbrowser\apps\desktop\runtime\python\python.exe'
$overlay='C:\projekte\lastbrowser\output\root-python312-pytest-overlay-20261005'
$sidekick='C:\projekte\lastbrowser\services\sidekick'
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'
& $py -I -B -c "import sys;sys.path[:0]=[r'$overlay',r'$sidekick',r'$sidekick\tests'];import pytest;raise SystemExit(pytest.main(['-q','-p','no:cacheprovider',r'$sidekick\tests\test_independent_scoped_models.py::test_get_uses_bound_worker_and_redacts_public_catalog',r'$sidekick\tests\test_independent_scoped_models.py::test_configuration_only_read_has_no_worker_no_config_write_and_does_not_claim_connection_health',r'$sidekick\tests\test_independent_scoped_models.py::test_set_is_atomic_preserves_other_settings_and_retry_survives_reopen',r'$sidekick\tests\test_independent_scope_binding.py::test_context_metadata_is_captured_only_for_its_actual_bound_model_provider',r'$sidekick\tests\test_independent_migrations.py::test_old_event_cursor_returns_atomic_snapshot_and_monotonic_watermark',r'$sidekick\tests\test_independent_api.py::test_actual_router_snapshot_and_events_are_scoped_and_versioned',r'$sidekick\tests\test_root_onboarding_cursor.py'],plugins=[]))"
```

Result: **exit 0, 7 passed in 2.79s**. No reproducible backend defect was found. The remaining proof is a new-Space onboarding UI with an existing provider (A37) and an actual renderer/SSE resync while an event commits (A38), followed by current-package verification.
