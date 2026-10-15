import React, { useEffect, useRef, useState } from 'react';
import { companionDefaultNames, personalityAvatar, useCompanionAppearance, type CompanionPersonality } from '../personality-avatar.js';
import { useDesktopI18n } from '../i18n.js';
import type { DesktopTranslationKey } from '../i18n/keys.js';
import './companion-personality.css';

export type CompanionSelection = { personality: CompanionPersonality; botName: string };
const STANDARD_CHAT_COMPANION_KEY = 'lastbrowser.standardChatCompanion.v1';

const COMPANION_DESCRIPTION_KEYS: Record<CompanionPersonality, DesktopTranslationKey> = {
  nova: 'sidebar.companion.nova',
  analytical: 'sidebar.companion.analytical',
  developer: 'sidebar.companion.developer',
  creative: 'sidebar.companion.creative',
  mentor: 'sidebar.companion.mentor'
};

export function readStandardChatCompanion(): CompanionSelection {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STANDARD_CHAT_COMPANION_KEY) || '');
    if (raw && typeof raw.personality === 'string' && Object.hasOwn(companionDefaultNames, raw.personality)) {
      const personality = raw.personality as CompanionPersonality;
      const botName = typeof raw.botName === 'string' && raw.botName.trim() ? raw.botName.trim() : companionDefaultNames[personality];
      return { personality, botName };
    }
  } catch { /* default */ }
  return { personality: 'nova', botName: 'Nova' };
}

export function CompanionPicker({ value, onChange, disabled = false }: { value: CompanionSelection; onChange: (value: CompanionSelection) => void; disabled?: boolean }) {
  const { t } = useDesktopI18n();
  return <div className="companion-personality-picker">
    <div className="companion-personality-options" role="group" aria-label={t('copilot.personalityDialog')}>
      {(Object.keys(companionDefaultNames) as CompanionPersonality[]).map(personality => {
        const selected = value.personality === personality;
        return <button key={personality} type="button" className="companion-personality-option" disabled={disabled} aria-pressed={selected}
          onClick={() => onChange({ personality, botName: companionDefaultNames[personality] })}>
          <img src={personalityAvatar(personality)} alt="" />
          <span>{companionDefaultNames[personality]}</span>
        </button>;
      })}
    </div>
    <p className="companion-personality-blurb" role="status">{t(COMPANION_DESCRIPTION_KEYS[value.personality])}</p>
    <label className="companion-name-field">
      <span>{t('copilot.personalityNameLabel')}</span>
      <input className="companion-name-input" maxLength={80} value={value.botName} disabled={disabled} aria-label={t('copilot.personalityTitle')} onChange={event => onChange({ ...value, botName: event.target.value })} />
    </label>
  </div>;
}

export function CompanionSwitch({ compact = false }: { compact?: boolean }) {
  const companion = useCompanionAppearance();
  const { t } = useDesktopI18n();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CompanionSelection>({ personality: 'nova', botName: 'Nova' });
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  const saved = readStandardChatCompanion();
  const personality = companion.loaded ? companion.personality : saved.personality;
  const botName = companion.loaded ? companion.botName : saved.botName;
  return <div ref={rootRef} style={{ position: 'relative' }}>
    <button type="button" ref={triggerRef} className={compact ? 'sidebar-companion-switch' : 'copilot-header-brand'} aria-label={t('copilot.personalitySwitch')} aria-haspopup="dialog" aria-expanded={open}
      style={{ background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 }}
      onClick={event => { event.stopPropagation(); setDraft({ personality, botName }); setOpen(current => !current); }}>
      <img src={personalityAvatar(personality)} alt="" style={compact ? { width: 22, height: 22, objectFit: 'contain' } : undefined} className={compact ? undefined : 'copilot-header-avatar'} draggable={false} />
      <span className={compact ? undefined : 'copilot-header-title'}>{botName}{compact ? '' : ' AI'}</span>
    </button>
    {open && <section className="companion-personality-popover" role="dialog" aria-label={t('copilot.personalityDialog')} onClick={event => event.stopPropagation()}>
      <strong className="companion-personality-popover-title">{t('copilot.personalityTitle')}</strong>
      <CompanionPicker value={draft} onChange={setDraft} disabled={!companion.loaded || companion.busy} />
      {companion.error && <p role="alert">{companion.error}</p>}
      {companion.error && <button type="button" onClick={companion.retry}>{t('common.retry')}</button>}
      {!companion.loaded && !companion.error && <p role="status">{t('copilot.loading')}</p>}
      <div className="companion-personality-actions native-card-actions">
        <button type="button" className="companion-personality-save" disabled={!companion.loaded} onClick={() => {
          const botNameToSave = draft.botName.trim() || companionDefaultNames[draft.personality];
          window.localStorage.setItem(STANDARD_CHAT_COMPANION_KEY, JSON.stringify({ personality: draft.personality, botName: botNameToSave }));
          setOpen(false);
          triggerRef.current?.focus();
          void companion.setSelection(draft.personality, botNameToSave);
        }}>{t('common.save')}</button>
        <button type="button" className="companion-personality-cancel" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>{t('common.cancel')}</button>
      </div>
    </section>}
  </div>;
}
