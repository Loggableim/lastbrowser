"""Router policy stub for M1. Real classifier arrives in M3."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from app.config import get_settings

Tier = Literal["leicht", "mittel", "schwer"]
QueueName = Literal["high", "standard", "low"]

CODE_RE = re.compile(r"```|def\s+\w+\(|class\s+\w+|import\s+\w+|#!/usr/bin")


@dataclass(frozen=True)
class Features:
    char_len: int
    code_share: float
    has_tools_hint: bool


@dataclass(frozen=True)
class RouteDecision:
    tier: Tier
    queue: QueueName
    confidence: float
    model: str
    reason: str


def extract_features(prompt: str) -> Features:
    text = prompt or ""
    n = max(len(text), 1)
    code_chars = sum(len(m.group(0)) for m in CODE_RE.finditer(text))
    code_share = min(code_chars / n, 1.0)
    has_tools = bool(re.search(r"\b(tool|function call|browser|mcp)\b", text, re.I))
    return Features(char_len=len(text), code_share=code_share, has_tools_hint=has_tools)


def classify_stub(features: Features) -> tuple[Tier, float]:
    """Heuristic placeholder until ONNX classifier (M3). Defaults toward mittel."""
    settings = get_settings()
    threshold = settings.confidence_threshold

    if features.char_len < 80 and features.code_share < 0.05 and not features.has_tools_hint:
        return "leicht", 0.75
    if features.has_tools_hint or features.code_share > 0.25 or features.char_len > 4000:
        return "schwer", 0.7
    # uncertain → mittel (Ami: under threshold → mittel)
    conf = 0.55 if features.char_len < 200 else 0.65
    if conf < threshold:
        return "mittel", conf
    return "mittel", conf


def decide(prompt: str, opt_in: bool) -> RouteDecision:
    """
    Opt-in → high queue for mittel/schwer.
    Without opt-in: never escalate to schwer (Ami); only leicht/mittel, queue low/standard.
    """
    settings = get_settings()
    features = extract_features(prompt)
    tier, confidence = classify_stub(features)

    if not opt_in and tier == "schwer":
        tier = "mittel"
        reason = "no-opt-in: capped from schwer to mittel"
    else:
        reason = "stub-classifier"

    if opt_in:
        queue: QueueName = "high"
    elif tier == "leicht":
        queue = "low"
    else:
        queue = "standard"

    model = settings.model_for(tier)
    return RouteDecision(
        tier=tier, queue=queue, confidence=confidence, model=model, reason=reason
    )
