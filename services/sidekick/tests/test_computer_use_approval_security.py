from __future__ import annotations

import pytest

from runtime.tool_guardrails import ToolCallGuardrailController
from tools.computer_use.approval import (
    ApprovalRegistry,
    action_parameters_fingerprint,
    compute_action_target_fingerprint,
)


def _issue(registry: ApprovalRegistry, params: dict, *, run_id: str = "host-task-1", ttl: float = 30) -> tuple[str, str, str]:
    action = "physical_input"
    target = compute_action_target_fingerprint(action, params)
    fingerprint = action_parameters_fingerprint(action, params)
    token = registry.issue_token(
        action=action,
        target=target,
        snapshot_id=str(params["snapshot_id"]),
        run_id=run_id,
        ttl_seconds=ttl,
        parameters_fingerprint=fingerprint,
    )
    return token, target, fingerprint


def _validate(registry: ApprovalRegistry, token: str, params: dict, *, run_id: str = "host-task-1"):
    action = "physical_input"
    return registry.validate_and_consume(
        token=token,
        action=action,
        target=compute_action_target_fingerprint(action, params),
        snapshot_id=str(params.get("snapshot_id") or ""),
        run_id=run_id,
        parameters_fingerprint=action_parameters_fingerprint(action, params),
    )


def test_approval_requires_every_binding_at_issue_and_consume():
    registry = ApprovalRegistry()
    with pytest.raises(ValueError, match="target"):
        registry.issue_token("invoke", snapshot_id="s", run_id="r", parameters_fingerprint="f")
    with pytest.raises(ValueError, match="parameters_fingerprint"):
        registry.issue_token("invoke", target="element:1", snapshot_id="s", run_id="r")

    params = {"snapshot_id": "s1", "actions": [{"type": "click", "x": 20, "y": 30}]}
    token, target, fingerprint = _issue(registry, params)
    assert registry.validate_and_consume(token, "physical_input", target, "s1", "host-task-1")[0] is False
    assert registry.validate_and_consume(token, "physical_input", target, "", "host-task-1", fingerprint)[0] is False
    assert _validate(registry, token, params)[0] is True


@pytest.mark.parametrize("ttl", [0, -1, float("nan"), float("inf"), 301])
def test_invalid_ttl_cannot_create_nonexpiring_or_unbounded_approval(ttl):
    with pytest.raises(ValueError, match="ttl"):
        ApprovalRegistry().issue_token(
            "invoke", "element:1", "snapshot", "host-task", ttl_seconds=ttl,
            parameters_fingerprint="digest",
        )


def test_forged_expired_replayed_and_cross_run_approvals_fail_closed(monkeypatch):
    registry = ApprovalRegistry()
    params = {"snapshot_id": "snap-a", "actions": [{"type": "click", "x": 1, "y": 2}]}
    token, _, _ = _issue(registry, params)
    assert _validate(registry, "appr_forged", params)[0] is False
    assert _validate(registry, token, params, run_id="another-host-task")[0] is False
    assert _validate(registry, token, params)[0] is True
    assert _validate(registry, token, params)[0] is False

    now = [100.0]
    monkeypatch.setattr("tools.computer_use.approval.time.monotonic", lambda: now[0])
    expired, _, _ = _issue(registry, params, ttl=1)
    now[0] += 2
    assert _validate(registry, expired, params)[0] is False


@pytest.mark.parametrize(
    "mutate",
    [
        lambda p: p.update(snapshot_id="snap-b"),
        lambda p: p["actions"][0].update(x=99),
        lambda p: p["actions"][0].update(type="type", text="changed"),
    ],
)
def test_changed_snapshot_or_any_effectful_parameter_invalidates_approval(mutate):
    registry = ApprovalRegistry()
    approved = {"snapshot_id": "snap-a", "actions": [{"type": "click", "x": 1, "y": 2}]}
    changed = {"snapshot_id": "snap-a", "actions": [{"type": "click", "x": 1, "y": 2}]}
    token, _, _ = _issue(registry, approved)
    mutate(changed)
    assert _validate(registry, token, changed)[0] is False


def test_fingerprint_is_canonical_and_excludes_only_capability_and_run_fields():
    a = {"snapshot_id": "s", "value": 0, "approval_id": "first", "run_id": "host-a"}
    b = {"run_id": "host-b", "approval_id": "second", "value": 0, "snapshot_id": "s"}
    assert action_parameters_fingerprint("set_value", a) == action_parameters_fingerprint("set_value", b)
    b["value"] = 1
    assert action_parameters_fingerprint("set_value", a) != action_parameters_fingerprint("set_value", b)


def test_trusted_approval_authorizes_exact_fake_action_once():
    registry = ApprovalRegistry()
    params = {"snapshot_id": "s1", "actions": [{"type": "click", "x": 4, "y": 8}]}
    token, _, _ = _issue(registry, params)
    effects = []
    approved, _ = _validate(registry, token, params)
    if approved:
        effects.append((params["actions"][0]["x"], params["actions"][0]["y"]))
    replayed, _ = _validate(registry, token, params)
    if replayed:
        effects.append((params["actions"][0]["x"], params["actions"][0]["y"]))
    assert effects == [(4, 8)]


@pytest.mark.parametrize(
    "args",
    [
        {"action": "physical_input", "actions": [{"type": "type", "text": "powershell.exe -enc abc"}]},
        {"action": "physical_input", "actions": [{"type": "key", "keys": "ctrl+shift+i"}]},
        {"action": "key", "keys": "Win+R"},
        {"action": "navigate", "url": "javascript:alert(1)"},
    ],
)
def test_runtime_guardrail_blocks_known_shell_or_devtools_escape_routes(args):
    decision = ToolCallGuardrailController().before_call("computer_use", args)
    assert decision.action == "block"
    assert decision.code == "computer_use_escape_block"


def test_runtime_guardrail_keeps_ordinary_ui_text_available():
    decision = ToolCallGuardrailController().before_call(
        "computer_use", {"action": "physical_input", "actions": [{"type": "type", "text": "Hello from a form"}]}
    )
    assert decision.allows_execution
