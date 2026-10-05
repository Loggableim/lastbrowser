# Offline pytest overlay for bundled Python 3.12

Prepared 2026-10-05 for the final focused backend checks. No product file, shared Python installation, network source, or bundled runtime was modified.

## Why an overlay is needed

The packaged interpreter is `apps/desktop/runtime/python/python.exe` (Python 3.12.10). It already imports the bundled runtime dependencies, including Pydantic 2.13.5 and FastAPI 0.142.2, with `-I`. Pytest is not part of the product wheelhouse or bundled runtime. System Python 3.14 has pytest 9.0.2 in its user-site, but launching children from it with `-I` hides that user-site and also fails to import the package versions expected by the worker.

A parent-only test overlay was created at:

`output/root-python312-pytest-overlay-20261005`

It contains copied pure-Python test runner packages (`pytest` 9.0.2, `_pytest`, `pluggy` 1.6.0, `iniconfig` 2.3.0, `packaging` 25.0, `pygments` 2.19.2, `colorama` 0.4.6, plus `py.py`) and their distribution metadata. Sources came from `C:\Users\logga\AppData\Roaming\Python\Python314\site-packages`. This target is only for invoking pytest in the parent process. WorkerHost strips `PYTHONPATH`, calls the actual bundled `sys.executable` with `-I`, and inserts only the in-tree Sidekick source root; therefore the test overlay cannot leak into the worker.

## Reproduce the focused check (PowerShell, repository root)

```powershell
$py = 'C:\projekte\lastbrowser\apps\desktop\runtime\python\python.exe'
$overlay = 'C:\projekte\lastbrowser\output\root-python312-pytest-overlay-20261005'
$sidekick = 'C:\projekte\lastbrowser\services\sidekick'
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD = '1'
& $py -I -B -c "import sys;sys.path[:0]=[r'$overlay',r'$sidekick'];import pytest,pydantic,fastapi;print('pytest',pytest.__version__,'pydantic',pydantic.__version__,'fastapi',fastapi.__version__);raise SystemExit(pytest.main(['-q','-p','no:cacheprovider',r'$sidekick\tests\test_independent_profile_isolation.py::test_two_workers_keep_real_profile_tool_and_mcp_globals_after_parent_switch',r'$sidekick\tests\test_independent_governance.py::test_native_cancel_ack_waits_for_bound_effect_and_closes_later_dispatch'],plugins=[]))"
```

Observed versions: pytest 9.0.2, Pydantic 2.13.5, FastAPI 0.142.2. Result: **2 passed in 4.25s**. The profile-isolation test's `isolated_python()` selects the bundled executable and starts real child workers with `-I`; it verifies separate worker PIDs and fixed profile/tool/MCP context after the parent profile changes. The governance test verifies a revoked managed browser capability fences later effects. Both tests use temporary controlled profiles and local fixtures.

## Rebuild the overlay if it is removed

```powershell
$source = 'C:\Users\logga\AppData\Roaming\Python\Python314\site-packages'
$overlay = 'C:\projekte\lastbrowser\output\root-python312-pytest-overlay-20261005'
New-Item -ItemType Directory -Path $overlay | Out-Null
@('_pytest','pytest','pluggy','iniconfig','packaging','pygments','colorama') | ForEach-Object {
  Copy-Item -LiteralPath (Join-Path $source $_) -Destination $overlay -Recurse
}
@('pytest-9.0.2.dist-info','pluggy-1.6.0.dist-info','iniconfig-2.3.0.dist-info','packaging-25.0.dist-info','pygments-2.19.2.dist-info','colorama-0.4.6.dist-info') | ForEach-Object {
  Copy-Item -LiteralPath (Join-Path $source $_) -Destination $overlay -Recurse
}
Copy-Item -LiteralPath (Join-Path $source 'py.py') -Destination $overlay
```

For a broader later run, keep the same interpreter bootstrap and replace the pytest argument list with the desired test paths/flags. `-I -B`, disabled plugin autoload, no cache provider, and the actual child executable are part of the evidence boundary. The system Python 3.14 environment is not used as a child runtime. At the time of this initial overlay audit, the complete suite had not been executed; see the final gate section below for the later interrupted run.

