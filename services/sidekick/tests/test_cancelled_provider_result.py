"""A provider's late return must not replace an already persisted cancellation."""

import ast
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from threading import Event, Lock
from types import SimpleNamespace

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


def test_cancel_between_provider_guard_and_session_lock_cannot_persist():
    """Exercise the real locked guard after a deterministic checkpoint wait."""
    source = Path(__file__).parents[1] / "web" / "api" / "streaming.py"
    worker = next(node for node in ast.parse(source.read_text(encoding="utf-8")).body
                  if isinstance(node, ast.FunctionDef) and node.name == "_run_agent_streaming")
    locked_result = next(node for node in ast.walk(worker)
                         if isinstance(node, ast.With)
                         and len(node.items) == 1
                         and isinstance(node.items[0].context_expr, ast.Name)
                         and node.items[0].context_expr.id == "_agent_lock"
                         and node.body
                         and isinstance(node.body[0], ast.If)
                         and "active_stream_id" in ast.unparse(node.body[0].test))
    guard = locked_result.body[0]
    probe = ast.FunctionDef(name="probe", args=ast.arguments(
        posonlyargs=[], args=[ast.arg(arg=name) for name in
                             ("cancel_event", "s", "stream_id", "_agent_lock", "entered")],
        kwonlyargs=[], kw_defaults=[], defaults=[]),
        body=[ast.parse("if cancel_event.is_set(): return").body[0],
              ast.parse("entered.set()").body[0],
              ast.With(items=locked_result.items,
                       body=[guard, ast.parse("return 'persist-result'").body[0]])],
        decorator_list=[])
    namespace = {}
    module = ast.fix_missing_locations(ast.Module(body=[probe], type_ignores=[]))
    exec(compile(module, str(source), "exec"), namespace)

    lock, entered, cancelled = Lock(), Event(), Event()
    session = SimpleNamespace(active_stream_id="old-stream")
    with ThreadPoolExecutor(max_workers=1) as pool:
        with lock:
            result = pool.submit(namespace["probe"], cancelled, session, "old-stream", lock, entered)
            assert entered.wait(2)
            cancelled.set()
            session.active_stream_id = None
        assert result.result(timeout=2) is None

    assert namespace["probe"](Event(), SimpleNamespace(active_stream_id="old-stream"),
                              "old-stream", Lock(), Event()) == "persist-result"
