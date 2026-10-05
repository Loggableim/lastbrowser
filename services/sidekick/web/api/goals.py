"""WebUI bridge for Sidekick persistent session goals."""

from __future__ import annotations

import copy
import hashlib
import json
import logging
import re
import threading
import time
import uuid
import sqlite3
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

try:  # Exposed as a module attribute so tests can monkeypatch it directly.
    from cli.goals import (  # type: ignore
        CONTINUATION_PROMPT_TEMPLATE,
        DEFAULT_MAX_CONSECUTIVE_PARSE_FAILURES,
        DEFAULT_MAX_TURNS,
        GoalManager as _NativeGoalManager,
        GoalState,
        bounded_goal_evidence,
        format_goal_turn_budget,
        judge_goal,
        normalize_goal_turn_budget,
        persist_goal_state,
        GoalRevisionConflict,
        _COMMAND_RECEIPT,
    )
except Exception:  # pragma: no cover - depends on installed sidekick-agent
    CONTINUATION_PROMPT_TEMPLATE = ""  # type: ignore
    DEFAULT_MAX_CONSECUTIVE_PARSE_FAILURES = 3  # type: ignore
    DEFAULT_MAX_TURNS = 20  # type: ignore
    _NativeGoalManager = None  # type: ignore
    GoalState = None  # type: ignore
    judge_goal = None  # type: ignore
    def format_goal_turn_budget(max_turns):  # type: ignore
        try:
            value = int(max_turns) if max_turns is not None else None
        except (TypeError, ValueError):
            value = None
        return "∞" if value is None or value <= 0 else str(value)

    def normalize_goal_turn_budget(max_turns, *, default=20, unlimited=False):  # type: ignore
        if unlimited:
            return None
        if max_turns is None:
            return int(default or DEFAULT_MAX_TURNS or 20)
        try:
            value = int(max_turns)
        except (TypeError, ValueError):
            return int(default or DEFAULT_MAX_TURNS or 20)
        return None if value <= 0 else value

GoalManager = _NativeGoalManager  # type: ignore

_DB_CACHE: dict[str, Any] = {}

# A continuation event is delivered to the renderer before it can POST the
# next chat turn. Keep that hand-off scoped and synchronized with pause/clear.
# The old set in config.py only recorded a session id, so a later pause could
# not invalidate the already-emitted continuation prompt.
_CONTINUATION_LOCK = threading.RLock()
_PENDING_CONTINUATIONS: dict[tuple[str, str, str], str] = {}
_CANCELLED_CONTINUATIONS: dict[tuple[str, str, str], str] = {}
# A continuation claim is persisted before its worker is started so duplicate
# requests cannot launch two turns. Keep a process-local in-flight marker too:
# session reads must not mistake the short claim→stream-registration window (or
# a currently running turn) for a crashed worker and rearm it prematurely.
_IN_FLIGHT_CONTINUATIONS: set[tuple[str, str, str, int]] = set()
_GOAL_RUN_MARKER_RE = re.compile(r"\n\n<!-- lastbrowser-goal-run:([0-9a-f]{32}:\d+) -->$")


def _is_internal_goal_continuation(text: str) -> bool:
    prefix = str(CONTINUATION_PROMPT_TEMPLATE or "").split("{goal}", 1)[0]
    return bool(prefix and str(text or "").startswith(prefix))


def strip_goal_continuation_marker(text: str) -> str:
    """Remove the durable run discriminator before the prompt reaches the model."""
    return _GOAL_RUN_MARKER_RE.sub("", str(text or "").strip())


def _continuation_key(
    session_id: str,
    *,
    profile_home: str | Path | None = None,
    space_slug: str | None = None,
) -> tuple[str, str, str]:
    try:
        profile_key = str(Path(profile_home).expanduser().resolve()) if profile_home else ""
    except Exception:
        profile_key = str(profile_home or "").strip()
    return (
        str(session_id or "").strip(),
        profile_key,
        str(space_slug or "").strip().lower(),
    )


def _claim_continuation_once(manager: Any) -> bool:
    claim = getattr(manager, "consume_continuation", None)
    # Lightweight manager doubles used by integrations predating durable
    # claims have no persisted state API; production GoalManager always does.
    return bool(claim()) if callable(claim) else True


def _in_flight_continuation_key(scope_key: tuple[str, str, str], turn: int) -> tuple[str, str, str, int]:
    return (*scope_key, int(turn))


def goal_continuation_claim_turn(
    session_id: str,
    *,
    profile_home: str | Path | None = None,
    space_slug: str | None = None,
) -> int | None:
    """Return the turn claimed by this process for the current stream start."""
    key = _continuation_key(session_id, profile_home=profile_home, space_slug=space_slug)
    with _CONTINUATION_LOCK:
        mgr = _manager(session_id, profile_home=profile_home, space_slug=space_slug)
        state = getattr(mgr, "state", None) if mgr is not None else None
        if state is None:
            return None
        turn = int(getattr(state, "turns_used", 0) or 0)
        return turn if _in_flight_continuation_key(key, turn) in _IN_FLIGHT_CONTINUATIONS else None


def queue_goal_continuation(
    session_id: str,
    prompt: str,
    *,
    profile_home: str | Path | None = None,
    space_slug: str | None = None,
) -> bool:
    """Queue a continuation only while the same scoped goal remains active."""
    sid = str(session_id or "").strip()
    text = str(prompt or "").strip()
    if not sid or not text:
        return False
    key = _continuation_key(sid, profile_home=profile_home, space_slug=space_slug)
    with _CONTINUATION_LOCK:
        mgr = _manager(sid, profile_home=profile_home, space_slug=space_slug)
        try:
            if mgr is None or not mgr.is_active() or mgr.next_continuation_prompt() != text:
                return False
        except Exception:
            return False
        _CANCELLED_CONTINUATIONS.pop(key, None)
        _PENDING_CONTINUATIONS[key] = text
        return True


def cancel_goal_continuation(
    session_id: str,
    *,
    profile_home: str | Path | None = None,
    space_slug: str | None = None,
) -> None:
    """Invalidate a queued continuation while retaining a one-shot tombstone.

    The renderer may already have received the event. The tombstone lets the
    next chat request reject that exact stale prompt instead of running it as
    an ordinary user message.
    """
    key = _continuation_key(session_id, profile_home=profile_home, space_slug=space_slug)
    with _CONTINUATION_LOCK:
        prompt = _PENDING_CONTINUATIONS.pop(key, None)
        if prompt:
            _CANCELLED_CONTINUATIONS[key] = prompt


def consume_goal_continuation(
    session_id: str,
    message: str,
    *,
    profile_home: str | Path | None = None,
    space_slug: str | None = None,
) -> str:
    """Return ``active``, ``cancelled``, or ``none`` for the pending hand-off.

    A different user message supersedes the queued continuation and records a
    tombstone for any delayed renderer POST. A matching prompt is only allowed
    through if its goal is still active in the same profile/Space.
    """
    key = _continuation_key(session_id, profile_home=profile_home, space_slug=space_slug)
    text = str(message or "").strip()
    with _CONTINUATION_LOCK:
        pending = _PENDING_CONTINUATIONS.get(key)
        if pending is not None:
            if text != pending:
                # A delayed internal continuation from an older goal run must
                # not supersede a newer queued continuation in the same scope.
                if _is_internal_goal_continuation(text):
                    return "cancelled"
                _PENDING_CONTINUATIONS.pop(key, None)
                _CANCELLED_CONTINUATIONS[key] = pending
                return "none"
            _PENDING_CONTINUATIONS.pop(key, None)
            mgr = _manager(session_id, profile_home=profile_home, space_slug=space_slug)
            try:
                if (
                    mgr is not None
                    and mgr.is_active()
                    and mgr.next_continuation_prompt() == pending
                    and _claim_continuation_once(mgr)
                ):
                    state = getattr(mgr, "state", None)
                    _IN_FLIGHT_CONTINUATIONS.add(
                        _in_flight_continuation_key(key, int(getattr(state, "turns_used", 0) or 0))
                    )
                    return "active"
            except Exception:
                pass
            _CANCELLED_CONTINUATIONS[key] = pending
            return "cancelled"

        cancelled = _CANCELLED_CONTINUATIONS.get(key)
        if cancelled is not None and text == cancelled:
            _CANCELLED_CONTINUATIONS.pop(key, None)
            return "cancelled"

        # The pending hand-off itself is process-local, while goal state is
        # durable. If the backend restarts after emitting goal_continue but
        # before the renderer POSTs it, recover that exact prompt from the
        # persisted active goal. Conversely, never let an orphaned internal
        # continuation fall through as an ordinary user message after pause,
        # clear, or goal replacement.
        if _is_internal_goal_continuation(text):
            try:
                mgr = _manager(session_id, profile_home=profile_home, space_slug=space_slug)
            except Exception:
                # This message already has the internal continuation prefix.
                # If the matching persisted goal cannot be loaded, never let
                # the prompt fall through as ordinary user text.
                return "cancelled"
            try:
                if (
                    mgr is not None
                    and mgr.is_active()
                    and mgr.next_continuation_prompt() == text
                    and _claim_continuation_once(mgr)
                ):
                    state = getattr(mgr, "state", None)
                    _IN_FLIGHT_CONTINUATIONS.add(
                        _in_flight_continuation_key(key, int(getattr(state, "turns_used", 0) or 0))
                    )
                    return "active"
            except Exception:
                pass
            return "cancelled"
        return "none"