## Backend test readiness and remaining offline gaps

Follow-up audit confirmed that the shipped runtime already has `croniter` 6.2.4 and `python-dateutil` 2.9.0 under `Lib/site-packages`, visible to both parent and `-I` child. Their matching wheels are also in `apps/desktop/runtime/wheelhouse`; no croniter overlay is needed. Pytest itself is the only test-runner package absent from the shipped runtime and wheelhouse; the temporary parent overlay above supplies it.

`services/sidekick/pyproject.toml` declares only `pytest>=8.0` in its `dev` extra and configures `testpaths = ["tests"]`. The full test tree has no `async def test_*`, `pytest.mark.asyncio`, or `pytest.mark.anyio` usages. Thus pytest-asyncio is not required by the current suite. Plugin autoload is disabled and `plugins=[]` is passed explicitly; the only `pytest_plugins` declaration found loads an in-tree test helper. No pytest-cov/timeout plugin is required by the configured suite.

The product `all` extra also lists optional dependencies not present in the runtime wheelhouse or bundled site-packages (among them cryptography, Pillow, tiktoken, Telegram, aiohttp, BeautifulSoup, NumPy, ChromaDB, and sentence-transformers). The current tests that import these optional integrations appear scoped, mocked, or skip-gated in reviewed cases, but suite-wide optional-dependency sufficiency remains unverified. The initial overlay audit did not fetch them speculatively; see the final gate section for the bounded later dependency evidence.

## Exact full backend command for Root after source freeze

From repository root, set the same `$py`, `$overlay`, `$sidekick` variables above, keep plugin autoload disabled, and run:

```powershell
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD = '1'
& $py -I -B -c "import sys;sys.path[:0]=[r'$overlay',r'$sidekick'];import pytest,croniter,dateutil,pydantic;print('pytest',pytest.__version__,'croniter',croniter.__file__,'dateutil',dateutil.__file__,'pydantic',pydantic.__version__);raise SystemExit(pytest.main(['-q','-p','no:cacheprovider',r'$sidekick\tests'],plugins=[]))"
```

This full-suite command was documented for Root before the final gate attempt below. `-I -B`, no cache provider, no third-party plugin autoload, parent-only pytest overlay and the bundled child interpreter are the intended environment boundaries.

### Root collection readiness, 2026-10-05

Root ran the same isolated bootstrap with `--collect-only -q -p no:cacheprovider` against the complete in-tree tests directory. Result: **3659 tests collected in 19.73 s**, no collection errors. Full output: `output/root-backend-collection-20261005.txt`. This verifies collection/import readiness in the current offline setup, not test execution or optional feature runtime availability. The full execution gate remains pending source freeze. The PowerShell wrapper completed successfully; the collection report itself contains the pytest result.

## Re-run the two previously blocked materialization cases

```powershell
& $py -I -B -c "import sys;sys.path[:0]=[r'$overlay',r'$sidekick'];import pytest,croniter,dateutil,pydantic;print('pytest',pytest.__version__,'croniter',croniter.__file__,'dateutil',dateutil.__file__,'pydantic',pydantic.__version__);raise SystemExit(pytest.main(['-q','-p','no:cacheprovider',r'$sidekick\tests\test_independent_dispatch.py::test_actual_process_materializes_one_normal_session_and_retry_keeps_original_context',r'$sidekick\tests\test_independent_scheduling.py::test_queued_schedule_materializes_real_session_before_any_inference'],plugins=[]))"
```

Observed: **2 passed in 3.03s**. Both tests use the real `WorkerHost` default, whose default executable is parent `sys.executable`; because this invocation runs under bundled Python 3.12.10, child processes are also the bundled interpreter and are launched with `-I`. No worker factory, child path, import check, or failure handling was monkeypatched.

## Gateway optional dependency overlay (2026-10-05)

