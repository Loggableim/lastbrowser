from web.api.runtime_identity import RUNTIME_GENERATION, provider_config_generation, rotate_provider_config_generation


def test_provider_generations_are_opaque_stable_and_rotate_on_account_config_changes():
    before = provider_config_generation(" OpenRouter ")
    assert before == provider_config_generation("openrouter")
    assert before != "openrouter"
    assert before not in RUNTIME_GENERATION

    after = rotate_provider_config_generation("openrouter")
    assert after != before
    assert after == provider_config_generation("openrouter")
    assert RUNTIME_GENERATION
