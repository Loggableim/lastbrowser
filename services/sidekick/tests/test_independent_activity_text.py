from runtime.independent.activity_text import summarize_activity
from runtime.independent.contracts import (
    ActivitySnapshot, Budget, NativeChatObservation, RunCounters, RunProgress,
    RunView, Scope, WaitingFor, new_id,
)

NOW = "2026-10-04T01:00:00Z"


def run(scope, **changes):
    return RunView(run_id=new_id(), dispatch_id=new_id(), scope=scope,
                   definition_id=new_id(), definition_revision=1,
                   created_at=NOW, updated_at=NOW, **changes)


def test_real_partial_output_wait_and_unknown_usage_are_grounded():
    scope = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id="a")
    waiting = run(scope, state="waiting_for_user", state_revision=3,
                  waiting_for=WaitingFor(kind="clarification", resource_id="question-checkpoint"))
    terminal = run(scope, state="failed", reason_code="provider_request_budget_exhausted", result_ref="saved-result-reference")
    progress = RunProgress(run_id=terminal.run_id, scope=scope, progress_revision=2,
        observed_at=NOW, run_state="running", counters=RunCounters(provider_requests=2),
        budget=Budget(max_provider_requests=2), text="Actual partial result from controlled SDK")
    value = summarize_activity(ActivitySnapshot(scope=scope, observed_at=NOW, watermark=0,
        runs=(waiting, terminal), run_progress=(progress,),
        native_chat_observation=NativeChatObservation(source_state="partial", observed_at=NOW)))
    assert "Actual partial result from controlled SDK" in value
    assert "Gemessene Tokens / Measured tokens: unbekannt/unknown" in value
    assert "Requests: 2/2" in value and "question-checkpoint" in value
    assert "Question text not supplied" in value and "Revision 3" in value
    assert "saved-result-reference" in value and "partial" in value and NOW in value


def test_foreign_rows_and_progress_are_excluded_before_counts():
    scope = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id="a")
    foreign = Scope(backend_profile_id=scope.backend_profile_id, space_id=new_id(), browser_profile_id="a")
    own = run(scope, target_session_id="own-chat")
    other = run(foreign, target_session_id="foreign-chat")
    leak = RunProgress(run_id=own.run_id, scope=foreign, target_session_id="own-chat",
        progress_revision=1, observed_at=NOW, run_state="running", counters=RunCounters(), budget=Budget(), text="PRIVATE-SENTINEL")
    value = summarize_activity(ActivitySnapshot(scope=scope, observed_at=NOW, watermark=0,
        runs=(own, other), run_progress=(leak,), active_chats=(
            {"sessionId": "own-chat", "title": "Owned title", "state": "streaming", "observedAt": NOW},
            {"sessionId": "foreign-chat", "title": "PRIVATE-SENTINEL"},
            {"sessionId": "forged-chat", "scope": foreign.model_dump(by_alias=True)}),
        schedules=({"definitionId": "foreign-schedule", "scope": foreign.model_dump(by_alias=True)},)))
    assert "Läufe / Runs: 1" in value and "Work chats: 1" in value
    assert "Schedules: 0" in value and "Owned title" in value
    assert other.run_id not in value and "PRIVATE-SENTINEL" not in value and "forged-chat" not in value


def test_absent_metadata_is_unknown_not_empty_live_success():
    scope = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id="a")
    value = summarize_activity(ActivitySnapshot(scope=scope, observed_at=NOW, watermark=0, source_state="unavailable"))
    assert "Activity: unavailable" in value and "Native chat source: unbekannt/unknown" in value
    assert "No active tasks" not in value


def test_terminal_reference_is_not_invented_result_and_stale_source_is_visible():
    scope = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id="a")
    row = run(scope, state="completed", result_ref="artifact-ref")
    value = summarize_activity(ActivitySnapshot(scope=scope, observed_at=NOW, watermark=0,
        source_state="stale", last_successful_at=NOW, runs=(row,)))
    assert "No result text supplied" in value and "Result reference: artifact-ref" in value
    assert "Activity: stale" in value and "Last successful" in value


def test_last_twenty_and_four_kib_multibyte_bound_are_explicit():
    scope = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id="a")
    rows = tuple(run(scope) for _ in range(25))
    value = summarize_activity(ActivitySnapshot(scope=scope, observed_at=NOW, watermark=0,
        runs=rows, active_chats=tuple({"sessionId": str(i), "title": "界" * 1000} for i in range(25))))
    assert len(value.encode("utf-8")) <= 4096
    assert "5 ältere Einträge ausgelassen" in value and "text limit" in value
    assert rows[0].run_id not in value and rows[5].run_id in value


def test_wrong_session_progress_cannot_supply_a_terminal_result():
    scope = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id="a")
    row = run(scope, state="completed", target_session_id="expected")
    p = RunProgress(run_id=row.run_id, scope=scope, target_session_id="other", progress_revision=1,
                    observed_at=NOW, run_state="completed", counters=RunCounters(), budget=Budget(), text="wrong result")
    value = summarize_activity(ActivitySnapshot(scope=scope, observed_at=NOW, watermark=0, runs=(row,), run_progress=(p,)))
    assert "wrong result" not in value and "No result text supplied" in value


def test_nested_metadata_never_becomes_private_json_and_ia_state_uses_actual_run():
    scope = Scope(backend_profile_id=new_id(), space_id=new_id(), browser_profile_id="a")
    row = run(scope, state="paused", target_session_id="actual-session")
    value = summarize_activity(ActivitySnapshot(scope=scope, observed_at=NOW, watermark=0,
        runs=(row,), active_chats=({"sessionId": "actual-session", "title": {"private": "SECRET-SENTINEL"}},)))
    assert "SECRET-SENTINEL" not in value
    assert "Chat actual-session: unbekannt/unknown; paused" in value
