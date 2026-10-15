import React, { useEffect, useState } from 'react';
import { companionDefaultNames, personalityAvatar, type CompanionPersonality } from '../personality-avatar.js';
export type CompanionSelection = { personality: CompanionPersonality; botName: string };
const STANDARD_CHAT_COMPANION_KEY = 'lastbrowser.standardChatCompanion.v1';

export const STANDARD_CHAT_COMPANION_EVENT = 'lastbrowser:standard-chat-companion';

export function readStandardChatCompanion(): CompanionSelection & { stored: boolean } {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STANDARD_CHAT_COMPANION_KEY) || '');
    if (raw && typeof raw.personality === 'string' && Object.hasOwn(companionDefaultNames, raw.personality)) {
      const personality = raw.personality as CompanionPersonality;
      const botName = typeof raw.botName === 'string' && raw.botName.trim() ? raw.botName.trim() : companionDefaultNames[personality];
      return { personality, botName, stored: true };
    }
  } catch { /* default */ }
  return { personality: 'nova', botName: 'Nova', stored: false };
}

export function writeStandardChatCompanion(personality: CompanionPersonality, botName: string): void {
  const saved = { personality, botName: botName.trim() || companionDefaultNames[personality] };
  window.localStorage.setItem(STANDARD_CHAT_COMPANION_KEY, JSON.stringify(saved));
  window.dispatchEvent(new CustomEvent(STANDARD_CHAT_COMPANION_EVENT, { detail: saved }));
}

export function useStandardChatCompanion(): CompanionSelection & { stored: boolean; avatar: string } {
  const [value, setValue] = useState(readStandardChatCompanion);
  useEffect(() => {
    const sync = () => setValue(readStandardChatCompanion());
    window.addEventListener(STANDARD_CHAT_COMPANION_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(STANDARD_CHAT_COMPANION_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return { ...value, avatar: personalityAvatar(value.personality) };
}

export function CompanionPicker({ value, onChange, disabled = false }: { value: CompanionSelection; onChange: (value: CompanionSelection) => void; disabled?: boolean }) {
  return <div>
    <div role="group" aria-label="Space-Persönlichkeit" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(72px,1fr))', gap: 8 }}>
      {(Object.keys(companionDefaultNames) as CompanionPersonality[]).map(personality => <button key={personality} type="button" disabled={disabled} aria-pressed={value.personality === personality}
        onClick={() => onChange({ personality, botName: companionDefaultNames[personality] })} style={{ display: 'grid', justifyItems: 'center', padding: 8, border: value.personality === personality ? '2px solid var(--accent-primary)' : '2px solid transparent', borderRadius: 8, background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
        <img src={personalityAvatar(personality)} alt="" style={{ width: 52, height: 52, objectFit: 'contain' }} /><span>{companionDefaultNames[personality]}</span>
      </button>)}
    </div>
    <label style={{ display: 'grid', gap: 6, marginBlock: 12 }}>Name (optional)<input maxLength={80} value={value.botName} disabled={disabled} onChange={event => onChange({ ...value, botName: event.target.value })} /></label>
  </div>;
}
