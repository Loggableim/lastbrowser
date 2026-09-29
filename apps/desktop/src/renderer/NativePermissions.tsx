/**
 * Per-site permission UI.
 *
 * The permission policy is deny-by-default, which is only usable if the user can
 * grant an exception: a video-call site must be able to get the camera. This
 * panel lists the origins the user trusted and lets them revoke one, and the
 * toolbar shows a one-click "allow camera & microphone" action for the current
 * page.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Camera, Loader2, ShieldCheck, Trash2, X } from 'lucide-react';

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

export function PermissionsPanel({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}): JSX.Element | null {
  const [origins, setOrigins] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await window.lastbrowser.permissions.trustedOrigins();
      setOrigins(Array.isArray(list) ? (list as string[]) : []);
    } catch {
      setError('Could not load trusted sites. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  if (!open) return null;

  return (
    <div className="permissions-panel" role="dialog" aria-label="Site permissions" aria-busy={loading}>
      <header>
        <ShieldCheck size={15} />
        <strong>Site permissions</strong>
        <span className="permissions-count">{origins.length}</span>
        <button type="button" aria-label="Close site permissions" onClick={onClose}>
          <X size={14} />
        </button>
      </header>
      <div className="permissions-list">
        {loading && (
          <p className="permissions-empty"><Loader2 size={13} className="spin" /> Loading trusted sites…</p>
        )}
        {!loading && error && origins.length === 0 && (
          <p className="permissions-empty" role="alert">{error}</p>
        )}
        {!loading && !error && origins.length === 0 && (
          <p className="permissions-empty">
            No sites are trusted yet. Camera and microphone are blocked everywhere by default.
          </p>
        )}
        {origins.map((origin) => (
          <div key={origin} className="permission-row">
            <Camera size={13} />
            <span className="permission-origin" title={origin}>{origin}</span>
            <button
              type="button"
              aria-label={`Revoke camera and microphone access for ${origin}`}
              title="Revoke access"
              disabled={revoking === origin}
              onClick={async () => {
                setRevoking(origin);
                setError(null);
                try {
                  const next = await window.lastbrowser.permissions.revoke(origin);
                  setOrigins(Array.isArray(next) ? (next as string[]) : []);
                } catch {
                  setError(`Could not revoke access for ${origin}. Try again.`);
                } finally {
                  setRevoking(null);
                }
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
      {error && !loading && origins.length > 0 && <p className="permissions-error" role="alert">{error}</p>}
      <p className="permissions-hint">
        Trusted sites may use the camera and microphone. Everything else — location, USB,
        serial devices — stays blocked.
      </p>
    </div>
  );
}

/**
 * One-click trust for the page currently open in the browser.
 * Hidden when the page is already trusted or is not a real http(s) origin.
 */
export function SitePermissionButton({
  url
}: {
  url: string;
}): JSX.Element | null {
  const origin = originOf(url);
  const [trusted, setTrusted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!origin) {
      setTrusted(false);
      return;
    }
    void window.lastbrowser.permissions
      .trustedOrigins()
      .then((list) => {
        if (alive) setTrusted(Array.isArray(list) && (list as string[]).includes(origin));
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [origin]);

  if (!origin || trusted) return null;

  return (
    <button
      type="button"
      className="site-permission-trigger"
      title={`Allow camera and microphone for ${origin}`}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void window.lastbrowser.permissions
          .trust(origin)
          .then(() => setTrusted(true))
          .catch(() => null)
          .finally(() => setBusy(false));
      }}
    >
      <Camera size={14} />
    </button>
  );
}
