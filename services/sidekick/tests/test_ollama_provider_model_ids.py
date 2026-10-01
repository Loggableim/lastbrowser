"""Provider-qualified Ollama model IDs retain colon-delimited model tags."""

import pytest

from web.api import routes


@pytest.mark.parametrize(
    ("model_id", "expected_model", "expected_provider"),
    [
        ("@ollama-cloud:qwen3:32b", "qwen3:32b", "ollama-cloud"),
        ("@ollama:qwen3:4b", "qwen3:4b", "ollama"),
        ("@ollama-cloud:deepseek-v4.1-flash", "deepseek-v4.1-flash", "ollama-cloud"),
        ("@openrouter:deepseek/r1:free", "deepseek/r1:free", "openrouter"),
        ("@custom:my-key:Qwen3", "Qwen3", "custom:my-key"),
    ],
)
def test_provider_qualified_model_splits_at_valid_provider_boundary(
    model_id, expected_model, expected_provider
):
    assert routes._split_provider_qualified_model(model_id) == (
        expected_model,
        expected_provider,
    )


@pytest.mark.parametrize(
    ("model_id", "expected_model", "expected_provider"),
    [
        ("@ollama-cloud:qwen3:32b", "@ollama-cloud:qwen3:32b", "ollama-cloud"),
        ("@ollama:qwen3:4b", "@ollama:qwen3:4b", "ollama"),
    ],
)
def test_ollama_tag_model_request_keeps_full_id_and_provider(
    model_id, expected_model, expected_provider
):
    model, provider = routes._session_model_state_from_request(
        model_id,
        requested_provider=None,
        current_provider="openrouter",
    )

    assert model == expected_model
    assert provider == expected_provider
