import { createContext, createElement, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { IndependentAssistantClient, isIndependentRecord, isIndependentScope } from './independent-assistant-client.js';
import { sameAssistantScope, type IndependentScope } from './independent-contracts.js';
import type { NativeChatBinding } from './native-chat-control.js';

export const personalityAvatars = {
  nova: new URL('./startup/assets/sidekick-01.png', import.meta.url).href,
  analytical: new URL('./startup/assets/sidekick-04.png', import.meta.url).href,
  developer: new URL('./startup/assets/sidekick-03.png', import.meta.url).href,
  creative: new URL('./startup/assets/sidekick-02.png', import.meta.url).href,
  mentor: new URL('./startup/assets/sidekick-06.png', import.meta.url).href
} as const;
export type CompanionPersonality = keyof typeof personalityAvatars;
export const companionDefaultNames: Record<CompanionPersonality, string> = { nova: 'Nova', analytical: 'Orion', developer: 'Patch', creative: 'Spark', mentor: 'Zen' };
export function personalityAvatar(personality: unknown): string {
  return typeof personality === 'string' && Object.hasOwn(personalityAvatars, personality)
    ? personalityAvatars[personality as CompanionPersonality] : personalityAvatars.nova;
}
const STANDARD_CHAT_COMPANION_KEY = 'lastbrowser.standardChatCompanion.v1';
export const STANDARD_CHAT_COMPANION_EVENT = 'lastbrowser:standard-chat-companion';
type CompanionRecord = { key: string; personality: CompanionPersonality; botName: string; scope: IndependentScope; revision: number };
// Mirrors the Space companion into the sidebar's standard-chat selection and
// notifies same-window listeners (the sidebar icon listens for this event).
function writeStandardChatCompanion(personality: CompanionPersonality, botName: string) {
  const saved = { personality, botName };
  window.localStorage.setItem(STANDARD_CHAT_COMPANION_KEY, JSON.stringify(saved));
  window.dispatchEvent(new CustomEvent(STANDARD_CHAT_COMPANION_EVENT, { detail: saved }));
}
function surfaceCompanionError(message: string) {
  const showToast = (window as unknown as { showToast?: (message: string) => void }).showToast;
  if (typeof showToast === 'function') showToast(message);
}
type Appearance = { personality: CompanionPersonality; botName: string; loaded: boolean; busy: boolean; error: string; retry: () => void; setSelection: (personality: CompanionPersonality, botName: string) => Promise<boolean> };
const defaultAppearance: Appearance = { personality: 'nova', botName: 'Nova', loaded: false, busy: false, error: '', retry: () => {}, setSelection: async () => false };
export const CompanionAppearanceContext = createContext<Appearance>(defaultAppearance);
export function CompanionAppearanceProvider({ children, browserProfileId, workspacePath, backendProfileName }: PropsWithChildren<{ browserProfileId: string; workspacePath: string; backendProfileName: string | null }>) {
  const [client] = useState(() => new IndependentAssistantClient(window.lastbrowser.independent));
  const key = JSON.stringify([browserProfileId, workspacePath, backendProfileName]);
  const keyRef = useRef(key); keyRef.current = key;
  const [appearance, setAppearance] = useState<CompanionRecord | null>(null);
  const committedRef = useRef<CompanionRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const retry = () => setRefreshNonce(value => value + 1);
  const generation = useRef(0);
  const refreshGeneration = useRef(0);
  const selectionGeneration = useRef(0);
  const activeSelection = useRef(0);
  useEffect(() => {
    let alive = true;
    let sequence = 0;
    generation.current++;
    committedRef.current = null;
    setAppearance(null); setBusy(false); setError('');
    if (!browserProfileId) { setError('Browserprofil ist noch nicht verfügbar.'); return; }
    const refresh = async () => {
      const request = ++sequence;
      const refreshRevision = ++refreshGeneration.current;
      try {
        const resolved = await companionRequestDeadline(client.request({ schemaVersion: 1, operation: 'resolveScope', ...(backendProfileName ? { backendProfileName } : {}), payload: { browserProfileId, workspacePath: workspacePath || null } }));
        if (!resolved.ok) throw new Error(resolved.error.message);
        const result = await companionRequestDeadline(client.request({ schemaVersion: 1, operation: 'companion', scope: resolved.value.scope, payload: { action: 'get' } }));
        if (!result.ok) throw new Error(result.error.message);
        if (!alive || request !== sequence || refreshRevision !== refreshGeneration.current || activeSelection.current !== 0) return;
        if (!sameAssistantScope(result.value.scope, resolved.value.scope)) throw new Error('Companion scope changed');
        const next = { key, ...result.value };
        committedRef.current = next;
        setAppearance(next); setError('');
      } catch (reason) { if (alive && request === sequence && refreshRevision === refreshGeneration.current && activeSelection.current === 0) { committedRef.current = null; setAppearance(null); setError(reason instanceof Error ? reason.message : String(reason)); } }
    };
    void refresh();
    window.addEventListener('lastbrowser:settings-changed', refresh);
    window.addEventListener('lastbrowser:companion-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => { alive = false; sequence++; window.removeEventListener('lastbrowser:settings-changed', refresh); window.removeEventListener('lastbrowser:companion-changed', refresh); window.removeEventListener('focus', refresh); };
  }, [key, client, refreshNonce]);
  const setSelection = async (personality: CompanionPersonality, botName: string) => {
    const committed = committedRef.current;
    const trimmed = botName.trim();
    if (!committed || committed.key !== keyRef.current || !trimmed) return false;
    const lifecycle = generation.current;
    const requestKey = committed.key;
    const selectionId = ++selectionGeneration.current;
    activeSelection.current = selectionId;
    refreshGeneration.current++;
    setError('');
    setAppearance({ ...committed, personality, botName: trimmed });
    // Sidebar icon, dock and standard-chat header read the standard selection,
    // so the header choice must reach them at once (reverted in the catch below).
    writeStandardChatCompanion(personality, trimmed);
    try {
      const result = await companionRequestDeadline(client.request({ schemaVersion: 1, operation: 'companion', scope: committed.scope, payload: { action: 'set', personality, botName: trimmed, expectedRevision: committed.revision, clientRequestId: crypto.randomUUID() } }));
      if (lifecycle !== generation.current || keyRef.current !== requestKey || selectionId !== selectionGeneration.current) return false;
      if (!result.ok) throw new Error(result.error.message);
      if (!sameAssistantScope(result.value.scope, committed.scope)) throw new Error('Companion scope changed');
      const next = { key: requestKey, ...result.value };
      committedRef.current = next;
      setAppearance(next);
      return true;
    } catch (reason) {
      if (lifecycle === generation.current && keyRef.current === requestKey && selectionId === selectionGeneration.current) {
        committedRef.current = committed;
        setAppearance(committed);
        writeStandardChatCompanion(committed.personality, committed.botName);
        const message = reason instanceof Error ? reason.message : String(reason);
        setError(message);
        surfaceCompanionError(message);
      }
      return false;
    } finally {
      if (activeSelection.current === selectionId) activeSelection.current = 0;
    }
  };
  const value: Appearance = appearance?.key === key ? { personality: appearance.personality, botName: appearance.botName, loaded: true, busy, error, retry, setSelection }
    : { ...defaultAppearance, error, busy, retry, setSelection };
  return createElement(CompanionAppearanceContext.Provider, { value }, children);
}
export function useCompanionAppearance() {
  const appearance = useContext(CompanionAppearanceContext);
  return { ...appearance, avatar: personalityAvatar(appearance.personality) };
}
async function companionRequestDeadline<T>(request: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([request, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Persönlichkeit konnte nicht rechtzeitig geladen oder gespeichert werden. Bitte erneut laden.')), 15000);
  })]); } finally { if (timer) clearTimeout(timer); }
}
export function messageCompanionAppearance(value: unknown, fallback: { personality: unknown; botName: string; avatar: string }) {
  const data = normalizeCompanionSnapshot(value);
  return data ? { ...data, avatar: personalityAvatar(data.personality) } : fallback;
}
export type CompanionSnapshot = { personality: CompanionPersonality; botName: string };
export function normalizeCompanionSnapshot(value: unknown): CompanionSnapshot | null {
  if (!isIndependentRecord(value) || typeof value.personality !== 'string' || !Object.hasOwn(personalityAvatars, value.personality)
    || typeof value.botName !== 'string' || !value.botName.trim() || value.botName.length > 80 || /[\u0000-\u001f\u007f]/.test(value.botName)) return null;
  return { personality: value.personality as CompanionPersonality, botName: value.botName.trim() };
}
export function readCompanionSnapshotEvent(value: unknown, binding: NativeChatBinding | undefined): CompanionSnapshot | null {
  if (!binding || !isIndependentRecord(value) || value.event !== 'companion' || value.streamId !== binding.streamId) return null;
  const context = value.nativeContext;
  if (!isIndependentRecord(context) || context.schemaVersion !== 1 || context.sessionId !== binding.sessionId || context.streamId !== binding.streamId
    || typeof context.writerGeneration !== 'string' || !context.writerGeneration || !isIndependentScope(context.scope) || !sameAssistantScope(context.scope, binding.scope)) return null;
  if (value.sessionId !== undefined && value.sessionId !== binding.sessionId) return null;
  return normalizeCompanionSnapshot(value.data);
}
export function attachCompanionSnapshot<T extends { role?: string; pending?: boolean; streaming?: boolean; chatStreamId?: string; chatStreamSessionId?: string }>(messages: T[], companion: CompanionSnapshot, streamId?: string, sessionId?: string): T[] {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === 'assistant' && (streamId ? message.chatStreamId === streamId && message.chatStreamSessionId === sessionId : message.pending || message.streaming)) {
      return messages.map((item, itemIndex) => itemIndex === index ? { ...item, companion } : item);
    }
  }
  return messages;
}
