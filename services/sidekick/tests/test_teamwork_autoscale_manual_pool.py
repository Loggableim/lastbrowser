"""Manual Teamwork pools must still honor dynamic worker scaling."""
from unittest.mock import patch

import pytest

from runtime.teamwork_orchestrator import resolve_team_plan


@pytest.mark.parametrize(
    ("auto_scale", "expected_workers"),
    # A complete turn is capped at four workers so planner + workers + critic
    # + synthesis fit the published request/token budget. The configured pool
    # remains the full eligibility set for each plan.
    [(True, 2), (False, 4)],
)
def test_manual_worker_pool_defines_eligibility_without_disabling_autoscale(
    auto_scale, expected_workers,
):
    pool = [
        {
            "id": f"model-{index}",
            "call_model": f"model-{index}",
            "name": f"Model {index}",
            "provider": f"provider-{index}",
            "tier": "balanced",
        }
        for index in range(8)
    ]

    with patch("runtime.teamwork_orchestrator.get_teamwork_model_pool", return_value=pool):
        plan = resolve_team_plan(
            "What is 2 + 2?",
            {
                "strategy": "balanced",
                "auto_scale": auto_scale,
                "max_subagents": 8,
                "roles": {
                    "planner": "auto",
                    "worker_pool": [model["id"] for model in pool],
                    "critic": "auto",
                    "synthesizer": "auto",
                },
            },
        )

    assert len(plan["workers"]) == expected_workers
    assert [model["id"] for model in plan["worker_pool"]] == [model["id"] for model in pool]
    assert [worker["model"] for worker in plan["workers"]] == [
        model["id"] for model in pool[:expected_workers]
    ]
