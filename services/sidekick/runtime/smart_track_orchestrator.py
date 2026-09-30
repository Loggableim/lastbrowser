"""Smart Track Single-Track Orchestrator for Lastbrowser.

Token-efficient alternative to multi-agent teamwork. Routes queries through a single
curated track using a 3-tier Model Wall (Low, Medium, High) and token-free intent detection:
- Low: Fast, high-economy models (e.g. Gemini 2.5 Flash Lite, Ollama 7B/8B, Haiku)
- Medium: Balanced models for day-to-day coding & analysis (e.g. Gemini 2.5 Flash, Qwen-Coder)
- High: Flagship reasoning models with optional sequential pre-planning (e.g. Gemini 2.5 Pro, R1, Sonnet)
"""
from __future__ import annotations

import json
import logging
import os
import re
import threading
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger("sidekick.smart_track")

DEFAULT_SMART_TRACK_CONFIG: Dict[str, Any] = {
    "enabled": True,
    "effort": "medium",  # "low" | "medium" | "high"
    "auto_scan": True,
    "overrides": {
        "low": "auto",
        "medium": "auto",
        "high": "auto",
    },
    "preplan_on_high": True,
}

_CONFIG_LOCK = threading.RLock()
_CACHED_CONFIG: Optional[Dict[str, Any]] = None
_SCAN_LOCK = threading.Lock()
_SCAN_THREAD: Optional[threading.Thread] = None
_SCAN_STATE: Dict[str, Any] = {"status": "idle", "last_error": None}


def _set_model_wall_scan_state(status: str, error: Optional[str] = None) -> None:
    with _SCAN_LOCK:
        _SCAN_STATE.update(status=status, last_error=error)


def get_smart_track_config_path() -> Path:
    from web.api.config import STATE_DIR
    return STATE_DIR / "smart_track.json"


_get_smart_track_config_path = get_smart_track_config_path


import copy

def load_smart_track_config(reload: bool = False) -> Dict[str, Any]:
    """Load smart track configuration from disk, merged with defaults."""
    global _CACHED_CONFIG
    with _CONFIG_LOCK:
        if not reload and _CACHED_CONFIG is not None:
            return copy.deepcopy(_CACHED_CONFIG)
        cfg_path = get_smart_track_config_path()
        config = copy.deepcopy(DEFAULT_SMART_TRACK_CONFIG)
        if cfg_path.exists():
            try:
                data = json.loads(cfg_path.read_text(encoding="utf-8"))
                if isinstance(data, dict):
                    overrides = copy.deepcopy(DEFAULT_SMART_TRACK_CONFIG["overrides"])
                    if isinstance(data.get("overrides"), dict):
                        overrides.update(data["overrides"])
                    config.update(data)
                    config["overrides"] = overrides
            except Exception:
                logger.warning("Failed to parse %s, falling back to defaults", cfg_path, exc_info=True)
        if config.get("effort") not in ("low", "medium", "high"):
            config["effort"] = "medium"
        _CACHED_CONFIG = copy.deepcopy(config)
        return config


