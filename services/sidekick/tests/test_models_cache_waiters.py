from __future__ import annotations

import threading
import time


def test_models_cache_waiter_wakes_after_failed_build_without_cache(monkeypatch):
    from web.api import config

    waiter_has_lock = threading.Event()
    outcome: list[bool] = []
    monkeypatch.setattr(config, "_cache_build_in_progress", True)
    monkeypatch.setattr(config, "_MODELS_CACHE_BUILD_WAIT_TIMEOUT", 60.0)
    monkeypatch.setattr(config, "_available_models_cache", None)

    def wait_for_build() -> None:
        with config._cache_build_cv:
            waiter_has_lock.set()
            outcome.append(config._wait_for_models_cache_build())

    waiter = threading.Thread(target=wait_for_build, name="catalog-waiter")
    waiter.start()
    assert waiter_has_lock.wait(2)

    started = time.monotonic()
    with config._cache_build_cv:
        # Simulate the builder's exception cleanup: it clears the flag and
        # notifies, but leaves the cache empty because no catalog was produced.
        config._cache_build_in_progress = False
        config._cache_build_cv.notify_all()
    waiter.join(0.5)

    assert not waiter.is_alive(), "failed catalog build left its waiter blocked"
    assert outcome == [True]
    assert config._available_models_cache is None
    assert time.monotonic() - started < 0.5
