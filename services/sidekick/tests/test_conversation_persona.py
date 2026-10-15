"""A conversation keeps the persona it started with; only legacy ones adopt once."""
from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

import runtime.independent.companion as companion
import runtime.independent.native_chat_protocol as protocol
from runtime.independent.contracts import Scope


@pytest.fixture
def space(tmp_path, monkeypatch):
    """One Space with its real companion state and a turn context bound to it."""
    scope = Scope(backend_profile_id=str(uuid.uuid4()), space_id=str(uuid.uuid4()), browser_profile_id="browser-a")
    home = tmp_path / "home"
    root = tmp_path / "space"
    home.mkdir()
    root.mkdir()
    resolver = SimpleNamespace(resolve=lambda scope, **_: SimpleNamespace(scope=scope, profile_home=home, space_root=root))
    store = SimpleNamespace(list_bindings=lambda: [SimpleNamespace(scope=scope)])
    # The binding check has its own tests; these tests pin only the persona rules.
    monkeypatch.setattr(protocol, "verify_native_context", lambda context: None)
    return SimpleNamespace(scope=scope, store=store, resolver=resolver,
                           context=SimpleNamespace(scope=scope, space_root=root, profile_home=home))


def choose(space, personality):
    """Change the Space's global persona through the same call the header and sidebar use."""
    current = companion.companion_operation(space.store, space.resolver, space.scope, "default", {"action": "get"})
    return companion.companion_operation(space.store, space.resolver, space.scope, "default", {
        "action": "set", "personality": personality, "expectedRevision": current["revision"],
        "clientRequestId": str(uuid.uuid4())})


def start(space):
    return companion.start_conversation_companion(space.store, space.resolver, space.scope, "default")


def test_new_conversation_takes_the_current_persona(space):
    choose(space, "developer")

    assert start(space) == {"personality": "developer", "botName": "Patch"}


def test_conversation_keeps_its_snapshot_after_a_global_persona_change(space):
    choose(space, "developer")
    conversation = SimpleNamespace(companion=start(space))
    choose(space, "mentor")

    persona, adopted = companion.conversation_companion_for_turn(conversation, space.context)

    assert persona == {"personality": "developer", "botName": "Patch"}
    assert adopted is False
    assert conversation.companion == {"personality": "developer", "botName": "Patch"}
    # A conversation started after the change takes the new persona.
    assert start(space) == {"personality": "mentor", "botName": "Zen"}


def test_legacy_conversation_without_snapshot_adopts_the_persona_once(space):
    choose(space, "analytical")
    conversation = SimpleNamespace(companion=None)

    first, adopted = companion.conversation_companion_for_turn(conversation, space.context)

    assert first == {"personality": "analytical", "botName": "Orion"}
    assert adopted is True
    assert conversation.companion == first

    choose(space, "creative")
    second, adopted_again = companion.conversation_companion_for_turn(conversation, space.context)

    assert second == first
    assert adopted_again is False


@pytest.mark.parametrize("stored", [
    {"personality": "unknown", "botName": "Ghost"},
    {"personality": "mentor", "botName": "x" * 81},
    {"personality": "mentor", "botName": "bad\x07name"},
    "not-a-snapshot",
])
def test_unusable_snapshot_is_treated_as_legacy(space, stored):
    choose(space, "creative")
    conversation = SimpleNamespace(companion=stored)

    persona, adopted = companion.conversation_companion_for_turn(conversation, space.context)

    assert persona == {"personality": "creative", "botName": "Spark"}
    assert adopted is True


def test_failed_snapshot_leaves_the_conversation_to_adopt_on_its_first_turn(space, monkeypatch):
    choose(space, "mentor")
    conversation = SimpleNamespace(companion=None)

    def unavailable(*args, **kwargs):
        raise OSError("companion state unavailable")

    with monkeypatch.context() as patch:
        patch.setattr(companion, "companion_operation", unavailable)
        assert start(space) is None

    persona, adopted = companion.conversation_companion_for_turn(conversation, space.context)

    assert persona == {"personality": "mentor", "botName": "Zen"}
    assert adopted is True


def test_snapshot_survives_save_and_reload_without_following_the_global_choice(space, tmp_path, monkeypatch):
    from web.api import models
    from web.api.config import clear_session_dir, set_session_dir

    choose(space, "developer")
    session = models.Session(session_id=uuid.uuid4().hex, title="Persona", workspace=str(tmp_path / "workspace"),
                             model="test-model", model_provider="test-provider", companion=start(space))
    choose(space, "mentor")
    # Keep the legacy mirror outside this test's directory; the snapshot lives in the session file.
    monkeypatch.setattr(models.Session, "_legacy_session_path", lambda self: None)
    set_session_dir(str(tmp_path / "sessions"))
    try:
        session.save()
        reloaded = models.Session.load(session.session_id)
    finally:
        clear_session_dir()

    assert reloaded.companion == {"personality": "developer", "botName": "Patch"}