def _default_max_turns() -> int:
    """Return the configured /goal turn budget, defaulting to Sidekick' 20 turns."""
    try:
        from web.api import config as _config

        cfg = getattr(_config, "cfg", {}) or {}
        goals_cfg = cfg.get("goals", {}) if isinstance(cfg, dict) else {}
        if not isinstance(goals_cfg, dict):
            return int(DEFAULT_MAX_TURNS or 20)
        return max(1, int(goals_cfg.get("max_turns", DEFAULT_MAX_TURNS or 20) or 20))
    except Exception:
        return int(DEFAULT_MAX_TURNS or 20)


def _meta_key(session_id: str) -> str:
    return f"goal:{session_id}"


def lastbrowser_workspace_goal_slug(workspace_path: str | Path) -> str:
    """Return a stable, opaque goal scope for a trusted Lastbrowser workspace path."""
    import os

    canonical = os.path.normcase(str(Path(workspace_path).expanduser().resolve()))
    return "lbws-" + hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


def _profile_db(profile_home: str | Path, *, space_slug: str | None = None):
    """Return a SessionDB pinned to *profile_home*, without reading SIDEKICK_HOME.

    The upstream Sidekick GoalManager persists through sidekick_cli.goals.load_goal(),
    which resolves SessionDB from process-global SIDEKICK_HOME. WebUI sessions are
    profile-scoped and can run concurrently, so the WebUI bridge uses an explicit
    state.db path whenever the caller provides the session's profile home.
    When in a space context, returns a space-scoped goals.db instead.
    """
    # An explicit Space is a hard persistence boundary. If it cannot be
    # resolved, never fall through to a profile/global store: that would make
    # a stale Space ID silently read or overwrite another scope's goal.
    if space_slug:
        sp = _space_goals_path(space_slug, profile_home=profile_home)
        if sp is None:
            return None
        key = str(sp)
        cached = _DB_CACHE.get(key)
        if cached is not None:
            return cached
        try:
            from runtime._compat.shim_state import SessionDB  # type: ignore

            db = SessionDB(db_path=sp)
        except Exception as exc:
            logger.debug("GoalManager space DB unavailable at %s: %s", sp, exc)
            return None
        _DB_CACHE[key] = db
        return db

    # No explicit Space means profile scope. Never derive this from the
    # currently selected Space: background sessions and profile switches can
    # otherwise read or overwrite a different session's goal store.
    home = Path(profile_home).expanduser().resolve()
    key = str(home)
    cached = _DB_CACHE.get(key)
    if cached is not None:
        return cached
    try:
        from runtime._compat.shim_state import SessionDB  # type: ignore

        db = SessionDB(db_path=home / "state.db")
    except Exception as exc:  # pragma: no cover - import/env dependent
        logger.debug("GoalManager profile DB unavailable for %s: %s", home, exc)
        return None
    _DB_CACHE[key] = db
    return db


def _space_goals_path(
    space_slug: str | None = None,
    *,
    profile_home: str | Path | None = None,
) -> Path | None:
    """Return the goals DB for this Space inside the owning profile's Space root.

    Stream workers are plain threads and do not inherit the request's profile
    ContextVar. Resolve the Space while temporarily setting the profile that
    owns this session, rather than trusting whichever profile is globally
    active when a continuation is evaluated.
    """
    profile_module = None
    profile_token = None
    resolved_profile_home = None
    try:
        if profile_home is not None:
            from web.api import profiles as profile_module

            home = Path(profile_home).expanduser().resolve()
            resolved_profile_home = home
            # Resolve from the current launcher environment as well as the
            # module snapshot. Test runners and embedded Sidekick launchers can
            # set SIDEKICK_HOME after profiles.py was imported.
            try:
                base_home = Path(profile_module._resolve_base_sidekick_home()).expanduser().resolve()
            except Exception:
                base_home = Path(profile_module._DEFAULT_SIDEKICK_HOME).expanduser().resolve()
            module_base_home = Path(profile_module._DEFAULT_SIDEKICK_HOME).expanduser().resolve()
            known_base_homes = {base_home, module_base_home}
            if home in known_base_homes or (
                home.name == "default" and home.parent.name == "profiles"
            ):
                profile_name = "default"
            elif home.parent.name == "profiles" and home.parent.parent in known_base_homes:
                if home.name == "default":
                    profile_name = "default"
                elif profile_module._PROFILE_ID_RE.fullmatch(home.name):
                    profile_name = home.name
                else:
                    return None
            else:
                # Do not silently resolve a Space from the active profile when
                # the session's explicit profile home cannot be identified.
                return None
            profile_token = profile_module.set_request_profile(profile_name)

        # Lastbrowser desktop workspaces are ordinary filesystem projects, not
        # Sidekick Space Engine entries. Keep their goal state under the owning
        # profile using a path-derived opaque key instead of falling back to
        # the profile-wide state.db or creating a visible Sidekick Space.
        if re.fullmatch(r"lbws-[0-9a-f]{32}", str(space_slug or "")):
            if resolved_profile_home is None:
                from web.api._home import get_webui_home

                resolved_profile_home = Path(get_webui_home()).expanduser().resolve()
            root = resolved_profile_home / "browser-spaces" / str(space_slug)
            root.mkdir(parents=True, exist_ok=True)
            return root / "goals.db"

        from web.api.space_engine import DEFAULT_SPACE_SLUG, get_workspace, resolve_active_space

        if space_slug:
            space = get_workspace(space_slug)
            if space is None and space_slug == "default":
                space = get_workspace(DEFAULT_SPACE_SLUG)
            if space is None:
                return None
        else:
            space = resolve_active_space()
        p = space.root / "goals.db"
        return p
    except Exception:
        return None
    finally:
        if profile_module is not None and profile_token is not None:
            try:
                profile_module._request_profile.reset(profile_token)
            except Exception:
                logger.debug("Could not restore profile context after resolving goal Space")


