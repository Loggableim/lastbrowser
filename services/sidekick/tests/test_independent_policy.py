import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from runtime.independent.contracts import PermissionScope
from runtime.independent.policy import (
    PolicyDenied, checked_file, dispatch_independent, intersect_permissions, origin,
    read_authorized_file, require_origin, require_public_network, tool_block_reason, validate_tool,
)


@pytest.mark.parametrize("name", ["browser_cdp", "execute_code", "terminal", "delegate_task", "memory", "mcp_calendar_create_event", "session_search", "windows_click"])
def test_raw_and_general_tools_cannot_bypass_independent_boundary(monkeypatch, name):
    monkeypatch.setenv("LASTBROWSER_INDEPENDENT_WORKER", "1")
    assert tool_block_reason(name, {}) == "independent_context_missing"
    assert '"denied":true' in dispatch_independent(name, {})
    with pytest.raises(PolicyDenied):
        validate_tool(name, {})


def test_normal_chat_is_not_reclassified_as_independent(monkeypatch):
    monkeypatch.delenv("LASTBROWSER_INDEPENDENT_WORKER", raising=False)
    assert dispatch_independent("browser_cdp", {}) is None


def test_missing_background_thread_context_fails_closed(monkeypatch):
    monkeypatch.setenv("LASTBROWSER_INDEPENDENT_WORKER", "1")
    with ThreadPoolExecutor(max_workers=1) as pool:
        assert 'independent_context_missing' in pool.submit(dispatch_independent, "independent_browser_read", {}).result()


@pytest.mark.parametrize("args", [{"targetId": "other"}, {"scope": {}}, {"endpoint": "http://localhost:9222"}, {"method": "Runtime.evaluate"}])
def test_model_cannot_choose_scope_or_target(args):
    with pytest.raises(PolicyDenied, match="model_cannot_select_scope_or_target"):
        validate_tool("independent_browser_read", args)


def test_origins_ports_credentials_and_redirect_destinations():
    assert origin("HTTPS://Example.com:443/path") == "https://example.com"
    require_origin("https://example.com/path", ("https://example.com",))
    for url in ("https://example.com:444/path", "http://example.com", "file:///C:/secret", "https://user:pass@example.com", "https://example.com.evil.test"):
        with pytest.raises(PolicyDenied):
            require_origin(url, ("https://example.com",))
    with pytest.raises(PolicyDenied):
        require_public_network("http://metadata.test", ("http://metadata.test",), ("169.254.169.254",))
    with pytest.raises(PolicyDenied):
        require_public_network("https://example.com", ("https://example.com",), ())


def test_permission_intersection_never_promotes_preference_or_capability():
    a = PermissionScope(browser_origins=("https://a.test", "https://b.test"), allowed_effects=("read", "send"))
    b = PermissionScope(browser_origins=("https://a.test",), allowed_effects=("read",))
    effective = intersect_permissions(a, b)
    assert effective.browser_origins == ("https://a.test",) and effective.allowed_effects == ("read",)
    assert not effective.raw_cdp and not effective.terminal and not effective.desktop
    assert not intersect_permissions().allowed_effects


def test_read_uses_actual_file_handle_and_denies_sibling_and_traversal(tmp_path):
    root = tmp_path / "allowed"
    root.mkdir()
    good = root / "page.txt"
    good.write_text("source evidence", encoding="utf-8")
    other = tmp_path / "secret.txt"
    other.write_text("private", encoding="utf-8")
    assert read_authorized_file(str(good), (str(root),))["text"] == "source evidence"
    with pytest.raises(PolicyDenied):
        read_authorized_file(str(other), (str(root),))
    with pytest.raises(PolicyDenied):
        checked_file(str(root / ".." / "secret.txt"), (str(root),))
    assert read_authorized_file(str(good), (str(root),), 6)["truncated"]


def test_registry_boundary_rejects_before_real_handler(monkeypatch):
    from tools.registry import ToolRegistry
    called = []
    registry = ToolRegistry()
    registry.register(name="terminal", toolset="test", schema={"name": "terminal"}, handler=lambda args, **kw: called.append(args))
    monkeypatch.setenv("LASTBROWSER_INDEPENDENT_WORKER", "1")
    result = registry.dispatch("terminal", {"command": "foreign action"})
    assert "denied" in result and not called
