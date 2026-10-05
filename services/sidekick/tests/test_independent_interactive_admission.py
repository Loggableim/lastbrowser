"""Actual admission waits without spawning extra workers or losing permits."""
import threading
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest

from runtime.independent.manager import RunManager
from runtime.independent.policy import PolicyDenied
from runtime.independent.store import ResourceBusy


@pytest.fixture
def admission():
    manager = object.__new__(RunManager)
    manager._stop = threading.Event()
    manager._interactive_slots = threading.BoundedSemaphore(2)
    manager._interactive_waiters = threading.BoundedSemaphore(1)
    manager._interactive_wait_seconds = 0.3
    context = SimpleNamespace(budget=SimpleNamespace(provider_timeout_seconds=10))
    return manager, context


def occupy(manager):
    assert manager._interactive_slots.acquire(False)
    assert manager._interactive_slots.acquire(False)


def test_waiting_call_uses_released_slot_without_increasing_parallelism(admission):
    manager, context = admission
    occupy(manager)
    entered = threading.Event()
    def call():
        entered.set()
        manager._acquire_interactive(context, None)
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(call)
        assert entered.wait(1)
        manager._interactive_slots.release()
        future.result(timeout=1)
        assert not manager._interactive_slots.acquire(False)
    manager._interactive_slots.release()
    manager._interactive_slots.release()
    assert manager._interactive_waiters.acquire(False)


def test_capacity_wait_is_bounded_and_releases_queue_place(admission):
    manager, context = admission
    occupy(manager)
    with pytest.raises(ResourceBusy):
        manager._acquire_interactive(context, None)
    assert manager._interactive_waiters.acquire(False)
    with pytest.raises(ResourceBusy):
        manager._acquire_interactive(context, None)


def test_cancel_and_shutdown_do_not_consume_worker_permits(admission):
    manager, context = admission
    cancellation = threading.Event()
    cancellation.set()
    with pytest.raises(PolicyDenied, match="assistant_turn_cancelled"):
        manager._acquire_interactive(context, cancellation)
    manager._stop.set()
    with pytest.raises(PolicyDenied, match="assistant_turn_cancelled"):
        manager._acquire_interactive(context, None)
    assert manager._interactive_slots.acquire(False)
    assert manager._interactive_slots.acquire(False)


def test_cancel_during_wait_releases_queue_place_without_starting(admission, monkeypatch):
    manager, context = admission
    occupy(manager)
    cancellation, queued = threading.Event(), threading.Event()
    acquire = manager._interactive_waiters.acquire
    def observe(*args, **kwargs):
        result = acquire(*args, **kwargs)
        if result:
            queued.set()
        return result
    monkeypatch.setattr(manager._interactive_waiters, "acquire", observe)
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(manager._acquire_interactive, context, cancellation)
        assert queued.wait(1)
        cancellation.set()
        with pytest.raises(PolicyDenied, match="assistant_turn_cancelled"):
            future.result(timeout=1)
    assert manager._interactive_waiters.acquire(False)
    assert not manager._interactive_slots.acquire(False)


def test_configuration_error_after_admission_releases_worker_permit(admission, monkeypatch):
    manager, context = admission
    context.resolved_profile_home = "unused-bound-home"
    def fail(_):
        raise OSError("configuration unavailable")
    monkeypatch.setattr("runtime.independent.manager.provider_configuration_digest", fail)
    with pytest.raises(OSError, match="configuration unavailable"):
        manager.run_interactive(context, {"mode": "model_catalog"})
    assert manager._interactive_slots.acquire(False)
    assert manager._interactive_slots.acquire(False)
