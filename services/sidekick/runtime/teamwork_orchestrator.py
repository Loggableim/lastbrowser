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

import json
import logging
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger("sidekick.teamwork")

DEFAULT_TEAMWORK_CONFIG: Dict[str, Any] = {
    "enabled": True,
    "strategy": "balanced",  # "cost" | "balanced" | "quality"
    "auto_scale": True,
    "max_subagents": 4,      # 1 to 8
    "shared_grounding": True,
    "allow_autonomous_tools": True,
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
            return dict(_CACHED_CONFIG)
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
        max_sub = config.get("max_subagents", 4)
        try:
            config["max_subagents"] = max(1, min(8, int(max_sub)))
        except (ValueError, TypeError):
            config["max_subagents"] = 4
        if config.get("strategy") not in ("cost", "balanced", "quality"):
            config["strategy"] = "balanced"
        _CACHED_CONFIG = dict(config)
        return config


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
        if "allow_autonomous_tools" in data:
            current["allow_autonomous_tools"] = bool(data["allow_autonomous_tools"])
        if isinstance(data.get("roles"), dict):
            current["roles"].update(data["roles"])
        if isinstance(data.get("hot_swap"), dict):
            current["hot_swap"].update(data["hot_swap"])

        cfg_path = _get_teamwork_config_path()
        cfg_path.parent.mkdir(parents=True, exist_ok=True)
        tmp_path = cfg_path.with_suffix(f".tmp.{os.getpid()}.{threading.current_thread().ident}")
        tmp_path.write_text(json.dumps(current, indent=2, ensure_ascii=False), encoding="utf-8")
        os.replace(str(tmp_path), str(cfg_path))
        _CACHED_CONFIG = dict(current)
        return current


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
    fast_tokens = ("lite", "nano", "mini", "3b", "7b", "8b", "haiku")
    if any(k in mid for k in fast_tokens):
        return "fast"
    # Balanced
    return "balanced"


def get_teamwork_model_pool() -> List[Dict[str, Any]]:
    """Return all currently available and ready models categorized by provider and tier."""
    from web.api.config import get_available_models
    catalog = get_available_models()
    models: List[Dict[str, Any]] = []
    seen_ids = set()

    for group in catalog.get("groups", []):
        provider_id = group.get("provider_id") or group.get("provider") or "unknown"
        provider_label = group.get("provider") or provider_id
        for m in group.get("models", []):
            raw_id = str(m.get("id") or "").strip()
            if not raw_id:
                continue
            clean_id = raw_id.split(":", 1)[1] if ":" in raw_id and not raw_id.startswith("ollama:") else raw_id
            if clean_id.lower() == "teamwork" or clean_id in seen_ids:
                continue
            seen_ids.add(clean_id)
            name = m.get("name") or clean_id
            tier = classify_model_tier(clean_id, provider_id)
            models.append({
                "id": clean_id,
                "name": name,
                "provider": provider_id,
                "provider_label": provider_label,
                "tier": tier,
                "context_window": m.get("context_window", 128000),
            })

    # Ensure baseline Gemini models exist if no external provider connected
    if not models:
        models.append({
            "id": "gemini-2.5-flash",
            "name": "Gemini 2.5 Flash",
            "provider": "google-gemini-cli",
            "provider_label": "Google Gemini",
            "tier": "balanced",
            "context_window": 1048576,
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


def resolve_team_plan(prompt: str, config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Resolve the specific models and roles for a teamwork session."""
    cfg = config or load_teamwork_config()
    pool = get_teamwork_model_pool()
    max_sub = cfg.get("max_subagents", 4)
    auto_scale = cfg.get("auto_scale", True)
    strategy = cfg.get("strategy", "balanced")
    roles_cfg = cfg.get("roles", {})

    complexity = evaluate_task_complexity(prompt)
    if auto_scale:
        if complexity <= 2:
            target_workers = 2
        elif complexity <= 4:
            target_workers = min(3, max_sub)
        else:
            target_workers = min(4, max_sub)
    else:
        target_workers = max_sub

    target_workers = max(1, min(target_workers, len(pool) if pool else 1))

    # Split pool into tiers
    fast_models = [m for m in pool if m["tier"] == "fast"]
    balanced_models = [m for m in pool if m["tier"] == "balanced"]
    quality_models = [m for m in pool if m["tier"] == "quality"]

    # Role resolution: Worker Pool
    selected_workers: List[Dict[str, Any]] = []
    manual_workers = roles_cfg.get("worker_pool")
    if isinstance(manual_workers, list) and len(manual_workers) > 0 and manual_workers[0] != "auto":
        for mid in manual_workers:
            match = next((m for m in pool if m["id"] == mid), None)
            if match:
                selected_workers.append(match)
        if selected_workers:
            target_workers = min(len(selected_workers), max_sub)
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
            # Balanced: mix of fast and quality/balanced
            candidates.sort(key=lambda m: (0 if m["tier"] == "balanced" else 1 if m["tier"] == "quality" else 2))

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

    # Critic & Synthesizer models
    manual_critic = roles_cfg.get("critic")
    critic_model = manual_critic if manual_critic and manual_critic != "auto" else None
    if not critic_model:
        # Pick highest reasoning model available
        critic_cand = next((m["id"] for m in quality_models), None) or next((m["id"] for m in balanced_models), None) or (pool[0]["id"] if pool else "gemini-2.5-flash")
        critic_model = critic_cand

    manual_synth = roles_cfg.get("synthesizer")
    synth_model = manual_synth if manual_synth and manual_synth != "auto" else None
    if not synth_model:
        synth_model = critic_model

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
            "provider": w["provider"],
            "name": w["name"],
            "role": persp["role"],
            "focus": persp["focus"],
        })

    return {
        "strategy": strategy,
        "complexity": complexity,
        "workers": workers_with_perspectives,
        "critic": critic_model,
        "synthesizer": synth_model,
        "pool": pool,
    }


def _invoke_worker(
    worker: Dict[str, Any],
    prompt: str,
    grounding: str,
    backup_pool: List[Dict[str, Any]],
    timeout: float = 45.0
) -> Dict[str, Any]:
    """Call a single debate worker with hot-swap retry."""
    from runtime.auxiliary_client import call_llm, extract_content_or_reasoning

    current_worker = dict(worker)
    tried_models = {current_worker["model"]}
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
                model=current_worker["model"],
                messages=messages,
                timeout=timeout,
            )
            content = extract_content_or_reasoning(resp)
            if not content:
                content = str(resp.choices[0].message.content or "").strip()
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
                "swapped": current_worker["model"] != worker["model"],
            }
        except Exception as e:
            logger.warning("Worker %s failed: %s", current_worker["model"], e)
            # Try hot-swap from backup pool
            swap_candidate = next((m for m in backup_pool if m["id"] not in tried_models), None)
            if swap_candidate:
                logger.info("Hot-swapping worker %s -> %s", current_worker["model"], swap_candidate["id"])
                tried_models.add(swap_candidate["id"])
                current_worker["model"] = swap_candidate["id"]
                current_worker["provider"] = swap_candidate["provider"]
                current_worker["name"] = swap_candidate.get("name", swap_candidate["id"])
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
                "error": str(e),
                "swapped": False,
            }


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
    from runtime.auxiliary_client import call_llm, extract_content_or_reasoning

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

    grounding_text = grounding_context.strip()
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
    synth_model = plan["synthesizer"]
    pool = plan["pool"]

    put_event("teamwork_stage", {
        "stage": "debate",
        "active_models": [w["name"] for w in workers],
        "message": f"{len(workers)} Modelle debattieren parallel...",
        "workers": workers,
    })

    # 3. Phase: Parallele Debatte (ThreadPoolExecutor)
    drafts: List[Dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=len(workers)) as executor:
        futures = {
            executor.submit(_invoke_worker, w, prompt, grounding_text, pool): w
            for w in workers
        }
        for future in as_completed(futures):
            if cancel_event and cancel_event.is_set():
                executor.shutdown(wait=False, cancel_futures=True)
                raise InterruptedError("Cancelled")
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
                    put_event("teamwork_draft", {
                        "model": res["model"],
                        "name": res["name"],
                        "role": res["role"],
                        "error": res["error"],
                        "skipped": True,
                    })
            except Exception as e:
                logger.error("Worker future raised error: %s", e)

    # Quorum check
    successful_drafts = [d for d in drafts if not d.get("error") and d.get("content")]
    min_quorum = cfg.get("hot_swap", {}).get("fallback_quorum_min", 1)
    if len(successful_drafts) < min_quorum:
        raise RuntimeError(
            f"Teamwork-Fehler: Es konnte kein Lösungsentwurf generiert werden "
            f"({len(drafts)} Modelle fehlgeschlagen)."
        )

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
    if grounding_text:
        critic_prompt += f"GEMEINSAMER KONTEXT:\n{grounding_text}\n\n"

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
        critic_resp = call_llm(
            model=critic_model,
            messages=[{"role": "user", "content": critic_prompt}],
            timeout=50.0,
        )
        critic_review = extract_content_or_reasoning(critic_resp)
        if not critic_review:
            critic_review = str(critic_resp.choices[0].message.content or "").strip()
    except Exception as e:
        logger.warning("Critic evaluation failed: %s, continuing with best draft directly", e)
        critic_review = f"Kritik konnte nicht separat generiert werden ({e}). Synthese basiert auf den Roh-Entwürfen."

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
    if grounding_text:
        synthesis_prompt += f"GEMEINSAMER KONTEXT:\n{grounding_text}\n\n"

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
    try:
        synth_resp = call_llm(
            model=synth_model,
            messages=[{"role": "user", "content": synthesis_prompt}],
            timeout=65.0,
        )
        final_answer = extract_content_or_reasoning(synth_resp)
        if not final_answer:
            final_answer = str(synth_resp.choices[0].message.content or "").strip()
    except Exception as e:
        logger.error("Synthesis failed: %s, falling back to best individual draft", e)
        final_answer = successful_drafts[0]["content"]

    synth_ms = int((time.time() - synth_t0) * 1000)
    total_duration_ms = int((time.time() - start_total_t) * 1000)

    # Stream the final answer tokens/blocks into client stream
    put_event("delta", {"content": final_answer})

    metadata_payload = {
        "strategy": cfg.get("strategy", "balanced"),
        "models_used": [d["model"] for d in drafts] + [critic_model, synth_model],
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
