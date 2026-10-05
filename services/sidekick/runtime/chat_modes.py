"""Explicit per-turn chat modes; a prompt cannot authorize a mode change.

The frozen policy is passed on the agent instance and every tool invocation.
It therefore also applies in concurrent tool threads without ambient globals.
Existing tool authorization remains authoritative in action and boost modes.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping


MODES = frozenset({"action", "plan", "grill_me", "boost"})
LIFETIMES = frozenset({"chat", "next_turn"})
PLAN_READ_TOOLS = frozenset({"read_file", "search_files"})


class ChatModeConflict(ValueError):
    code = "chat_mode_revision_conflict"


@dataclass(frozen=True)
class ChatExecutionPolicy:
    mode: str
    revision: int
    max_parallel_children: int = 3
    max_child_iterations: int = 50

    def __post_init__(self) -> None:
        if self.mode not in MODES or type(self.revision) is not int or self.revision < 0:
            raise ValueError("Invalid chat execution policy")
        if type(self.max_parallel_children) is not int or not 1 <= self.max_parallel_children <= 6:
            raise ValueError("Invalid subagent concurrency budget")
        if type(self.max_child_iterations) is not int or not 1 <= self.max_child_iterations <= 100:
            raise ValueError("Invalid subagent iteration budget")

    def view(self) -> dict[str, Any]:
        return {"schemaVersion": 1, "mode": self.mode, "revision": self.revision,
                "maxParallelChildren": self.max_parallel_children,
                "maxChildIterations": self.max_child_iterations}


def tool_denial(policy: ChatExecutionPolicy | None, name: str,
                arguments: Mapping[str, Any] | None) -> str | None:
    """Deny before hooks, checkpoint side effects, or actual tool dispatch."""
    if policy is None:
        return None
    if not isinstance(policy, ChatExecutionPolicy):
        return "chat_mode_policy_invalid"
    if policy.mode == "grill_me":
        return "grill_me_tools_disabled"
    if policy.mode == "plan" and name not in PLAN_READ_TOOLS:
        return "plan_mode_read_only"
    if policy.mode == "boost" and name == "delegate_task":
        args = arguments if isinstance(arguments, Mapping) else {}
        tasks = args.get("tasks")
        if tasks is not None and (not isinstance(tasks, list) or not tasks
                                  or len(tasks) > policy.max_parallel_children):
            return "boost_subagent_budget_exceeded"
        iterations = args.get("max_iterations")
        if iterations is not None and (type(iterations) is not int or iterations < 1
                                       or iterations > policy.max_child_iterations):
            return "boost_subagent_budget_exceeded"
    return None


def settings_view(raw: Any) -> dict[str, Any]:
    """Legacy absence is action; malformed persisted state fails closed."""
    if raw is None:
        return {"schemaVersion": 1, "mode": "action", "lifetime": "chat", "revision": 0}
    if not isinstance(raw, dict) or raw.get("schemaVersion") != 1:
        raise ValueError("Invalid saved chat mode")
    mode, lifetime, revision = raw.get("mode"), raw.get("lifetime"), raw.get("revision")
    if mode not in MODES or lifetime not in LIFETIMES or type(revision) is not int or revision < 0:
        raise ValueError("Invalid saved chat mode")
    return {"schemaVersion": 1, "mode": mode, "lifetime": lifetime, "revision": revision}


def update_settings(raw: Any, *, mode: Any, lifetime: Any, expected_revision: Any) -> dict[str, Any]:
    current = settings_view(raw)
    if mode not in MODES or lifetime not in LIFETIMES:
        raise ValueError("Unsupported chat mode or lifetime")
    if type(expected_revision) is not int or expected_revision != current["revision"]:
        raise ChatModeConflict("Chat mode changed; reload the current chat")
    return {"schemaVersion": 1, "mode": mode, "lifetime": lifetime,
            "revision": current["revision"] + 1}


def capture_policy(raw: Any, *, requested_mode: Any = None, config: Any = None
                   ) -> tuple[ChatExecutionPolicy, dict[str, Any]]:
    """Consume next_turn under the caller's transcript writer reservation."""
    current = settings_view(raw)
    requested = str(requested_mode or "").strip().lower()
    if requested and requested not in MODES:
        raise ValueError("Unsupported chat mode")
    mode = requested or current["mode"]
    cfg = config if isinstance(config, Mapping) else {}
    delegation = cfg.get("delegation", {})
    delegation = delegation if isinstance(delegation, Mapping) else {}
    children = delegation.get("max_concurrent_children", 3)
    iterations = delegation.get("max_iterations", 50)
    children = min(6, max(1, children)) if type(children) is int else 3
    iterations = min(100, max(1, iterations)) if type(iterations) is int else 50
    policy = ChatExecutionPolicy(mode, current["revision"], children, iterations)
    persisted = dict(current)
    if current["lifetime"] == "next_turn":
        persisted = {"schemaVersion": 1, "mode": "action", "lifetime": "chat",
                     "revision": current["revision"] + 1}
    return policy, persisted


def mode_instruction(policy: ChatExecutionPolicy) -> str:
    if policy.mode == "plan":
        return ("\n\nMODE: PLAN. Build a concrete plan from the request and available context. "
                "Only read_file/search_files are available for inspection. All writing, terminal, "
                "delegation, network and unknown tools are blocked by the runtime. "
                "Explain unresolved facts. The user chooses when to switch to Action.")
    if policy.mode == "grill_me":
        return ("\n\nMODE: GRILL ME. Clarify the user's objective with focused adaptive questions. "
                "For each question provide three or four distinct, equally valid answer options "
                "and accept free text equally. Ask only about unresolved points, incorporate "
                "corrections, and offer a reasoned summary when enough context exists or when "
                "the user requests completion. Never navigate or launch work. Tools are disabled.")
    if policy.mode == "boost":
        return ("\n\nMODE: BOOST. Prefer delegation of independent, useful subtasks when this "
                "actually reduces work. Preserve all existing authorization and approval rules. "
                f"At most {policy.max_parallel_children} children in a batch, each at most "
                f"{policy.max_child_iterations} iterations. Do not invent subtasks or recursive "
                "delegation to fill the budget. Report actual work and combine its results.")
    return ""
