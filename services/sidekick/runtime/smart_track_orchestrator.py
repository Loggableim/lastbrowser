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
    if any(k in mid for k in ("flash-lite", "lite", "nano", "mini", "haiku", "3b", "7b", "8b")):
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
    if any(k in mid for k in ("lite", "nano", "mini", "3b", "7b", "8b", "haiku")):
        return "low", tags

    # Medium Tier
    return "medium", tags


def build_model_wall() -> Dict[str, Any]:
    """Scan connected models and build the 3-tier Model Wall with capability index."""
    from web.api.config import get_available_models
    catalog = get_available_models()
    seen = set()

    tiers: Dict[str, List[Dict[str, Any]]] = {
        "low": [],
        "medium": [],
        "high": [],
    }

    for group in catalog.get("groups", []):
        provider_id = group.get("provider_id") or group.get("provider") or "unknown"
        provider_label = group.get("provider") or provider_id
        for m in group.get("models", []):
            raw_id = str(m.get("id") or "").strip()
            if not raw_id:
                continue
            clean_id = raw_id.split(":", 1)[1] if ":" in raw_id and not raw_id.startswith("ollama:") else raw_id
            if clean_id.lower() in ("teamwork", "smart-track", "smart-track-low", "smart-track-medium", "smart-track-high") or clean_id in seen:
                continue
            seen.add(clean_id)

            tier, tags = classify_smart_model(clean_id, provider_id)
            model_info = {
                "id": clean_id,
                "name": m.get("name") or clean_id,
                "provider": provider_id,
                "provider_label": provider_label,
                "tier": tier,
                "tags": tags,
                "context_window": m.get("context_window", 128000),
            }
            tiers[tier].append(model_info)

    # Baseline Gemini fallback if no models discovered
    if not any(tiers.values()):
        tiers["medium"].append({
            "id": "gemini-2.5-flash",
            "name": "Gemini 2.5 Flash",
            "provider": "google-gemini-cli",
            "provider_label": "Google Gemini",
            "tier": "medium",
            "tags": ["web", "fast"],
            "context_window": 1048576,
        })
        tiers["low"].append({
            "id": "gemini-2.5-flash-lite",
            "name": "Gemini 2.5 Flash Lite",
            "provider": "google-gemini-cli",
            "provider_label": "Google Gemini",
            "tier": "low",
            "tags": ["fast"],
            "context_window": 1048576,
        })
        tiers["high"].append({
            "id": "gemini-2.5-pro",
            "name": "Gemini 2.5 Pro",
            "provider": "google-gemini-cli",
            "provider_label": "Google Gemini",
            "tier": "high",
            "tags": ["reasoning"],
            "context_window": 1048576,
        })

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
        default_model = model_list[0]["id"] if model_list else "gemini-2.5-flash"
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
    from runtime.auxiliary_client import call_llm, extract_content_or_reasoning

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
            preplan_resp = call_llm(
                model=preplan_model,
                messages=[
                    {"role": "system", "content": preplan_sys},
                    {"role": "user", "content": prompt},
                ],
                timeout=25.0,
            )
            preplan_content = extract_content_or_reasoning(preplan_resp)
            if not preplan_content:
                preplan_content = str(preplan_resp.choices[0].message.content or "").strip()
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
    try:
        main_resp = call_llm(
            provider=routed["provider"],
            model=routed["model"],
            messages=main_messages,
            timeout=120.0,
        )
        final_answer = extract_content_or_reasoning(main_resp)
        if not final_answer:
            final_answer = str(main_resp.choices[0].message.content or "").strip()
    except Exception as e:
        logger.error("Smart track main call to %s failed: %s", routed["model"], e)
        wall = build_model_wall()
        fb_model = wall.get("medium", {}).get("default", "gemini-2.5-flash")
        fb_resp = call_llm(
            model=fb_model,
            messages=main_messages,
            timeout=60.0,
        )
        final_answer = extract_content_or_reasoning(fb_resp)
        if not final_answer:
            final_answer = str(fb_resp.choices[0].message.content or "").strip()
        routed["model"] = fb_model
        routed["name"] = f"{fb_model} (Fallback)"

    main_ms = int((time.time() - main_t0) * 1000)
    total_ms = int((time.time() - start_total_t) * 1000)

    # Stream out the text
    put_event("delta", {"content": final_answer})

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
