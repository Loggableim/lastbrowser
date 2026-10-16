"""Groq stays a beta provider and its public errors do not leak a key."""

from runtime.groq_errors import groq_public_error
from providers import get_provider_profile


def test_groq_profile_uses_openai_compatible_base():
    profile = get_provider_profile("groq")
    assert profile is not None
    assert profile.base_url == "https://api.groq.com/openai/v1"
    assert profile.env_vars == ("GROQ_API_KEY",)
    assert profile.display_name == "Groq"


def test_invalid_key_message_does_not_echo_a_secret():
    message = groq_public_error(401)
    assert message is not None
    assert "ungültig" in message
    assert "gsk_" not in message
    assert "Bearer" not in message


def test_rate_limit_message_names_429_and_is_not_a_product_bug():
    message = groq_public_error(429, retry_after="12")
    assert message is not None
    assert "429" in message
    assert "kein Fehler von LastBrowser" in message
    assert "12" in message
