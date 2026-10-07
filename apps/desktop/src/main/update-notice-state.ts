export type PendingUpdateMarker = {
  fromVersion: string;
  targetVersion: string;
};

export type UpdateNoticeState = {
  schemaVersion: 1;
  lastSuccessfulVersion: string | null;
  seenVersion: string | null;
  pendingUpdate: PendingUpdateMarker | null;
};

export type UpdateNoticeCandidate = {
  fromVersion: string | null;
  toVersion: string;
};

export type UpdateNoticeDecision = {
  state: UpdateNoticeState;
  candidate: UpdateNoticeCandidate | null;
};

export function emptyUpdateNoticeState(): UpdateNoticeState {
  return { schemaVersion: 1, lastSuccessfulVersion: null, seenVersion: null, pendingUpdate: null };
}

export function parseUpdateNoticeState(value: unknown): UpdateNoticeState {
  if (!isRecord(value) || value.schemaVersion !== 1) return emptyUpdateNoticeState();
  const pending = isRecord(value.pendingUpdate)
    && isVersion(value.pendingUpdate.fromVersion)
    && isVersion(value.pendingUpdate.targetVersion)
    ? { fromVersion: value.pendingUpdate.fromVersion, targetVersion: value.pendingUpdate.targetVersion }
    : null;
  return {
    schemaVersion: 1,
    lastSuccessfulVersion: isVersion(value.lastSuccessfulVersion) ? value.lastSuccessfulVersion : null,
    seenVersion: isVersion(value.seenVersion) ? value.seenVersion : null,
    pendingUpdate: pending
  };
}

export function recordDownloadedUpdate(
  current: UpdateNoticeState,
  fromVersion: string,
  targetVersion: string
): UpdateNoticeState {
  if (!isVersion(fromVersion) || !isVersion(targetVersion) || compareVersions(targetVersion, fromVersion) <= 0) return current;
  return { ...current, pendingUpdate: { fromVersion, targetVersion } };
}

/**
 * A fresh install has no prior version marker and no updater receipt, so it
 * establishes a baseline without showing an upgrade dialog. An updater receipt
 * also detects an upgrade for existing installs that predate this feature.
 * Once this code has run, the successful renderer startup marker catches
 * manual installer upgrades as well.
 */
export function decideUpdateNotice(
  stored: UpdateNoticeState,
  currentVersion: string,
  installerConfirmsUpgrade = false
): UpdateNoticeDecision {
  const state = parseUpdateNoticeState(stored);
  if (!isVersion(currentVersion)) return { state, candidate: null };

  if (state.seenVersion === currentVersion) {
    return {
      state: {
        ...state,
        lastSuccessfulVersion: currentVersion,
        pendingUpdate: state.pendingUpdate?.targetVersion === currentVersion ? null : state.pendingUpdate
      },
      candidate: null
    };
  }

  const updaterConfirmsUpgrade = state.pendingUpdate?.targetVersion === currentVersion
    && compareVersions(currentVersion, state.pendingUpdate.fromVersion) > 0;
  const priorLaunchConfirmsUpgrade = isVersion(state.lastSuccessfulVersion)
    && compareVersions(currentVersion, state.lastSuccessfulVersion) > 0;

  if (updaterConfirmsUpgrade) {
    return {
      state,
      candidate: { fromVersion: state.pendingUpdate!.fromVersion, toVersion: currentVersion }
    };
  }
  if (installerConfirmsUpgrade
    && (!isVersion(state.lastSuccessfulVersion) || compareVersions(currentVersion, state.lastSuccessfulVersion) > 0)) {
    return {
      state,
      candidate: {
        fromVersion: isVersion(state.lastSuccessfulVersion) ? state.lastSuccessfulVersion : null,
        toVersion: currentVersion
      }
    };
  }
  if (priorLaunchConfirmsUpgrade) {
    return {
      state,
      candidate: { fromVersion: state.lastSuccessfulVersion!, toVersion: currentVersion }
    };
  }

  // First successful renderer request is the baseline for a fresh install.
  // Also rebase after a downgrade/restore instead of announcing a false update.
  return {
    state: {
      ...state,
      lastSuccessfulVersion: currentVersion,
      pendingUpdate: state.pendingUpdate && compareVersions(state.pendingUpdate.targetVersion, currentVersion) <= 0
        ? null
        : state.pendingUpdate
    },
    candidate: null
  };
}

export function acknowledgeUpdateNotice(
  state: UpdateNoticeState,
  currentVersion: string,
  shownVersion: string,
  installerConfirmsUpgrade = false
): UpdateNoticeState | null {
  if (!isVersion(currentVersion) || shownVersion !== currentVersion) return null;
  const decision = decideUpdateNotice(state, currentVersion, installerConfirmsUpgrade);
  if (!decision.candidate || decision.candidate.toVersion !== shownVersion) return null;
  return {
    ...decision.state,
    lastSuccessfulVersion: currentVersion,
    seenVersion: currentVersion,
    pendingUpdate: decision.state.pendingUpdate?.targetVersion === currentVersion ? null : decision.state.pendingUpdate
  };
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a.parts[index] !== b.parts[index]) return a.parts[index] - b.parts[index];
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true });
}

function isVersion(value: unknown): value is string {
  return typeof value === 'string' && parseVersion(value) !== null;
}

function parseVersion(value: string): { parts: [number, number, number]; prerelease: string } | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value.trim());
  if (!match) return null;
  return { parts: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: match[4] || '' };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
