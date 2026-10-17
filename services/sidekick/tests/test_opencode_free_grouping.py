"""Chat picker groups the OpenCode Go catalog into paid "Go" and free "Go Free".

Part of GitHub issue #172 (F3 Modellwahl: Gruppen Go / Go Free). The split is
catalog-derived: free-tier entries are recognised by the ``-free`` suffix the
OpenCode gateway uses on limited-time/free model ids, so no model list is
hardcoded in Lastbrowser.
"""

from __future__ import annotations

from web.api import config as web_config


def test_is_opencode_free_model_matches_catalog_suffix():
    assert web_config._is_opencode_free_model("beam-free") is True
    assert web_config._is_opencode_free_model("longcat-2.5-preview-free") is True
    assert web_config._is_opencode_free_model("  Beam-Free  ") is True
    assert web_config._is_opencode_free_model("deepseek-v4-pro") is False
    assert web_config._is_opencode_free_model("") is False
    assert web_config._is_opencode_free_model(None) is False


def test_split_opencode_free_groups_leaves_other_providers_untouched():
    groups = [
        {
            "provider": "OpenRouter",
            "provider_id": "openrouter",
            "models": [{"id": "vendor/model-free", "label": "Vendor (free)"}],
        }
    ]
    assert web_config._split_opencode_free_groups(groups) == groups


def test_split_opencode_free_groups_separates_paid_and_free():
    groups = [
        {
            "provider": "OpenCode Go",
            "provider_id": "opencode-go",
            "models": [
                {"id": "deepseek-v4-pro", "label": "DeepSeek V4 Pro"},
                {"id": "beam-free", "label": "Beam Free"},
                {"id": "longcat-2.5-preview-free", "label": "LongCat 2.5 Preview Free"},
            ],
        }
    ]

    split = web_config._split_opencode_free_groups(groups)

    assert [group["provider"] for group in split] == ["OpenCode Go", "OpenCode Go Free"]
    # Both groups route through the same provider so selection stays @opencode-go:<id>.
    assert [group["provider_id"] for group in split] == ["opencode-go", "opencode-go"]
    # Distinct ids keep the two optgroups unique in the renderer.
    assert [group["id"] for group in split] == ["opencode-go", "opencode-go-free"]
    assert [model["id"] for model in split[0]["models"]] == ["deepseek-v4-pro"]
    assert [model["id"] for model in split[1]["models"]] == [
        "beam-free",
        "longcat-2.5-preview-free",
    ]


def test_split_opencode_free_groups_without_free_models_returns_single_group():
    groups = [
        {
            "provider": "OpenCode Go",
            "provider_id": "opencode-go",
            "models": [{"id": "glm-5.2", "label": "GLM-5.2"}],
        }
    ]

    split = web_config._split_opencode_free_groups(groups)

    assert len(split) == 1
    assert "id" not in split[0]


def test_get_available_models_exposes_opencode_go_and_free_groups(monkeypatch):
    def fake_provider_model_ids(provider):
        normalized = str(provider or "").strip().lower()
        if normalized in {"opencode-go", "opencode_go", "go", "opencode-go-sub"}:
            return ["deepseek-v4-pro", "beam-free", "longcat-2.5-preview-free"]
        return []

    monkeypatch.setattr("cli.models.provider_model_ids", fake_provider_model_ids)
    monkeypatch.setattr(
        web_config,
        "resolve_active_provider_context",
        lambda _cfg: {"provider": "opencode-go", "model": "deepseek-v4-pro"},
    )
    web_config.invalidate_models_cache()

    catalog = web_config.get_available_models()

    go_groups = [
        group for group in catalog.get("groups", []) if group.get("provider_id") == "opencode-go"
    ]
    labels = {group.get("provider"): [m["id"] for m in group["models"]] for group in go_groups}

    assert "OpenCode Go" in labels
    assert "OpenCode Go Free" in labels
    assert labels["OpenCode Go"] == ["deepseek-v4-pro"]
    assert labels["OpenCode Go Free"] == ["beam-free", "longcat-2.5-preview-free"]