class _ProfileGoalManager:
    """Small WebUI-local GoalManager adapter with explicit profile persistence."""

    def __init__(self, session_id: str, *, profile_home: str | Path, default_max_turns: int = 20, space_slug: str | None = None):
        if GoalState is None:
            raise RuntimeError("Sidekick goal state unavailable")
        self.session_id = session_id
        self.profile_home = Path(profile_home).expanduser().resolve()
        self.space_slug = str(space_slug or "").strip().lower() or None
        self.default_max_turns = int(default_max_turns or DEFAULT_MAX_TURNS or 20)
        self._resume_stale = False
        if _profile_db(self.profile_home, space_slug=self.space_slug) is None:
            raise RuntimeError("Persistent goal store unavailable for the requested profile or Space")
        self._state = self._load()

    @property
    def state(self):
        return self._state

    def _load(self):
        db = _profile_db(self.profile_home, space_slug=self.space_slug)
        if db is None or not self.session_id:
            return None
        try:
            raw = db.get_meta(_meta_key(self.session_id))
        except Exception as exc:
            raise RuntimeError("Failed to read persistent goal state") from exc
        if not raw:
            self._loaded_revision = 0
            return None
        try:
            state = GoalState.from_json(raw)  # type: ignore[union-attr]
            self._loaded_revision = state.revision
            # Older goal records have no discriminator and keep their legacy
            # continuation text until the user explicitly resumes/replaces it.
            parsed = json.loads(raw)
            run_id = str(parsed.get("_goal_run_id") or "").strip()
            state._goal_run_id = run_id if re.fullmatch(r"[0-9a-f]{32}", run_id) else None
            return state
        except Exception as exc:
            # Treat corrupt persisted state as unavailable. Returning None here
            # makes callers believe no goal exists and can silently overwrite
            # the unreadable value with a new goal.
            logger.warning("GoalManager profile state parse failed for %s: %s", self.session_id, exc)
            raise RuntimeError("Failed to parse persistent goal state") from exc

    def _save(self, state) -> None:
        db = _profile_db(self.profile_home, space_slug=self.space_slug)
        if not self.session_id:
            return
        if state is None:
            raise RuntimeError("Cannot persist an empty goal state")
        if db is None:
            raise RuntimeError("Persistent goal store is unavailable")
        try:
            persist_goal_state(db, self.session_id, state, expected_revision=self._loaded_revision)
            self._loaded_revision = state.revision
        except GoalRevisionConflict:
            raise
        except Exception as exc:
            raise RuntimeError("Failed to persist goal state") from exc

    def _run_id(self) -> str | None:
        """Return the discriminator persisted alongside this scoped goal."""
        value = str(getattr(self._state, "_goal_run_id", "") or "").strip()
        return value if re.fullmatch(r"[0-9a-f]{32}", value) else None

    def is_active(self) -> bool:
        return self._state is not None and self._state.status == "active"

    def has_goal(self) -> bool:
        return self._state is not None and self._state.status in ("active", "paused")

    def status_line(self) -> str:
        s = self._state
        if s is None or s.status in ("cleared",):
            return "No active goal. Set one with /goal <text>."
        turns = f"{s.turns_used}/{format_goal_turn_budget(s.max_turns)} turns"
        if s.status == "active":
            return f"⊙ Goal (active, {turns}): {s.goal}"
        if s.status == "paused":
            extra = f" — {s.paused_reason}" if s.paused_reason else ""
            return f"⏸ Goal (paused, {turns}{extra}): {s.goal}"
        if s.status == "done":
            return f"✓ Goal done ({turns}): {s.goal}"
        return f"Goal ({s.status}, {turns}): {s.goal}"

    def set(
        self,
        goal: str,
        *,
        max_turns: Optional[int] = None,
        unlimited: bool = False,
    ):
        goal = (goal or "").strip()
        if not goal:
            raise ValueError("goal text is empty")
        state = GoalState(  # type: ignore[operator]
            goal=goal,
            status="active",
            turns_used=0,
            max_turns=normalize_goal_turn_budget(
                max_turns,
                default=self.default_max_turns,
                unlimited=unlimited,
            ),
            created_at=time.time(),
            last_turn_at=0.0,
        )
        state._goal_run_id = uuid.uuid4().hex
        self._state = state
        self._save(state)
        return state

    def pause(self, reason: str = "user-paused"):
        if not self._state:
            return None
        self._state.status = "paused"
        self._state.paused_reason = reason
        self._save(self._state)
        return self._state

    def resume(self, *, reset_budget: bool = False):
        self._resume_stale = False
        if not self._state:
            return None
        if self._state.status == "active" and not reset_budget:
            return self._state
        pending_response = getattr(self._state, "pending_judge_response", None)
        if pending_response is not None and not reset_budget:
            expected_state = copy.deepcopy(self._state)
            expected_run_id = self._run_id()
            pending_user_initiated = bool(getattr(self._state, "pending_judge_user_initiated", True))
            if judge_goal is None:
                verdict, reason, parse_failed = "unavailable", "goal judge unavailable", False
            else:
                verdict, reason, parse_failed = judge_goal(
                    expected_state.goal,
                    pending_response,
                    prior_responses=expected_state.recent_assistant_responses,
                )
            # The provider call runs without the goal lock. Reload before
            # applying its result so a concurrent clear/replacement always wins.
            latest_state = self._load()
            latest_run_id = str(getattr(latest_state, "_goal_run_id", "") or "") if latest_state else None
            if latest_state != expected_state or latest_run_id != expected_run_id:
                self._state = latest_state
                self._resume_stale = True
                return self._state
            if verdict == "unavailable":
                self._state.last_verdict = verdict
                self._state.last_reason = reason
                self._state.paused_reason = "goal judge unavailable; retry /goal resume after restoring the judge provider"
                self._save(self._state)
                return self._state
            self._state.status = "active"
            self._state.paused_reason = None
            self._state.pending_judge_response = None
            self.evaluate_after_turn(
                pending_response,
                user_initiated=pending_user_initiated,
                judged_result=(verdict, reason, parse_failed),
            )
            return self._state
        exhausted = (
            self._state.max_turns is not None
            and int(self._state.turns_used or 0) >= int(self._state.max_turns or 0)
        )
        if exhausted and not reset_budget:
            return self._state
        self._state._goal_run_id = uuid.uuid4().hex
        self._state.status = "active"
        self._state.paused_reason = None
        # A user-requested resume is a fresh attempt even if the previous
        # continuation failed before GoalManager could advance turns_used.
        self._state.consumed_continuation_turn = -1
        if reset_budget:
            self._state.turns_used = 0
            if getattr(self._state, "pending_judge_response", None) is not None:
                self._state.recent_assistant_responses = bounded_goal_evidence(
                    [*self._state.recent_assistant_responses, self._state.pending_judge_response]
                )
                self._state.pending_judge_response = None
                self._state.pending_judge_user_initiated = True
        self._state.consecutive_parse_failures = 0
        self._save(self._state)
        return self._state

    def clear(self) -> None:
        if self._state is None:
            return
        self._state.status = "cleared"
        self._save(self._state)
        self._state = None

    def apply_pending_judge_result(self, *, expected_digest, verdict, reason, parse_failed):
        """Apply a validated private judge result with the existing durable CAS."""
        from runtime.independent.contracts import digest_json
        raw = _profile_db(self.profile_home, space_slug=self.space_slug).get_meta(_meta_key(self.session_id))
        expected = json.loads(raw) if raw else None
        if expected is None or digest_json(expected) != expected_digest:
            raise GoalRevisionConflict("Goal changed during native judge retry")
        self._state = self._load()
        state = self._state
        if (state is None or state.status != "paused" or state.pending_judge_response is None
                or state.revision != expected.get("revision") or self._run_id() != expected.get("_goal_run_id")):
            raise GoalRevisionConflict("Goal is no longer awaiting evaluation")
        if verdict not in {"done", "continue", "unavailable"} or type(parse_failed) is not bool:
            raise ValueError("Invalid native goal verdict")
        if verdict == "unavailable":
            state.last_verdict, state.last_reason = verdict, reason
            state.paused_reason = "goal judge unavailable; retry /goal resume after restoring the judge provider"
            self._save(state)
            return {"status": "paused", "should_continue": False, "continuation_prompt": None,
                "verdict": verdict, "reason": reason}
        state.status, state.paused_reason = "active", None
        return self.evaluate_after_turn(state.pending_judge_response,
            user_initiated=state.pending_judge_user_initiated,
            judged_result=(verdict, reason, parse_failed))

    def evaluate_after_turn(
        self,
        last_response: str,
        *,
        user_initiated: bool = True,
        judged_result: tuple[str, str, bool] | None = None,
    ) -> Dict[str, Any]:
        state = self._state
        if state is None or state.status != "active":
            return {
                "status": state.status if state else None,
                "should_continue": False,
                "continuation_prompt": None,
                "verdict": "inactive",
                "reason": "no active goal",
                "message": "",
            }

        if judged_result is not None:
            verdict, reason, parse_failed = judged_result
        elif judge_goal is None:
            verdict, reason, parse_failed = "unavailable", "goal judge unavailable", False
        else:
            verdict, reason, parse_failed = judge_goal(
                state.goal, str(last_response or ""),
                prior_responses=state.recent_assistant_responses,
            )
        if verdict == "unavailable":
            state.pending_judge_response = str(last_response or "")[:4000]
            state.pending_judge_user_initiated = bool(user_initiated)
            state.last_turn_at = time.time()
            state.last_verdict = verdict
            state.last_reason = reason
            state.status = "paused"
            state.paused_reason = "goal judge unavailable; retry /goal resume after restoring the judge provider"
            self._save(state)
            return {
                "status": "paused",
                "should_continue": False,
                "continuation_prompt": None,
                "verdict": "unavailable",
                "reason": reason,
                "message": (
                    "⏸ Goal paused because its judge could not evaluate the last response after a bounded retry. "
                    "The response was saved for re-evaluation; no completion was assumed and no new generation was started. "
                    "Restore the judge provider, then use /goal resume."
                ),
            }

        state.turns_used += 1
        state.last_turn_at = time.time()
        state.pending_judge_response = None
        state.pending_judge_user_initiated = True
        state.recent_assistant_responses = bounded_goal_evidence(
            [*state.recent_assistant_responses, str(last_response or "")]
        )
        state.last_verdict = verdict
        state.last_reason = reason
        if parse_failed:
            state.consecutive_parse_failures = int(getattr(state, "consecutive_parse_failures", 0) or 0) + 1
        else:
            state.consecutive_parse_failures = 0

        if verdict == "done":
            state.status = "done"
            self._save(state)
            return {
                "status": "done",
                "should_continue": False,
                "continuation_prompt": None,
                "verdict": "done",
                "reason": reason,
                "message": f"✓ Goal achieved: {reason}",
            }

        if state.consecutive_parse_failures >= DEFAULT_MAX_CONSECUTIVE_PARSE_FAILURES:
            state.status = "paused"
            state.paused_reason = (
                f"judge model returned unparseable output {state.consecutive_parse_failures} turns in a row"
            )
            self._save(state)
            return {
                "status": "paused",
                "should_continue": False,
                "continuation_prompt": None,
                "verdict": "continue",
                "reason": reason,
                "message": (
                    f"⏸ Goal paused — the judge model ({state.consecutive_parse_failures} turns) "
                    "isn't returning the required JSON verdict. Route the judge to a stricter "
                    "model in ~/.sidekick/config.yaml:\n"
                    "  auxiliary:\n"
                    "    goal_judge:\n"
                    "      provider: openrouter\n"
                    "      model: google/gemini-3-flash-preview\n"
                    "Then /goal resume to continue."
                ),
            }

        if state.max_turns is not None and state.turns_used >= state.max_turns:
            state.status = "paused"
            state.paused_reason = (
                f"turn budget exhausted ({state.turns_used}/{format_goal_turn_budget(state.max_turns)})"
            )
            self._save(state)
            return {
                "status": "paused",
                "should_continue": False,
                "continuation_prompt": None,
                "verdict": "continue",
                "reason": reason,
                "message": (
                    f"⏸ Goal paused — {state.turns_used}/{format_goal_turn_budget(state.max_turns)} turns used. "
                    "Use /goal resume to keep going, or /goal clear to stop."
                ),
            }

        self._save(state)
        return {
            "status": "active",
            "should_continue": True,
            "continuation_prompt": self.next_continuation_prompt(),
            "verdict": "continue",
            "reason": reason,
            "message": f"↻ Continuing toward goal ({state.turns_used}/{format_goal_turn_budget(state.max_turns)}): {reason}",
        }

    def next_continuation_prompt(self) -> Optional[str]:
        if not self._state or self._state.status != "active" or self._state.continuation_owner != "legacy_chat":
            return None
        prompt = CONTINUATION_PROMPT_TEMPLATE.format(goal=self._state.goal)
        run_id = self._run_id()
        if run_id:
            turn = int(self._state.turns_used or 0)
            prompt = f"{prompt}\n\n<!-- lastbrowser-goal-run:{run_id}:{turn} -->"
        return prompt

    def consume_continuation(self) -> bool:
        """Persist an idempotent claim for this turn's continuation prompt."""
        state = self._state
        if not state or state.status != "active" or state.continuation_owner != "legacy_chat":
            return False
        turn = int(state.turns_used or 0)
        if int(state.consumed_continuation_turn) == turn:
            return False
        state.consumed_continuation_turn = turn
        try:
            self._save(state)
        except GoalRevisionConflict:
            self._state = self._load()
            return False
        return True


