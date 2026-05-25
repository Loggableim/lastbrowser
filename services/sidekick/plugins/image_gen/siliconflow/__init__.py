"""SiliconFlow image generation backend.

Exposes SiliconFlow's OpenAI-compatible ``/v1/images/generations`` endpoint
as an :class:`ImageGenProvider` implementation.

Supports all models available on SiliconFlow, defaulting to the cheapest:
``black-forest-labs/FLUX.1-schnell`` (≈¥0/image).

Selection precedence (first hit wins):
1. ``SILICONFLOW_IMAGE_MODEL`` env var
2. ``image_gen.siliconflow.model`` in ``config.yaml``
3. ``image_gen.model`` in ``config.yaml``
4. :data:`DEFAULT_MODEL`
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional, Tuple

import requests

from agent.image_gen_provider import (
    DEFAULT_ASPECT_RATIO,
    ImageGenProvider,
    error_response,
    resolve_aspect_ratio,
    save_b64_image,
    success_response,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model catalog
# ---------------------------------------------------------------------------

_MODELS: Dict[str, Dict[str, Any]] = {
    "black-forest-labs/FLUX.1-schnell": {
        "display": "FLUX.1-schnell",
        "speed": "~2-4s",
        "strengths": "Cheapest, fast, 4-step",
        "price": "¥0/image",
    },
    "black-forest-labs/FLUX.1-dev": {
        "display": "FLUX.1-dev",
        "speed": "~5-10s",
        "strengths": "Higher quality than schnell",
        "price": "¥0.14/image",
    },
    "black-forest-labs/FLUX-1.1-pro": {
        "display": "FLUX-1.1-pro",
        "speed": "~5-10s",
        "strengths": "Pro quality",
        "price": "¥0.28/image",
    },
    "black-forest-labs/FLUX-1.1-pro-Ultra": {
        "display": "FLUX-1.1-pro-Ultra",
        "speed": "~10-20s",
        "strengths": "Highest FLUX quality, 4K upscale",
        "price": "¥0.56/image",
    },
    "black-forest-labs/FLUX.2-flex": {
        "display": "FLUX.2-flex",
        "speed": "~5-10s",
        "strengths": "FLUX 2, flexible quality",
        "price": "varies",
    },
    "black-forest-labs/FLUX.2-pro": {
        "display": "FLUX.2-pro",
        "speed": "~5-10s",
        "strengths": "FLUX 2, best quality",
        "price": "varies",
    },
    "Qwen/Qwen-Image": {
        "display": "Qwen-Image",
        "speed": "~5-10s",
        "strengths": "Qwen, good text rendering",
        "price": "¥0.3/1M tokens",
    },
    "Tongyi-MAI/Z-Image-Turbo": {
        "display": "Z-Image-Turbo",
        "speed": "~2-4s",
        "strengths": "Fast, cheap, bilingual",
        "price": "¥0.1/1M tokens",
    },
    "Tongyi-MAI/Z-Image": {
        "display": "Z-Image",
        "speed": "~5-8s",
        "strengths": "High quality, bilingual",
        "price": "¥0.3/1M tokens",
    },
    "Kwai-Kolors/Kolors": {
        "display": "Kolors",
        "speed": "~5-10s",
        "strengths": "Free, good quality",
        "price": "¥0/image",
    },
    "baidu/ERNIE-Image-Turbo": {
        "display": "ERNIE-Image-Turbo",
        "speed": "~3-6s",
        "strengths": "Fast, cheap",
        "price": "¥0.11/1M tokens",
    },
}

DEFAULT_MODEL = "black-forest-labs/FLUX.1-schnell"

_SIZES = {
    "landscape": "1024x576",
    "square": "1024x1024",
    "portrait": "576x1024",
}

DEFAULT_BASE_URL = "https://api.siliconflow.com/v1"


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------


def _load_cfg() -> Dict[str, Any]:
    """Read ``image_gen.siliconflow`` from config.yaml."""
    try:
        from hermes_cli.config import load_config

        cfg = load_config()
        section = cfg.get("image_gen") if isinstance(cfg, dict) else None
        sf = section.get("siliconflow") if isinstance(section, dict) else None
        return sf if isinstance(sf, dict) else {}
    except Exception as exc:
        logger.debug("Could not load image_gen.siliconflow config: %s", exc)
        return {}


def _resolve_api_key() -> str:
    """Return the SiliconFlow API key, or ''."""
    env_key = os.environ.get("SILICONFLOW_API_KEY", "").strip()
    if env_key:
        return env_key
    cfg = _load_cfg()
    return cfg.get("api_key", "").strip()


def _resolve_base_url() -> str:
    """Return the configured base URL."""
    env_url = os.environ.get("SILICONFLOW_BASE_URL", "").strip()
    if env_url:
        return env_url.rstrip("/")
    cfg = _load_cfg()
    return (cfg.get("base_url") or DEFAULT_BASE_URL).rstrip("/")


def _resolve_model() -> Tuple[str, Dict[str, Any]]:
    """Decide which model to use and return ``(model_id, meta)``."""
    env_override = os.environ.get("SILICONFLOW_IMAGE_MODEL")
    if env_override and env_override in _MODELS:
        return env_override, _MODELS[env_override]

    cfg = _load_cfg()
    candidate: Optional[str] = None
    if isinstance(cfg, dict):
        value = cfg.get("model")
        if isinstance(value, str) and value in _MODELS:
            candidate = value
    if candidate is None:
        top = cfg.get("model") if isinstance(cfg, dict) else None
        if isinstance(top, str) and top in _MODELS:
            candidate = top

    if candidate is not None:
        return candidate, _MODELS[candidate]

    return DEFAULT_MODEL, _MODELS[DEFAULT_MODEL]


def _resolve_size(aspect: str) -> str:
    return _SIZES.get(aspect, _SIZES["square"])


# ---------------------------------------------------------------------------
# Provider
# ---------------------------------------------------------------------------


class SiliconFlowImageGenProvider(ImageGenProvider):
    """SiliconFlow ``/v1/images/generations`` backend — OpenAI-compatible."""

    @property
    def name(self) -> str:
        return "siliconflow"

    @property
    def display_name(self) -> str:
        return "SiliconFlow"

    def is_available(self) -> bool:
        return bool(_resolve_api_key())

    def list_models(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": model_id,
                "display": meta.get("display", model_id),
                "speed": meta.get("speed", ""),
                "strengths": meta.get("strengths", ""),
                "price": meta.get("price", ""),
            }
            for model_id, meta in _MODELS.items()
        ]

    def default_model(self) -> Optional[str]:
        return DEFAULT_MODEL

    def get_setup_schema(self) -> Dict[str, Any]:
        return {
            "name": "SiliconFlow",
            "badge": "paid",
            "tag": "FLUX, Qwen-Image, and more via siliconflow.com — OpenAI-compatible",
            "env_vars": [
                {
                    "key": "SILICONFLOW_API_KEY",
                    "prompt": "SiliconFlow API key",
                    "url": "https://cloud.siliconflow.com/",
                },
            ],
        }

    def generate(
        self,
        prompt: str,
        aspect_ratio: str = DEFAULT_ASPECT_RATIO,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        prompt = (prompt or "").strip()
        aspect = resolve_aspect_ratio(aspect_ratio)

        if not prompt:
            return error_response(
                error="Prompt is required",
                error_type="invalid_argument",
                provider="siliconflow",
                aspect_ratio=aspect,
            )

        api_key = _resolve_api_key()
        if not api_key:
            return error_response(
                error="SILICONFLOW_API_KEY not set. Get one at https://cloud.siliconflow.com/",
                error_type="missing_api_key",
                provider="siliconflow",
                aspect_ratio=aspect,
            )

        model_id, meta = _resolve_model()
        base_url = _resolve_base_url()
        size = _resolve_size(aspect)

        payload: Dict[str, Any] = {
            "model": model_id,
            "prompt": prompt,
            "image_size": size,
            "batch_size": 1,
            "num_inference_steps": 4,
            "guidance_scale": 0,
        }

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

        try:
            response = requests.post(
                f"{base_url}/images/generations",
                headers=headers,
                json=payload,
                timeout=120,
            )
            response.raise_for_status()
        except requests.HTTPError as exc:
            resp = exc.response
            status = resp.status_code if resp is not None else 0
            try:
                err_msg = (
                    resp.json().get("error", {}).get("message", resp.text[:300])
                    if resp is not None
                    else str(exc)
                )
            except Exception:
                err_msg = resp.text[:300] if resp is not None else str(exc)
            logger.error("SiliconFlow image gen failed (%d): %s", status, err_msg)
            return error_response(
                error=f"SiliconFlow image generation failed ({status}): {err_msg}",
                error_type="api_error",
                provider="siliconflow",
                model=model_id,
                prompt=prompt,
                aspect_ratio=aspect,
            )
        except requests.Timeout:
            return error_response(
                error="SiliconFlow image generation timed out (120s)",
                error_type="timeout",
                provider="siliconflow",
                model=model_id,
                prompt=prompt,
                aspect_ratio=aspect,
            )
        except requests.ConnectionError as exc:
            return error_response(
                error=f"SiliconFlow connection error: {exc}",
                error_type="connection_error",
                provider="siliconflow",
                model=model_id,
                prompt=prompt,
                aspect_ratio=aspect,
            )

        try:
            result = response.json()
        except Exception as exc:
            return error_response(
                error=f"SiliconFlow returned invalid JSON: {exc}",
                error_type="invalid_response",
                provider="siliconflow",
                model=model_id,
                prompt=prompt,
                aspect_ratio=aspect,
            )

        # Parse response — SiliconFlow returns { "images": [{ "url": "..." }] }
        images = result.get("images", [])
        if not images:
            return error_response(
                error="SiliconFlow returned no image data",
                error_type="empty_response",
                provider="siliconflow",
                model=model_id,
                prompt=prompt,
                aspect_ratio=aspect,
            )

        url = images[0].get("url", "")
        if not url:
            return error_response(
                error="SiliconFlow response contained no URL",
                error_type="empty_response",
                provider="siliconflow",
                model=model_id,
                prompt=prompt,
                aspect_ratio=aspect,
            )

        extra: Dict[str, Any] = {
            "size": size,
        }

        return success_response(
            image=url,
            model=model_id,
            prompt=prompt,
            aspect_ratio=aspect,
            provider="siliconflow",
            extra=extra,
        )


# ---------------------------------------------------------------------------
# Plugin registration
# ---------------------------------------------------------------------------


def register(ctx) -> None:
    """Register this provider with the image gen registry."""
    ctx.register_image_gen_provider(SiliconFlowImageGenProvider())
