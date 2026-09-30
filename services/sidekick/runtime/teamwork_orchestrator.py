"""Teamwork Multi-Agent Orchestrator for Lastbrowser.

Combines connected LLMs (Google Gemini CLI/Cloud, Ollama Cloud/Local, OpenAI,
Anthropic, DeepSeek, etc.) via a Consensus & Debate architecture.
Features:
- Dynamic auto-scaling based on task complexity
- Configurable strategy presets (cost-optimized, balanced, max-quality)
- Shared grounding with browser tabs & CDP
- Parallel debate execution with hot-swap resilience & quorum fallback
- Critic evaluation & cross-review
- Unified final synthesis with rich SSE streaming
"""
from __future__ import annotations

import copy
import json
import logging
import os
import queue
import re
import threading
import time
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger("sidekick.teamwork")

# Synchronous planner/critic clients cannot be interrupted directly. Bound
# detached provider calls globally so repeated cancellations cannot accumulate
# unbounded threads. Daemon workers cannot hold process shutdown if a provider
# ignores its timeout.
_CANCELLABLE_CALL_SLOTS = threading.BoundedSemaphore(2)
# Worker providers run in a per-turn ThreadPoolExecutor so they can respond in
# parallel. A cancelled synchronous HTTP call cannot be killed safely, though,
# so cap detached/running workers across all turns. Slots are acquired before a
# task is submitted (rather than inside it) to avoid accumulating executor
# threads waiting on the semaphore after repeated cancellations.
_TEAMWORK_WORKER_SLOTS = threading.BoundedSemaphore(8)


def _call_llm_cancellable(call_llm: Callable[..., Any], *, cancel_event: Optional[threading.Event], **kwargs: Any) -> Any:
    """Call a sync provider while allowing prompt cancellation."""
    if cancel_event is None:
        return call_llm(**kwargs)

    while not _CANCELLABLE_CALL_SLOTS.acquire(timeout=0.05):
        if cancel_event.is_set():
            raise InterruptedError("Cancelled")
    if cancel_event.is_set():
        _CANCELLABLE_CALL_SLOTS.release()
        raise InterruptedError("Cancelled")

    result: queue.Queue[tuple[bool, Any]] = queue.Queue(maxsize=1)

    def invoke() -> None:
        try:
            result.put((True, call_llm(**kwargs)))
        except BaseException as exc:
            result.put((False, exc))
        finally:
            _CANCELLABLE_CALL_SLOTS.release()

    thread = threading.Thread(target=invoke, name="teamwork-provider-call", daemon=True)
    try:
        thread.start()
    except BaseException:
        _CANCELLABLE_CALL_SLOTS.release()
        raise

    while True:
        if cancel_event.is_set():
            raise InterruptedError("Cancelled")
        try:
            succeeded, value = result.get(timeout=0.05)
        except queue.Empty:
            continue
        if succeeded:
            return value
        raise value

DEFAULT_TEAMWORK_CONFIG: Dict[str, Any] = {
    "enabled": True,
    "strategy": "balanced",  # "cost" | "balanced" | "quality"
    "auto_scale": True,
    "max_subagents": 4,      # 1 to 8
    "shared_grounding": True,
    "roles": {
        "planner": "auto",
        "worker_pool": "auto",
        "critic": "auto",
        "synthesizer": "auto",
    },
    "hot_swap": {
        "enabled": True,
        "fallback_quorum_min": 1,
    },
}

_CONFIG_LOCK = threading.RLock()
_CACHED_CONFIG: Optional[Dict[str, Any]] = None


def get_teamwork_config_path() -> Path:
    from web.api.config import STATE_DIR
    return STATE_DIR / "teamwork.json"


_get_teamwork_config_path = get_teamwork_config_path