def save_smart_track_config(data: Dict[str, Any]) -> Dict[str, Any]:
    """Save smart track configuration to disk atomically."""
    global _CACHED_CONFIG
    with _CONFIG_LOCK:
        current = load_smart_track_config()
        if "enabled" in data:
            current["enabled"] = bool(data["enabled"])
        if "effort" in data and str(data["effort"]).lower() in ("low", "medium", "high"):
            current["effort"] = str(data["effort"]).lower()
        if "auto_scan" in data:
            current["auto_scan"] = bool(data["auto_scan"])
        if "preplan_on_high" in data:
            current["preplan_on_high"] = bool(data["preplan_on_high"])
        if "overrides" in data and isinstance(data["overrides"], dict):
            for tier in ("low", "medium", "high"):
                if tier in data["overrides"]:
                    current["overrides"][tier] = str(data["overrides"][tier]).strip()

        cfg_path = get_smart_track_config_path()
        cfg_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = cfg_path.with_suffix(f".tmp.{os.getpid()}.{threading.current_thread().ident}")
        tmp_path.write_text(json.dumps(current, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(str(tmp_path), str(cfg_path))
        _CACHED_CONFIG = dict(current)
        return current


def detect_prompt_intent(prompt: str) -> str:
    """Classify prompt intent in <0.1ms using deterministic zero-token heuristic rules.

    Returns: 'coding' | 'web' | 'reasoning' | 'general'
    """
    text = prompt.strip().lower()
    if not text:
        return "general"

    # 1. Coding intent
    code_signals = (
        "```", "def ", "function", "class ", "import ", "const ", "let ",
        "return ", "<div", "sql", "select ", "where ", "regex", "api", "npm ",
        "pip ", "git ", "refactor", "bug", "traceback", "typescript", "python",
        "javascript", "html", "css", "dockerfile", "endpoint", "json"
    )
    if any(sig in text for sig in code_signals):
        return "coding"

    # 2. Web & Current information intent
    web_signals = (
        "aktuell", "suche", "news", "nachrichten", "url", "http://", "https://",
        "website", "webseite", "wetter", "kurs", "heute", "gestern", "release notes",
        "doku", "documentation", "latest"
    )
    if any(sig in text for sig in web_signals):
        return "web"

    # 3. Reasoning / Deep analysis intent
    reasoning_signals = (
        "warum", "why", "beweise", "prove", "vergleiche", "unterschied",
        "vor- und nachteile", "trade-off", "architektur", "analyse", "komplex",
        "ursache", "herleitung", "berechne", "mathematik", "logik", "fazit"
    )
    if any(sig in text for sig in reasoning_signals):
        return "reasoning"

    return "general"


def classify_smart_model(model_id: str, provider: str = "") -> Tuple[str, List[str]]:
    """Determine the tier ('low', 'medium', 'high') and capability tags for a given model."""
    mid = model_id.lower()
    tags = []

    # Tag capabilities
    if any(k in mid for k in ("coder", "code", "dev", "deepseek-coder", "qwen2.5-coder", "codestral")):
        tags.append("coding")
    if any(k in mid for k in ("search", "browse", "web", "gemini")):
        tags.append("web")
    if any(k in mid for k in ("pro", "r1", "o1", "o3", "sonnet", "opus", "qwq")):
        tags.append("reasoning")
    if any(k in mid for k in ("flash", "lite", "nano", "mini", "haiku")) or re.search(r"(?:^|[:_\-])(?:3|4|7|8)b(?:$|[:_\-])", mid):
        tags.append("fast")

    # Tier assignment
    if "gemini" in mid:
        if any(k in mid for k in ("flash-lite", "lite", "nano")):
            return "low", tags
        if "pro" in mid:
            return "high", tags
        return "medium", tags

    # Quality / High Tier
    if any(k in mid for k in ("pro", "deepseek-r1", "-r1", "o1", "o3", "claude-3-7", "claude-3-5-sonnet", ":70b", "-70b", "qwq", "opus")):
        return "high", tags

    # Low / Eco Tier
    if any(k in mid for k in ("flash", "lite", "nano", "mini", "haiku")) or re.search(r"(?:^|[:_\-])(?:3|4|7|8)b(?:$|[:_\-])", mid):
        return "low", tags

    # Medium Tier
    return "medium", tags


def build_model_wall() -> Dict[str, Any]:
    """Scan connected models and build the 3-tier Model Wall with capability index."""
    from web.api.config import get_available_models
    catalog = get_available_models()
    groups = list(catalog.get("groups", []))
    seen = set()

    def verified_ollama_cloud_models() -> List[str]:
        """Exclude Ollama setup hints unless this account has live models."""
        try:
            from cli.auth import resolve_api_key_provider_credentials

            credentials = resolve_api_key_provider_credentials("ollama-cloud")
            if not str(credentials.get("api_key") or "").strip():
                return []

            from cli.models import fetch_ollama_cloud_models

            return list(dict.fromkeys(
                str(model_id).strip()
                for model_id in fetch_ollama_cloud_models()
                if str(model_id).strip()
            ))
        except Exception:
            logger.warning("Unable to verify Ollama Cloud Smart Track models", exc_info=True)
            return []

    ollama_cloud_models: Optional[List[str]] = None
    if not any(
        (group.get("provider_id") or group.get("provider")) == "ollama-cloud"
        for group in groups
    ):
        # Smart Track scans providers directly, so a fresh credential-scoped
        # catalog remains discoverable even when the general model picker has
        # a stale cached group or omits this provider entirely.
        ollama_cloud_models = verified_ollama_cloud_models()
        if ollama_cloud_models:
            groups.append({"provider_id": "ollama-cloud", "provider": "Ollama Cloud", "models": []})

    tiers: Dict[str, List[Dict[str, Any]]] = {
        "low": [],
        "medium": [],
        "high": [],
    }

    for group in groups:
        provider_id = group.get("provider_id") or group.get("provider") or "unknown"
        provider_label = group.get("provider") or provider_id
        if provider_id == "ollama-cloud":
            if ollama_cloud_models is None:
                ollama_cloud_models = verified_ollama_cloud_models()
            if not ollama_cloud_models:
                # The static provider catalog is useful for setup UI, but it is
                # not evidence that a credential or account entitlement exists.
                continue
            catalog_models = group.get("models", [])
            by_call_model: Dict[str, Dict[str, Any]] = {}
            for model in catalog_models:
                raw_id = str(model.get("id") or "").strip()
                prefix = f"@{provider_id}:"
                call_id = raw_id[len(prefix):] if raw_id.startswith(prefix) else raw_id
                if call_id:
                    by_call_model[call_id] = model
            group_models = []
            for live_id in ollama_cloud_models:
                cached_model = by_call_model.get(live_id)
                group_models.append({
                    **(cached_model or {}),
                    "id": (cached_model or {}).get("id") or live_id,
                    "name": (cached_model or {}).get("name") or live_id,
                })
        else:
            group_models = group.get("models", [])

        for m in group_models:
            raw_id = str(m.get("id") or "").strip()
            if not raw_id:
                continue
            # Only @provider:model is a provider-qualified picker ID. A bare
            # colon is part of many real model IDs (for example qwen3:4b,
            # deepseek-r1:70b, or OpenRouter :free variants) and must survive.
            qualified_prefix = f"@{provider_id}:"
            call_model = raw_id[len(qualified_prefix):] if raw_id.startswith(qualified_prefix) else raw_id
            if call_model.lower() in ("teamwork", "smart-track", "smart-track-low", "smart-track-medium", "smart-track-high") or raw_id in seen:
                continue
            seen.add(raw_id)

            tier, tags = classify_smart_model(call_model, provider_id)
            model_info = {
                "id": raw_id,
                "call_model": call_model,
                "name": m.get("name") or call_model,
                "provider": provider_id,
                "provider_label": provider_label,
                "tier": tier,
                "tags": tags,
                "context_window": m.get("context_window", 128000),
            }
            tiers[tier].append(model_info)

    # Inter-tier fallback for empty slots
    all_models = [m for sublist in tiers.values() for m in sublist]
    for tier in ("low", "medium", "high"):
        if not tiers[tier]:
            if tier == "low":
                borrow = tiers["medium"] or tiers["high"] or all_models
            elif tier == "high":
                borrow = tiers["medium"] or tiers["low"] or all_models
            else:
                borrow = tiers["high"] or tiers["low"] or all_models
            if borrow:
                tiers[tier] = list(borrow)

    # Calculate default and intent specialists for each tier
    model_wall = {}
    for tier_key, model_list in tiers.items():
        preferred_ollama_default = next((
            model for model in model_list
            if tier_key == "low"
            and model.get("provider") == "ollama-cloud"
            and str(model.get("call_model") or model.get("id") or "").lower()
            == "deepseek-v4.1-flash"
        ), None)
        default_model = (
            preferred_ollama_default["id"]
            if preferred_ollama_default
            else model_list[0]["id"] if model_list else ""
        )
        coding_model = next((m["id"] for m in model_list if "coding" in m.get("tags", [])), default_model)
        web_model = next((m["id"] for m in model_list if "web" in m.get("tags", [])), default_model)
        reasoning_model = next((m["id"] for m in model_list if "reasoning" in m.get("tags", [])), default_model)

        model_wall[tier_key] = {
            "default": default_model,
            "coding": coding_model,
            "web": web_model,
            "reasoning": reasoning_model,
            "models": model_list,
        }

    return model_wall


def schedule_model_wall_scan(*, force: bool = False) -> bool:
    """Refresh the Model Wall off-thread; return whether a scan was queued.

    Automatic startup/credential scans obey ``auto_scan``. Explicit callers may
    pass ``force=True`` (the manual scan endpoint) and always trigger discovery.
    Discovery only enumerates provider models; it never issues generations.
    """
    global _SCAN_THREAD
    if not force and not load_smart_track_config(reload=True).get("auto_scan", True):
        return False
    with _SCAN_LOCK:
        if _SCAN_THREAD is not None and _SCAN_THREAD.is_alive():
            return False
        _SCAN_STATE.update(status="scanning", last_error=None)

        def scan() -> None:
            global _SCAN_THREAD
            try:
                build_model_wall()
                _set_model_wall_scan_state("complete")
            except Exception as exc:
                logger.warning("Smart Track automatic model scan failed: %s", exc)
                _set_model_wall_scan_state("failed", str(exc))
            finally:
                with _SCAN_LOCK:
                    _SCAN_THREAD = None

        _SCAN_THREAD = threading.Thread(target=scan, name="smart-track-model-scan", daemon=True)
        _SCAN_THREAD.start()
        return True


def get_model_wall_scan_state() -> Dict[str, Any]:
    with _SCAN_LOCK:
        return dict(_SCAN_STATE)


def _provider_for_wall_model(wall: Dict[str, Any], model_id: str, fallback: str = "") -> str:
    """Return the provider owning a selected model-wall ID."""
    for tier in wall.values():
        for model in tier.get("models", []):
            if model.get("id") == model_id:
                return str(model.get("provider") or fallback)
    return fallback


def resolve_smart_track_model(
    effort: str = "medium",
    prompt: str = "",
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Resolve the specific model and provider for a smart track request."""
    cfg = config or load_smart_track_config()
    effort_norm = str(effort or cfg.get("effort", "medium")).lower()
    if effort_norm not in ("low", "medium", "high"):
        effort_norm = "medium"

    wall = build_model_wall()
    if not any(tier.get("models") for tier in wall.values()):
        raise RuntimeError("Smart Track hat keine aktuell verfügbaren Modelle. Verbinde zuerst mindestens einen Modellanbieter.")
    tier_data = wall.get(effort_norm, wall.get("medium", {}))
    models_in_tier = tier_data.get("models", [])
    intent = detect_prompt_intent(prompt)

    # Check user override for this tier
    overrides = cfg.get("overrides", {})
    user_override = str(overrides.get(effort_norm, "")).strip()
    if user_override and user_override.lower() != "auto":
        all_models = [m for td in wall.values() for m in td.get("models", [])]
        chosen = next((m for m in all_models if m["id"] == user_override), None)
        if chosen:
            return {
                "model": chosen["id"],
                "call_model": chosen.get("call_model", chosen["id"]),
                "provider": chosen["provider"],
                "name": chosen["name"],
                "tier": effort_norm,
                "intent": intent,
                "tags": chosen.get("tags", []),
                "overridden": True,
            }

    # Match based on intent
    target_id = tier_data.get(intent) or tier_data.get("default")
    chosen = next((m for m in models_in_tier if m["id"] == target_id), None)
    if not chosen and models_in_tier:
        chosen = models_in_tier[0]

    if not chosen:
        chosen = {
            "id": "gemini-2.5-flash",
            "name": "Gemini 2.5 Flash",
            "provider": "google-gemini-cli",
            "tier": effort_norm,
            "tags": ["web"],
        }

    return {
        "model": chosen["id"],
        "call_model": chosen.get("call_model", chosen["id"]),
        "provider": chosen["provider"],
        "name": chosen["name"],
        "tier": effort_norm,
        "intent": intent,
        "tags": chosen.get("tags", []),
        "overridden": False,
    }


def run_smart_track_turn(
    session: Any,
    prompt: str,
    *,
    effort: str = "medium",
    stream_put: Optional[Callable[[str, Any], None]] = None,
    cancel_event: Optional[threading.Event] = None,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Execute a single-track smart turn with live SSE event emission."""
    from runtime.auxiliary_client import stream_llm

    start_total_t = time.time()
    cfg = config or load_smart_track_config()

    def put_event(ev: str, data: Any):
        if stream_put:
            try:
                stream_put(ev, data)
            except Exception:
                pass

    if cancel_event and cancel_event.is_set():
        raise InterruptedError("Cancelled before smart track start")

    routed = resolve_smart_track_model(effort=effort, prompt=prompt, config=cfg)
    effort_norm = routed["tier"]
    intent = routed["intent"]

    # Initial routing event to inform frontend UI
    put_event("smart_track_routed", {
        "effort": effort_norm,
        "intent": intent,
        "model": routed["model"],
        "provider": routed["provider"],
        "name": routed["name"],
        "tags": routed.get("tags", []),
        "overridden": routed.get("overridden", False),
    })

    preplan_content: Optional[str] = None
    preplan_ms: int = 0
    preplan_reasoning_parts: List[str] = []

    def emit_preplan_reasoning(text: str) -> None:
        if text:
            preplan_reasoning_parts.append(text)
            put_event("reasoning", {"text": text})

    # High Effort: Sequential 2-Phase execution (Pre-planning -> Deep Flagship execution)
    if effort_norm == "high" and cfg.get("preplan_on_high", True):
        put_event("smart_track_step", {
            "stage": "preplan",
            "message": "Erstelle strukturierte Aufgabenzerlegung & Validierungsschritte...",
        })

        preplan_t0 = time.time()
        preplan_sys = (
            "Du bist ein analytischer Aufgaben-Strukturierer. "
            "Zerlege die folgende Aufgabenstellung kurz, präzise und stichpunktartig in:\n"
            "1. Kernfragen & Zieldefinition\n"
            "2. Kritische Randbedingungen & mögliche Fallstricke\n"
            "3. Empfohlene Lösungsstruktur\n"
            "Halte die Antwort kompakt (maximal 150-200 Wörter) und ohne Floskeln."
        )

        try:
            wall = build_model_wall()
            preplan_model = wall.get("low", {}).get("default") or wall.get("medium", {}).get("default") or routed["model"]
            preplan_entry = next(
                (m for tier_data in wall.values() for m in tier_data.get("models", []) if m.get("id") == preplan_model),
                None,
            )
            preplan_content = stream_llm(
                provider=_provider_for_wall_model(wall, preplan_model, routed["provider"]),
                model=(preplan_entry or {}).get("call_model", preplan_model),
                messages=[
                    {"role": "system", "content": preplan_sys},
                    {"role": "user", "content": prompt},
                ],
                on_content=lambda _text: None,
                on_reasoning=emit_preplan_reasoning,
                timeout=25.0,
                cancel_event=cancel_event,
                retry_transient_before_first_token=False,
            )
        except Exception as e:
            logger.warning("Smart track pre-plan step skipped due to error: %s", e)
            preplan_content = None

        preplan_ms = int((time.time() - preplan_t0) * 1000)
        if preplan_content:
            put_event("smart_track_preplan", {
                "content": preplan_content,
                "execution_ms": preplan_ms,
            })

    if cancel_event and cancel_event.is_set():
        raise InterruptedError("Cancelled during smart track pre-planning")

    # Main execution step
    put_event("smart_track_step", {
        "stage": "executing",
        "message": f"Generiere Antwort mit {routed['name']}...",
    })

    main_messages = []
    if preplan_content:
        main_sys = (
            f"Du führst eine anspruchsvolle Analyse im Smart-Track-Modus (High Effort) durch.\n"
            f"Folgende strukturierte Vorplanung wurde bereits ermittelt. Nutze sie als Fundament:\n"
            f"--- VORPLANUNG ---\n{preplan_content}\n--- ENDE VORPLANUNG ---\n"
            f"Beantworte die Anfrage des Nutzers nun fundiert, detailliert und präzise."
        )
        main_messages.append({"role": "system", "content": main_sys})

    main_messages.append({"role": "user", "content": prompt})

    main_t0 = time.time()
    answer_parts: List[str] = []
    reasoning_parts: List[str] = list(preplan_reasoning_parts)

    def emit_main_content(text: str) -> None:
        if text:
            answer_parts.append(text)
            put_event("delta", {"content": text})

    def emit_main_reasoning(text: str) -> None:
        if text:
            reasoning_parts.append(text)
            put_event("reasoning", {"text": text})

    def has_visible_output() -> bool:
        return bool(answer_parts or reasoning_parts)

    def stream_main_response(*, timeout: float) -> str:
        return stream_llm(
            provider=routed["provider"],
            model=routed.get("call_model", routed["model"]),
            messages=main_messages,
            on_content=emit_main_content,
            on_reasoning=emit_main_reasoning,
            timeout=timeout,
            cancel_event=cancel_event,
            retry_transient_before_first_token=False,
        )

    try:
        # Keep one provider attempt inside the renderer's 180s idle window;
        # if it fails before output, the announced medium fallback gets its
        # own bounded attempt below.
        final_answer = stream_main_response(timeout=160.0)
    except InterruptedError:
        raise
    except Exception as e:
        # Never switch models once any answer or reasoning has reached the UI:
        # the fallback could contradict already visible output.
        if has_visible_output():
            raise RuntimeError(
                "Smart Track response stream failed after partial output; "
                "the partial response was left visible and was not replaced."
            ) from e

        logger.error("Smart track main call to %s failed before output: %s", routed["model"], e)
        wall = build_model_wall()
        fb_model = wall.get("medium", {}).get("default") or routed["model"]
        fb_entry = next(
            (m for tier_data in wall.values() for m in tier_data.get("models", []) if m.get("id") == fb_model),
            None,
        )
        fb_provider = _provider_for_wall_model(wall, fb_model, routed["provider"])
        put_event("smart_track_step", {
            "stage": "fallback",
            "message": f"{routed['name']} ist vor der ersten Ausgabe fehlgeschlagen; wechsle zu {fb_model}...",
            "model": fb_model,
            "provider": fb_provider,
        })
        routed["model"] = fb_model
        routed["call_model"] = (fb_entry or {}).get("call_model", fb_model)
        routed["provider"] = fb_provider
        routed["name"] = f"{fb_model} (Fallback)"
        try:
            final_answer = stream_main_response(timeout=160.0)
        except InterruptedError:
            raise
        except Exception:
            if has_visible_output():
                raise RuntimeError(
                    "Smart Track fallback stream failed after partial output; "
                    "the partial response was left visible and was not replaced."
                )
            raise

    # Some compatible adapters may return a complete response without invoking
    # callbacks. Emit it once; streamed callbacks remain the authoritative text
    # whenever they already delivered content.
    if not answer_parts and final_answer:
        emit_main_content(final_answer)
    final_answer = "".join(answer_parts) if answer_parts else final_answer

    if cancel_event and cancel_event.is_set():
        raise InterruptedError("Cancelled during smart track response")

    main_ms = int((time.time() - main_t0) * 1000)
    total_ms = int((time.time() - start_total_t) * 1000)

    metadata_payload = {
        "effort": effort_norm,
        "intent": intent,
        "model": routed["model"],
        "provider": routed["provider"],
        "name": routed["name"],
        "tags": routed.get("tags", []),
        "preplan": preplan_content,
        "preplan_ms": preplan_ms,
        "execution_ms": main_ms,
        "total_ms": total_ms,
    }

    put_event("smart_track_complete", metadata_payload)

    # Attach to session messages with metadata for UI rendering
    assistant_entry = {
        "role": "assistant",
        "content": final_answer,
        "timestamp": int(time.time()),
        "smartTrack": metadata_payload,
    }
    if reasoning_parts:
        assistant_entry["reasoning"] = "".join(reasoning_parts)
    session.messages.append(assistant_entry)
    try:
        session.save()
    except Exception:
        logger.warning("Failed to save session messages after smart track turn", exc_info=True)

    return {
        "content": final_answer,
        "metadata": metadata_payload,
        "duration_ms": total_ms,
    }
