from pathlib import Path
import asyncio

from api import browser_runtime


def test_agent_browser_control_is_denied_without_permission():
    sid = "perm-test-denied"
    browser_runtime.browser_permission_revoke(sid)

    result = browser_runtime.browser_agent_control(sid, "snapshot")

    assert result["ok"] is False
    assert result["code"] == "browser_permission_required"
    assert result["permission"]["mode"] == "none"


def test_read_permission_allows_snapshot_but_not_click(monkeypatch):
    sid = "perm-test-read"
    browser_runtime.browser_permission_grant(sid, "read")

    monkeypatch.setattr(
        browser_runtime.get_browser_manager(),
        "agent_snapshot",
        lambda session_id, full=False: {"ok": True, "text": "snapshot", "state": {"session_id": session_id}},
    )

    assert browser_runtime.browser_agent_control(sid, "snapshot")["ok"] is True
    denied = browser_runtime.browser_agent_control(sid, "click", payload={"ref": "@e1"})
    assert denied["ok"] is False
    assert denied["code"] == "browser_permission_required"


def test_permission_handoff_can_pause_resume_and_stop():
    sid = "perm-test-handoff"
    browser_runtime.browser_permission_revoke(sid)

    read_perm = browser_runtime.browser_permission_grant(sid, "read")
    assert read_perm["mode"] == "read"
    assert browser_runtime.browser_agent_control(sid, "snapshot")["ok"] is True
    assert browser_runtime.browser_agent_control(sid, "click", payload={"ref": "@e1"})["ok"] is False

    control_perm = browser_runtime.browser_permission_grant(sid, "control")
    assert control_perm["mode"] == "control"

    revoked = browser_runtime.browser_permission_revoke(sid)
    assert revoked["mode"] == "none"
    assert browser_runtime.browser_agent_control(sid, "snapshot")["ok"] is False


def test_control_permission_allows_mutating_agent_actions(monkeypatch):
    sid = "perm-test-control"
    browser_runtime.browser_permission_grant(sid, "control")

    monkeypatch.setattr(
        browser_runtime.get_browser_manager(),
        "agent_action",
        lambda session_id, action, payload=None, origin_host=None: {
            "ok": True,
            "action": action,
            "session_id": session_id,
        },
    )

    result = browser_runtime.browser_agent_control(sid, "click", payload={"ref": "@e1"})

    assert result == {"ok": True, "action": "click", "session_id": sid}


def test_browser_action_v1_runs_steps_in_order(monkeypatch):
    session = browser_runtime.BrowserSession(browser_runtime.get_browser_manager(), "seq-test")
    calls = []

    async def fake_agent_action(action, payload=None, origin_host=None):
        calls.append((action, payload or {}))
        return {"ok": True, "state": {"session_id": "seq-test"}}

    monkeypatch.setattr(session, "agent_action", fake_agent_action)

    result = asyncio.run(
        session.action_v1(
            {
                "steps": [
                    {"action": "navigate", "url": "https://example.com"},
                    {"action": "click", "ref": "@e1"},
                ]
            }
        )
    )

    assert [action for action, _ in calls] == ["navigate", "click"]
    assert result["ok"] is True
    assert len(result["steps"]) == 2


def test_agent_browser_tools_proxy_to_visible_webui_browser():
    tool_path = Path(__file__).resolve().parents[2] / "cids-hermes-agent" / "tools" / "browser_tool.py"
    source = tool_path.read_text(encoding="utf-8")

    assert "HERMES_WEBUI_BROWSER_SESSION_ID" in source
    assert "/api/browser/agent-control" in source
    assert "/api/browser/action" in source
    assert '_webui_browser_post("navigate"' in source
    assert '_webui_browser_post("snapshot"' in source
    assert '_webui_browser_post("click"' in source
    assert '_webui_browser_post("type"' in source
    assert '_webui_browser_post("scroll"' in source
    assert '_webui_browser_action_post(' in source
    assert 'name="browser_action_v1"' in source


def test_permission_status_hides_bridge_token():
    sid = "perm-test-token"
    browser_runtime.browser_permission_grant(sid, "control")

    status = browser_runtime.browser_permission_status(sid)

    assert status["mode"] == "control"
    assert "token" not in status
    assert browser_runtime.browser_permission_token(sid)


def test_runtime_blocks_secret_material_in_browser_urls():
    assert browser_runtime._url_has_secret_material("http://127.0.0.1:8787/?api_key=sk-test-secret")
    assert browser_runtime._url_has_secret_material("http://127.0.0.1:8787/?x=sk-abcdefghijklmnopqrstuvwxyz")


def test_blocked_agent_navigation_is_reported_as_failure():
    source = Path(browser_runtime.__file__).read_text(encoding="utf-8")
    assert 'if state.status in {"blocked", "error"}' in source
