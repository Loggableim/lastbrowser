import React, { useId } from 'react';
import { companionDefaultNames, personalityAvatar, DEFAULT_CUSTOM_QUICKCHAT_PROMPT, CUSTOM_PROMPT_LIMIT, isCustomCompanionPromptValid, type CompanionPersonality } from '../personality-avatar.js';
import './companion-picker.css';
export type CompanionSelection = { personality: CompanionPersonality; botName: string; customPrompt?: string };
export function CustomCompanionPrompt({ value, onChange, disabled = false }: { value?: string; onChange: (value: string) => void; disabled?: boolean }) {
  const id = useId();
  return <div className="companion-custom-editor">
    <label htmlFor={id}>Eigener Quickchat-Prompt</label>
    <p id={`${id}-help`}>Gilt nur für diesen Space. Beschreibe Sprache, Ton und Antwortstil. Quickchat antwortet ohne Tools oder Aktionen; normale Chats übernehmen nur den Stil und behalten ihre Sicherheits- und Berechtigungsregeln.</p>
    <textarea id={id} aria-describedby={`${id}-help`} aria-invalid={!isCustomCompanionPromptValid(value)} value={value ?? DEFAULT_CUSTOM_QUICKCHAT_PROMPT} maxLength={CUSTOM_PROMPT_LIMIT} rows={7} disabled={disabled} onChange={event => onChange(event.target.value)} />
    {!isCustomCompanionPromptValid(value) && <p role="alert">Bitte einen Prompt mit bis zu 4.000 Zeichen ohne Steuerzeichen eingeben.</p>}
    <div className="companion-custom-editor-footer"><span>{(value ?? DEFAULT_CUSTOM_QUICKCHAT_PROMPT).length} / {CUSTOM_PROMPT_LIMIT}</span><button type="button" disabled={disabled} onClick={() => onChange(DEFAULT_CUSTOM_QUICKCHAT_PROMPT)}>Nova-Vorlage verwenden</button></div>
  </div>;
}
export function CompanionPicker({ value, onChange, disabled = false }: { value: CompanionSelection; onChange: (value: CompanionSelection) => void; disabled?: boolean }) {
  return <div className="companion-picker">
    <div className="companion-picker-options" role="group" aria-label="Space-Persönlichkeit">
      {(Object.keys(companionDefaultNames) as CompanionPersonality[]).map(personality => <button className="companion-picker-option" key={personality} type="button" disabled={disabled} aria-pressed={value.personality === personality}
        onClick={() => onChange({ personality, botName: personality === value.personality ? value.botName : companionDefaultNames[personality], customPrompt: value.customPrompt ?? DEFAULT_CUSTOM_QUICKCHAT_PROMPT })}>
        <img src={personalityAvatar(personality)} alt="" /><span>{companionDefaultNames[personality]}</span>
      </button>)}
    </div>
    <label className="companion-name-field">Name (optional)<input maxLength={80} value={value.botName} disabled={disabled} onChange={event => onChange({ ...value, botName: event.target.value })} /></label>
    {value.personality === 'custom' && <CustomCompanionPrompt value={value.customPrompt} disabled={disabled} onChange={customPrompt => onChange({ ...value, customPrompt })} />}
  </div>;
}
