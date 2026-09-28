"""Regression tests for the log-rotation PermissionError fallback.

Bug (observed 2026-09-14 on a live install): ``agent.log`` grew to
138.8 MB with a 5 MB rotation limit - 27x over. On Windows the rename in
``RotatingFileHandler.doRollover`` fails with ``PermissionError`` whenever
another Sidekick process still holds the log open, and a long-running
WebUI holds it around the clock. The old fallback kept logging to the
current file with no bound, so the file grew unbounded.
"""

from __future__ import annotations

import logging

import pytest


def _emit(handler, logger_name: str, message: str) -> None:
    """Exercise the handler directly, independent of process logger filters."""
    record = logging.LogRecord(
        name=logger_name,
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg=message,
        args=(),
        exc_info=None,
    )
    handler.handle(record)


def test_do_rollover_truncates_when_rename_is_blocked(tmp_path, monkeypatch):
    """When the rename fails permanently, the handler must truncate the
    current file instead of letting it grow unbounded."""
    from shared.logging_setup import SidekickRotatingFileHandler

    # Block the rename and the backup deletion from the start, like a
    # permanently-held Windows lock. RotatingFileHandler.doRollover uses
    # os.rename (not os.replace) plus os.remove for the .1 slot.
    def failing_op(*args, **kwargs):
        raise PermissionError(13, "The process cannot access the file")

    monkeypatch.setattr("logging.handlers.os.rename", failing_op)
    monkeypatch.setattr("logging.handlers.os.remove", failing_op)

    log_file = tmp_path / "agent.log"
    handler = SidekickRotatingFileHandler(
        log_file, maxBytes=1024, backupCount=2, encoding="utf-8"
    )
    try:
        # Fill the file far beyond maxBytes with a single huge record - with
        # the rename blocked, the old code kept appending forever (the
        # 138.8 MB agent.log). A single oversized record avoids the
        # fill/rollover/truncate oscillation the fix produces on normal
        # records.
        _emit(handler, "rollover-test", "x" * 4096)
        handler.flush()
        assert log_file.stat().st_size > 1024, "test setup: file should exceed the limit"

        handler.doRollover()

        size = log_file.stat().st_size
        assert size <= 1024, (
            f"log file must be truncated when rollover fails (got {size} bytes)"
        )
        # The handler must remain usable after the fallback.
        _emit(handler, "rollover-test", "after-rollover")
        handler.flush()
        assert log_file.stat().st_size > 0
    finally:
        handler.close()


def test_do_rollover_normal_path_still_rotates(tmp_path):
    """Without lock contention the standard rename-based rollover works."""
    from shared.logging_setup import SidekickRotatingFileHandler

    log_file = tmp_path / "agent.log"
    handler = SidekickRotatingFileHandler(
        log_file, maxBytes=1024, backupCount=2, encoding="utf-8"
    )
    try:
        blob = "y" * 512
        for _ in range(10):
            _emit(handler, "rollover-test-normal", blob)
        handler.flush()
        rotated = tmp_path / "agent.log.1"
        assert rotated.exists(), "normal rollover must rename to .1"
        assert log_file.stat().st_size <= 1024
    finally:
        handler.close()