The bundled Python 3.12.10 runtime and its wheelhouse do not contain `aiohttp`; the gateway extra in `services/sidekick/pyproject.toml` declares `aiohttp>=3.9,<4`. The two real webhook adapter tests import the production `gateway.platforms.webhook` path and were blocked by that missing optional dependency. An isolated parent-only overlay now lives at `output/root-python312-optional-overlay-20261005`; it is not installed into the bundled runtime and is not added to worker `sys.path`.

Only the required Windows CPython 3.12 wheel and its runtime dependencies were fetched from the official PyPI index (`https://pypi.org/simple`) into `wheel-cache`, then extracted into `site-packages` after checking archive paths. `wheel-manifest.json` records the wheel filename, origin and computed SHA-256 for every artifact. The pinned set is:

| Wheel | SHA-256 |
| --- | --- |
| `aiohappyeyeballs-2.7.1-py3-none-any.whl` | `9243213661e29250eb41368e5daa826fc017156c3b8a11440826b2e3ed376472` |
| `aiohttp-3.13.5-cp312-cp312-win_amd64.whl` | `110e448e02c729bcebb18c60b9214a87ba33bac4a9fa5e9a5f139938b56c6cb1` |
| `aiosignal-1.4.0-py3-none-any.whl` | `053243f8b92b990551949e63930a839ff0cf0b0ebbe0597b0f3fb19e1a0fe82e` |
| `attrs-26.1.0-py3-none-any.whl` | `c647aa4a12dfbad9333ca4e71fe62ddc36f4e63b2d260a37a8b83d2f043ac309` |
| `frozenlist-1.8.0-cp312-cp312-win_amd64.whl` | `34187385b08f866104f0c0617404c8eb08165ab1272e884abc89c112e9c00746` |
| `idna-3.20-py3-none-any.whl` | `ab7ae7122974553370f0bdb919e1a960b2cd1bc1ef0276416d896db81c14582c` |
| `multidict-6.9.1-cp312-cp312-win_amd64.whl` | `a16a1dc8529f9e734a41c3b856f3eae7ebacdc061dde3f8a844e0c7889c97203` |
| `propcache-0.5.4-cp312-cp312-win_amd64.whl` | `98914de2c4d7f0f9f4a8c6ea4bf05841f4175796941e3ef7d47eb718f22311fb` |
| `yarl-1.25.1-cp312-cp312-win_amd64.whl` | `7d575b54cb3863ef9bc290ea4b009999d55dc237326131e4853cf33e888fee03` |

Import evidence under the bundled interpreter with `-I -B` resolves `aiohttp 3.13.5`, `aiohttp.web.Application`, `gateway.platforms.webhook`, and `cli.web_server` from the overlay/in-tree source as expected. The real adapter tests `test_webhook_adapter_validates_signature_and_dispatches_event` and `test_webhook_adapter_rejects_bad_signature` both pass (**2 passed in 0.93 s**); captured output is `output/root-backend-webhook-contracts-20261005.stdout.log`. Reproduce those tests with the parent-only runner `output/root-python312-optional-overlay-20261005/run_webhook_contracts.py` and the bundled interpreter.

### Full-suite environment and current gate

The test tree's `conftest.py` replaces pytest's standard `tmp_path` with per-test folders under `services/sidekick/.test-tmp`. A parent process must also override launcher profile variables before collection: `config.STATE_DIR` is captured when test modules are imported, before per-test fixtures execute. Set `SIDEKICK_HOME` and `LASTBROWSER_HOME` to an owned temporary profile and set `SIDEKICK_WEBUI_STATE_DIR` and `SIDEKICK_STATE_DIR` within it; setting only `HOME`, `APPDATA`, and `TEMP` is insufficient when an inherited `SIDEKICK_HOME` is present.

The full-suite runner is `output/root-python312-optional-overlay-20261005/run_backend_fullsuite.py`. From `services/sidekick`, prepare unique per-run directories under the repository and set `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP`, `TMP`, all three `XDG_*_HOME` variables, `SIDEKICK_HOME`, `LASTBROWSER_HOME`, `SIDEKICK_WEBUI_STATE_DIR`, and `SIDEKICK_STATE_DIR` to those directories before invoking:

