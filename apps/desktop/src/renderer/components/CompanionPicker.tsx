import React from 'react';
import { useDesktopI18n } from '../i18n.js';
import { companionDefaultNames, personalityAvatar, type CompanionPersonality } from '../personality-avatar.js';
import { shellText } from '../i18n/shell-text.js';
export type CompanionSelection = { personality: CompanionPersonality; botName: string };
export function CompanionPicker({ value, onChange, disabled = false }: { value: CompanionSelection; onChange: (value: CompanionSelection) => void; disabled?: boolean }) {
  const { locale } = useDesktopI18n();
  return <div>
    <div role="group" aria-label={shellText(locale, "Space-Persönlichkeit", "Space personality")} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(72px,1fr))', gap: 8 }}>
      {(Object.keys(companionDefaultNames) as CompanionPersonality[]).map(personality => <button key={personality} type="button" disabled={disabled} aria-pressed={value.personality === personality}
        onClick={() => onChange({ personality, botName: companionDefaultNames[personality] })} style={{ display: 'grid', justifyItems: 'center', padding: 8, border: value.personality === personality ? '2px solid var(--accent-primary)' : '2px solid transparent', borderRadius: 8, background: 'var(--bg-hover)', color: 'var(--text-primary)' }}>
        <img src={personalityAvatar(personality)} alt="" style={{ width: 52, height: 52, objectFit: 'contain' }} /><span>{companionDefaultNames[personality]}</span>
      </button>)}
    </div>
    <label style={{ display: 'grid', gap: 6, marginBlock: 12 }}>Name (optional)<input maxLength={80} value={value.botName} disabled={disabled} onChange={event => onChange({ ...value, botName: event.target.value })} /></label>
  </div>;
}
