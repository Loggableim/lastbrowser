"""Regression coverage for restart-safety run lifecycle reporting."""

import time


def test_health_counts_active_runs_even_when_no_sse_streams():
    """A worker run can outlive its SSE channel; health must expose the run."""
    from api import config, routes

    with config.STREAMS_LOCK:
        config.STREAMS.clear()
    with config.ACTIVE_RUNS_LOCK:
        config.ACTIVE_RUNS.clear()
        config.ACTIVE_RUNS["stream-1"] = {
            "stream_id": "stream-1",
            "session_id": "session-1",
            "started_at": time.time() - 42,
            "phase": "running",
        }

    try:
        stream_check = routes._streams_lock_health()
        run_check = routes._run_lifecycle_health()

        assert stream_check["active_streams"] == 0
        assert run_check["active_runs"] == 1
        assert run_check["oldest_run_age_seconds"] >= 40
        assert run_check["runs"][0]["session_id"] == "session-1"
    finally:
        with config.ACTIVE_RUNS_LOCK:
            config.ACTIVE_RUNS.clear()


def test_run_registry_unregister_records_last_finished_time():
    """Guards need a grace window after the last real worker exits."""
    from api import config

    with config.ACTIVE_RUNS_LOCK:
        config.ACTIVE_RUNS.clear()
        config.LAST_RUN_FINISHED_AT = None

    config.register_active_run("stream-2", session_id="session-2", phase="starting")
    with config.ACTIVE_RUNS_LOCK:
        assert "stream-2" in config.ACTIVE_RUNS

    config.unregister_active_run("stream-2")

    with config.ACTIVE_RUNS_LOCK:
        assert "stream-2" not in config.ACTIVE_RUNS
        assert isinstance(config.LAST_RUN_FINISHED_AT, float)


def test_stream_status_and_sse_heartbeat_expose_run_metadata():
    """Running streams must expose phase/age so the UI does not show a silent spinner."""
    src = __import__("pathlib").Path(__file__).resolve().parents[1].joinpath("api", "routes.py").read_text(encoding="utf-8")
    status_start = src.index('if parsed.path == "/api/chat/stream/status":')
    status_body = src[status_start:src.index('if parsed.path == "/api/chat/cancel":', status_start)]
    sse_start = src.index("def _handle_sse_stream")
    sse_body = src[sse_start:src.index("\ndef _terminal_session_and_workspace", sse_start)]

    assert "ACTIVE_RUNS" in status_body
    assert '"age_seconds"' in status_body
    assert '"run"' in status_body
    assert "def _heartbeat_payload" in sse_body
    assert '_sse(handler, "heartbeat", _heartbeat_payload())' in sse_body
