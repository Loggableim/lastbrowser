"""Public Groq error text. Never include the API key."""

from __future__ import annotations


def groq_public_error(status_code: int | None, retry_after: str | None = None) -> str | None:
    """Return a user-facing message for Groq auth and quota failures."""
    if status_code == 401:
        return (
            "Der Groq-API-Schlüssel ist ungültig. "
            "Trag einen eigenen Schlüssel in den Einstellungen ein."
        )
    if status_code == 429:
        wait = f" Erneuter Versuch nach {retry_after} Sekunden." if retry_after else ""
        return (
            "Groq-Limit erreicht (429). Das Gratis-Kontingent oder das Rate-Limit ist leer. "
            "Das ist kein Fehler von LastBrowser."
            + wait
        )
    return None
