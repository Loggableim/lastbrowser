"""Recognize removed providers in legacy profiles without deleting credentials."""

def is_retired_provider(value: object) -> bool:
    identity = str(value or "").strip().lower().removeprefix("custom:")
    return identity in {"antigravity", "antigravity (google)", "antigravity-cli", "antigravity-cloud", "agy"} or identity.startswith("cloudcode-pa://antigravity")
