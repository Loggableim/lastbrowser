"""Focused A31 contract checks for plugins that only provide a start URL."""
import json

import pytest
from cli.plugins import _validated_start_url
from runtime.independent.capabilities import CapabilityService, public_inventory
from runtime.independent.contracts import ProviderSelection
from test_independent_dispatch import manager_fixture


def test_url_only_plugin_is_not_promoted_to_an_api_capability(tmp_path, monkeypatch):
    home, _, scope, store, manager, _ = manager_fixture(tmp_path)
    try:
        context = manager.make_context(
            scope, ProviderSelection(provider_config_ref="controlled", model="controlled")
        )
        plugin = home / "plugins" / "url-only"
        plugin.mkdir(parents=True)
        (plugin / "plugin.yaml").write_text(
            "name: url-only\nversion: '1'\nstart_url: https://example.invalid/app\n",
            "utf-8",
        )
        (plugin / "__init__.py").write_text("", "utf-8")
        tool_plugin = home / "plugins" / "tool-and-url"
        tool_plugin.mkdir(parents=True)
        (tool_plugin / "plugin.yaml").write_text(
            "name: tool-and-url\nprovides_tools: [read_data]\nstart_url: https://example.invalid/tool\n",
            "utf-8",
        )
        (tool_plugin / "__init__.py").write_text("", "utf-8")
        monkeypatch.setenv("LASTBROWSER_INDEPENDENT_WORKER", "1")
        monkeypatch.setenv("SIDEKICK_HOME", str(home))
        inventory = public_inventory(context, {"plugins": {"enabled": ["url-only"]}})
        url_plugin = next(row for row in inventory["plugins"] if row["id"] == "url-only")
        assert url_plugin["enabled"]
        assert url_plugin["startUrl"] == "https://example.invalid/app"
        tool_and_url = next(row for row in inventory["plugins"] if row["id"] == "tool-and-url")
        assert "startUrl" not in tool_and_url

        monkeypatch.setattr(
            "runtime.independent.scoped_models.probe_catalog",
            lambda *_, **__: {
                "providers": [],
                "groups": [],
                "capabilityInventory": inventory,
            },
        )
        entry = next(
            row for row in CapabilityService(manager).catalog(scope)["entries"]
            if row["capabilityId"] == "plugin:url-only"
        )
        connection = entry["connections"][0]
        assert entry["startUrl"] == url_plugin["startUrl"]
        assert entry["connectionKind"] == "connector"
        assert entry["status"] == "restricted"
        assert entry["supportedTasks"] == []
        assert connection["adapterAvailable"] is False
        assert connection["setupActions"] == [
            {"kind": "settings", "availability": "unavailable", "reasonCode": "scoped_adapter_unavailable"}
        ]
        assert "example.invalid" in json.dumps(entry)
        assert "private-marker" not in json.dumps(entry)
    finally:
        manager.shutdown()
        store.close()


@pytest.mark.parametrize(
    "value",
    [
        "javascript:alert(1)",
        "file:///C:/private.txt",
        "custom-protocol://open",
        "https://user:password@example.invalid/",
        "https://@example.invalid/",
        "https://example.invalid/?access_token=private-marker",
        "https://example.invalid/?auth-token=private-marker",
        "https://example.invalid/#token=private-marker",
        "https://example.invalid:bad/",
        " https://example.invalid/",
        "https://example.invalid\\@evil.invalid/",
        "https://example.invalid/\r\nX-Header: injected",
    ],
)
def test_plugin_start_url_rejects_credentials_and_non_web_targets(value):
    assert _validated_start_url(value) is None


@pytest.mark.parametrize("value", ["https://example.invalid/app", "http://localhost:8080/"])
def test_plugin_start_url_accepts_http_and_https(value):
    assert _validated_start_url(value) == value
