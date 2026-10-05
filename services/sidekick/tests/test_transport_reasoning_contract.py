from __future__ import annotations

from types import SimpleNamespace

from runtime.transports import (
    AnthropicMessagesTransport,
    BedrockConverseTransport,
    CodexResponsesTransport,
)
from shared.constants import parse_reasoning_effort
from web.api.config import (
    _known_reasoning_efforts_for_model,
    _reasoning_allowed_efforts_for_model,
    _annotate_model_reasoning_efforts,
    set_reasoning_effort,
    resolve_reasoning_config,
)
from cli import codex_models
from web.api.streaming import _provider_evidence_from_result


def test_codex_responses_transport_validates_usable_and_failed_responses():
    transport = CodexResponsesTransport()

    assert transport.validate_response(None) is False
    assert transport.validate_response(SimpleNamespace(status="failed", output=[object()])) is False
    assert transport.validate_response(SimpleNamespace(status="cancelled", output_text="answer")) is False
    assert transport.validate_response(SimpleNamespace(status="completed", output=[object()])) is True
    assert transport.validate_response(SimpleNamespace(status="completed", output=[], output_text="answer")) is True
    assert transport.validate_response(SimpleNamespace(status="completed", output=[], output_text="  ")) is False


def test_anthropic_messages_transport_validates_content_blocks():
    transport = AnthropicMessagesTransport()

    assert transport.validate_response(None) is False
    assert transport.validate_response(SimpleNamespace(content=[])) is False
    assert transport.validate_response(SimpleNamespace(content=[object()])) is True


def test_bedrock_transport_accepts_normalized_converse_response():
    response = SimpleNamespace(choices=[object()])

    assert BedrockConverseTransport().validate_response(response) is True


def test_codex_responses_transport_passes_xhigh_and_max_as_distinct_efforts():
    transport = CodexResponsesTransport()

    xhigh = transport.build_kwargs(
        model="gpt-6.1-sol",
        messages=[],
        reasoning_config={"enabled": True, "effort": "xhigh"},
    )
    maximum = transport.build_kwargs(
        model="gpt-6.1-sol",
        messages=[],
        reasoning_config={"enabled": True, "effort": "max"},
    )
    disabled = transport.build_kwargs(
        model="gpt-6.1-sol",
        messages=[],
        reasoning_config={"enabled": False},
    )

    assert xhigh["reasoning"] == {"effort": "xhigh"}
    assert maximum["reasoning"] == {"effort": "max"}
    assert "reasoning" not in disabled


def test_codex_responses_transport_normalizes_text_tool_and_incomplete_outputs():
    transport = CodexResponsesTransport()
    text_response = SimpleNamespace(
        status="completed",
        output=[SimpleNamespace(
            type="message",
            role="assistant",
            status="completed",
            content=[SimpleNamespace(type="output_text", text="answer")],
        )],
    )
    refusal_response = SimpleNamespace(
        status="completed",
        output=[SimpleNamespace(
            type="message",
            role="assistant",
            status="completed",
            content=[SimpleNamespace(type="refusal", refusal="I can't help with that request.")],
        )],
    )
    tool_response = SimpleNamespace(
        status="completed",
        output=[SimpleNamespace(
            type="function_call",
            status="completed",
            call_id="call-1",
            name="lookup",
            arguments='{"query":"x"}',
        )],
    )
    incomplete_response = SimpleNamespace(
        status="incomplete",
        output=[SimpleNamespace(
            type="message",
            role="assistant",
            status="incomplete",
            content=[SimpleNamespace(type="output_text", text="partial")],
        )],
    )

    text_message = transport.normalize_response(text_response)
    refusal_message = transport.normalize_response(refusal_response)
    tool_message = transport.normalize_response(tool_response)
    incomplete_message = transport.normalize_response(incomplete_response)

    assert text_message.content == "answer"
    assert text_message.finish_reason == "stop"
    assert refusal_message.content == "I can't help with that request."
    assert refusal_message.finish_reason == "stop"
    assert tool_message.tool_calls[0].function.name == "lookup"
    assert tool_message.finish_reason == "tool_calls"
    assert incomplete_message.content == "partial"
    assert incomplete_message.finish_reason == "incomplete"


