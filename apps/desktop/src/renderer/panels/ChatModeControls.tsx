import React from 'react';
import { captureCommandContext, type CommandAction, type CommandContext } from '../CommandActionContracts.js';
import { chatBudgetLabels, chatCommandCopy } from '../chat-command-copy.js';
import './chat-command-controls.css';

/** This is a backend-confirmed mode, never an optimistic prompt decoration. */
export interface ConfirmedChatMode {
  sessionId: string;
  mode: 'action' | 'plan' | 'grill_me' | 'boost';
  lifetime: 'chat' | 'next_turn';
  revision: number;
  maxParallel?: number;
  maxTokens?: number;
}
export function ChatModeControls({ value, context, locale, pending, onAction }: {
  value: ConfirmedChatMode | null; context: CommandContext; locale: string;
  pending: boolean; onAction: (action: CommandAction) => void;
}): React.JSX.Element | null {
  if (!value || value.sessionId !== context.sessionId || value.mode === 'action') return null;
  const copy = chatCommandCopy(locale);
  const labels = chatBudgetLabels(locale);
  return <div className="persistent-goal-controls" role="status">
    <strong>/{value.mode === 'grill_me' ? 'grill-me' : value.mode}</strong>
    <p>{copy.commands[value.mode]} · {copy[value.lifetime]}</p>
    {value.maxParallel !== undefined && <p>{labels[0]}: {value.maxParallel}</p>}
    {value.maxTokens !== undefined && <p>{labels[1]}: {value.maxTokens}</p>}
    <button type="button" disabled={pending} onClick={() => onAction({ kind: 'set_mode', mode: 'action',
      lifetime: value.lifetime, expectedRevision: value.revision, context: captureCommandContext(context) })}>{copy.clear}</button>
  </div>;
}