def _manager(session_id: str, *, profile_home: str | Path | None = None, space_slug: str | None = None):
    if GoalManager is None:
        raise RuntimeError("Persistent goal support is unavailable")
    if (profile_home or space_slug) and GoalManager is _NativeGoalManager and GoalState is not None:
        try:
            effective_profile_home = profile_home
            if effective_profile_home is None:
                try:
                    from runtime._compat.shim_constants import get_sidekick_home as _get_sidekick_home

                    effective_profile_home = _get_sidekick_home()
                except Exception:
                    effective_profile_home = Path(".")
            return _ProfileGoalManager(
                session_id=session_id,
                profile_home=effective_profile_home,
                default_max_turns=_default_max_turns(),
                space_slug=space_slug,
            )
        except Exception as exc:
            logger.warning("Profile-scoped GoalManager unavailable: %s", exc)
            raise RuntimeError("Persistent goal store is unavailable") from exc
    return GoalManager(session_id=session_id, default_max_turns=_default_max_turns())


def _state_payload(
    state: Any,
    session_id: str = "",
    *,
    space_slug: str | None = None,
) -> Optional[Dict[str, Any]]:
    if state is None:
        return None
    space = str(space_slug or getattr(state, "space", "") or getattr(state, "space_slug", "") or "").strip().lower()
    return {
        "goal": getattr(state, "goal", "") or "",
        "status": getattr(state, "status", "") or "",
        "turns_used": int(getattr(state, "turns_used", 0) or 0),
        "max_turns": getattr(state, "max_turns", None),
        "last_verdict": getattr(state, "last_verdict", None),
        "last_reason": getattr(state, "last_reason", None),
        "paused_reason": getattr(state, "paused_reason", None),
        "pending_judge": getattr(state, "pending_judge_response", None) is not None,
        "session_id": str(session_id).strip() if session_id else "",
        "revision": int(getattr(state, "revision", 0)),
        "continuation_owner": getattr(state, "continuation_owner", "legacy_chat"),
        "owner_run_id": getattr(state, "owner_run_id", None),
        **({"space": space} if space else {}),
    }


def _save_goal_manager_state(mgr: Any, session_id: str, state: Any) -> None:
    """Persist a small claim-state repair through either WebUI goal adapter."""
    if isinstance(mgr, _ProfileGoalManager):
        mgr._state = state
        mgr._save(state)
        return
    from cli.goals import save_goal  # type: ignore

    save_goal(str(session_id or ""), state)


def _rearm_unfinished_continuation_claim(
    session_id: str,
    *,
    profile_home: str | Path | None = None,
    space_slug: str | None = None,
) -> bool:
    """Make an unjudged, claimed continuation eligible for one retry.

    Claims are keyed by ``turns_used``. A completed evaluator advances that
    counter; an interrupted stream does not. Only the latter may be rearmed.
    The caller holds ``_CONTINUATION_LOCK``.
    """
    mgr = _manager(str(session_id or ""), profile_home=profile_home, space_slug=space_slug)
    state = getattr(mgr, "state", None) if mgr is not None else None
    if state is None or str(getattr(state, "status", "") or "").strip() != "active" or getattr(state, "continuation_owner", "legacy_chat") != "legacy_chat":
        return False
    turns_used = int(getattr(state, "turns_used", 0) or 0)
    consumed_turn = getattr(state, "consumed_continuation_turn", -1)
    consumed_turn = -1 if consumed_turn is None else int(consumed_turn)
    if consumed_turn != turns_used:
        return False
    state.consumed_continuation_turn = turns_used - 1
    try:
        _save_goal_manager_state(mgr, session_id, state)
    except Exception:
        state.consumed_continuation_turn = consumed_turn
        raise
    return True


def finish_goal_continuation(
    session_id: str,
    *,
    claim_turn: int | None = None,
    profile_home: str | Path | None = None,
    space_slug: str | None = None,
) -> bool:
    """Release the process-local claim after a worker exits.

    If goal evaluation never advanced the turn (cancel, interruption, or an
    error before the evaluator), rearm the same durable prompt. Successful
    evaluation advances ``turns_used`` and therefore remains claimed exactly
    once for the completed turn.
    """
    key = _continuation_key(session_id, profile_home=profile_home, space_slug=space_slug)
    with _CONTINUATION_LOCK:
        if claim_turn is None:
            return False
        claim_key = _in_flight_continuation_key(key, claim_turn)
        if claim_key not in _IN_FLIGHT_CONTINUATIONS:
            return False
        _IN_FLIGHT_CONTINUATIONS.discard(claim_key)
        try:
            mgr = _manager(str(session_id or ""), profile_home=profile_home, space_slug=space_slug)
            state = getattr(mgr, "state", None) if mgr is not None else None
            consumed_turn = getattr(state, "consumed_continuation_turn", -1) if state is not None else -1
            consumed_turn = -1 if consumed_turn is None else int(consumed_turn)
            if (
                state is None
                or str(getattr(state, "status", "") or "").strip() != "active"
                or int(getattr(state, "turns_used", 0) or 0) != int(claim_turn)
                or consumed_turn != int(claim_turn)
            ):
                return False
            return _rearm_unfinished_continuation_claim(
                session_id, profile_home=profile_home, space_slug=space_slug,
            )
        except Exception:
            logger.warning("Could not release interrupted continuation for session %s", session_id, exc_info=True)
            return False


def _payload(
    *,
    ok: bool = True,
    action: str,
    message: str,
    state: Any = None,
    session_id: str = "",
    space_slug: str | None = None,
    error: str | None = None,
    kickoff_prompt: str | None = None,
    decision: Dict[str, Any] | None = None,
    message_key: str | None = None,
    message_args: list[Any] | None = None,
    retryable: bool = False,
    revision: int | None = None,
) -> Dict[str, Any]:
    body: Dict[str, Any] = {
        "ok": bool(ok),
        "action": action,
        "message": message,
        "goal": _state_payload(state, session_id=session_id, space_slug=space_slug),
        "revision": int(getattr(state, "revision", 0)) if revision is None else revision,
    }
    if error:
        body["error"] = error
    if retryable:
        body["retryable"] = True
    if kickoff_prompt:
        body["kickoff_prompt"] = kickoff_prompt
    if decision is not None:
        body["decision"] = decision
    if message_key:
        body["message_key"] = message_key
    if message_args is not None:
        body["message_args"] = [a for a in message_args if a is not None]
    return body


def _goal_status_payload(state: Any, *, default_message: str | None = None) -> Dict[str, Any]:
    """Build localized-status style payload fields from a goal state."""
    if default_message is None:
        default_message = "No active goal. Set one with /goal <text>."
    if state is None:
        return {"message": default_message, "message_key": "goal_status_none"}
    status = str(getattr(state, "status", "") or "").strip()
    if status in ("cleared",):
        return {"message": default_message, "message_key": "goal_status_none"}
    turns_used = int(getattr(state, "turns_used", 0) or 0)
    max_turns = getattr(state, "max_turns", None)
    budget_label = format_goal_turn_budget(max_turns)
    goal = str(getattr(state, "goal", "") or "")
    if status == "active":
        return {
            "message": f"⊙ Goal (active, {turns_used}/{budget_label} turns): {goal}",
            "message_key": "goal_status_active",
            "message_args": [turns_used, budget_label, goal],
        }
    if status == "paused":
        reason = str(getattr(state, "paused_reason", "") or "")
        if "judge unavailable" in reason.lower():
            return {
                "message": (
                    "⏸ Goal evaluation is waiting for the judge provider. The last response is saved for re-evaluation. "
                    "Restore the provider, then use /goal resume."
                ),
                "message_key": "goal_judge_unavailable",
                "message_args": [],
            }
        exhausted = (
            max_turns is not None
            and turns_used >= int(max_turns)
        ) or "budget exhausted" in reason.lower() or "turn budget exhausted" in reason.lower()
        if exhausted:
            return {
                "message": f"⏸ Goal paused — {turns_used}/{budget_label} turns used. Use /goal resume to keep going, or /goal clear to stop.",
                "message_key": "goal_paused_budget_exhausted",
                "message_args": [turns_used, budget_label],
            }
        return {
            "message": f"⏸ Goal (paused, {turns_used}/{budget_label}{' — ' + reason if reason else ''}): {goal}",
            "message_key": "goal_status_paused",
            "message_args": [turns_used, budget_label, reason, goal],
        }
    if status == "done":
        return {
            "message": f"✓ Goal done ({turns_used}/{budget_label}): {goal}",
            "message_key": "goal_status_done",
            "message_args": [turns_used, budget_label, goal],
        }
    return {
        "message": f"Goal ({status}, {turns_used}/{budget_label}): {goal}",
        "message_args": [status, turns_used, budget_label, goal],
    }


