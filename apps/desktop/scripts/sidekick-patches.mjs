/**
 * Local patches applied to the vendored Sidekick tree after every sync.
 *
 * `services/sidekick` is replaced wholesale by `sync-sidekick.mjs` from the
 * upstream repo, so any fix we make there would be lost on the next sync.
 * This module holds those fixes as idempotent string replacements that the
 * sync script re-applies afterwards.
 *
 * Rules for adding a patch:
 *  - Keep it small and targeted; prefer upstreaming the fix when possible.
 *  - Make `find` unique enough that it only matches the intended site.
 *  - The patch must be a no-op when already applied (the sync checks first).
 */

export const SIDEKICK_PATCHES = [
  {
    id: 'oauth-reuse-pending-google-flow',
    file: 'web/api/oauth.py',
    description:
      'Expire stale Google OAuth flows and reuse a live one instead of ' +
      'raising "A Google sign-in is already in progress" (which blocked the ' +
      'Gemini CLI connect button for 15 minutes after a closed tab).',
    find: `    if provider == "google-gemini-cli":
        sidekick_home = _get_active_profile_home()
        with _OAUTH_FLOWS_LOCK:
            if any(f.get("provider") == provider and f.get("status") == "pending"
                   and f.get("sidekick_home") == str(sidekick_home) for f in _OAUTH_FLOWS.values()):
                raise ValueError("A Google sign-in is already in progress for this profile")
            flow_id = uuid.uuid4().hex`,
    replace: `    if provider == "google-gemini-cli":
        sidekick_home = _get_active_profile_home()
        with _OAUTH_FLOWS_LOCK:
            # Expire stale flows first: a flow whose worker died (browser
            # closed, callback never arrived) would otherwise block every new
            # attempt for GOOGLE_FLOW_MAX_WAIT_SECONDS (15 min) with
            # "A Google sign-in is already in progress for this profile".
            _now = time.time()
            for _fid, _flow in list(_OAUTH_FLOWS.items()):
                if (
                    _flow.get("provider") == provider
                    and _flow.get("status") == "pending"
                    and float(_flow.get("expires_at") or 0) <= _now
                ):
                    _flow["status"] = "expired"
                    _drop_sensitive_flow_fields(_flow)

            # Reuse a live flow instead of rejecting the request. The user may
            # simply have closed the sign-in tab and clicked Connect again —
            # returning the same flow (and its auth_url) is idempotent and
            # avoids stranding them behind the "already in progress" error.
            existing_id = next(
                (
                    fid for fid, f in _OAUTH_FLOWS.items()
                    if f.get("provider") == provider
                    and f.get("status") == "pending"
                    and f.get("sidekick_home") == str(sidekick_home)
                ),
                None,
            )
            if existing_id:
                existing = _OAUTH_FLOWS[existing_id]
                _existing_url = existing.get("auth_url")
                _existing_expires = existing.get("expires_at")
            else:
                _existing_url = None
                _existing_expires = None

        if existing_id:
            # Give the worker a moment to publish the URL if it has not yet.
            auth_url = _existing_url if isinstance(_existing_url, str) else ""
            deadline = time.time() + 1.5
            while not auth_url and time.time() < deadline:
                with _OAUTH_FLOWS_LOCK:
                    auth_url = _OAUTH_FLOWS.get(existing_id, {}).get("auth_url") or ""
                if auth_url:
                    break
                time.sleep(0.02)
            return {"ok": True, "provider": provider, "flow_id": existing_id,
                    "status": "pending", "expires_at": _existing_expires,
                    "auth_url": auth_url,
                    "message": "A Google sign-in is already in progress; reusing it."}

        with _OAUTH_FLOWS_LOCK:
            flow_id = uuid.uuid4().hex`
  },
  {
    id: 'models-probe-timeout',
    file: 'web/api/config.py',
    description:
      'Cap the provider /models probe at 3s instead of 10s so an unreachable ' +
      'provider cannot stall the onboarding status call for 30 seconds.',
    find: `                req = urllib.request.Request(endpoint_url, method="GET")
                req.add_header("User-Agent", "OpenAI/Python 1.0")
                for k, v in headers.items():
                    req.add_header(k, v)
                with urllib.request.urlopen(req, timeout=10) as response:  # nosec B310`,
    replace: `                req = urllib.request.Request(endpoint_url, method="GET")
                req.add_header("User-Agent", "OpenAI/Python 1.0")
                for k, v in headers.items():
                    req.add_header(k, v)
                # Keep this short: the endpoint probe runs on the onboarding
                # status path, which the desktop shell calls on startup. A slow
                # or unreachable provider must not stall the whole first-run
                # flow — the hardcoded catalog below is the fallback.
                _probe_timeout = float(os.getenv("SIDEKICK_MODELS_PROBE_TIMEOUT", "3"))
                with urllib.request.urlopen(req, timeout=_probe_timeout) as response:  # nosec B310`
  },
  {
    id: 'google-oauth-state-per-server',
    file: 'runtime/google_oauth.py',
    description:
      'Bind the OAuth expected_state to the server instance instead of the ' +
      'handler class, so a second flow cannot clobber the first one and make ' +
      'a valid Google sign-in fail with "state_mismatch".',
    find: `        if state != type(self).expected_state:
            type(self).captured_error = "state_mismatch"
            self._respond_html(400, _ERROR_PAGE.format(message="State mismatch — aborting for safety."))`,
    replace: `        # Read the expected state from the server instance, not the class.
        # \`expected_state\` is a class attribute, so two concurrent flows (or a
        # retried flow) would overwrite each other and the second callback
        # would fail with "state_mismatch" even though the user signed in
        # correctly. The server carries the state for its own flow.
        expected = getattr(self.server, "expected_state", None)
        if expected is None:
            expected = type(self).expected_state
        if state != expected:
            type(self).captured_error = "state_mismatch"
            self._respond_html(400, _ERROR_PAGE.format(message="State mismatch — aborting for safety."))`
  },
  {
    id: 'google-oauth-state-bind-to-server',
    file: 'runtime/google_oauth.py',
    description:
      'Store the flow state on the callback server instance (companion to ' +
      'google-oauth-state-per-server).',
    find: `    _OAuthCallbackHandler.expected_state = state
    _OAuthCallbackHandler.captured_code = None`,
    replace: `    # Bind the expected state to THIS server instance. The handler class
    # attribute is shared across flows, so a second flow would clobber the
    # first one's state and its callback would fail with "state_mismatch".
    server.expected_state = state
    _OAuthCallbackHandler.expected_state = state
    _OAuthCallbackHandler.captured_code = None`
  },
  {
    id: 'fallback-model-accessors',
    file: 'web/api/config.py',
    description:
      'Add get/set_sidekick_fallback_model so the WebUI can configure the ' +
      'fallback used when the primary model is rate-limited (previously ' +
      'config.yaml-only).',
    find: `    invalidate_models_cache()
    return {"ok": True, "model": persisted_model}


# ── TTL cache for get_available_models() ─────────────────────────────────────`,
    replace: `    invalidate_models_cache()
    return {"ok": True, "model": persisted_model}


def get_sidekick_fallback_model() -> dict:
    """Read the configured fallback model (used when the primary hits a rate limit).

    The agent reads \`\`fallback_model\`\` from config.yaml when a turn fails with
    HTTP 429; without it a rate-limited provider just ends the turn. The WebUI
    had no way to set it, so users could not recover from a quota exhaustion
    without editing YAML by hand.
    """
    config_path = _get_config_path()
    try:
        config_data = _load_yaml_config_file(config_path)
    except Exception:
        config_data = {}
    entry = config_data.get("fallback_model")
    if isinstance(entry, list):
        entry = next((e for e in entry if isinstance(e, dict) and e.get("model")), None)
    if not isinstance(entry, dict):
        return {"ok": True, "fallback_model": None}
    return {
        "ok": True,
        "fallback_model": {
            "model": str(entry.get("model") or ""),
            "provider": str(entry.get("provider") or ""),
            "base_url": entry.get("base_url") or None,
        },
    }


def set_sidekick_fallback_model(
    model_id: str, provider: str = "", base_url: str | None = None
) -> dict:
    """Persist \`\`fallback_model\`\` in config.yaml, or clear it when model is empty.

    Mirrors the shape the agent expects (\`\`{model, provider, base_url}\`\`) so a
    rate-limited primary model can hand off to a working one instead of failing
    the turn outright.
    """
    config_path = _get_config_path()
    selected_model = str(model_id or "").strip()
    with _cfg_lock:
        config_data = _load_yaml_config_file(config_path)
        if not selected_model:
            config_data.pop("fallback_model", None)
            _save_yaml_config_file(config_path, config_data)
        else:
            resolved_model, resolved_provider, resolved_base_url = resolve_model_provider(
                selected_model
            )
            entry: dict = {
                "model": resolved_model or selected_model,
                "provider": str(provider or "").strip() or resolved_provider or "",
            }
            effective_base_url = base_url or resolved_base_url
            if effective_base_url:
                entry["base_url"] = effective_base_url
            config_data["fallback_model"] = entry
            _save_yaml_config_file(config_path, config_data)
    reload_config()
    return get_sidekick_fallback_model()


# ── TTL cache for get_available_models() ─────────────────────────────────────`
  },
  {
    id: 'fallback-model-route',
    file: 'web/api/routes.py',
    description:
      'Expose GET/POST /api/fallback-model (companion to fallback-model-accessors).',
    find: `    if parsed.path == "/api/default-model":
        try:
            return j(handler, set_sidekick_default_model(body.get("model")))
        except ValueError as e:
            return bad(handler, str(e))
        except RuntimeError as e:
            return bad(handler, str(e), 500)`,
    replace: `    if parsed.path == "/api/default-model":
        try:
            return j(handler, set_sidekick_default_model(body.get("model")))
        except ValueError as e:
            return bad(handler, str(e))
        except RuntimeError as e:
            return bad(handler, str(e), 500)

    if parsed.path == "/api/fallback-model":
        # GET returns the configured fallback; POST sets or clears it.
        try:
            if handler.command == "GET":
                return j(handler, get_sidekick_fallback_model())
            return j(
                handler,
                set_sidekick_fallback_model(
                    body.get("model", ""),
                    str(body.get("provider", "") or ""),
                    body.get("base_url") or None,
                ),
            )
        except ValueError as e:
            return bad(handler, str(e))
        except RuntimeError as e:
            return bad(handler, str(e), 500)`
  },
  {
    id: 'fallback-model-route-import',
    file: 'web/api/routes.py',
    description:
      'Import the fallback accessors in routes.py (companion to fallback-model-route).',
    find: `    set_sidekick_default_model,
    model_with_provider_context,`,
    replace: `    set_sidekick_default_model,
    get_sidekick_fallback_model,
    set_sidekick_fallback_model,
    model_with_provider_context,`
  }
];

