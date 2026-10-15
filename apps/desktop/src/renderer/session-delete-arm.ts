import type { SessionDeleteOutcome } from './session-list-scope.js';

/**
 * Two-step chat deletion for the sidebar: a five-second arm, then a confirm click.
 * A refused deletion pins the arm, so its message stays visible until the user
 * confirms again, cancels explicitly, or the deletion succeeds.
 */
export const SESSION_DELETE_ARM_MS = 5000;

export type SessionDeleteArm = { sessionId: string; scope: string; expiresAt: number; pinned: boolean };

export type SessionDeleteStep = { confirm: boolean; arm: SessionDeleteArm };

/** The first click arms the row; a click on the armed row inside the window confirms. */
export function nextSessionDeleteStep(arm: SessionDeleteArm | null, sessionId: string, scope: string, now: number): SessionDeleteStep {
  if (arm && arm.sessionId === sessionId && arm.scope === scope && (arm.pinned || now < arm.expiresAt)) {
    return { confirm: true, arm };
  }
  return { confirm: false, arm: { sessionId, scope, expiresAt: now + SESSION_DELETE_ARM_MS, pinned: false } };
}

/** Success clears the arm. A refusal pins it; a silent scope change clears it. */
export function settleSessionDeleteArm(arm: SessionDeleteArm | null, sessionId: string, outcome: SessionDeleteOutcome): SessionDeleteArm | null {
  if (!arm || arm.sessionId !== sessionId) return arm;
  if (outcome.deleted || !outcome.message) return null;
  return { ...arm, pinned: true };
}

/** Only an unpinned arm times out; a pinned arm waits for success or an explicit cancel. */
export function isSessionDeleteArmExpired(arm: SessionDeleteArm, now: number): boolean {
  return !arm.pinned && now >= arm.expiresAt;
}

/** A row keeps its message only from a refused attempt; success or an empty outcome clears it. */
export function settleSessionDeleteErrors(errors: Record<string, string>, sessionId: string, outcome: SessionDeleteOutcome): Record<string, string> {
  const next = { ...errors };
  delete next[sessionId];
  if (!outcome.deleted && outcome.message) next[sessionId] = outcome.message;
  return next;
}

/** Messages belong to rows that are still listed; anything else is dropped. */
export function pruneSessionDeleteErrors(errors: Record<string, string>, listedIds: ReadonlySet<string>): Record<string, string> {
  const ids = Object.keys(errors);
  if (ids.every((id) => listedIds.has(id))) return errors;
  return Object.fromEntries(ids.filter((id) => listedIds.has(id)).map((id) => [id, errors[id]]));
}