def _extract_goal_turns_from_message(message: str) -> tuple[int, int]:
    """Best-effort extraction for continuation messages like '(1/20)'."""
    if not message:
        return 0, 0
    match = re.search(r"\((\d+)\s*/\s*(\d+)\)", message)
    if not match:
        return 0, 0
    try:
        return int(match.group(1)), int(match.group(2))
    except Exception:
        return 0, 0


def _goal_decision_payload(
    decision: Dict[str, Any],
    state: Any,
) -> Dict[str, Any]:
    """Attach goal message i18n key/args to an evaluation decision."""
    if not isinstance(decision, dict):
        return decision
    status = str(decision.get("status") or "").strip()
    reason = str(decision.get("reason") or "").strip()
    turns_used = int(getattr(state, "turns_used", 0) or 0)
    max_turns = getattr(state, "max_turns", None)
    budget_label = format_goal_turn_budget(max_turns)
    if (turns_used, max_turns) in ((0, 0), (0, None)):
        turns_used, parsed_max_turns = _extract_goal_turns_from_message(str(decision.get("message") or ""))
        if parsed_max_turns:
            max_turns = parsed_max_turns
            budget_label = format_goal_turn_budget(max_turns)

    if status == "done":
        return {
            **decision,
            "turns_used": turns_used,
            "max_turns": max_turns,
            "message_key": "goal_achieved",
            "message_args": [reason],
        }
    if status == "paused":
        paused_reason = str(getattr(state, "paused_reason", "") or "").strip().lower()
        if "judge unavailable" in paused_reason:
            return {
                **decision,
                "turns_used": turns_used,
                "max_turns": max_turns,
                "message_key": "goal_judge_unavailable",
                "message_args": [],
            }
        return {
            **decision,
            "turns_used": turns_used,
            "max_turns": max_turns,
            "message_key": "goal_paused_budget_exhausted",
            "message_args": [turns_used, budget_label],
        }
    if decision.get("should_continue"):
        return {
            **decision,
            "turns_used": turns_used,
            "max_turns": max_turns,
            "message_key": "goal_continuing",
            "message_args": [turns_used, budget_label, reason],
        }
    return {
        **decision,
        "turns_used": turns_used,
        "max_turns": max_turns,
    }


def goal_state_snapshot(
    session_id: str,
    *,
    profile_home: str | Path | None = None,
    space_slug: str | None = None,
) -> Any:
    """Return a deep copy of current goal state for rollback before kickoff."""
    mgr = _manager(str(session_id or ""), profile_home=profile_home, space_slug=space_slug)
    if mgr is None:
        return None
    return copy.deepcopy(getattr(mgr, "state", None))


def restore_goal_state(
    session_id: str,
    snapshot: Any,
    *,
    profile_home: str | Path | None = None,
    space_slug: str | None = None,
    expected_current: Any = None,
    check_expected_current: bool = False,
) -> bool:
    """Restore a prior state only if the failed kickoff still owns the goal.

    A concurrent pause, clear, or replacement goal must win over rollback. The
    expected state is captured immediately after the command mutation and
    compared under the same lock used by goal lifecycle commands.
    """
    with _CONTINUATION_LOCK:
        mgr = _manager(str(session_id or ""), profile_home=profile_home, space_slug=space_slug)
        if mgr is None:
            return False
        current = copy.deepcopy(getattr(mgr, "state", None))
        current_run_id = getattr(current, "_goal_run_id", None)
        expected_run_id = getattr(expected_current, "_goal_run_id", None)
        if check_expected_current and (
            current != expected_current or current_run_id != expected_run_id
        ):
            return False
        if snapshot is None:
            try:
                mgr.clear()
                return True
            except Exception:
                return False
        if isinstance(mgr, _ProfileGoalManager):
            mgr._state = snapshot
            mgr._save(snapshot)
            return True
        try:
            from cli.goals import save_goal  # type: ignore

            save_goal(str(session_id or ""), snapshot)
            return True
        except Exception as exc:  # pragma: no cover - native fallback only
            logger.debug("Goal state restore failed for %s: %s", session_id, exc)
            return False


def goal_state_for_session(
    session_id: str,
    *,
    profile_home: str | Path | None = None,
    space_slug: str | None = None,
    recover_incomplete: bool = False,
) -> Optional[Dict[str, Any]]:
    """Return the persisted goal payload for a session, if any.

    ``recover_incomplete`` is reserved for session reads that have confirmed
    there is no live stream for this session. It repairs a durable continuation
    claim left behind when the backend died after accepting the prompt but
    before its post-turn evaluator ran.
    """
    key = _continuation_key(session_id, profile_home=profile_home, space_slug=space_slug)
    if recover_incomplete:
        with _CONTINUATION_LOCK:
            # A current worker may have claimed the prompt just before its
            # stream id becomes visible on the session. Never rearm that claim.
            mgr = _manager(str(session_id or ""), profile_home=profile_home, space_slug=space_slug)
            state = getattr(mgr, "state", None) if mgr is not None else None
            current_turn = int(getattr(state, "turns_used", 0) or 0) if state is not None else 0
            if _in_flight_continuation_key(key, current_turn) not in _IN_FLIGHT_CONTINUATIONS:
                try:
                    _rearm_unfinished_continuation_claim(
                        session_id, profile_home=profile_home, space_slug=space_slug,
                    )
                except Exception:
                    logger.warning("Could not recover interrupted goal continuation for session %s", session_id, exc_info=True)
    mgr = _manager(str(session_id or ""), profile_home=profile_home, space_slug=space_slug)
    if mgr is None:
        return None
    state = getattr(mgr, "state", None)
    if state is None:
        return None
    if str(getattr(state, "status", "") or "").strip() == "cleared":
        return None
    payload = _state_payload(state, str(session_id or ""), space_slug=space_slug)
    # The native renderer may restart after the goal evaluator has saved its
    # decision but before it consumes the goal_continue SSE event. The prompt
    # is deterministic from the durable goal state and continuation claim, so
    # expose it only while that turn is still pending. The renderer can then
    # safely reconcile the handoff after restoring this exact session.
    consumed_turn = getattr(state, "consumed_continuation_turn", -1)
    consumed_turn = -1 if consumed_turn is None else int(consumed_turn)
    if (
        payload is not None
        and str(getattr(state, "status", "") or "").strip() == "active"
        and consumed_turn < int(getattr(state, "turns_used", 0) or 0)
    ):
        try:
            prompt = mgr.next_continuation_prompt()
            if prompt:
                payload["continuation_prompt"] = prompt
        except Exception:
            # Keep the goal status available; the session read path already
            # reports goal-store failures separately.
            logger.debug("Could not recover goal continuation for session %s", session_id, exc_info=True)
    return payload


