# A21 restart/recovery acceptance

**Status: partial (backend manager restart path covered; full Main-process restart unverified).**

The current backend recovery transaction is in `services/sidekick/runtime/independent/store.py:1108-1143`. A run whose stored runner generation differs is interrupted; claimed or dispatched actions become `unknown` with `process_interrupted`; the run receives `process_restarted`. A never-started queued run with no actions remains eligible for fresh scope/governance admission. Ordinary generation-owned leases are made stale, while account leases are deliberately excluded from this blanket invalidation. Pending/approved action approvals are revoked. On terminal transition, `transition_run` releases active non-account leases (`store.py:426-460`).

`RunManager.start()` invokes this recovery before starting its ticker (`services/sidekick/runtime/independent/manager.py:418-425`). New regression `services/sidekick/tests/test_root_security_recovery.py::test_manager_start_recovers_uncertain_mutation_without_replay_and_fences_run_lease` exercises that real entrypoint against a reopened isolated SQLite store. It creates an already-dispatched action, an execution lease, and an account lease under the old generation. After manager start and ticker activity, the run stays interrupted, its action stays unknown, its execution lease is released, and the account lease remains active for explicit reconciliation. A second recovery is idempotent.

Focused command (bundled Python 3.12.10 and existing offline pytest overlay):

```powershell
$py = 'C:\projekte\lastbrowser\apps\desktop\runtime\python\python.exe'
$overlay = 'C:\projekte\lastbrowser\output\root-python312-pytest-overlay-20261005'
$sidekick = 'C:\projekte\lastbrowser\services\sidekick'
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD = '1'
& $py -I -B -c "import sys;sys.path[:0]=[r'$overlay',r'$sidekick',r'$sidekick\tests'];import pytest;raise SystemExit(pytest.main(['-q','-p','no:cacheprovider',r'$sidekick\tests\test_root_security_recovery.py'],plugins=[]))"
```

Result: **exit 0, 1 passed in 0.89s**. No product files or existing tests were changed. The existing `test_independent_migrations.py:423-462` separately contains a real `os._exit(23)` child-process/WAL crash regression for claimed and dispatched actions, including unknown-state recovery and no replay; that existing test was not rerun in this focused assignment. Neither test drives Electron Main shutdown/start or a packaged application, so the complete A21 Main-process criterion remains unverified. No A34 claim is made; the original spec defines A34 as continuing a profile interview without changing existing permissions, schedules, or task starts (`independentagent.md:454`).