def test_reasoning_effort_parser_preserves_max_and_xhigh():
    assert parse_reasoning_effort("max") == {"enabled": True, "effort": "max"}
    assert parse_reasoning_effort("xhigh") == {"enabled": True, "effort": "xhigh"}
    assert parse_reasoning_effort("ultra") is None


def test_unsupported_inherited_reasoning_effort_uses_provider_default():
    assert resolve_reasoning_config("max", ["low", "medium", "high", "xhigh"]) is None
    assert resolve_reasoning_config("xhigh", ["low", "medium", "high", "xhigh"]) == {
        "enabled": True,
        "effort": "xhigh",
    }
    assert resolve_reasoning_config("none", []) == {"enabled": False}


def test_codex_catalog_preserves_model_efforts_and_drops_ultra(tmp_path, monkeypatch):
    cache_path = tmp_path / "models_cache.json"
    cache_path.write_text(
        '{"models":[{"slug":"gpt-6.1-sol","supported_reasoning_levels":['
        '{"effort":"low"},{"effort":"xhigh"},{"effort":"max"},{"effort":"ultra"}]}]}',
        encoding="utf-8",
    )
    monkeypatch.setenv("CODEX_HOME", str(tmp_path))
    codex_models._MODEL_REASONING_EFFORTS.clear()

    assert _known_reasoning_efforts_for_model("gpt-6.1-sol", "openai-codex") == [
        "low", "xhigh", "max"
    ]
    assert _reasoning_allowed_efforts_for_model("gpt-6.1-sol", "openai-codex") == [
        "low", "xhigh", "max"
    ]
    assert _known_reasoning_efforts_for_model("unknown-future-model", "openai-codex") == []
    try:
        set_reasoning_effort("none", "gpt-6.1-sol", "openai-codex")
    except ValueError:
        pass
    else:
        raise AssertionError("model-scoped Codex settings must reject unsupported 'none'")

    groups = [{"provider_id": "openai-codex", "models": [{"id": "gpt-6.1-sol"}, {"id": "unknown-future-model"}]}]
    _annotate_model_reasoning_efforts(groups)

    assert groups[0]["models"][0]["reasoning_efforts"] == ["low", "xhigh", "max"]
    assert groups[0]["models"][1]["reasoning_efforts"] == []


def test_codex_api_model_catalog_preserves_cached_effort_metadata(monkeypatch):
    current_levels = [
        {"effort": "low"},
        {"effort": "xhigh"},
        {"effort": "max"},
        {"effort": "ultra"},
    ]

    class Response:
        status_code = 200

        @staticmethod
        def json():
            return {
                "models": [
                    {
                        "slug": "gpt-6.1-sol",
                        "priority": 1,
                        "supported_reasoning_levels": current_levels,
                    }
                ]
            }

    import httpx

    codex_models._MODEL_REASONING_EFFORTS.clear()
    monkeypatch.setattr(httpx, "get", lambda *args, **kwargs: Response())

    assert codex_models._fetch_models_from_api("test credential") == ["gpt-6.1-sol"]
    assert codex_models.get_codex_model_reasoning_efforts("gpt-6.1-sol") == [
        "low", "xhigh", "max"
    ]
    current_levels.clear()
    assert codex_models._fetch_models_from_api("test credential") == ["gpt-6.1-sol"]
    assert codex_models.get_codex_model_reasoning_efforts("gpt-6.1-sol") == []