```powershell
$repo = (Resolve-Path ..\..).Path
$py = Join-Path $repo 'apps\desktop\runtime\python\python.exe'
$runner = Join-Path $repo 'output\root-python312-optional-overlay-20261005\run_backend_fullsuite.py'
$runId = [guid]::NewGuid().ToString('N')
$testRoot = Join-Path $repo ".test-tmp\root-python312-fullsuite-$runId"
$testProfileHome = Join-Path $testRoot 'home'
$stateDir = Join-Path $testProfileHome 'state\webui'
$appDataRoaming = Join-Path $testRoot 'appdata\roaming'
$appDataLocal = Join-Path $testRoot 'appdata\local'
$tempRoot = Join-Path $testRoot 'tmp'
$pytestBase = Join-Path $testRoot 'pytest'
$xdgConfig = Join-Path $testRoot 'xdg-config'
$xdgCache = Join-Path $testRoot 'xdg-cache'
$xdgData = Join-Path $testRoot 'xdg-data'
@($testProfileHome,$stateDir,$appDataRoaming,$appDataLocal,$tempRoot,$pytestBase,$xdgConfig,$xdgCache,$xdgData) | ForEach-Object { New-Item -ItemType Directory -Force -Path $_ | Out-Null }
$env:HOME=$testProfileHome; $env:USERPROFILE=$testProfileHome; $env:APPDATA=$appDataRoaming; $env:LOCALAPPDATA=$appDataLocal
$env:TEMP=$tempRoot; $env:TMP=$tempRoot; $env:XDG_CONFIG_HOME=$xdgConfig; $env:XDG_CACHE_HOME=$xdgCache; $env:XDG_DATA_HOME=$xdgData
$env:SIDEKICK_HOME=$testProfileHome; $env:LASTBROWSER_HOME=$testProfileHome; $env:SIDEKICK_WEBUI_STATE_DIR=$stateDir; $env:SIDEKICK_STATE_DIR=$stateDir
$env:PYTHONUTF8='1'; $env:PYTHONIOENCODING='utf-8'; $env:PYTHONDONTWRITEBYTECODE='1'; $env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'; $env:PYTEST_ADDOPTS="--basetemp `"$pytestBase`""
$stdout = Join-Path $repo "output\root-backend-fullsuite-$runId.stdout.log"
& $py -I -B -u $runner *> $stdout
```

An initial full run without the explicit Sidekick profile overrides stopped at 16% after bridge/auth cases returned 504. Subsequent full-collection focused reproduction (3,696 collected, 12 selected) passed **12/12 in 11.37 s** after profile variables were confined. It covered the five password-cache tests, three session-prune tests, one dashboard-auth case, and three FastAPI bridge cases. At each bridge/dashboard setup, `auth._STATE_DIR` matched `config.STATE_DIR` and both classified under the owned temporary profile. The auth test helpers now bind their own `config.STATE_DIR` before reloading auth and register the prior auth path/cache globals for normal monkeypatch teardown, preventing a per-test directory from leaking into later tests. Captured output: `output/root-backend-auth-bridge-classified-20261005.stdout.log`.

The 16% full run was intentionally stopped after identifying that missing environment isolation; it is not a full-suite result. The next full-suite acceptance run must use the environment block above and wait for source freeze. No later full-suite pass is claimed here.

Several other product optional modules remain absent from the bundled runtime and were not downloaded speculatively: `cryptography`, `PIL`/Pillow, `telegram`, `tiktoken`, `bs4`, `numpy`, `chromadb`, and `sentence_transformers`. Current tests directly import `cryptography` only in a `SIDEKICK_COCKPIT_ROOT`-gated integration, import `telegram.ext` inside one Telegram test, and import `PIL.Image` inside a Windows capture test. Those test bodies had not been reached in the interrupted full run; whether those extras are required for the full suite remains open. The heavyweight Nova dependencies were not installed.
