import threading
from types import SimpleNamespace

import pytest

from runtime.independent.contracts import new_id
from runtime.independent.manager import ComputeAdmission
from runtime.independent.scope_binding import ProfileHub


def test_scheduler_restores_bound_inactive_profiles_without_migrating_legacy_home(tmp_path, monkeypatch):
    from web.api import independent as api
    home = tmp_path / "home"
    home.mkdir()
    for name in ("active", "inactive", "untouched"):
        (home / "profiles" / name).mkdir(parents=True)
    profile_hub = ProfileHub(home)
    stores = [profile_hub.get(name) for name in ("active", "inactive")]
    from runtime.independent.contracts import Scope, SpaceBinding
    for store in stores:
        scope = Scope(backend_profile_id=store.backend_profile_id, space_id=new_id(), browser_profile_id="browser")
        store.bind_space(SpaceBinding(scope=scope, native_slug="registered", partition_key="persist:" + new_id()))
    monkeypatch.setattr(api, "_hub", profile_hub)
    monkeypatch.setattr(api, "_service_pair", lambda store, resolver: (SimpleNamespace(store=store), None))
    try:
        managers = tuple(api.registered_managers())
        assert {manager.store.get_profile_ref().name for manager in managers} == {"active", "inactive"}
        assert not (home / "state.db").exists()
        assert not (home / "profiles" / "untouched" / "state.db").exists()
    finally:
        profile_hub.close()


def test_manual_cron_parent_admits_before_child_and_releases_even_on_failure(monkeypatch):
    from web.api import routes, independent
    seen = []
    monkeypatch.setattr(independent, "_watchdog_stop", threading.Event())
    def child(job, profile):
        seen.append((job, profile, len(ComputeAdmission._owners)))
        raise RuntimeError("controlled child failure")
    monkeypatch.setattr(routes, "_run_cron_job_in_profile_subprocess_admitted", child)
    with pytest.raises(RuntimeError, match="controlled child failure"):
        routes._run_cron_job_in_profile_subprocess({"id": "controlled"}, "fixed-home")
    assert seen == [({"id": "controlled"}, "fixed-home", 1)]
    assert not ComputeAdmission._owners
    routes._mark_cron_done("controlled")


def test_shutdown_cancels_waiting_manual_cron_without_child_and_typed_job_never_runs_legacy(monkeypatch):
    from web.api import routes, independent
    cancelled = threading.Event()
    cancelled.set()
    monkeypatch.setattr(independent, "_watchdog_stop", cancelled)
    monkeypatch.setattr(routes, "_run_cron_job_in_profile_subprocess_admitted", lambda *_: pytest.fail("child must not start"))
    with pytest.raises(RuntimeError, match="cancelled_before_compute"):
        routes._run_cron_job_in_profile_subprocess({"id": "controlled"}, "fixed-home")
    with pytest.raises(ValueError, match="requires_scoped_enqueue"):
        routes._run_cron_job_in_profile_subprocess({"id": "independent:" + new_id(), "job_type": "independent_agent"}, "fixed-home")
    assert not ComputeAdmission._owners
    routes._mark_cron_done("controlled")
