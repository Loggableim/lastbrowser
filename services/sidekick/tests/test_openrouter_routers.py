"""The OpenRouter picker offers the free and auto routers, and nothing else new."""
from runtime.independent.scoped_models import public_catalog
from runtime.openrouter_routers import ROUTER_IDS, ensure_openrouter_routers
from runtime.opencode_free_chat import free_default_choice


def test_configured_catalog_appends_routers_after_existing_models():
    catalog = {"groups": [
        {"provider_id": "opencode", "provider": "OpenCode", "configured": True, "models": [
            {"id": "deepseek-v4.1-flash-free", "label": "DeepSeek V4.1 Flash (free)"},
        ]},
        {"provider_id": "openrouter", "provider": "OpenRouter", "configured": True, "models": [
            {"id": "moonshotai/kimi-k2.6:free", "label": "Kimi K2.6 (free)"},
        ]},
    ]}
    result = ensure_openrouter_routers(catalog)
    assert [group["provider_id"] for group in result["groups"]] == ["opencode", "openrouter"]
    assert [row["id"] for row in result["groups"][0]["models"]] == ["deepseek-v4.1-flash-free"]
    openrouter = result["groups"][1]["models"]
    assert [row["id"] for row in openrouter] == [
        "moonshotai/kimi-k2.6:free", "openrouter/free", "openrouter/auto",
    ]
    by_id = {row["id"]: row for row in openrouter}
    assert by_id["openrouter/free"]["label"] == "OpenRouter free router"
    assert by_id["openrouter/auto"]["label"] == "OpenRouter auto router"
    assert by_id["openrouter/free"]["contextLength"] == 200_000
    assert by_id["openrouter/auto"]["contextLength"] == 2_000_000
    assert by_id["openrouter/free"]["modelSource"] == "explicit_config"
    assert by_id["openrouter/auto"]["supportsIndependent"] is True
    added = {row["id"] for row in openrouter} - {"moonshotai/kimi-k2.6:free"}
    assert added == ROUTER_IDS
    assert free_default_choice()[0] != "openrouter/auto"


def test_unconfigured_group_exposes_only_the_two_routers():
    catalog = {"groups": [{"provider_id": "openrouter", "provider": "OpenRouter", "configured": False, "models": [
        {"id": "openai/gpt-oss-20b:free", "label": "GPT-OSS 20B (free)"},
        {"id": "openrouter/free", "label": "Free Models Router (free)"},
    ]}]}
    result = ensure_openrouter_routers(catalog)
    group = result["groups"][0]
    assert group["configured"] is True
    assert [row["id"] for row in group["models"]] == ["openrouter/free", "openrouter/auto"]
    assert group["models"][0]["label"] == "OpenRouter free router"
    assert not any(str(row["id"]).endswith(":free") for row in group["models"])


def test_missing_provider_group_is_appended_and_survives_public_catalog():
    public = public_catalog(
        {"groups": [{"provider_id": "opencode", "provider": "OpenCode", "models": [
            {"id": "deepseek-v4.1-flash-free", "label": "DeepSeek V4.1 Flash (free)"},
        ]}]},
        {"providers": []},
        {},
    )
    result = ensure_openrouter_routers(public)
    assert [group["provider_id"] for group in result["groups"] if group.get("provider_id")][:1] == ["opencode"]
    openrouter = next(group for group in result["groups"] if group.get("provider_id") == "openrouter")
    assert [row["id"] for row in openrouter["models"]] == ["openrouter/free", "openrouter/auto"]
    assert openrouter["configured"] is True
    assert openrouter["models"][0]["contextLength"] == 200_000
    assert openrouter["models"][1]["label"] == "OpenRouter auto router"


def test_router_rows_are_refreshed_without_duplication():
    catalog = {"groups": [{"provider_id": "openrouter", "configured": True, "models": [
        {"id": "openrouter/auto", "label": "openrouter/auto"},
        {"id": "openrouter/free", "label": "openrouter/free"},
    ]}]}
    once = ensure_openrouter_routers(catalog)
    twice = ensure_openrouter_routers(once)
    assert [row["id"] for row in twice["groups"][0]["models"]] == ["openrouter/auto", "openrouter/free"]
    assert {row["label"] for row in twice["groups"][0]["models"]} == {
        "OpenRouter free router", "OpenRouter auto router",
    }
