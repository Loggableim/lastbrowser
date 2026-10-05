"""Scope and strict contracts fail closed before any agent work is admitted."""
from __future__ import annotations

import os
from pathlib import Path

import pytest
from pydantic import TypeAdapter, ValidationError

from runtime.independent.contracts import (
    BackendProfileRef, Budget, InterviewAnswer, InterviewModelReply, PermissionScope,
    ProfilePatch, ProviderSelection, RunContext, Scope, SpaceBinding, new_id,
)
from runtime.independent.scope import ScopeError, ScopeResolver, build_confirmed_profile_context
from runtime.independent.store import IndependentStore, ResourceBusy
from web.api.space_engine import Space


def configured(tmp_path):
    home = tmp_path / "profiles" / "a"
    home.mkdir(parents=True)
    space = Space("research", custom_root=home / "spaces")
    space.save_config({"name": "Research", "model": {"default": "test-model"}}, mint_space_id=True)
    scope = Scope(backend_profile_id=new_id(), space_id=space.load_config()["space_id"], browser_profile_id="default")
    store = IndependentStore(home, scope.backend_profile_id)
    store.register_profile(BackendProfileRef(backend_profile_id=scope.backend_profile_id, name="a", canonical_home=str(home)))
    binding = SpaceBinding(scope=scope, native_slug="research", partition_key="persist:space_research_default")
    store.bind_space(binding)
    resolver = ScopeResolver(store, profiles_provider=lambda: [{"name": "a", "path": str(home)}], partitions_provider=lambda _: binding.partition_key)
    return home, space, scope, store, resolver


def context(scope, home, space, **updates):
    return RunContext(run_id=new_id(), dispatch_id=new_id(), scope=scope, resolved_profile_home=str(home), resolved_space_root=str(space.root), backend_profile_name="a", partition_key="persist:space_research_default", binding_revision=1, provider=ProviderSelection(provider_config_ref="provider:a", model="test-model"), effective_permissions=PermissionScope(), runner_generation=new_id(), cancellation_token=new_id(), **updates)


def test_existing_native_identity_read_does_not_mutate_home_or_active_profile(tmp_path):
    home, space, scope, store, resolver = configured(tmp_path)
    before = space.config_path.read_bytes()
    env = dict(os.environ)
    try:
        result = resolver.resolve(scope, authenticated_profile_name="a")
        assert result.space_root == space.root
        assert resolver.validate_context(context(scope, home, space)).scope == scope
        assert space.config_path.read_bytes() == before
        assert dict(os.environ) == env
    finally:
        store.close()


def test_invalid_unknown_or_foreign_profiles_do_not_fall_back_to_default(tmp_path):
    _, _, scope, store, resolver = configured(tmp_path)
    try:
        with pytest.raises(ScopeError):
            resolver.resolve_profile(new_id())
        with pytest.raises(ScopeError):
            resolver.resolve(scope, authenticated_profile_name="../../default")
        foreign = scope.model_copy(update={"backend_profile_id": new_id()})
        with pytest.raises(ScopeError):
            resolver.resolve(foreign)
        missing = ScopeResolver(store, profiles_provider=lambda: [])
        with pytest.raises(ScopeError):
            missing.resolve(scope)
    finally:
        store.close()


def test_home_move_or_partition_swap_requires_explicit_migration(tmp_path):
    home, space, scope, store, resolver = configured(tmp_path)
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    try:
        moved = ScopeResolver(store, profiles_provider=lambda: [{"name": "a", "path": str(elsewhere)}])
        with pytest.raises(ScopeError):
            moved.resolve(scope)
        swapped = ScopeResolver(store, profiles_provider=resolver.profiles_provider, partitions_provider=lambda _: "persist:foreign")
        with pytest.raises(ScopeError):
            swapped.resolve(scope)
        forged = context(scope, home, space).model_copy(update={"resolved_profile_home": str(elsewhere)})
        with pytest.raises(ScopeError):
            resolver.validate_context(forged)
    finally:
        store.close()


