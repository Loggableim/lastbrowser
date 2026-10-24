"""Groq chat provider profile.

OpenAI-compatible chat at https://api.groq.com/openai/v1. The key is the
user's own GROQ_API_KEY. This provider is a beta test, not a default.
"""

from providers import register_provider
from providers.base import ProviderProfile

groq = ProviderProfile(
    name="groq",
    aliases=("groq-chat",),
    env_vars=("GROQ_API_KEY",),
    display_name="Groq",
    description="Groq — OpenAI-compatible chat, beta test",
    signup_url="https://console.groq.com/keys",
    fallback_models=(),
    base_url="https://api.groq.com/openai/v1",
)

register_provider(groq)
