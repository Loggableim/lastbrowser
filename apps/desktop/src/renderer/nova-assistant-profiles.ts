import type { IndependentScope } from './independent-contracts.js';
import type { DesktopLocaleId } from './i18n/keys.js';
import { bundledNovaAssistants } from './nova-assistant-templates.js';

export type NovaAssistantProfile = { id: string; name: string; instructions: string };
type AssistantStorage = Pick<Storage, 'getItem' | 'setItem'>;
type AssistantSpace = Pick<IndependentScope, 'browserProfileId' | 'spaceId' | 'backendProfileId'>;

export const novaAssistantNameLimit = 80;
export const novaAssistantInstructionsLimit = 8000;

export class InvalidNovaAssistantProfileError extends Error {}

const profileKey = (browserProfileId: string) => `lastbrowser.novaAssistants.v1:${JSON.stringify(browserProfileId)}`;
const spaceKeyPrefix = (browserProfileId: string) => `lastbrowser.novaAssistantSelection.v1:${JSON.stringify(browserProfileId)}:`;
const spaceKey = ({ browserProfileId, spaceId, backendProfileId }: AssistantSpace) =>
  spaceKeyPrefix(browserProfileId) + JSON.stringify([spaceId, backendProfileId]);

function isNovaAssistant(value: unknown): value is NovaAssistantProfile {
  if (typeof value !== 'object' || value === null) return false;
  const { id, name, instructions } = value as Partial<NovaAssistantProfile>;
  return typeof id === 'string' && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/.test(id) &&
    typeof name === 'string' && name.trim().length > 0 && name.length <= novaAssistantNameLimit && !/[\x00-\x1f\x7f]/.test(name) &&
    typeof instructions === 'string' && instructions.length <= novaAssistantInstructionsLimit;
}

export function readNovaAssistantProfiles(storage: AssistantStorage, browserProfileId: string): NovaAssistantProfile[] {
  const raw = storage.getItem(profileKey(browserProfileId));
  if (raw === null) return [];
  let entries: unknown;
  try { entries = JSON.parse(raw); } catch { return []; }
  return Array.isArray(entries) ? entries.filter(isNovaAssistant) : [];
}

export function findNovaAssistant(
  storage: AssistantStorage, browserProfileId: string, assistantId: string, locale: DesktopLocaleId = 'en',
): NovaAssistantProfile | undefined {
  return bundledNovaAssistants(locale).find((profile) => profile.id === assistantId) ??
    readNovaAssistantProfiles(storage, browserProfileId).find((profile) => profile.id === assistantId);
}

export function saveNovaAssistantProfile(storage: AssistantStorage, browserProfileId: string, assistant: NovaAssistantProfile): NovaAssistantProfile[] {
  const record = { id: assistant.id, name: assistant.name.trim(), instructions: assistant.instructions.trim() };
  // Match Sidekick's text validation on save, while keeping older drafts editable.
  if (!isNovaAssistant(record) || /[\ud800-\udfff]/u.test(record.name) ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\ud800-\udfff]/u.test(record.instructions) ||
      bundledNovaAssistants('en').some((profile) => profile.id === record.id)) {
    throw new InvalidNovaAssistantProfileError('Invalid assistant profile');
  }
  const current = readNovaAssistantProfiles(storage, browserProfileId);
  const existing = current.findIndex((entry) => entry.id === record.id);
  if (existing === -1) current.push(record);
  else current[existing] = record;
  storage.setItem(profileKey(browserProfileId), JSON.stringify(current));
  return current;
}

export function deleteNovaAssistantProfile(storage: AssistantStorage, browserProfileId: string, id: string): NovaAssistantProfile[] {
  const next = readNovaAssistantProfiles(storage, browserProfileId).filter((record) => record.id !== id);
  storage.setItem(profileKey(browserProfileId), JSON.stringify(next));
  return next;
}

export function clearNovaAssistantsForProfile(storage: Pick<Storage, 'removeItem' | 'length' | 'key'>, browserProfileId: string): void {
  storage.removeItem(profileKey(browserProfileId));
  const prefix = spaceKeyPrefix(browserProfileId);
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) storage.removeItem(key);
  }
}

export function selectNovaAssistantForSpace(storage: AssistantStorage, scope: AssistantSpace, assistantId: string | null): void {
  if (assistantId && !findNovaAssistant(storage, scope.browserProfileId, assistantId)) {
    throw new Error('Assistant profile is no longer available');
  }
  storage.setItem(spaceKey(scope), assistantId ?? '');
}

export function readNovaAssistantForSpace(storage: AssistantStorage, scope: AssistantSpace, locale: DesktopLocaleId = 'en'): NovaAssistantProfile | undefined {
  const id = storage.getItem(spaceKey(scope));
  if (!id) return undefined;
  return findNovaAssistant(storage, scope.browserProfileId, id, locale);
}

export function decideNovaAssistantSwitch(
  currentSessionId: string | null, currentAssistantId: string | null | undefined, nextId: string | null, confirm: () => boolean,
): 'create' | 'reuse' | 'cancelled' {
  if (currentSessionId === null) return 'create';
  if (currentAssistantId === nextId) return 'reuse';
  return confirm() ? 'create' : 'cancelled';
}