def load_teamwork_config(reload: bool = False) -> Dict[str, Any]:
    """Load teamwork configuration from disk, merged with defaults."""
    global _CACHED_CONFIG
    with _CONFIG_LOCK:
        if not reload and _CACHED_CONFIG is not None:
            return copy.deepcopy(_CACHED_CONFIG)
        cfg_path = _get_teamwork_config_path()
        config = dict(DEFAULT_TEAMWORK_CONFIG)
        if cfg_path.exists():
            try:
                data = json.loads(cfg_path.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    # Deep merge roles and hot_swap
                    roles = dict(DEFAULT_TEAMWORK_CONFIG["roles"])
                    if isinstance(data.get("roles"), dict):
                        roles.update(data["roles"])
                    hot_swap = dict(DEFAULT_TEAMWORK_CONFIG["hot_swap"])
                    if isinstance(data.get("hot_swap"), dict):
                        hot_swap.update(data["hot_swap"])

                    config.update(data)
                    config["roles"] = roles
                    config["hot_swap"] = hot_swap
            except Exception:
                logger.warning("Failed to parse %s, falling back to defaults", cfg_path, exc_info=True)
        # Validation
        # This option predates tool-capable workers. The current debate workers
        # cannot execute tools, so do not expose or preserve a misleading flag.
        config.pop("allow_autonomous_tools", None)
        max_sub = config.get("max_subagents", 4)
        try:
            config["max_subagents"] = max(1, min(8, int(max_sub)))
        except (ValueError, TypeError):
            config["max_subagents"] = 4
        if config.get("strategy") not in ("cost", "balanced", "quality"):
            config["strategy"] = "balanced"
        # A quorum of zero (or a negative value) would let Teamwork report a
        # successful run even when every worker failed. Keep persisted config
        # within the same bounds as the UI's supported worker count.
        try:
            config["hot_swap"]["fallback_quorum_min"] = max(
                1, min(8, int(config["hot_swap"].get("fallback_quorum_min", 1)))
            )
        except (TypeError, ValueError):
            config["hot_swap"]["fallback_quorum_min"] = 1
        config["hot_swap"]["enabled"] = bool(config["hot_swap"].get("enabled", True))
        _CACHED_CONFIG = copy.deepcopy(config)
        return copy.deepcopy(config)


def save_teamwork_config(data: Dict[str, Any]) -> Dict[str, Any]:
    """Save teamwork configuration to disk atomically."""
    global _CACHED_CONFIG
    with _CONFIG_LOCK:
        current = load_teamwork_config()
        if "enabled" in data:
            current["enabled"] = bool(data["enabled"])
        if "strategy" in data and data["strategy"] in ("cost", "balanced", "quality"):
            current["strategy"] = data["strategy"]
        if "auto_scale" in data:
            current["auto_scale"] = bool(data["auto_scale"])
        if "max_subagents" in data:
            try:
                current["max_subagents"] = max(1, min(8, int(data["max_subagents"])))
            except (ValueError, TypeError):
                pass
        if "shared_grounding" in data:
            current["shared_grounding"] = bool(data["shared_grounding"])
        current.pop("allow_autonomous_tools", None)
        if isinstance(data.get("roles"), dict):
            current["roles"].update(data["roles"])
        if isinstance(data.get("hot_swap"), dict):
            current["hot_swap"].update(data["hot_swap"])
        try:
            current["hot_swap"]["fallback_quorum_min"] = max(
                1, min(8, int(current["hot_swap"].get("fallback_quorum_min", 1)))
            )
        except (TypeError, ValueError):
            current["hot_swap"]["fallback_quorum_min"] = 1
        current["hot_swap"]["enabled"] = bool(current["hot_swap"].get("enabled", True))

        cfg_path = _get_teamwork_config_path()
        cfg_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = cfg_path.with_suffix(f".tmp.{os.getpid()}.{threading.current_thread().ident}")
        tmp_path.write_text(json.dumps(current, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(str(tmp_path), str(cfg_path))
        _CACHED_CONFIG = copy.deepcopy(current)
        return copy.deepcopy(current)


def classify_model_tier(model_id: str, provider: str = "") -> str:
    """Classify a model into 'fast' (cost), 'balanced', or 'quality'."""
    mid = model_id.lower()
    # Handle Gemini explicitly
    if "gemini" in mid:
        if any(k in mid for k in ("flash-lite", "lite", "nano")):
            return "fast"
        if "pro" in mid:
            return "quality"
        return "balanced"

    # Quality / Deep Reasoning models
    if any(k in mid for k in ("pro", "deepseek-r1", "-r1", "o1", "o3", "claude-3-7", "claude-3-5-sonnet", ":70b", "-70b", "qwq")):
        return "quality"
    # Fast / Cost-optimized models
    fast_tokens = ("lite", "nano", "mini", "haiku", "flash")
    if any(k in mid for k in fast_tokens) or re.search(r"(?:^|[:_\-])(?:3|4|7|8)b(?:$|[:_\-])", mid):
        return "fast"
    # Balanced
    return "balanced"


def get_teamwork_model_pool() -> List[Dict[str, Any]]:
    """Return all currently available and ready models categorized by provider and tier."""
    from web.api.config import get_available_models
    catalog = get_available_models()
    models: List[Dict[str, Any]] = []
    seen_ids = set()

    def verified_ollama_cloud_models() -> set[str]:
        """Return only account-verified Ollama Cloud models, never setup hints."""
        try:
            from cli.auth import resolve_api_key_provider_credentials

            credentials = resolve_api_key_provider_credentials("ollama-cloud")
            if not str(credentials.get("api_key") or "").strip():
                return set()

            # This catalog is account-scoped and only returns live results or
            # a previously live-verified cache when credentials are present.
            from cli.models import fetch_ollama_cloud_models

            return {
                str(model_id).strip()
                for model_id in fetch_ollama_cloud_models()
                if str(model_id).strip()
            }
        except Exception:
            return set()

    ollama_cloud_models: Optional[set[str]] = None

    for group in catalog.get("groups", []):
        provider_id = group.get("provider_id") or group.get("provider") or "unknown"
        provider_label = group.get("provider") or provider_id
        if provider_id == "ollama-cloud":
            if ollama_cloud_models is None:
                ollama_cloud_models = verified_ollama_cloud_models()
            if not ollama_cloud_models:
                # config.get_available_models may intentionally show curated
                # models as setup hints; those are not an inference-ready pool.
                continue
        for m in group.get("models", []):
            raw_id = str(m.get("id") or "").strip()
            if not raw_id:
                continue
            # Only @provider:model is a provider-qualified picker ID. A bare
            # colon is part of many real model IDs (for example qwen3:4b,
            # deepseek-r1:70b, or OpenRouter :free variants) and must survive.
            # Keep provider-qualified picker IDs as the orchestration identity.
            # The catalog deliberately adds @provider:model when providers
            # expose the same model ID. Strip it only for the provider API call.
            qualified_prefix = f"@{provider_id}:"
            call_model = raw_id[len(qualified_prefix):] if raw_id.startswith(qualified_prefix) else raw_id
            if provider_id == "ollama-cloud" and call_model not in ollama_cloud_models:
                continue
            if call_model.lower() == "teamwork" or raw_id in seen_ids:
                continue
            seen_ids.add(raw_id)
            name = m.get("name") or call_model
            tier = classify_model_tier(call_model, provider_id)
            models.append({
                "id": raw_id,
                "call_model": call_model,
                "name": name,
                "provider": provider_id,
                "provider_label": provider_label,
                "tier": tier,
                "context_window": m.get("context_window", 128000),
            })

    return models


def evaluate_task_complexity(prompt: str) -> int:
    """Score prompt complexity from 1 to 5 to guide dynamic auto-scaling."""
    text = prompt.strip()
    score = 1
    # Length signal
    if len(text) > 150:
        score += 1
    if len(text) > 600:
        score += 1
    # Code signal
    if "```" in text or "def " in text or "function" in text or "class " in text or "import " in text:
        score += 1
    # Multi-step / comparison / architectural keywords
    keywords = ("vergleiche", "compare", "architektur", "refactor", "refaktoriere", "debug", "optimiere", "analyze", "analyse", "implementiere", "design")
    matches = sum(1 for k in keywords if k in text.lower())
    if matches >= 1:
        score += 1
    if matches >= 3:
        score += 1
    return min(5, score)


def _scaled_worker_target(complexity: int, max_subagents: int) -> int:
    """Scale from two workers for simple tasks to the configured cap at max complexity."""
    cap = max(1, min(8, int(max_subagents)))
    if cap == 1:
        return 1
    level = max(1, min(5, int(complexity)))
    # Linear interpolation keeps the low end economical while allowing the
    # full configured capacity to be used for the hardest tasks.
    return min(cap, 2 + ((cap - 2) * (level - 1) + 3) // 4)


def _provider_failure_kind(error: Any) -> Optional[int]:
    """Extract only an HTTP status from provider exceptions for safe UI guidance."""
    for candidate in (
        getattr(error, "status_code", None),
        getattr(getattr(error, "response", None), "status_code", None),
    ):
        try:
            status = int(candidate)
        except (TypeError, ValueError):
            continue
        if 400 <= status <= 599:
            return status
    # Some SDK wrappers expose only a formatted exception string. Match the
    # status token, but never forward that string because it may include data.
    match = re.search(r"\bHTTP\s*(401|429)\b|\b(401|429)\b", str(error), re.IGNORECASE)
    if match:
        return int(match.group(1) or match.group(2))
    return None


def _safe_provider_failure(error: Any) -> str:
    """Describe provider failures without copying externally supplied text."""
    status = _provider_failure_kind(error)
    if status == 401:
        return "HTTP 401: authentication failed"
    if status == 429:
        return "HTTP 429: rate limit or quota reached"
    if status is not None:
        return f"HTTP {status}: provider request failed"
    return "provider request failed"


def _teamwork_quorum_error(failed_drafts: List[Dict[str, Any]], required: int) -> str:
    """Return actionable, deterministic errors without echoing provider payloads."""
    statuses = {
        status
        for draft in failed_drafts
        if (status := (draft.get("http_status") or _provider_failure_kind(draft.get("error")))) is not None
    }
    if 401 in statuses:
        return (
            "Teamwork konnte keinen Lösungsentwurf erzeugen: Der Anbieter hat die "
            "Anmeldung abgelehnt (HTTP 401). Prüfe die gespeicherten Zugangsdaten."
        )
    if 429 in statuses:
        return (
            "Teamwork konnte keinen Lösungsentwurf erzeugen: Der Anbieter meldet "
            "ein Rate-Limit oder erschöpftes Kontingent (HTTP 429). Warte auf die "
            "Rücksetzung oder aktiviere einen weiteren Anbieter."
        )
    return (
        "Teamwork-Fehler: Es konnte kein Lösungsentwurf generiert werden "
        f"({len(failed_drafts)} Modelle fehlgeschlagen; mindestens {required} erforderlich)."
    )


def resolve_team_plan(prompt: str, config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Resolve the specific models and roles for a teamwork session."""
    cfg = config or load_teamwork_config()
    pool = get_teamwork_model_pool()
    try:
        max_sub = max(1, min(8, int(cfg.get("max_subagents", 4))))
    except (TypeError, ValueError):
        max_sub = 4
    auto_scale = cfg.get("auto_scale", True)
    strategy = cfg.get("strategy", "balanced")
    roles_cfg = cfg.get("roles", {})
    if not isinstance(roles_cfg, dict):
        roles_cfg = {}

    complexity = evaluate_task_complexity(prompt)
    if auto_scale:
        target_workers = _scaled_worker_target(complexity, max_sub)
    else:
        target_workers = max_sub

    target_workers = max(1, min(target_workers, len(pool))) if pool else 0

    # Split pool into tiers
    fast_models = [m for m in pool if m["tier"] == "fast"]
    balanced_models = [m for m in pool if m["tier"] == "balanced"]
    quality_models = [m for m in pool if m["tier"] == "quality"]
    ollama_default = next((
        m for m in pool
        if m["provider"] == "ollama-cloud"
        and str(m.get("call_model") or m["id"]).lower() == "deepseek-v4.1-flash"
    ), None)

    # Role resolution: Worker Pool
    selected_workers: List[Dict[str, Any]] = []
    manual_workers = roles_cfg.get("worker_pool")
    if isinstance(manual_workers, list) and len(manual_workers) > 0 and manual_workers[0] != "auto":
        seen_worker_ids = set()
        for mid in manual_workers:
            mid = str(mid or "").strip()
            if not mid:
                continue
            if mid in seen_worker_ids:
                continue
            seen_worker_ids.add(mid)
            match = next((m for m in pool if m["id"] == mid), None)
            if match:
                selected_workers.append(match)
        if selected_workers:
            # A manually selected pool defines eligible models, not a request
            # to run every selected model at once. Preserve complexity-based
            # auto-scaling while honoring the configured hard cap.
            target_workers = min(len(selected_workers), target_workers, max_sub)
            selected_workers = selected_workers[:target_workers]

    if not selected_workers:
        # Auto-selection according to strategy
        candidates = list(pool)
        if strategy == "cost":
            # Prefer fast models, then balanced
            candidates.sort(key=lambda m: (0 if m["tier"] == "fast" else 1 if m["tier"] == "balanced" else 2))
        elif strategy == "quality":
            # Prefer quality models, then balanced
            candidates.sort(key=lambda m: (0 if m["tier"] == "quality" else 1 if m["tier"] == "balanced" else 2))
        else:
            # Balanced: include the configured Ollama Cloud default when it is
            # available, then diversify with balanced/quality models.
            candidates.sort(key=lambda m: (
                0 if m is ollama_default else
                1 if m["tier"] == "balanced" else
                2 if m["tier"] == "quality" else 3
            ))

        # Try to diversify providers
        providers_seen = set()
        for m in candidates:
            if len(selected_workers) >= target_workers:
                break
            if m["provider"] not in providers_seen or len(providers_seen) == len({x["provider"] for x in pool}):
                selected_workers.append(m)
                providers_seen.add(m["provider"])

        # Fill remaining slots if needed
        for m in candidates:
            if len(selected_workers) >= target_workers:
                break
            if m not in selected_workers:
                selected_workers.append(m)

    if not selected_workers and pool:
        selected_workers = [pool[0]]

    # The planner is a real, single planning pass before the parallel workers.
    manual_planner = roles_cfg.get("planner")
    planner = next((m for m in pool if m["id"] == manual_planner), None) if manual_planner and manual_planner != "auto" else None
    if planner is None:
        planner = (
            (ollama_default if strategy == "balanced" else None)
            or next((m for m in balanced_models), None)
            or next((m for m in quality_models), None)
            or (pool[0] if pool else None)
        )

    # Critic & Synthesizer models
    manual_critic = roles_cfg.get("critic")
    critic_entry = next((m for m in pool if m["id"] == manual_critic), None) if manual_critic and manual_critic != "auto" else None
    if critic_entry is None:
        # A configured model may have been disconnected or removed from the
        # provider catalog since the preference was saved. Resolve to a model
        # that is actually available instead of routing an invalid model ID.
        critic_entry = next(iter(quality_models), None) or next(iter(balanced_models), None) or (pool[0] if pool else None)
    critic_model = critic_entry["id"] if critic_entry else ""
    critic_provider = critic_entry["provider"] if critic_entry else None

    manual_synth = roles_cfg.get("synthesizer")
    synth_entry = next((m for m in pool if m["id"] == manual_synth), None) if manual_synth and manual_synth != "auto" else None
    if synth_entry is None:
        synth_entry = critic_entry
    synth_model = synth_entry["id"] if synth_entry else ""
    synth_provider = synth_entry["provider"] if synth_entry else None

    # Assign diverse perspectives to each worker
    perspective_templates = [
        {"role": "Pragmatiker", "focus": "Effiziente, direkte und sofort funktionierende Umsetzung ohne unnötigen Ballast."},
        {"role": "Architekt", "focus": "Systemische Robustheit, Randfälle (Edge Cases), Typensicherheit und saubere Modulstruktur."},
        {"role": "Optimierer", "focus": "Performance, alternative Algorithmen, Skalierbarkeit und Ressourceneffizienz."},
        {"role": "Skeptiker", "focus": "Sicherheit, Fehlerquellen, versteckte Annahmen und Verifikation."},
    ]

    workers_with_perspectives = []
    for idx, w in enumerate(selected_workers):
        persp = perspective_templates[idx % len(perspective_templates)]
        workers_with_perspectives.append({
            "model": w["id"],
            "call_model": w.get("call_model", w["id"]),
            "provider": w["provider"],
            "name": w["name"],
            "role": persp["role"],
            "focus": persp["focus"],
        })

    return {
        "strategy": strategy,
        "complexity": complexity,
        "planner": planner,
        "workers": workers_with_perspectives,
        "critic": critic_model,
        "critic_provider": critic_provider,
        "synthesizer": synth_model,
        "synthesizer_provider": synth_provider,
        "pool": pool,
    }


def _invoke_worker(
    worker: Dict[str, Any],
    prompt: str,
    grounding: str,
    backup_pool: List[Dict[str, Any]],
    timeout: float = 45.0,
    allow_hot_swap: bool = True,
) -> Dict[str, Any]:
    """Call one debate worker, swapping on operational failures only.

    Authentication and quota responses are returned immediately. Falling
    through to another provider after those responses could silently consume
    a different (potentially paid) account or model.
    """
    from runtime.auxiliary_client import call_llm, extract_content_or_reasoning

    current_worker = dict(worker)
    tried_models = {current_worker["model"]}
    swapped = False
    start_t = time.time()

    sys_instruction = (
        f"Du bist Teil eines hochkompetenten Multi-Modell-Teams ('Teamwork-Modus').\n"
        f"Deine spezifische Rolle: **{current_worker['role']}**\n"
        f"Dein Fokus: {current_worker['focus']}\n\n"
        f"Erstelle einen eigenständigen, exzellenten Lösungsentwurf für die Nutzeranfrage. "
        f"Bleibe faktenbasiert, präzise und liefere konkrete Erklärungen bzw. Code, wo passend."
    )

    messages = [{"role": "system", "content": sys_instruction}]
    if grounding:
        messages.append({"role": "system", "content": f"[GEMEINSAMER BROWSER- UND ARBEITSKONTEXT]\n{grounding}"})
    messages.append({"role": "user", "content": prompt})

    while True:
        try:
            resp = call_llm(
                provider=current_worker["provider"],
                model=current_worker.get("call_model", current_worker["model"]),
                messages=messages,
                timeout=timeout,
            )
            content = extract_content_or_reasoning(resp)
            if not content:
                content = str(resp.choices[0].message.content or "").strip()
            else:
                content = str(content).strip()
            if not content:
                # An empty completion is not a usable draft. Treat it like an
                # operational provider failure so the configured hot-swap
                # policy can try another currently available model.
                raise RuntimeError("provider returned an empty response")
            elapsed_ms = int((time.time() - start_t) * 1000)
            return {
                "model": current_worker["model"],
                "provider": current_worker["provider"],
                "name": current_worker.get("name", current_worker["model"]),
                "role": current_worker["role"],
                "focus": current_worker["focus"],
                "content": content,
                "execution_ms": elapsed_ms,
                "error": None,
                "swapped": swapped,
            }
        except Exception as e:
            failure_status = _provider_failure_kind(e)
            safe_failure = _safe_provider_failure(e)
            logger.warning("Worker %s failed: %s", current_worker["model"], safe_failure)
            if not allow_hot_swap or failure_status in {401, 429}:
                elapsed_ms = int((time.time() - start_t) * 1000)
                return {
                    "model": current_worker["model"],
                    "provider": current_worker["provider"],
                    "name": current_worker.get("name", current_worker["model"]),
                    "role": current_worker["role"],
                    "focus": current_worker["focus"],
                    "content": "",
                    "execution_ms": elapsed_ms,
                    "error": safe_failure,
                    "http_status": failure_status,
                    "swapped": False,
                }
            # Try hot-swap from backup pool
            swap_candidate = next((m for m in backup_pool if m["id"] not in tried_models), None)
            if swap_candidate:
                logger.info("Hot-swapping worker %s -> %s", current_worker["model"], swap_candidate["id"])
                tried_models.add(swap_candidate["id"])
                current_worker["model"] = swap_candidate["id"]
                current_worker["call_model"] = swap_candidate.get("call_model", swap_candidate["id"])
                current_worker["provider"] = swap_candidate["provider"]
                current_worker["name"] = swap_candidate.get("name", swap_candidate["id"])
                swapped = True
                continue
            # No candidate left, return failed draft
            elapsed_ms = int((time.time() - start_t) * 1000)
            return {
                "model": current_worker["model"],
                "provider": current_worker["provider"],
                "name": current_worker.get("name", current_worker["model"]),
                "role": current_worker["role"],
                "focus": current_worker["focus"],
                "content": "",
                "execution_ms": elapsed_ms,
                "error": safe_failure,
                "http_status": failure_status,
                "swapped": swapped,
            }


def _invoke_worker_with_slot(*args: Any, **kwargs: Any) -> Dict[str, Any]:
    """Run a worker and release its process-wide concurrency slot on exit."""
    try:
        return _invoke_worker(*args, **kwargs)
    finally:
        _TEAMWORK_WORKER_SLOTS.release()


def run_teamwork_turn(
    session: Any,
    prompt: str,
    *,
    grounding_context: str = "",
    config: Optional[Dict[str, Any]] = None,
    stream_put: Optional[Callable[[str, Any], None]] = None,
    cancel_event: Optional[threading.Event] = None,
) -> Dict[str, Any]:
    """Execute a complete Consensus & Debate Teamwork turn with live SSE event emission."""
    from runtime.auxiliary_client import call_llm, extract_content_or_reasoning, stream_llm

    start_total_t = time.time()
    cfg = config or load_teamwork_config()

    def put_event(ev: str, data: Any):
        if stream_put:
            try:
                stream_put(ev, data)
            except Exception:
                pass

    # 1. Phase: Shared Grounding
    put_event("teamwork_stage", {
        "stage": "grounding",
        "message": "Erfasse Kontext und Browser-Zustand...",
    })

    grounding_text = grounding_context.strip() if cfg.get("shared_grounding", True) else ""
    if not grounding_text and cfg.get("shared_grounding", True):
        # Extract active tab context if attached to session
        tab_title = getattr(session, "active_tab_title", None)
        tab_url = getattr(session, "active_tab_url", None)
        tab_snippet = getattr(session, "active_tab_snippet", None)
        if tab_url or tab_title:
            grounding_text = f"URL: {tab_url or 'N/A'}\nTitel: {tab_title or 'N/A'}"
            if tab_snippet:
                grounding_text += f"\nInhaltsauszug: {tab_snippet[:1500]}"

    if cancel_event and cancel_event.is_set():
        raise InterruptedError("Cancelled")

    # 2. Phase: Resolve Team Composition
    plan = resolve_team_plan(prompt, cfg)
    workers = plan["workers"]
    critic_model = plan["critic"]
    critic_provider = plan.get("critic_provider")
    synth_model = plan["synthesizer"]
    synth_provider = plan.get("synthesizer_provider")
    pool = plan["pool"]
    if not workers or not critic_model or not synth_model:
        raise RuntimeError("Teamwork hat keine aktuell verfügbaren Modelle. Verbinde zuerst mindestens einen Modellanbieter.")

    planner_context = ""
    planner_failure = None
    planner_model = plan.get("planner")
    if planner_model:
        put_event("teamwork_stage", {
            "stage": "planning",
            "model": planner_model["id"],
            "message": "Planer strukturiert die Teilfragen...",
        })
        try:
            planner_resp = _call_llm_cancellable(
                call_llm,
                cancel_event=cancel_event,
                provider=planner_model["provider"],
                model=planner_model.get("call_model", planner_model["id"]),
                messages=[
                    {"role": "system", "content": "Erstelle einen kurzen Arbeitsplan mit Teilfragen, Randbedingungen und Prüfpunkten. Keine Lösung ausformulieren; maximal 120 Wörter."},
                    {"role": "user", "content": prompt},
                ],
                timeout=30.0,
            )
            planner_context = extract_content_or_reasoning(planner_resp)
            if not planner_context:
                planner_context = str(planner_resp.choices[0].message.content or "").strip()
            if planner_context:
                put_event("teamwork_plan", {"model": planner_model["id"], "content": planner_context})
        except InterruptedError:
            raise
        except Exception as e:
            planner_failure = _safe_provider_failure(e)
            logger.warning("Teamwork planner failed; continuing without plan: %s", planner_failure)

    team_context = grounding_text
    if planner_context:
        team_context = f"{team_context}\n\n[ARBEITSPLAN DES PLANERS]\n{planner_context}".strip()

    if cancel_event and cancel_event.is_set():
        raise InterruptedError("Cancelled during teamwork planning")

    put_event("teamwork_stage", {
        "stage": "debate",
        "active_models": [w["name"] for w in workers],
        "message": f"{len(workers)} Modelle debattieren parallel...",
        "workers": workers,
    })

    # 3. Phase: Parallele Debatte (ThreadPoolExecutor)
    drafts: List[Dict[str, Any]] = []
    hot_swap_cfg = cfg.get("hot_swap", {})
    if not isinstance(hot_swap_cfg, dict):
        hot_swap_cfg = {}
    allow_hot_swap = bool(hot_swap_cfg.get("enabled", True))
    executor = ThreadPoolExecutor(max_workers=len(workers))
    futures = {}
    cancelled = False
    pending = set()
    try:
        # Reserve global capacity before submitting each task. Waiting here is
        # cancellation-aware, and submitting one at a time avoids deadlocks
        # between concurrent turns that each need more slots than remain free.
        for worker in workers:
            while cancel_event and cancel_event.is_set():
                cancelled = True
                raise InterruptedError("Cancelled")
            while not _TEAMWORK_WORKER_SLOTS.acquire(timeout=0.05):
                if cancel_event and cancel_event.is_set():
                    cancelled = True
                    raise InterruptedError("Cancelled")
            if cancel_event and cancel_event.is_set():
                _TEAMWORK_WORKER_SLOTS.release()
                cancelled = True
                raise InterruptedError("Cancelled")
            try:
                future = executor.submit(
                    _invoke_worker_with_slot,
                    worker,
                    prompt,
                    team_context,
                    pool,
                    allow_hot_swap=allow_hot_swap,
                )
            except BaseException:
                _TEAMWORK_WORKER_SLOTS.release()
                raise
            futures[future] = worker
            pending.add(future)

        while pending:
            if cancel_event and cancel_event.is_set():
                cancelled = True
                raise InterruptedError("Cancelled")
            completed, pending = wait(
                pending,
                timeout=0.05 if cancel_event else None,
                return_when=FIRST_COMPLETED,
            )
            for future in completed:
                try:
                    res = future.result()
                    drafts.append(res)
                    if not res.get("error"):
                        put_event("teamwork_draft", {
                            "model": res["model"],
                            "name": res["name"],
                            "role": res["role"],
                            "content": res["content"],
                            "execution_ms": res["execution_ms"],
                            "swapped": res.get("swapped", False),
                        })
                    else:
                        status = res.get("http_status") or _provider_failure_kind(res.get("error"))
                        put_event("teamwork_draft", {
                            "model": res["model"],
                            "name": res["name"],
                            "role": res["role"],
                            # Provider exceptions can contain URLs, request
                            # details, or credential fragments. Only expose a
                            # normalized status category in the UI event.
                            "error": (
                                f"HTTP {status}" if status in (401, 429)
                                else "Anbieteraufruf fehlgeschlagen"
                            ),
                            "skipped": True,
                        })
                except Exception as e:
                    logger.error("Worker future raised error: %s", _safe_provider_failure(e))
        if cancel_event and cancel_event.is_set():
            cancelled = True
            raise InterruptedError("Cancelled")
    finally:
        # ThreadPoolExecutor.__exit__ always waits for workers, even after a
        # shutdown(wait=False). Avoid that implicit wait when the caller has
        # cancelled; provider calls can be blocked or may ignore their timeout.
        if cancelled:
            # A successfully cancelled future never entered the wrapper and
            # therefore cannot release its reserved slot itself. Running tasks
            # release theirs from _invoke_worker_with_slot when they return.
            for future in futures:
                if future.cancel():
                    _TEAMWORK_WORKER_SLOTS.release()
        executor.shutdown(wait=not cancelled, cancel_futures=cancelled)

    # Quorum check
    successful_drafts = [d for d in drafts if not d.get("error") and d.get("content")]
    try:
        min_quorum = max(1, min(8, int(hot_swap_cfg.get("fallback_quorum_min", 1))))
    except (TypeError, ValueError):
        min_quorum = 1
    if len(successful_drafts) < min_quorum:
        raise RuntimeError(_teamwork_quorum_error(
            [draft for draft in drafts if draft.get("error") or not draft.get("content")],
            min_quorum,
        ))

    if cancel_event and cancel_event.is_set():
        raise InterruptedError("Cancelled")

    # 4. Phase: Critic Evaluation & Cross-Review
    put_event("teamwork_stage", {
        "stage": "critic",
        "model": critic_model,
        "message": "Critic vergleicht und bewertet die Entwürfe...",
    })

    critic_prompt = (
        f"Du bist der leitende Reviewer und Critic im Multi-Modell-Teamwork.\n\n"
        f"URSPRÜNGLICHE ANFRAGE:\n{prompt}\n\n"
    )
    if team_context:
        critic_prompt += f"GEMEINSAMER KONTEXT UND ARBEITSPLAN:\n{team_context}\n\n"

    critic_prompt += "HIER SIND DIE PARALLELEN ENTWÜRFE DER MODELLE:\n"
    for idx, d in enumerate(successful_drafts, 1):
        critic_prompt += f"\n--- Entwurf {idx} ({d['name']} - Rolle: {d['role']}) ---\n{d['content']}\n"

    critic_prompt += (
        "\nAUFGABE DES CRITICS:\n"
        "1. Analysiere kurz die Stärken und Alleinstellungsmerkmale jedes Entwurfs.\n"
        "2. Decke eventuelle Ungenauigkeiten, fehlende Randfälle oder Fehler auf.\n"
        "3. Gib eine präzise Empfehlung, welche Elemente in der finalen Synthese zusammengeführt werden sollen."
    )

    critic_t0 = time.time()
    critic_review = ""
    try:
        critic_entry = next((m for m in pool if m["id"] == critic_model), None)
        critic_resp = _call_llm_cancellable(
            call_llm,
            cancel_event=cancel_event,
            provider=critic_provider,
            model=critic_entry.get("call_model", critic_model) if critic_entry else critic_model,
            messages=[{"role": "user", "content": critic_prompt}],
            timeout=50.0,
        )
        critic_review = extract_content_or_reasoning(critic_resp)
        if not critic_review:
            critic_review = str(critic_resp.choices[0].message.content or "").strip()
    except InterruptedError:
        raise
    except Exception as e:
        safe_failure = _safe_provider_failure(e)
        logger.warning("Critic evaluation failed: %s, continuing with best draft directly", safe_failure)
        critic_review = f"Kritik konnte nicht separat generiert werden ({safe_failure}). Synthese basiert auf den Roh-Entwürfen."

    critic_ms = int((time.time() - critic_t0) * 1000)
    put_event("teamwork_critic", {
        "model": critic_model,
        "review": critic_review,
        "execution_ms": critic_ms,
    })

    if cancel_event and cancel_event.is_set():
        raise InterruptedError("Cancelled")

    # 5. Phase: Finale Synthese
    put_event("teamwork_stage", {
        "stage": "synthesizing",
        "model": synth_model,
        "message": "Synthetisiere bestes Gesamtergebnis...",
    })

    synthesis_prompt = (
        f"Du bist der leitende Synthesizer im Teamwork-Modus von Lastbrowser.\n\n"
        f"URSPRÜNGLICHE NUTZERANFRAGE:\n{prompt}\n\n"
    )
    if team_context:
        synthesis_prompt += f"GEMEINSAMER KONTEXT UND ARBEITSPLAN:\n{team_context}\n\n"

    synthesis_prompt += "VORGELEGTE ENTWÜRFE DER MODELLE:\n"
    for idx, d in enumerate(successful_drafts, 1):
        synthesis_prompt += f"\n--- Entwurf {idx} ({d['name']} - {d['role']}) ---\n{d['content']}\n"

    synthesis_prompt += f"\nBEWERTUNG DES CRITICS:\n{critic_review}\n\n"
    synthesis_prompt += (
        "DEINE AUFGABE:\n"
        "Erstelle die finale, perfekte und vollständige Antwort für den Nutzer. "
        "Führe die stärksten Aspekte aller Entwürfe zusammen, korrigiere etwaige Fehler gemäß der Kritik "
        "und präsentiere das Ergebnis klar, professionell strukturiert und direkt anwendbar."
    )

    synth_t0 = time.time()
    synthesis_failure = None
    streamed_answer_parts: List[str] = []
    streamed_reasoning_parts: List[str] = []

    def emit_synthesis_content(text: str) -> None:
        if not text:
            return
        streamed_answer_parts.append(text)
        put_event("delta", {"content": text})

    def emit_synthesis_reasoning(text: str) -> None:
        if not text:
            return
        streamed_reasoning_parts.append(text)
        put_event("reasoning", {"text": text})

    try:
        synth_entry = next((m for m in pool if m["id"] == synth_model), None)
        final_answer = stream_llm(
            provider=synth_provider,
            model=synth_entry.get("call_model", synth_model) if synth_entry else synth_model,
            messages=[{"role": "user", "content": synthesis_prompt}],
            on_content=emit_synthesis_content,
            on_reasoning=emit_synthesis_reasoning,
            timeout=65.0,
            cancel_event=cancel_event,
            retry_transient_before_first_token=True,
        )
        if not final_answer.strip():
            if streamed_answer_parts or streamed_reasoning_parts:
                raise RuntimeError(
                    "Teamwork synthesis returned no final answer after partial output; "
                    "the visible synthesis was left unchanged."
                )
            final_answer = successful_drafts[0]["content"]
            emit_synthesis_content(final_answer)
    except InterruptedError:
        raise
    except Exception as e:
        if streamed_answer_parts or streamed_reasoning_parts:
            safe_failure = _safe_provider_failure(e)
            raise RuntimeError(
                f"Teamwork synthesis stream failed after partial output ({safe_failure}); "
                "the partial answer or reasoning was left visible and was not replaced."
            )
        synthesis_failure = _safe_provider_failure(e)
        logger.error("Synthesis failed: %s, falling back to best individual draft", synthesis_failure)
        final_answer = successful_drafts[0]["content"]
        emit_synthesis_content(final_answer)

    synth_ms = int((time.time() - synth_t0) * 1000)
    total_duration_ms = int((time.time() - start_total_t) * 1000)

    metadata_payload = {
        "strategy": cfg.get("strategy", "balanced"),
        "planner": planner_model["id"] if planner_model else None,
        "planner_failure": planner_failure,
        "models_used": ([planner_model["id"]] if planner_model else []) + [d["model"] for d in drafts] + [critic_model, synth_model],
        "drafts": [
            {
                "model": d["model"],
                "name": d["name"],
                "role": d["role"],
                "content": d["content"],
                "execution_ms": d["execution_ms"],
                "error": d.get("error"),
                "swapped": d.get("swapped", False),
            }
            for d in drafts
        ],
        "critic": {
            "model": critic_model,
            "review": critic_review,
            "execution_ms": critic_ms,
        },
        "synthesis_failure": synthesis_failure,
        "stats": {
            "duration_ms": total_duration_ms,
            "drafts_count": len(successful_drafts),
            "auto_scaled": bool(cfg.get("auto_scale", True)),
        },
    }

    put_event("teamwork_complete", metadata_payload)

    # Attach to session messages
    assistant_entry = {
        "role": "assistant",
        "content": final_answer,
        "timestamp": int(time.time()),
        "teamwork": metadata_payload,
    }
    if streamed_reasoning_parts:
        assistant_entry["reasoning"] = "".join(streamed_reasoning_parts)
    session.messages.append(assistant_entry)
    try:
        session.save()
    except Exception:
        logger.warning("Failed to save session messages after teamwork turn", exc_info=True)

    return {
        "content": final_answer,
        "metadata": metadata_payload,
        "duration_ms": total_duration_ms,
    }
