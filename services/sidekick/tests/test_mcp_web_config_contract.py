"""Run actual MCP route handlers with temporary configuration and tool registry."""
import ast
import json
import logging
import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

from tools.registry import ToolRegistry


@pytest.fixture
def api(tmp_path, monkeypatch):
    path = tmp_path / "config.yaml"
    secret = "test-" + "credential"
    original = {"model": "keep-model", "mcp_servers": {"example": {"command": "python", "args": ["old.py"], "env": {"API_KEY": secret}, "enabled": True, "tools": {"exclude": ["delete"]}}}}
    path.write_text(yaml.safe_dump(original), encoding="utf-8")
    tree = ast.parse((Path(__file__).parents[1] / "web/api/routes.py").read_text(encoding="utf-8"))
    names = {"_handle_mcp_servers_save", "_handle_mcp_servers_list", "_handle_mcp_server_update", "_handle_mcp_server_delete", "_handle_mcp_tool_call", "_mask_secrets", "_parse_mcp_enabled", "_server_summary"}
    functions = {node.name: node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names}
    placeholder = next(node.value.value for node in tree.body if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "_MASKED_PLACEHOLDER" for target in node.targets))
    namespace = {
        "get_config": lambda: yaml.safe_load(path.read_text(encoding="utf-8")),
        "_get_config_path": lambda: path,
        "_save_yaml_config_file": lambda target, value: target.write_text(yaml.safe_dump(value), encoding="utf-8"),
        "reload_config": lambda: None, "_mcp_runtime_status_by_name": lambda: {},
        "_MASKED_PLACEHOLDER": placeholder, "json": json, "logger": logging.getLogger(__name__),
        "j": lambda handler, payload: payload,
        "bad": lambda handler, error, *args: {"ok": False, "error": str(error)},
    }
    exec(compile(ast.Module(body=list(functions.values()), type_ignores=[]), "routes.py", "exec"), namespace)
    registry = ToolRegistry()
    import tools.registry as module
    monkeypatch.setattr(module, "registry", registry)
    return SimpleNamespace(handlers=namespace, path=path, original=original, secret=secret, registry=registry)


def test_import_and_list_use_same_nova_config_preserve_secrets_and_other_settings(api):
    listing = api.handlers["_handle_mcp_servers_list"](None)
    assert api.secret not in json.dumps(listing)
    assert listing["reload_required"] is True
    submitted = listing["config"]
    submitted["mcpServers"]["example"]["enabled"] = False
    result = api.handlers["_handle_mcp_servers_save"](None, submitted)
    assert result["ok"] is True
    saved = yaml.safe_load(api.path.read_text(encoding="utf-8"))
    assert saved["model"] == "keep-model"
    assert saved["mcp_servers"]["example"]["env"]["API_KEY"] == api.secret
    assert saved["mcp_servers"]["example"]["tools"] == {"exclude": ["delete"]}
    assert api.handlers["_handle_mcp_servers_list"](None)["servers"][0]["enabled"] is False


def test_empty_map_actually_removes_all_servers(api):
    assert api.handlers["_handle_mcp_servers_save"](None, {"mcpServers": {}})["server_count"] == 0
    assert yaml.safe_load(api.path.read_text())["mcp_servers"] == {}


@pytest.mark.parametrize("body", [[], {"servers": []}, {"servers": {"broken": {}}}, {"servers": {"broken": {"command": 42}}}, {"servers": {"broken": {"command": "python", "args": "x"}}}, {"servers": {"broken": {"url": "file:///local"}}}, {"servers": {"broken": {"command": "python", "timeout": -1}}}, {"servers": {"broken": {"command": "python", "url": "https://example.test"}}}])
def test_invalid_import_never_modifies_configuration(api, body):
    before = api.path.read_text()
    assert api.handlers["_handle_mcp_servers_save"](None, body)["ok"] is False
    assert api.path.read_text() == before


def test_legacy_disabled_and_empty_arrays_are_supported(api):
    handler = api.handlers["_handle_mcp_servers_save"]
    assert handler(None, {"servers": {"example": {"command": "python", "disabled": True}}})["ok"] is True
    assert yaml.safe_load(api.path.read_text())["mcp_servers"]["example"]["enabled"] is False
    assert api.handlers["_handle_mcp_server_update"](None, "example", {"args": [], "env": {}})["ok"] is True
    assert yaml.safe_load(api.path.read_text())["mcp_servers"]["example"]["args"] == []
    before = api.path.read_text()
    assert api.handlers["_handle_mcp_server_update"](None, "example", {"command": "python", "url": "https://example.test"})["ok"] is False
    assert api.path.read_text() == before


def test_tool_calls_use_existing_registry_and_reject_wrong_or_disabled_server(api):
    calls = []
    api.registry.register(name="mcp_example_read", toolset="mcp-example", schema={"name": "mcp_example_read"}, handler=lambda args: calls.append(args) or json.dumps({"result": "offline-result"}), check_fn=lambda: True)
    call = api.handlers["_handle_mcp_tool_call"]
    assert call(None, [])["ok"] is False
    assert call(None, {"server": "example", "tool": "mcp_example_read", "arguments": {"query": "test"}})["result"] == {"result": "offline-result"}
    assert calls == [{"query": "test"}]
    assert call(None, {"server": "example", "tool": "unregistered"})["ok"] is False
    assert call(None, {"server": "example", "tool": "mcp_example_read", "arguments": []})["ok"] is False
    api.handlers["_handle_mcp_server_update"](None, "example", {"enabled": False})
    assert call(None, {"server": "example", "tool": "mcp_example_read"})["ok"] is False
    assert len(calls) == 1


def test_returned_tool_errors_are_not_success_and_reads_do_not_connect(api):
    api.registry.register(name="mcp_example_read", toolset="mcp-example", schema={}, handler=lambda args: json.dumps({"error": "offline error"}), check_fn=lambda: True)
    result = api.handlers["_handle_mcp_tool_call"](None, {"server": "example", "tool": "mcp_example_read"})
    assert result["ok"] is False
    assert "offline error" in result["error"]
    assert api.handlers["_handle_mcp_servers_list"](None)["servers"][0]["active"] is False


def test_real_stdio_handshake_discovery_and_route_call(api, monkeypatch, tmp_path):
    pytest.importorskip("mcp")
    from tools import mcp_tool
    import tools.osv_check
    monkeypatch.setattr(tools.osv_check, "check_package_for_malware", lambda *args: None)
    monkeypatch.setenv("SIDEKICK_HOME", str(tmp_path))
    config = {"command": sys.executable, "args": [str(Path(__file__).parent / "fixtures/mcp_echo_server.py")],
              "env": {"PYTHONPATH": os.environ.get("PYTHONPATH", "")}, "sampling": {"enabled": False},
              "connect_timeout": 15, "timeout": 15}
    assert api.handlers["_handle_mcp_servers_save"](None, {"servers": {"example": config}})["ok"] is True
    with (tmp_path / "mcp.log").open("a", encoding="utf-8") as logfile:
        monkeypatch.setattr(mcp_tool, "_get_mcp_stderr_log", lambda: logfile)
        try:
            names = mcp_tool.register_mcp_servers({"example": config})
            assert "mcp_example_echo" in names
            result = api.handlers["_handle_mcp_tool_call"](None, {"server": "example", "tool": "mcp_example_echo", "arguments": {"message": "offline-roundtrip"}})
            assert result["ok"] is True
            assert "offline-roundtrip" in json.dumps(result["result"])
        finally:
            mcp_tool.shutdown_mcp_servers()
