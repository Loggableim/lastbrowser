# Interview acceptance A03/A04/A07/A11/A26/A34

Stand: 2026-10-05. Focused backend contract checks only; this is not a complete UI, model-quality, or package acceptance. Product files and pre-existing tests were not changed. New owned regression tests: `services/sidekick/tests/test_root_interview_acceptance.py`.

## Results

- **A03 — multi-topic answer / no stale inferred topics: targeted PASS.** `test_independent_onboarding.py::test_correction_invalidates_derived_multitopic_inferences` applies a deterministic structured reply that cites the current answer for three topics; replacing that answer removes dependent inferences and makes the stale reply conflict. It is fixture/model-contract coverage, not natural-provider quality evidence.
- **A04 — no fixed question limit: targeted PASS.** `test_no_fixed_question_limit_and_resume_roundtrip` carries 60 answer/continue/serialize steps. `test_long_multibyte_interview_compacts_prompt_but_preserves_corrections` carries 60 long Japanese answers, bounds serialized context, and confirms the latest correction replaces the stale answer. No actual UI or live long dialogue was run.
- **A07 — ordinary “genug” phrase does not end the interview: targeted PASS.** Four negative phrases, including the original “genug offene Rechnungen” case, remain in `interview`; this does not replace natural-language app probes.
- **A11 — connection/model failure and skip preserve profile: targeted PASS.** `test_missing_provider_and_skip_preserve_answers_and_existing_context` injects a provider exception and checks saved answer preservation. `test_actual_two_packaged_pkce_workers_cancel_and_deny_callback_without_external_oauth_requests` starts two real bundled-Python child workers and sends a local OAuth `access_denied` callback: the first flow fails as `provider_oauth_failed`, the second can be cancelled, workers stop, and no auth file is written. The controlled local callback is not a third-party provider outage or a user-facing App flow.
- **A26 — old Space requires no new setup: targeted PASS at backend boundary.** New `test_legacy_space_and_unbound_normal_chat_need_no_interview_migration` verifies the read-only lookup finds an existing legacy Space and an unbound normal-chat session does not require an interview/native scope. The prior `space.yaml` bytes and absent Space ID stay unchanged. Existing test `test_independent_chat_binding.py::test_legacy_chat_remains_unbound_and_header_cannot_be_forged` provides adjacent regression coverage. No old Space was opened in the desktop UI.
- **A34 — continuing interview changes no existing rights, schedules, or task starts: targeted PASS at controlled backend boundary.** New `test_continuing_interview_preserves_existing_rights_schedule_and_dispatches` creates a scoped permission state, an enabled scheduled `AgentDefinition`, and an already accepted dispatch. It performs interview start → review → continue and compares the exact permission record, definition tuple, dispatch records, and manager dispatch list before/after. This proves those records remain unchanged on the covered call path; it does not cover the desktop UI or a concurrent live scheduler.

## Verification

Bundled runtime: Python 3.12.10. Parent pytest 9.0.2 comes from the existing offline overlay; WorkerHost child uses the bundled interpreter with `-I`. No shared runtime or network installation. `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1`, plugin autoload off, bytecode/cache disabled.

PowerShell command from repository root:

```powershell
$py='C:\projekte\lastbrowser\apps\desktop\runtime\python\python.exe'
$overlay='C:\projekte\lastbrowser\output\root-python312-pytest-overlay-20261005'
$sidekick='C:\projekte\lastbrowser\services\sidekick'
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'
& $py -I -B -c "import sys;sys.path[:0]=[r'$overlay',r'$sidekick',r'$sidekick\tests'];import pytest;raise SystemExit(pytest.main(['-q','-p','no:cacheprovider',r'$sidekick\tests\test_independent_onboarding.py::test_correction_invalidates_derived_multitopic_inferences',r'$sidekick\tests\test_independent_onboarding.py::test_no_fixed_question_limit_and_resume_roundtrip',r'$sidekick\tests\test_independent_onboarding.py::test_long_multibyte_interview_compacts_prompt_but_preserves_corrections',r'$sidekick\tests\test_independent_onboarding.py::test_finish_detection_is_not_substring_based',r'$sidekick\tests\test_independent_onboarding.py::test_missing_provider_and_skip_preserve_answers_and_existing_context',r'$sidekick\tests\test_root_interview_acceptance.py',r'$sidekick\tests\test_independent_connection_setup.py::test_actual_two_packaged_pkce_workers_cancel_and_deny_callback_without_external_oauth_requests'],plugins=[]))"
```

Final result: **exit 0, 11 passed in 4.15s**. An earlier run of the new tests failed before exercising A34 because its test resolver passed the `ProfileHub.profiles` method result instead of the method; the test fixture was corrected and the complete focused command then passed. This was a test-harness setup error, not a product failure. No broader test run was done.
