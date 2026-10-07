"""Regression checks for logging when Uvicorn imports the ASGI app directly."""

import asyncio
import logging

from cli import web_server
from shared import logging_setup


def test_direct_asgi_startup_initializes_logs_and_preserves_log_contract(tmp_path, monkeypatch):
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path / "sidekick-home"))
    root = logging.getLogger()
    previous_managed = [
        handler for handler in root.handlers
        if getattr(handler, "_sidekick_managed", False)
    ]
    previous_initialized = logging_setup._INITIALIZED
    previous_root_level = root.level
    for handler in previous_managed:
        root.removeHandler(handler)
    logging_setup._INITIALIZED = False

    try:
        assert web_server.app.router.on_startup[0] is web_server._initialize_file_logging_on_startup

        web_server._initialize_file_logging_on_startup()
        managed_after_first_start = [
            handler for handler in root.handlers
            if getattr(handler, "_sidekick_managed", False)
        ]
        assert len(managed_after_first_start) == 2

        # CLI launch and direct ASGI startup may both initialize logging in
        # one process. Repeated startup must not add duplicate file handlers.
        web_server._initialize_file_logging_on_startup()
        managed_after_second_start = [
            handler for handler in root.handlers
            if getattr(handler, "_sidekick_managed", False)
        ]
        assert managed_after_second_start == managed_after_first_start

        info_marker = "DIRECT_UVICORN_INFO_MARKER_SAFE"
        warning_marker = "DIRECT_UVICORN_WARNING_MARKER_SAFE"
        marker_logger = logging.getLogger("synthetic.direct_uvicorn_logging_probe")
        marker_logger.info(info_marker)
        marker_logger.warning(warning_marker)
        for handler in managed_after_second_start:
            handler.flush()

        logs_dir = tmp_path / "sidekick-home" / "logs"
        agent_log = (logs_dir / "agent.log").read_text(encoding="utf-8")
        errors_log = (logs_dir / "errors.log").read_text(encoding="utf-8")
        assert info_marker in agent_log
        assert warning_marker in agent_log
        assert warning_marker in errors_log
        assert info_marker not in errors_log

        agent = asyncio.run(web_server.get_logs(file="agent", lines=20))
        webui = asyncio.run(web_server.get_logs(file="webui", tail=20))
        errors = asyncio.run(web_server.get_logs(file="errors", lines=20))
        assert agent["file"] == "agent"
        assert webui["file"] == "webui"
        assert errors["file"] == "errors"
        assert any(info_marker in line for line in agent["lines"])
        assert any(info_marker in line for line in webui["lines"])
        assert any(warning_marker in line for line in webui["lines"])
        assert any(warning_marker in line for line in errors["lines"])
        assert all(info_marker not in line for line in errors["lines"])
    finally:
        for handler in list(root.handlers):
            if getattr(handler, "_sidekick_managed", False):
                root.removeHandler(handler)
                handler.close()
        for handler in previous_managed:
            root.addHandler(handler)
        root.setLevel(previous_root_level)
        logging_setup._INITIALIZED = previous_initialized