def _goal_command_payload(
    session_id: str,
    args: str = "",
    *,
    stream_running: bool = False,
    profile_home: str | Path | None = None,
    space_slug: str | None = None,
    max_turns: Optional[int] = None,
    unlimited: bool = False,
    _expected_revision: int | None = None,
    native_judge_retry: bool = False,
) -> Dict[str, Any]:
    """Return the WebUI response payload for a /goal command.

    Mirrors the gateway command semantics:
    - /goal or /goal status shows status
    - /goal pause pauses
    - /goal resume resumes and can return a kickoff_prompt so the caller can
      continue immediately when the session is idle
    - /goal clear|stop|done clears
    - /goal <text> sets a new active goal and returns kickoff_prompt so the
      caller can start the first normal user-role turn immediately.
    """
    sid = str(session_id or "").strip()
    if not sid:
        return _payload(ok=False, action="error", error="missing_session", message="session_id required", space_slug=space_slug)

    try:
        mgr = _manager(sid, profile_home=profile_home, space_slug=space_slug)
    except Exception as exc:
        logger.warning("Goal state unavailable for session %s: %s", sid, exc)
        mgr = None
    if mgr is None:
        return _payload(ok=False, action="error", error="unavailable", message="Goals unavailable on this session.", retryable=True, session_id=sid, space_slug=space_slug)
    if _expected_revision is not None and int(getattr(getattr(mgr, "state", None), "revision", 0)) != _expected_revision:
        return _payload(ok=False, action="error", error="goal_revision_conflict", message="Goal changed; refresh before retrying.", state=getattr(mgr, "state", None), session_id=sid, space_slug=space_slug)

    text = str(args or "").strip()
    lower = text.lower()
    if lower and lower != "status" and getattr(getattr(mgr, "state", None), "continuation_owner", "legacy_chat") != "legacy_chat":
        return _payload(ok=False, action="error", error="goal_owned_by_run", message="Use the owning agent run controls.", state=mgr.state, session_id=sid, space_slug=space_slug)

    if not text or lower == "status":
        state = getattr(mgr, "state", None)
        status_payload = _goal_status_payload(state)
        state_status = str(getattr(state, "status", "") or "").strip()
        visible_state = None if state_status == "cleared" else state
        return _payload(action="status", state=visible_state, revision=int(getattr(state, "revision", 0)), session_id=sid, space_slug=space_slug, **status_payload)

    if lower == "pause":
        try:
            with _CONTINUATION_LOCK:
                cancel_goal_continuation(sid, profile_home=profile_home, space_slug=space_slug)
                state = mgr.pause(reason="user-paused")
        except GoalRevisionConflict:
            return _payload(ok=False, action="pause", error="goal_revision_conflict", message="Goal changed; refresh before retrying.", session_id=sid)
        except Exception as exc:
            logger.warning("Could not persist goal pause for session %s: %s", sid, exc)
            return _payload(ok=False, action="pause", error="persistence_failed", message="Goal state could not be saved.", retryable=True, session_id=sid, space_slug=space_slug)
        if state is None:
            return _payload(
                ok=False,
                action="pause",
                error="no_goal",
                message="No goal set.",
                message_key="goal_no_goal",
                session_id=sid,
                space_slug=space_slug,
            )
        return _payload(
            action="pause",
            message=f"⏸ Goal paused: {state.goal}",
            message_key="goal_paused",
            message_args=[str(state.goal)],
            state=state,
            session_id=sid,
            space_slug=space_slug,
        )

    if lower == "resume":
        try:
            with _CONTINUATION_LOCK:
                state = getattr(mgr, "state", None)
                if state is not None and state.status == "active":
                    return _payload(
                        action="status", state=state, session_id=sid, space_slug=space_slug,
                        **_goal_status_payload(state),
                    )
                cancel_goal_continuation(sid, profile_home=profile_home, space_slug=space_slug)
                has_pending_judge = getattr(state, "pending_judge_response", None) is not None
                if has_pending_judge and native_judge_retry:
                    if stream_running:
                        return _payload(ok=False, action="resume", error="agent_running",
                            message="A stream is already active.", state=state, session_id=sid, space_slug=space_slug)
                    if state.status != "paused":
                        return _payload(ok=False, action="resume", error="goal_revision_conflict",
                            message="Goal changed; refresh before retrying.", state=state, session_id=sid)
                    deferred = _payload(action="resume", state=state, session_id=sid, space_slug=space_slug,
                        message="Retrying the saved goal evaluation.")
                    deferred["native_judge_retry_pending"] = True
                    return deferred
                if not has_pending_judge:
                    state = mgr.resume()
            if has_pending_judge:
                # Retrying a provider-backed judge can block. Keep pause/clear/
                # replacement responsive; the profile manager reloads and
                # verifies the saved goal identity before committing the result.
                state = mgr.resume()
                if getattr(mgr, "_resume_stale", False):
                    state_payload = _goal_status_payload(state, default_message="Goal changed during judge retry.")
                    return _payload(
                        action="status",
                        message=state_payload["message"],
                        message_key=state_payload.get("message_key"),
                        message_args=state_payload.get("message_args"),
                        state=state,
                        session_id=sid,
                        space_slug=space_slug,
                    )
        except GoalRevisionConflict:
            return _payload(ok=False, action="resume", error="goal_revision_conflict", message="Goal changed; refresh before retrying.", session_id=sid)
        except Exception as exc:
            logger.warning("Could not persist goal resume for session %s: %s", sid, exc)
            return _payload(ok=False, action="resume", error="persistence_failed", message="Goal state could not be saved.", retryable=True, session_id=sid, space_slug=space_slug)
        if state is None:
            return _payload(
                ok=False,
                action="resume",
                error="no_goal",
                message="No goal to resume.",
                message_key="goal_no_goal",
                session_id=sid,
                space_slug=space_slug,
            )
        if str(getattr(state, "status", "") or "").strip() != "active":
            status_payload = _goal_status_payload(state, default_message="Goal remains paused.")
            return _payload(
                action="resume",
                message=status_payload["message"],
                message_key=status_payload.get("message_key"),
                message_args=status_payload.get("message_args"),
                state=state,
                session_id=sid,
                space_slug=space_slug,
            )
        kickoff_prompt = None if stream_running else mgr.next_continuation_prompt()
        return _payload(
            action="resume",
            message=(
                f"▶ Goal resumed: {state.goal}\n"
                "Continuing now."
            ),
            message_key="goal_resumed",
            message_args=[str(state.goal)],
            state=state,
            session_id=sid,
            kickoff_prompt=kickoff_prompt,
            space_slug=space_slug,
        )

    if lower in ("clear", "stop", "done"):
        had = bool(mgr.has_goal())
        try:
            with _CONTINUATION_LOCK:
                cancel_goal_continuation(sid, profile_home=profile_home, space_slug=space_slug)
                mgr.clear()
        except GoalRevisionConflict:
            return _payload(ok=False, action="clear", error="goal_revision_conflict", message="Goal changed; refresh before retrying.", session_id=sid)
        except Exception as exc:
            logger.warning("Could not persist goal clear for session %s: %s", sid, exc)
            return _payload(ok=False, action="clear", error="persistence_failed", message="Goal state could not be saved.", retryable=True, session_id=sid, space_slug=space_slug)
        return _payload(
            action="clear",
            revision=getattr(mgr, "_loaded_revision", 0),
            message="Goal cleared." if had else "No active goal.",
            message_key="goal_cleared" if had else "goal_no_goal",
            state=getattr(mgr, "state", None),
            session_id=sid,
            space_slug=space_slug,
        )

    if stream_running:
        return _payload(
            ok=False,
            action="set",
            error="agent_running",
            message=(
                "Agent is running — use /goal status / pause / clear mid-run, "
                "or /stop before setting a new goal."
            ),
            session_id=sid,
            space_slug=space_slug,
        )

    try:
        with _CONTINUATION_LOCK:
            cancel_goal_continuation(sid, profile_home=profile_home, space_slug=space_slug)
            state = mgr.set(text, max_turns=max_turns, unlimited=unlimited)
    except ValueError as exc:
        return _payload(ok=False, action="set", error="invalid_goal", message=f"Invalid goal: {exc}", session_id=sid, space_slug=space_slug)
    except GoalRevisionConflict:
        return _payload(ok=False, action="set", error="goal_revision_conflict", message="Goal changed; refresh before retrying.", session_id=sid)
    except Exception as exc:
        logger.warning("Could not persist goal for session %s: %s", sid, exc)
        return _payload(ok=False, action="set", error="persistence_failed", message="Goal state could not be saved.", retryable=True, session_id=sid, space_slug=space_slug)

    budget_label = "unlimited runs" if getattr(state, "max_turns", None) is None else f"{state.max_turns} runs"
    followup = (
        "I'll keep working until the goal is done, you pause/clear it, or you stop it.\n"
        if getattr(state, "max_turns", None) is None
        else "I'll keep working until the goal is done, you pause/clear it, or the budget is exhausted.\n"
    )

    return _payload(
        action="set",
        message=(
            f"⊙ Goal set ({budget_label}): {state.goal}\n"
            f"{followup}"
            "Controls: /goal status · /goal pause · /goal resume · /goal clear"
        ),
        state=state,
        session_id=sid,
        kickoff_prompt=state.goal,
        space_slug=space_slug,
    )


def _command_store(manager: Any):
    if isinstance(manager, _ProfileGoalManager):
        return _profile_db(manager.profile_home, space_slug=manager.space_slug)
    from cli.goals import _get_session_db
    return _get_session_db()