def test_unknown_model_lookup_does_not_erase_live_reasoning_capabilities(tmp_path, monkeypatch):
    cache_path = tmp_path / "models_cache.json"
    cache_path.write_text(
        '{"models":[{"slug":"local-model","supported_reasoning_levels":[{"effort":"low"}]}]}',
        encoding="utf-8",
    )
    monkeypatch.setenv("CODEX_HOME", str(tmp_path))
    monkeypatch.setattr(codex_models, "_MODEL_REASONING_EFFORTS", {
        "live-model": ["high"],
        "known-without-levels": [],
    })
    assert codex_models.get_codex_model_reasoning_efforts("unknown-model") == []
    assert codex_models.get_codex_model_reasoning_efforts("live-model") == ["high"]
    assert codex_models.get_codex_model_reasoning_efforts("known-without-levels") == []
    assert codex_models.get_codex_model_reasoning_efforts("local-model") == ["low"]


def test_exact_documented_codex_efforts_work_without_external_cache(tmp_path, monkeypatch):
    monkeypatch.setenv('CODEX_HOME', str(tmp_path))
    monkeypatch.setattr(codex_models, '_MODEL_REASONING_EFFORTS', {})
    monkeypatch.setattr(codex_models, '_MODEL_REASONING_SOURCES', {})
    assert codex_models.get_codex_model_reasoning_metadata('@openai-codex:gpt-5.3-codex') == (
        ['low', 'medium', 'high', 'xhigh'], 'official_model_docs')
    assert codex_models.get_codex_model_reasoning_efforts('gpt-5.5') == ['none', 'low', 'medium', 'high', 'xhigh']
    assert codex_models.get_codex_model_reasoning_metadata('future-gpt-5.5-custom') == ([], 'unknown')
    assert codex_models.get_codex_model_reasoning_metadata('@another:gpt-5.5') == ([], 'unknown')


def test_explicit_empty_catalog_outranks_documented_codex_fallback(tmp_path, monkeypatch):
    monkeypatch.setenv('CODEX_HOME', str(tmp_path))
    monkeypatch.setattr(codex_models, '_MODEL_REASONING_EFFORTS', {'gpt-5.3-codex': []})
    monkeypatch.setattr(codex_models, '_MODEL_REASONING_SOURCES', {'gpt-5.3-codex': 'live_catalog'})
    (tmp_path / 'models_cache.json').write_text('{"models":[{"slug":"gpt-5.3-codex","supported_reasoning_levels":[{"effort":"high"}]}]}', 'utf-8')
    assert codex_models.get_codex_model_reasoning_metadata('gpt-5.3-codex') == ([], 'live_catalog')
    codex_models.get_codex_model_ids()
    assert codex_models.get_codex_model_reasoning_metadata('gpt-5.3-codex') == ([], 'live_catalog')


def test_catalog_annotation_preserves_provided_efforts_and_authoritative_empty():
    groups = [{'provider_id': 'openai-codex', 'models': [
        {'id': '@openai-codex:gpt-5.3-codex', 'reasoning_efforts': ['high', 'xhigh', 'ultra']},
        {'id': 'gpt-5.5', 'reasoning_efforts': []},
    ]}]
    _annotate_model_reasoning_efforts(groups)
    assert groups[0]['models'][0]['reasoning_efforts'] == ['high', 'xhigh']
    assert groups[0]['models'][1]['reasoning_efforts'] == []


def test_provider_evidence_uses_actual_fallback_provider_and_requires_success():
    result = {
        "provider": "fallback-provider",
        "model": "fallback-model",
        "completed": True,
        "interrupted": False,
        "partial": False,
        "final_response": "A complete answer.",
    }

    assert _provider_evidence_from_result(result) == {
        "provider_id": "fallback-provider",
        "model_id": "fallback-model",
        "successful_chat": True,
    }
    assert _provider_evidence_from_result({**result, "error": "upstream error"})["successful_chat"] is False
    assert _provider_evidence_from_result({**result, "interrupted": True})["successful_chat"] is False
    assert _provider_evidence_from_result({**result, "partial": True})["successful_chat"] is False
    assert _provider_evidence_from_result({**result, "completed": False})["successful_chat"] is False
    assert _provider_evidence_from_result({**result, "final_response": "  "})["successful_chat"] is False
    assert _provider_evidence_from_result({**result, "final_response": "I can't help with that request."})["successful_chat"] is True
    assert _provider_evidence_from_result({**result, "provider": ""}) is None
