import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type AccessAuthStartupPolicy = 'disabled' | 'enabled' | 'unknown';

export type AccessAuthPreflightContext = Readonly<{
  requestId: number;
  /** Opaque Main-owned identifier for the Sidekick runtime/profile scope. */
  scopeId: string;
}>;

export type AccessAuthStartupPreflight = AccessAuthPreflightContext & Readonly<{
  policy: AccessAuthStartupPolicy;
}>;

export type ReadAccessAuthStartupPolicyOptions = Readonly<{
  /** The settings directory derived from the active SidecarServices layout. */
  runtimeStateDirectory: string;
  /** The state directory passed to the Sidekick process in its environment. */
  sidecarStateDirectory: string;
  /** Main may pass presence only; the password value must not leave Main. */
  passwordEnvironmentConfigured: boolean;
  /** Injectable for deterministic unreadable-file coverage. */
  readSettings?: (filePath: string) => Promise<string>;
}>;

/**
 * Resolve only whether the currently configured Sidekick access password exists.
 * A positive result is not an authenticated session and can never unlock access;
 * callers must keep enabled and unknown states behind the existing auth check.
 */
export async function readAccessAuthStartupPolicy(
  options: ReadAccessAuthStartupPolicyOptions
): Promise<AccessAuthStartupPolicy> {
  if (!sameAbsolutePath(options.runtimeStateDirectory, options.sidecarStateDirectory)) return 'unknown';
  if (options.passwordEnvironmentConfigured) return 'enabled';

  let rawSettings: string;
  try {
    rawSettings = await (options.readSettings ?? ((filePath) => readFile(filePath, 'utf8')))(
      path.join(options.runtimeStateDirectory, 'settings.json')
    );
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return 'disabled';
    return 'unknown';
  }

  let settings: unknown;
  try {
    settings = JSON.parse(rawSettings) as unknown;
  } catch {
    return 'unknown';
  }

  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return 'unknown';
  const passwordHash = (settings as Record<string, unknown>).password_hash;
  if (typeof passwordHash === 'string') return passwordHash.length > 0 ? 'enabled' : 'disabled';
  if (passwordHash === undefined || passwordHash === null || passwordHash === false || passwordHash === 0) {
    return 'disabled';
  }
  return 'unknown';
}

/** Reject late preflight replies after either a newer request or runtime scope. */
export function isAccessAuthPreflightCurrent(
  result: AccessAuthPreflightContext,
  current: AccessAuthPreflightContext
): boolean {
  return typeof result === 'object'
    && result !== null
    && typeof current === 'object'
    && current !== null
    && Number.isSafeInteger(result.requestId)
    && Number.isSafeInteger(current.requestId)
    && result.requestId === current.requestId
    && typeof result.scopeId === 'string'
    && result.scopeId.length > 0
    && typeof current.scopeId === 'string'
    && current.scopeId.length > 0
    && result.scopeId === current.scopeId;
}

function sameAbsolutePath(left: string, right: string): boolean {
  if (!path.isAbsolute(left) || !path.isAbsolute(right)) return false;
  const normalizedLeft = path.normalize(path.resolve(left));
  const normalizedRight = path.normalize(path.resolve(right));
  return process.platform === 'win32'
    ? normalizedLeft.toLocaleLowerCase('en-US') === normalizedRight.toLocaleLowerCase('en-US')
    : normalizedLeft === normalizedRight;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);
}