def goal_command_payload(
    session_id: str, args: str = "", *, stream_running: bool = False,
    profile_home: str | Path | None = None, space_slug: str | None = None,
    max_turns: Optional[int] = None, unlimited: bool = False,
    expected_revision: int | None = None, client_request_id: str | None = None,
    source_actor: str = "human",
    human_authorization: dict[str, Any] | None = None,
    native_judge_retry: bool = False,
) -> Dict[str, Any]:
    """Scoped CAS controls with durable receipts in the existing goal store.

    The HTTP adapter supplies the actor from its trusted user ingress. Replayed
    results never repeat a kickoff. No SQL transaction spans a judge call.
    """
    sid = str(session_id or "").strip()
    text = str(args or "").strip()
    mutation = bool(text and text.lower() != "status")
    options = dict(stream_running=stream_running, profile_home=profile_home, space_slug=space_slug,
                   max_turns=max_turns, unlimited=unlimited)
    if native_judge_retry:
        options["native_judge_retry"] = True
    if native_judge_retry and (human_authorization is None or not client_request_id or expected_revision is None):
        return _payload(ok=False, action="error", error="native_goal_retry_human_receipt_required",
            message="Refresh goal state before retrying its evaluation.", session_id=sid)
    if mutation and source_actor != "human":
        return _payload(ok=False, action="error", error="human_command_required", message="Goal controls require a user action.", session_id=sid)
    if human_authorization is not None:
        from runtime.independent.contracts import Scope
        expected_fields = {"schemaVersion", "actorRef", "scope", "backendProfileName", "spaceSlug", "sessionId"}
        if (not isinstance(human_authorization, dict) or set(human_authorization) != expected_fields
                or human_authorization.get("schemaVersion") != 1
                or human_authorization.get("actorRef") != "user:desktop"
                or human_authorization.get("sessionId") != sid
                or human_authorization.get("spaceSlug") != space_slug
                or not isinstance(human_authorization.get("backendProfileName"), str)
                or not human_authorization["backendProfileName"] or source_actor != "human"):
            raise ValueError("Invalid native goal human authorization")
        Scope.model_validate(human_authorization["scope"])
        if not client_request_id or expected_revision is None:
            raise ValueError("Native goal authorization needs its durable command identity")
    if expected_revision is not None and (type(expected_revision) is not int or expected_revision < 0):
        return _payload(ok=False, action="error", error="invalid_revision", message="Invalid goal revision.", session_id=sid)
    if client_request_id is not None and (not isinstance(client_request_id, str) or not re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}", client_request_id)):
        return _payload(ok=False, action="error", error="invalid_request_id", message="Invalid command request identity.", session_id=sid)
    if mutation and client_request_id is not None and expected_revision is None:
        return _payload(ok=False, action="error", error="missing_revision", message="Refresh goal state before changing it.", session_id=sid)
    # Keep old lightweight CLI/test integrations available. Production desktop
    # mutations use a request identity and an explicit profile-bound store.
    if not mutation or (client_request_id is None and expected_revision is None):
        return _goal_command_payload(sid, text, **options)
    try:
        manager = _manager(sid, profile_home=profile_home, space_slug=space_slug)
        db = _command_store(manager)
        if db is None or not getattr(db, "db_path", None):
            raise RuntimeError("durable goal store unavailable")
        db_path = str(db.db_path)
        command_input = {"args": text, "max_turns": max_turns, "unlimited": unlimited,
            "expected_revision": expected_revision, "actor": source_actor}
        if human_authorization is not None:
            command_input["humanAuthorization"] = human_authorization
        digest = hashlib.sha256(json.dumps(command_input, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        key = "goal-command:" + hashlib.sha256(json.dumps([sid, source_actor, client_request_id or uuid.uuid4().hex]).encode()).hexdigest()
        with sqlite3.connect(db_path, timeout=1.0, isolation_level=None) as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                previous_receipt = conn.execute("SELECT value FROM state_meta WHERE key=?", (key,)).fetchone()
                if previous_receipt:
                    receipt = json.loads(previous_receipt[0])
                    conn.execute("COMMIT")
                    if receipt["digest"] != digest:
                        return _payload(ok=False, action="error", error="request_identity_conflict", message="Request identity already used for another command.", session_id=sid)
                    if receipt["state"] == "pending":
                        interrupted = time.time() - receipt["started_at"] > 120
                        return _payload(ok=False, action="error", error="command_interrupted" if interrupted else "command_in_progress",
                            message="Previous command has no confirmed result; refresh goal state." if interrupted else "Command is still being processed.",
                            retryable=not interrupted, session_id=sid)
                    if receipt["state"] == "complete":
                        result = dict(receipt["result"])
                    else:  # crash after state commit, before response materialization
                        state = GoalState.from_json(json.dumps(receipt["goal"]))
                        result = _payload(action=receipt["action"], message="Command was already applied.",
                            state=None if state.status == "cleared" else state, session_id=sid, space_slug=space_slug)
                        result["revision"] = receipt["revision"]
                    result.pop("kickoff_prompt", None)
                    result.pop("native_judge_retry", None)
                    result.pop("native_judge_retry_pending", None)
                    result["replayed"] = True
                    return result
                row = conn.execute("SELECT value FROM state_meta WHERE key=?", (_meta_key(sid),)).fetchone()
                current = GoalState.from_json(row[0]) if row else None
                revision = current.revision if current else 0
                if expected_revision is not None and revision != expected_revision:
                    conn.execute("COMMIT")
                    result = _payload(ok=False, action="error", error="goal_revision_conflict", message="Goal changed; refresh before retrying.", state=current, session_id=sid, space_slug=space_slug)
                    result["revision"] = revision
                    return result
                if current and current.continuation_owner != "legacy_chat":
                    conn.execute("COMMIT")
                    return _payload(ok=False, action="error", error="goal_owned_by_run", message="Use the owning agent run controls.", state=current, session_id=sid, space_slug=space_slug)
                action = text.lower() if text.lower() in ("pause", "resume") else "clear" if text.lower() in ("clear", "stop", "done") else "set"
                receipt = {"digest": digest, "state": "pending", "action": action, "started_at": time.time()}
                if human_authorization is not None:
                    receipt["humanAuthorization"] = human_authorization
                conn.execute("INSERT INTO state_meta(key,value) VALUES (?,?)", (key, json.dumps(receipt)))
                conn.execute("COMMIT")
            except BaseException:
                if conn.in_transaction:
                    conn.execute("ROLLBACK")
                raise
        token = _COMMAND_RECEIPT.set({"db_path": db_path, "session_id": sid, "key": key, "value": receipt})
        try:
            result = _goal_command_payload(sid, text, _expected_revision=revision, **options)
        finally:
            _COMMAND_RECEIPT.reset(token)
        # Preserve the goal snapshot written atomically by persist_goal_state.
        # It contains the actual run discriminator, unlike the public status.
        saved_receipt = db.get_meta(key)
        if saved_receipt:
            committed = json.loads(saved_receipt)
            if committed.get("digest") != digest:
                raise RuntimeError("Goal command receipt identity changed")
            receipt.update(committed)
        receipt.update(state="complete", result=result)
        if result.get("native_judge_retry_pending"):
            from runtime.independent.contracts import digest_json
            goal_raw = json.loads(db.get_meta(_meta_key(sid)))
            if (goal_raw.get("revision") != revision or goal_raw.get("status") != "paused"
                    or not isinstance(goal_raw.get("pending_judge_response"), str)
                    or not re.fullmatch(r"[0-9a-f]{32}", str(goal_raw.get("_goal_run_id") or ""))
                    or goal_raw.get("continuation_owner", "legacy_chat") != "legacy_chat"
                    or goal_raw.get("owner_run_id") is not None):
                raise GoalRevisionConflict("Goal changed during native retry admission")
            receipt.update(goal=goal_raw, revision=revision)
            result["native_judge_retry"] = {"humanCommandRef": key, "humanCommandDigest": digest,
                "goalRunId": goal_raw["_goal_run_id"], "goalRevision": revision,
                "goalDigest": digest_json(goal_raw)}
        db.set_meta(key, json.dumps(receipt, ensure_ascii=False))
        return result
    except GoalRevisionConflict:
        return _payload(ok=False, action="error", error="goal_revision_conflict", message="Goal changed; refresh before retrying.", session_id=sid)
    except Exception:
        logger.warning("Durable goal command failed for session %s", sid, exc_info=True)
        return _payload(ok=False, action="error", error="unavailable", message="Goal command could not be confirmed. Refresh goal state.", retryable=True, session_id=sid)


def apply_native_goal_judge_result(context, request, result):
    """Trusted Parent CAS, after SDK validation and OS exit with writer held."""
    from runtime.independent.native_goal_retry import NativeGoalRetryRequest, NativeGoalRetryResult, read_retry_goal
    request = NativeGoalRetryRequest.model_validate(request)
    result = NativeGoalRetryResult.model_validate(result)
    with _CONTINUATION_LOCK:
        read_retry_goal(context, request)
        if any(getattr(request, field) != getattr(result, field) for field in
                ("request_id", "scope", "session_id", "stream_id", "goal_run_id", "goal_revision", "goal_digest")):
            raise GoalRevisionConflict("Native goal judge result belongs to another snapshot")
        manager = _manager(context.session_id, profile_home=context.profile_home, space_slug=Path(context.space_root).name)
        if not isinstance(manager, _ProfileGoalManager):
            raise RuntimeError("Native goal retry requires its own profile store")
        db = _profile_db(context.profile_home, space_slug=Path(context.space_root).name)
        receipt = json.loads(db.get_meta(request.human_command_ref))
        token = _COMMAND_RECEIPT.set({"db_path": str(db.db_path), "session_id": context.session_id,
            "key": request.human_command_ref, "value": receipt})
        try:
            decision = manager.apply_pending_judge_result(expected_digest=request.goal_digest,
                verdict=result.verdict, reason=result.reason, parse_failed=result.parse_failed)
        finally:
            _COMMAND_RECEIPT.reset(token)
        committed = json.loads(db.get_meta(request.human_command_ref))
        committed.update(state="complete", result=_payload(action="resume", state=manager.state,
            session_id=context.session_id, space_slug=Path(context.space_root).name,
            message="Goal evaluation complete.", decision=decision))
        db.set_meta(request.human_command_ref, json.dumps(committed, ensure_ascii=False))
        return {**decision, "goal": _state_payload(manager.state, context.session_id,
            space_slug=Path(context.space_root).name), "session_id": context.session_id}


def native_goal_ingress_authorization(context, *, claim_turn: int) -> dict[str, Any]:
    """Read the actual consumed goal and its atomically bound human command."""
    from runtime.independent.native_chat_protocol import verify_native_context
    from runtime.independent.contracts import digest_json
    from runtime.independent.policy import PolicyDenied
    verify_native_context(context)
    if type(claim_turn) is not int or claim_turn < 0:
        raise PolicyDenied("native_goal_claim_required")
    path = Path(context.space_root) / "goals.db"
    if not path.is_file():
        raise PolicyDenied("native_goal_authorization_unavailable")
    slug = Path(context.space_root).name
    with _CONTINUATION_LOCK:
        key = _continuation_key(context.session_id, profile_home=context.profile_home, space_slug=slug)
        if _in_flight_continuation_key(key, claim_turn) not in _IN_FLIGHT_CONTINUATIONS:
            raise PolicyDenied("native_goal_claim_not_current")
        with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True, timeout=1) as conn:
            conn.execute("BEGIN")
            row = conn.execute("SELECT value FROM state_meta WHERE key=?", (_meta_key(context.session_id),)).fetchone()
            if row is None or len(row[0]) > 4 * 1024 * 1024:
                raise PolicyDenied("native_goal_state_unavailable")
            state = json.loads(row[0])
            run_id = state.get("_goal_run_id")
            if (not isinstance(run_id, str) or not re.fullmatch(r"[0-9a-f]{32}", run_id)
                    or state.get("status") != "active" or state.get("continuation_owner") != "legacy_chat"
                    or state.get("owner_run_id") is not None or state.get("turns_used") != claim_turn
                    or state.get("consumed_continuation_turn") != claim_turn):
                raise PolicyDenied("native_goal_claim_not_current")
            authority_key = "native-goal-human:" + context.session_id + ":" + run_id
            row = conn.execute("SELECT value FROM state_meta WHERE key=?", (authority_key,)).fetchone()
            if row is None or len(row[0]) > 65536:
                raise PolicyDenied("native_goal_human_authorization_required")
            authority = json.loads(row[0])
            expected = {"schemaVersion": 1, "actorRef": "user:desktop",
                "scope": context.scope.model_dump(mode="json", by_alias=True), "backendProfileName": context.profile_name,
                "spaceSlug": slug, "sessionId": context.session_id}
            objective = {"goal": state.get("goal"), "max_turns": state.get("max_turns")}
            if authority.get("humanAuthorization") != expected or authority.get("goalDigest") != digest_json(objective):
                raise PolicyDenied("native_goal_authorization_changed")
            row = conn.execute("SELECT value FROM state_meta WHERE key=?", (authority.get("commandRef"),)).fetchone()
            if row is None or len(row[0]) > 4 * 1024 * 1024:
                raise PolicyDenied("native_goal_command_unavailable")
            receipt = json.loads(row[0])
            if (receipt.get("state") not in {"committed", "complete"}
                    or receipt.get("digest") != authority.get("commandDigest")
                    or receipt.get("humanAuthorization") != expected
                    or (receipt.get("goal") or {}).get("_goal_run_id") != run_id):
                raise PolicyDenied("native_goal_command_unverified")
    return {"authorizationRef": authority_key, "authorizationDigest": digest_json(authority),
        "scope": context.scope.model_dump(mode="json", by_alias=True), "sessionId": context.session_id,
        "goalTurn": claim_turn, "goalRevision": state["revision"], "goalRunId": run_id}


def pause_native_goal_without_authorization(context, *, claim_turn: int) -> bool:
    """Pause only the actual unstarted claim; do not rearm a denied ingress."""
    from runtime.independent.native_chat_protocol import verify_native_context
    verify_native_context(context)
    slug = Path(context.space_root).name
    key = _continuation_key(context.session_id, profile_home=context.profile_home, space_slug=slug)
    with _CONTINUATION_LOCK:
        if _in_flight_continuation_key(key, claim_turn) not in _IN_FLIGHT_CONTINUATIONS:
            return False
        manager = _manager(context.session_id, profile_home=context.profile_home, space_slug=slug)
        state = manager.state
        if (state is None or state.status != "active" or state.continuation_owner != "legacy_chat"
                or state.owner_run_id is not None or state.turns_used != claim_turn
                or state.consumed_continuation_turn != claim_turn):
            return False
        manager.pause("native_goal_human_authorization_required")
        cancel_goal_continuation(context.session_id, profile_home=context.profile_home, space_slug=slug)
        return True


def transfer_goal_continuation_owner(session_id: str, *, profile_home: str | Path, space_slug: str | None,
    expected_revision: int, continuation_owner: str, owner_run_id: str | None = None) -> Dict[str, Any]:
    """Trusted broker operation; never exposed as an unvalidated model tool."""
    if type(expected_revision) is not int or expected_revision < 0:
        raise ValueError("invalid goal revision")
    if continuation_owner not in ("legacy_chat", "independent_run") or (continuation_owner == "independent_run" and (not isinstance(owner_run_id, str) or not owner_run_id.strip() or len(owner_run_id) > 128)):
        raise ValueError("invalid continuation owner")
    with _CONTINUATION_LOCK:
        manager = _manager(session_id, profile_home=profile_home, space_slug=space_slug)
        state = getattr(manager, "state", None)
        if state is None or state.revision != expected_revision:
            raise GoalRevisionConflict("goal revision changed")
        state.continuation_owner = continuation_owner
        state.owner_run_id = owner_run_id if continuation_owner == "independent_run" else None
        manager._save(state)
        cancel_goal_continuation(session_id, profile_home=profile_home, space_slug=space_slug)
        return _state_payload(state, session_id, space_slug=space_slug)


def has_active_goal(
    session_id: str,
    *,
    profile_home: str | Path | None = None,
    space_slug: str | None = None,
) -> bool:
    """Return True when the session has an active standing goal to evaluate."""
    sid = str(session_id or "").strip()
    if not sid:
        return False
    mgr = _manager(sid, profile_home=profile_home, space_slug=space_slug)
    if mgr is None:
        raise RuntimeError("Persistent goal state is unavailable")
    try:
        return bool(mgr.is_active())
    except Exception as exc:
        logger.warning("goal active-state check failed for session=%s: %s", sid, exc)
        raise RuntimeError("Persistent goal state is unavailable") from exc


_UNSPECIFIED_GOAL_SNAPSHOT = object()


def evaluate_goal_after_turn(
    session_id: str,
    last_response: str,
    *,
    user_initiated: bool = True,
    profile_home: str | Path | None = None,
    space_slug: str | None = None,
    expected_goal_state: Any = _UNSPECIFIED_GOAL_SNAPSHOT,
    continuation_owner: str = "legacy_chat",
    owner_run_id: str | None = None,
) -> Dict[str, Any]:
    """Evaluate a completed turn without overwriting concurrent user changes."""
    sid = str(session_id or "").strip()
    if not sid:
        return {
            "status": None,
            "should_continue": False,
            "continuation_prompt": None,
            "verdict": "inactive",
            "reason": "missing session_id",
            "message": "",
        }

    # Snapshot the state under the same lock as pause/resume/clear, then run
    # the potentially slow judge call without holding that lock so user
    # controls remain responsive.
    try:
        with _CONTINUATION_LOCK:
            mgr = _manager(sid, profile_home=profile_home, space_slug=space_slug)
            if mgr is None:
                return {
                    "status": None,
                    "should_continue": False,
                    "continuation_prompt": None,
                    "verdict": "inactive",
                    "reason": "goals unavailable",
                    "message": "",
                }
            expected_state = copy.deepcopy(getattr(mgr, "state", None))
            if expected_state and (
                getattr(expected_state, "continuation_owner", "legacy_chat") != continuation_owner
                or (continuation_owner == "independent_run" and getattr(expected_state, "owner_run_id", None) != owner_run_id)
            ):
                return {"status": expected_state.status, "should_continue": False, "continuation_prompt": None,
                        "verdict": "foreign_owner", "reason": "goal continuation belongs to another owner", "message": ""}
            if expected_goal_state is not _UNSPECIFIED_GOAL_SNAPSHOT and (
                expected_state != expected_goal_state
                or getattr(expected_state, "_goal_run_id", None)
                != getattr(expected_goal_state, "_goal_run_id", None)
            ):
                return {
                    "status": getattr(expected_state, "status", None),
                    "should_continue": False,
                    "continuation_prompt": None,
                    "verdict": "stale",
                    "reason": "goal changed while response was generated",
                    "message": "",
                }
            if not expected_state or str(getattr(expected_state, "status", "") or "") != "active":
                return {
                    "status": getattr(expected_state, "status", None),
                    "should_continue": False,
                    "continuation_prompt": None,
                    "verdict": "inactive",
                    "reason": "no active goal",
                    "message": "",
                }

        judged_result = (
            ("unavailable", "goal judge unavailable", False)
            if judge_goal is None
            else judge_goal(
                expected_state.goal, str(last_response or ""),
                prior_responses=expected_state.recent_assistant_responses,
            )
        )

        # Commit the judge result only if the state still matches the snapshot.
        # A pause, clear, replacement, or other turn's evaluation always wins.
        with _CONTINUATION_LOCK:
            commit_mgr = _manager(sid, profile_home=profile_home, space_slug=space_slug)
            current_state = copy.deepcopy(getattr(commit_mgr, "state", None)) if commit_mgr else None
            if (current_state != expected_state
                or getattr(current_state, "_goal_run_id", None) != getattr(expected_state, "_goal_run_id", None)
                or str(getattr(current_state, "status", "") or "") != "active"):
                return {
                    "status": getattr(current_state, "status", None),
                    "should_continue": False,
                    "continuation_prompt": None,
                    "verdict": "stale",
                    "reason": "goal changed during evaluation",
                    "message": "",
                }
            decision = commit_mgr.evaluate_after_turn(
                str(last_response or ""),
                user_initiated=user_initiated,
                judged_result=judged_result,
            )
    except Exception as exc:
        logger.debug("goal evaluation failed for session=%s: %s", sid, exc)
        return {
            "status": None,
            "should_continue": False,
            "continuation_prompt": None,
            "verdict": "error",
            "reason": f"goal evaluation failed: {type(exc).__name__}",
            "message": "",
        }
    if not isinstance(decision, dict):
        decision = {}
    decision.setdefault("should_continue", False)
    decision.setdefault("continuation_prompt", None)
    decision.setdefault("message", "")
    decision = dict(decision)
    decision = _goal_decision_payload(decision, getattr(commit_mgr, "state", None))
    if continuation_owner != "legacy_chat":
        decision["should_continue"] = False
        decision["continuation_prompt"] = None
    return decision
