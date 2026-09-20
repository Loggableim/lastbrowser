/**
 * Permission handling for the browser.
 *
 * Electron's default is to GRANT every permission request silently — camera,
 * microphone, geolocation, notifications, USB, serial. A browser that hands a
 * website your webcam without asking is not a browser anyone should use, so
 * this installs a deny-by-default handler with an explicit allow-list.
 *
 * Both handlers are required: Chromium performs a permission *check* first and
 * only issues a *request* when the check is denied. Implementing just one
 * leaves half the surface open.
 */

export type PermissionDecision = 'allow' | 'deny';

/**
 * Permissions a page may use without prompting.
 *
 * Deliberately narrow:
 *  - `fullscreen` and `pointerLock` are page-local (a video player, a game) and
 *    cannot exfiltrate anything on their own.
 *  - `clipboard-sanitized-write` only writes to the clipboard; reading is not
 *    granted because that is what leaks passwords.
 *  - `media` (camera/mic) is NOT here — a site must be explicitly trusted.
 */
const ALLOWED_PERMISSIONS = new Set([
  'fullscreen',
  'pointerLock',
  'clipboard-sanitized-write',
  'notifications'
]);

/**
 * Permissions that are always refused, even for trusted origins. These grant
 * raw device or filesystem access and have no business in a browsing session.
 */
const ALWAYS_DENIED = new Set([
  'usb',
  'serial',
  'hid',
  'midi',
  'midiSysex',
  'fileSystem',
  'openExternal',
  'idle-detection'
]);

export type PermissionController = {
  /** Decide a permission request. */
  decide(permission: string, origin: string): PermissionDecision;
  /** Origins the user explicitly trusted for camera/microphone. */
  trustedOrigins(): string[];
  /** Trust an origin for media access. */
  trustOrigin(origin: string): void;
  /** Revoke trust for an origin. */
  revokeOrigin(origin: string): void;
  /** Load previously trusted origins. */
  setTrustedOrigins(origins: string[]): void;
  /** Subscribe to trust-list changes (for persistence). */
  onTrustedChange(listener: (origins: string[]) => void): () => void;
};

export function createPermissionController(
  initialTrusted: string[] = []
): PermissionController {
  const trusted = new Set(initialTrusted.filter(Boolean));
  const listeners = new Set<(origins: string[]) => void>();

  const originOf = (raw: string): string => {
    try {
      return new URL(raw).origin;
    } catch {
      return '';
    }
  };

  const emit = (): void => {
    const list = Array.from(trusted);
    for (const listener of listeners) {
      try {
        listener(list);
      } catch {
        // A broken listener must not stop the others.
      }
    }
  };

  return {
    decide(permission: string, origin: string): PermissionDecision {
      const name = String(permission || '');
      if (ALWAYS_DENIED.has(name)) return 'deny';
      if (ALLOWED_PERMISSIONS.has(name)) return 'allow';
      // Camera/microphone only for origins the user trusted explicitly.
      if (name === 'media') {
        const normalized = originOf(origin);
        return normalized && trusted.has(normalized) ? 'allow' : 'deny';
      }
      // Everything else (geolocation, storage-access, unknown names) is denied.
      return 'deny';
    },

    trustedOrigins(): string[] {
      return Array.from(trusted);
    },

    trustOrigin(origin: string): void {
      const normalized = originOf(origin);
      if (normalized) {
        trusted.add(normalized);
        emit();
      }
    },

    revokeOrigin(origin: string): void {
      const normalized = originOf(origin);
      if (normalized && trusted.delete(normalized)) emit();
    },

    setTrustedOrigins(origins: string[]): void {
      trusted.clear();
      for (const origin of origins) {
        const normalized = originOf(origin);
        if (normalized) trusted.add(normalized);
      }
      emit();
    },

    onTrustedChange(listener: (origins: string[]) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

/**
 * Trusted origins are stored next to the app's other settings so a video-call
 * site the user allowed once does not have to be allowed again after a restart.
 */
export const trustedOriginsFileName = 'trusted-origins.json';

export function loadTrustedOrigins(filePath: string, fs: {
  existsSync: (p: string) => boolean;
  readFileSync: (p: string, enc: 'utf8') => string;
}): string[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  } catch {
    // A corrupt file must not block startup — start with an empty trust list.
    return [];
  }
}

export function saveTrustedOrigins(filePath: string, origins: string[], fs: {
  writeFileSync: (p: string, data: string, enc: 'utf8') => void;
}): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(origins, null, 2), 'utf8');
  } catch {
    // Persistence is best-effort; the in-memory list still applies.
  }
}
