"""A provider's late return must not replace an already persisted cancellation."""

import ast
from pathlib import Path
from threading import Event

import pytest


@pytest.mark.parametrize("cancelled", [True, False])
def test_late_provider_return_respects_cancel_before_persistence(cancelled):
    # Execute the real worker segment between the provider return and the
    # ephemeral/persistence paths, without constructing a paid provider client.
    source = Path(__file__).parents[1] / "web" / "api" / "streaming.py"
    tree = ast.parse(source.read_text(encoding="utf-8"))
    worker = next(n for n in tree.body if isinstance(n, ast.FunctionDef)
                  and n.name == "_run_agent_streaming")
    segment = None
    for parent in ast.walk(worker):
        body = getattr(parent, "body", None)
        if not isinstance(body, list):
            continue
        for i, node in enumerate(body):
            if (isinstance(node, ast.Assign) and isinstance(node.value, ast.Call)
                    and isinstance(node.value.func, ast.Attribute)
                    and node.value.func.attr == "run_conversation"):
                end = next((j for j in range(i + 1, len(body))
                           if isinstance(body[j], ast.If)
                           and isinstance(body[j].test, ast.Name)
                           and body[j].test.id == "ephemeral"), None)
                if end is None:
                    continue
                segment = body[i + 1:end]
    assert segment is not None
    # Reaching this sentinel represents overwriting the cancellation state.
    sentinel = ast.parse("return 'persist-result'").body[0]
    probe = ast.FunctionDef(name="probe", args=ast.arguments(
        posonlyargs=[], args=[ast.arg(arg="cancel_event")], kwonlyargs=[],
        kw_defaults=[], defaults=[]), body=[*segment, sentinel], decorator_list=[])
    module = ast.fix_missing_locations(ast.Module(body=[probe], type_ignores=[]))
    namespace = {}
    exec(compile(module, str(source), "exec"), namespace)
    flag = Event()
    if cancelled:
        flag.set()
    assert namespace["probe"](flag) == (None if cancelled else "persist-result")