def test_duplicate_native_ids_and_missing_legacy_ids_are_rejected_on_reads(tmp_path):
    home, space, scope, store, resolver = configured(tmp_path)
    duplicate = Space("duplicate", custom_root=home / "spaces")
    try:
        duplicate.save_config({"space_id": scope.space_id})
        with pytest.raises(ScopeError):
            resolver.resolve(scope)
        duplicate.config_path.unlink()
        space.save_config({"name": "Legacy"})
        before = space.config_path.read_bytes()
        with pytest.raises(ScopeError):
            resolver.resolve(scope)
        assert space.config_path.read_bytes() == before
    finally:
        store.close()


def test_browser_partition_collision_and_tombstone_are_durable(tmp_path):
    _, _, scope, store, _ = configured(tmp_path)
    try:
        foreign = scope.model_copy(update={"space_id": new_id()})
        with pytest.raises(ResourceBusy):
            store.bind_space(SpaceBinding(scope=foreign, native_slug="foreign", partition_key="persist:space_research_default"))
        tombstone = store.tombstone_binding(scope, expected_revision=1)
        assert tombstone.tombstoned_at
        assert store.list_bindings() == ()
        with pytest.raises(Exception, match="resurrected"):
            store.bind_space(SpaceBinding(scope=scope, native_slug="research", partition_key="persist:space_research_default"), expected_revision=2)
    finally:
        store.close()


def test_space_directory_symlink_cannot_escape_profile(tmp_path, symlink_capable):
    home, _, scope, store, resolver = configured(tmp_path)
    outside = tmp_path / "outside"
    outside.mkdir()
    (home / "spaces" / "escape").symlink_to(outside, target_is_directory=True)
    try:
        with pytest.raises(ScopeError):
            resolver.resolve(scope)
    finally:
        store.close()


def test_interview_schema_requires_three_or_four_distinct_options_and_equal_free_text():
    adapter = TypeAdapter(InterviewModelReply)
    valid = {"kind": "question", "basedOnRevision": 1, "topic": "purpose", "prompt": "What is this Space for?", "options": [{"id": str(i), "label": f"Choice {i}"} for i in range(3)], "allowFreeText": True}
    reply = adapter.validate_python(valid)
    assert len(reply.options) == 3 and reply.allow_free_text is True
    for mutation in ({"options": valid["options"][:2]}, {"options": valid["options"] * 2}, {"allowFreeText": False}, {"options": [valid["options"][0]] * 3}, {"basedOnRevision": "1"}, {"permissions": {"send": True}}):
        with pytest.raises(ValidationError):
            adapter.validate_python({**valid, **mutation})
    free = InterviewAnswer(question_id=new_id(), free_text="My own purpose", expected_revision=1, client_request_id=new_id())
    assert free.selected_option_ids == ()
    with pytest.raises(ValidationError):
        InterviewAnswer(question_id=new_id(), free_text="  ", expected_revision=1, client_request_id=new_id())


def test_preferences_cannot_enable_permissions_and_context_is_frozen(tmp_path):
    with pytest.raises(ValidationError):
        ProfilePatch.model_validate({"purpose": "Research", "allowedEffects": ["send"]})
    with pytest.raises(ValidationError):
        PermissionScope(raw_cdp=True)
    with pytest.raises(ValidationError):
        PermissionScope(browser_origins=("https://example.com/private",))
    home, space, scope, store, _ = configured(tmp_path)
    try:
        ctx = context(scope, home, space)
        with pytest.raises(ValidationError):
            ctx.scope = scope.model_copy(update={"space_id": new_id()})
        assert isinstance(ctx.resource_lease_refs, tuple)
        assert build_confirmed_profile_context(None) == ""
        with pytest.raises(ValidationError):
            Budget(max_safe_read_retries=3)
    finally:
        store.close()