/**
 * Apply every patch to a synced tree. Returns the list of patch ids that were
 * applied (already-applied patches are skipped).
 *
 * Line endings are normalized for matching: the upstream repo uses CRLF on
 * Windows checkouts while the patch anchors are written with LF, so a naive
 * `includes()` check silently misses every anchor.
 */
export function applySidekickPatches(targetDir, fs, path) {
  const applied = [];
  const skipped = [];
  const normalize = (text) => text.replace(/\r\n/g, '\n');
  for (const patch of SIDEKICK_PATCHES) {
    const file = path.join(targetDir, patch.file);
    let raw;
    try {
      raw = fs.readFileSync(file, 'utf8');
    } catch {
      skipped.push(`${patch.id} (file missing)`);
      continue;
    }
    const text = normalize(raw);
    if (text.includes(normalize(patch.replace))) {
      skipped.push(`${patch.id} (already applied)`);
      continue;
    }
    if (!text.includes(normalize(patch.find))) {
      skipped.push(`${patch.id} (anchor not found — upstream changed?)`);
      continue;
    }
    const patched = text.replace(normalize(patch.find), normalize(patch.replace));
    // Preserve the file's original line endings.
    const usesCrlf = raw.includes('\r\n');
    fs.writeFileSync(file, usesCrlf ? patched.replace(/\n/g, '\r\n') : patched, 'utf8');
    applied.push(patch.id);
  }
  return { applied, skipped };
}
