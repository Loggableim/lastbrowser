# Root security file and native browser follow-up (2026-10-05)

## Result

Ran the targeted worker/file and native-browser security tests with the documented bundled Python 3.12 parent-only pytest overlay. **16 passed in 163.78 s; exit code 0.** No failures, errors, or worker stderr diagnostics were produced.

Environment:

- Bundled `apps/desktop/runtime/python/python.exe` 3.12.10 with `-I -B`.
- Parent-only pytest overlay `output/root-python312-pytest-overlay-20261005`; plugin autoload disabled and pytest cache provider disabled.
- Pytest 9.0.2, Pydantic 2.13.5, FastAPI 0.142.2.
- Each test used its own pytest `tmp_path` fixture; no persistent user profile or external account was used.

The exact command was:

```powershell
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'
$py='C:\projekte\lastbrowser\apps\desktop\runtime\python\python.exe'
$overlay='C:\projekte\lastbrowser\output\root-python312-pytest-overlay-20261005'
$sidekick='C:\projekte\lastbrowser\services\sidekick'
& $py -I -B -c "import sys;sys.path[:0]=[r'$overlay',r'$sidekick'];import pytest,pydantic,fastapi;print('pytest',pytest.__version__,'pydantic',pydantic.__version__,'fastapi',fastapi.__version__);raise SystemExit(pytest.main(['-q','-p','no:cacheprovider',r'$sidekick\tests\test_native_file_io.py',r'$sidekick\tests\test_native_root_browser_transport.py',r'$sidekick\tests\test_root_security_paths.py'],plugins=[]))"
```

## Evidence

- `test_native_file_io.py`: 9 cases passed. The real bundled child `runtime.independent.native_file_executor` performed durable file write/read/replace and deduplication; the tests also exercised authority rechecks, unknown-receipt no-replay, Stop waiting for actual child exit, and retained compute/registration state when child exit could not be confirmed. No SDK request was made by the stdlib file operation.
- `test_native_root_browser_transport.py`: 5 cases passed. Owner contract validation, fail-closed behavior without a registered manager, no-authority runtime-receipt behavior, approval-command validation, and the registered native browser fence using a real controlled worker context all passed. The worker process command line was observed during the run; no process fixture or worker launcher was patched to bypass it.
- `test_root_security_paths.py`: 2 cases passed. The temporary workspace-junction escape was denied by both canonical path validation and authorized file read; the Windows UNC path was rejected before network or file access. This test file is the current `root_security_paths` test entry in the checkout; no separate runtime module with that name exists.

This is targeted backend/worker evidence only. It does not establish a packaged application, live browser, real provider, or full-suite result. No product files, test behavior, shared runtime, or package were changed by this run.
