/**
 * Chat UI components for Lastbrowser.
 *
 * Extracted from App.tsx to reduce the monolith. Contains three focused
 * components:
 *
 *   • ChatTranscript    - scrollable message list with empty/loading states
 *   • ChatMessageBody   - single message content renderer (text/HTML/research/JSON)
 *   • ChatComposer      - input form with mode toggle, model picker, slash commands
 *
 * All components are pure in the sense that they receive their state as props
 * and communicate back via callbacks — no Zustand or context dependencies.
 */

import React, {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import {
  Columns3,
  Cpu,
  Layers,
  ListFilter,
  Loader2,
  Plus,
  Send,
  Sparkles,
  StopCircle,
  UserCircle
} from 'lucide-react';
import { brandAssets } from '../brand.js';
import { describeChatContent } from '../chat-display.js';
import { RichTextRenderer } from '../NativeRichText.js';
import { AdvancedWebUiTools } from './AdvancedWebUiTools.js';
import type { DesktopChatMessage, DesktopSessionDetail, ChatRunState } from '../shell-state.js';
import { shouldShowNativeTurnUsage, type NativeChatTurnUsage } from '../chat-usage.js';
import { useDesktopI18n } from '../i18n.js';
import { qualifyModelForProvider } from '../provider-model-selection.js';
import { ReasoningEffortPicker } from '../components/ReasoningEffortPicker.js';
import { toBionicSegments } from '../utils/bionic-reading.js';
import { usePanelStore } from '../stores/usePanelStore.js';
import type { DesktopLocaleId } from '../i18n/keys.js';
import type { RunState } from '../independent-contracts.js';
import type { CommandAction, CommandCapabilities, CommandContext } from '../CommandActionContracts.js';
import { createChatCommandAction, parseChatCommand } from '../chat-command-registry.js';
import { chatCommandCopy } from '../chat-command-copy.js';
import { manualModelPickerOptions } from '../model-picker-options.js';
import { SlashCommandMenu } from './SlashCommandMenu.js';
import { ChildRunBubbles,childRunLabels } from '../components/ChildRunBubbles.js';
import type { ChildRunState } from '../child-run-controller.js';
import { modelPolicyCopy } from '../i18n/model-policy-copy.js';
import { useChatTranscriptScroll } from '../chat-transcript-scroll.js';
import { TeamworkProcessCard } from '../components/TeamworkProcessCard.js';
import type { TeamworkMetadata } from '../teamwork-live-stream.js';
import './chat-composer.css';

const nativeMessageCopy: Record<DesktopLocaleId,{ you:string; system:string; partial:string }> = {
  en:{you:'You',system:'System',partial:'Partial output'},de:{you:'Du',system:'System',partial:'Teilausgabe'},
  es:{you:'Tú',system:'Sistema',partial:'Salida parcial'},fr:{you:'Vous',system:'Système',partial:'Sortie partielle'},
  it:{you:'Tu',system:'Sistema',partial:'Output parziale'},'pt-BR':{you:'Você',system:'Sistema',partial:'Saída parcial'},
  ru:{you:'Вы',system:'Система',partial:'Частичный вывод'},ja:{you:'あなた',system:'システム',partial:'途中の出力'},
};

// ─── Types ───────────────────────────────────────────────────────────────────

type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;
type ComposerMode = 'action' | 'plan';

// ─── ChatTranscript ──────────────────────────────────────────────────────────

export type ChatTranscriptProps = {
  childGroups?:readonly ChildRunState[];
  childParentTurns?:readonly string[];
  childHistoryUnavailable?:boolean;
  childHistoryResyncNeeded?:boolean;
  onChildResync?:(turnId:string)=>void;
  independentRunState?: RunState;
  activeSession: DesktopSessionDetail | null;
  error: string;
  developerMessages: DesktopChatMessage[];
  loading: boolean;
  messages: DesktopChatMessage[];
  pendingUserMessage: string;
  ready: boolean;
  showDeveloperTools: boolean;
  showTokenUsage: boolean;
  showTps: boolean;
  showThinking: boolean;
  simplifiedToolCalling: boolean;
  latestTurnUsage: NativeChatTurnUsage | null;
  onCreateSession: () => void;
  serviceStatus: ServiceStatus | null;
};

export function ChatTranscript({
  childGroups=[],childParentTurns=[],childHistoryUnavailable=false,childHistoryResyncNeeded=false,onChildResync,
  independentRunState,
  activeSession,
  error,
  developerMessages,
  loading,
  messages,
  pendingUserMessage,
  ready,
  showDeveloperTools,
  showTokenUsage,
  showTps,
  showThinking,
  simplifiedToolCalling,
  latestTurnUsage,
  onCreateSession,
  serviceStatus
}: ChatTranscriptProps): React.JSX.Element {
  const { locale, t } = useDesktopI18n();
  const transcript=useChatTranscriptScroll(activeSession?.session_id??'',{messages,childGroups,pendingUserMessage});
  const numberFormat = new Intl.NumberFormat(locale);
  const normalizedPendingUserMessage = pendingUserMessage.replace(/\s+/g, ' ').trim();
  let lastUserMessageIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      lastUserMessageIndex = index;
      break;
    }
  }
  const pendingUserMessageAlreadyInTranscript = Boolean(normalizedPendingUserMessage)
    && lastUserMessageIndex >= 0
    && String(messages[lastUserMessageIndex].content || '').replace(/\s+/g, ' ').trim() === normalizedPendingUserMessage
    && messages.slice(lastUserMessageIndex + 1).some((message) =>
      message.role === 'assistant' && (message.pending || message.streaming));
  if (loading) {
    return (
      <div className="chat-transcript chat-state">
        <Loader2 size={22} className="spin" />
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  if (!activeSession && !messages.length && !childGroups.length) {
    return (
      <div className="chat-transcript chat-empty-state">
        <img src={brandAssets.sidekickAvatar} alt="" />
        <h2>{t('chat.startOrSelect')}</h2>
        <p>{t('chat.emptyHint')}</p>
        <button type="button" className="primary-action compact" onClick={onCreateSession} disabled={!ready}>
          <Plus size={15} />
          <span>{t('chat.newSession')}</span>
        </button>
      </div>
    );
  }

  return (
    <div ref={transcript} className="chat-transcript">
      {error && <div className="chat-error">{error}</div>}
      {messages.map((message, index) => {
        const isLastAssistant = message.role === 'assistant' && !messages.slice(index + 1).some((item) => item.role === 'assistant');
        const messageUsage = isLastAssistant ? latestTurnUsage : null;
        const inputTokens = messageUsage?.inputTokens;
        const outputTokens = messageUsage?.outputTokens;
        const tokensPerSecond = messageUsage?.tokensPerSecond ?? message._turnTps;
        const toolCalls = normalizeToolCalls(message.tool_calls);
        const reasoning = typeof message.reasoning === 'string' ? message.reasoning.trim() : '';
        const hasActivity = toolCalls.length > 0 || (showThinking && reasoning.length > 0);

        return (
        <article key={`${message.role || 'message'}-${index}`} className={`chat-message ${message.role || 'assistant'} ${message.pending ? 'pending' : ''}`}>
          <div className="message-avatar">
            {message.role === 'user' ? <UserCircle size={17} /> : <img src={brandAssets.sidekickAvatar} alt="" />}
          </div>
          <div className="message-body">
            <div className="message-meta">
              <strong>{message.role === 'user' ? nativeMessageCopy[locale].you : message.role === 'system' ? nativeMessageCopy[locale].system : 'Sidekick'}</strong>
              {(message.pending || (message.isPartial === true && message.streaming && (independentRunState === 'running' || independentRunState === 'pausing'))) && <Loader2 size={13} className="spin" />}
              {message.isPartial === true && <span className="chat-partial-label">{nativeMessageCopy[locale].partial}</span>}
            </div>
            <ChatMessageBody content={String(message.content || '')} />
            {message.role === 'assistant' && Boolean(message.teamwork && typeof message.teamwork === 'object') && (
              <TeamworkProcessCard metadata={message.teamwork as TeamworkMetadata} />
            )}
            {showThinking && reasoning && (
              <details className="chat-reasoning-details">
                <summary>{t('chat.reasoning')}</summary>
                <div className="chat-reasoning-content"><ChatMessageBody content={reasoning} /></div>
              </details>
            )}
            {hasActivity && (
              simplifiedToolCalling ? (
                <details className="chat-activity-details">
                  <summary>{t('settings.panels.notifications.compactActivity')} · {toolCalls.length}</summary>
                  {toolCalls.map((call, callIndex) => <ToolCallDetails key={call.id || `${call.name}-${callIndex}`} call={call} detailed={false} />)}
                </details>
              ) : (
                <section className="chat-tool-call-list">
                  {toolCalls.map((call, callIndex) => <ToolCallDetails key={call.id || `${call.name}-${callIndex}`} call={call} detailed />)}
                </section>
              )
            )}
            {shouldShowNativeTurnUsage({ isLatestAssistant: isLastAssistant, showTokenUsage, showTps, usage: messageUsage, persistedTps: message._turnTps }) && (
              <div className="chat-turn-usage" aria-label={t('chat.turnUsage')}>
                {showTokenUsage && inputTokens !== undefined && outputTokens !== undefined && (
                  <span>{t('chat.inputTokens', { count: numberFormat.format(inputTokens) })} · {t('chat.outputTokens', { count: numberFormat.format(outputTokens) })}</span>
                )}
                {showTps && typeof tokensPerSecond === 'number' && (
                  <span>{t('chat.tokensPerSecond', { count: numberFormat.format(tokensPerSecond) })}</span>
                )}
              </div>
            )}
          </div>
        </article>
        );
      })}
      {childGroups.map(group=><section key={group.binding.parentTurnId} className="chat-child-turn-group">
        <p className="child-run-identity">{childRunLabels[locale==='pt-BR'?'pt':locale].children} · {group.binding.parentTurnId}</p>
        <ChildRunBubbles state={group} locale={locale==='pt-BR'?'pt':locale} onResync={identity=>onChildResync?.(identity.parentTurnId)} renderContent={content=><ChatMessageBody content={content}/>}/>
      </section>)}
      {(childHistoryUnavailable||childHistoryResyncNeeded)&&<p className="chat-status-message" role="status">{childRunLabels[locale==='pt-BR'?'pt':locale][childHistoryUnavailable?'stale':'overflow']}</p>}
      {childParentTurns.filter(turn=>!childGroups.some(group=>group.binding.parentTurnId===turn)).map(turn=><button key={turn} type="button" className="secondary-action compact" onClick={()=>onChildResync?.(turn)}>
        {childRunLabels[locale==='pt-BR'?'pt':locale].resync} · {turn}</button>)}
      {pendingUserMessage && !pendingUserMessageAlreadyInTranscript && (
        <article className="chat-message user pending">
          <div className="message-avatar"><UserCircle size={17} /></div>
          <div className="message-body">
            <div className="message-meta"><strong>You</strong><Loader2 size={13} className="spin" /></div>
            <ChatMessageBody content={pendingUserMessage} />
          </div>
        </article>
      )}
      {showDeveloperTools && (
        <section className="chat-developer-panel native-work-card">
          <div className="chat-developer-header">
            <div>
              <strong>Developer trace</strong>
              <span>{developerMessages.length} hidden messages</span>
            </div>
            <span>Hidden by default</span>
          </div>
          <div className="chat-developer-messages">
            {developerMessages.length ? developerMessages.map((message, index) => (
              <article key={`dev-${message.role || 'message'}-${index}`} className={`chat-developer-message ${message.role || 'assistant'}`}>
                <div className="message-meta">
                  <strong>{message.role || 'message'}</strong>
                </div>
                <pre>{String(message.content || '').trim() || '...'}</pre>
              </article>
            )) : (
              <div className="chat-developer-empty">No hidden prompts or tool messages.</div>
            )}
          </div>
          <AdvancedWebUiTools panel="chat" serviceStatus={serviceStatus} compact />
        </section>
      )}
    </div>
  );
}

type ToolCallView = { id?: string; name: string; arguments?: string };

function normalizeToolCalls(value: unknown): ToolCallView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const fn = record.function && typeof record.function === 'object' ? record.function as Record<string, unknown> : {};
    const name = String(fn.name || record.name || '').trim();
    if (!name) return [];
    const rawArgs = fn.arguments ?? record.arguments;
    let args = '';
    if (typeof rawArgs === 'string') args = rawArgs;
    else if (rawArgs && typeof rawArgs === 'object') {
      try { args = JSON.stringify(rawArgs, null, 2); } catch { args = ''; }
    }
    return [{ id: String(record.id || ''), name, arguments: args }];
  });
}

function ToolCallDetails({ call, detailed }: { call: ToolCallView; detailed: boolean }): React.JSX.Element {
  return (
    <details className={detailed ? 'chat-tool-call-details expanded' : 'chat-tool-call-details'}>
      <summary>{call.name}</summary>
      {call.arguments && <pre>{call.arguments}</pre>}
    </details>
  );
}

// ─── ChatMessageBody ─────────────────────────────────────────────────────────

export function ChatMessageBody({ content }: { content: string }): React.JSX.Element {
  const view = useMemo(() => describeChatContent(content), [content]);
  const bionicReading = usePanelStore((state) => state.visionImpaired.enabled && state.visionImpaired.bionicReading);

  switch (view.kind) {
    case 'empty':
      return <p>...</p>;
    case 'text':
      return bionicReading
        ? <BionicText text={view.text} />
        : <RichTextRenderer content={view.text} />;
    case 'html':
      return (
        <div className="chat-structured chat-html-structured">
          <div className="chat-structured-header">
            <strong>HTML response</strong>
            <span>{view.title || 'Markup payload'}</span>
          </div>
          <div className="chat-html-preview">
            <div className="chat-html-preview-chip">{view.title || 'HTML'}</div>
            <pre>{view.snippet}</pre>
          </div>
          <details className="chat-structured-raw">
            <summary>Show raw HTML</summary>
            <pre>{view.raw}</pre>
          </details>
        </div>
      );
    case 'research':
      return (
        <div className="chat-structured chat-research-structured">
          <div className="chat-structured-header">
            <strong>{bionicReading ? <BionicText text={view.summary} as="span" /> : view.summary}</strong>
            <span>{view.results.length} results</span>
          </div>
          {view.keyPoints.length > 0 && (
            <div className="chat-chip-row">
              {view.keyPoints.map((point, index) => <span key={`${point}-${index}`}>{bionicReading ? <BionicText text={point} as="span" /> : point}</span>)}
            </div>
          )}
          {view.results.length > 0 && (
            <div className="chat-result-list">
              {view.results.map((result, index) => (
                <article key={`${result.title}-${index}`} className="chat-result-card">
                  <div className="chat-result-card-head">
                    <strong>{bionicReading ? <BionicText text={result.title} as="span" /> : result.title}</strong>
                    {result.source && <span>{result.source}</span>}
                  </div>
                  {result.url && (
                    <a href={result.url} target="_blank" rel="noreferrer">
                      {result.url}
                    </a>
                  )}
                  {result.snippet && (bionicReading ? <BionicText text={result.snippet} /> : <p>{result.snippet}</p>)}
                </article>
              ))}
            </div>
          )}
          {view.nextSteps.length > 0 && (
            <div className="chat-next-steps">
              <strong>Next steps</strong>
              <ul>
                {view.nextSteps.map((step, index) => <li key={`${step}-${index}`}>{bionicReading ? <BionicText text={step} as="span" /> : step}</li>)}
              </ul>
            </div>
          )}
          <details className="chat-structured-raw">
            <summary>Show raw JSON</summary>
            <pre>{view.raw}</pre>
          </details>
        </div>
      );
    case 'json':
      return (
        <div className="chat-structured chat-json-structured">
          <div className="chat-structured-header">
            <strong>JSON response</strong>
            <span>{view.entries.length} fields</span>
          </div>
          <dl className="chat-json-grid">
            {view.entries.map((entry) => (
              <React.Fragment key={entry.key}>
                <dt>{entry.key}</dt>
                <dd>{bionicReading ? <BionicText text={entry.value || '-'} as="span" /> : entry.value || '-'}</dd>
              </React.Fragment>
            ))}
          </dl>
          <details className="chat-structured-raw">
            <summary>Show raw JSON</summary>
            <pre>{view.raw}</pre>
          </details>
        </div>
      );
    default:
      return <p>{content.trim()}</p>;
  }
}

/** Render app-owned chat text as React text nodes, never as generated HTML. */
export function BionicText({ text, enabled = true, as = 'p' }: { text: string; enabled?: boolean; as?: 'p' | 'span' }): React.JSX.Element {
  const Tag = as;
  if (!enabled) return <Tag>{text}</Tag>;
  return (
    <Tag>
      {toBionicSegments(text).map((segment, index) => segment.bold
        ? <strong key={index}>{segment.text}</strong>
        : <React.Fragment key={index}>{segment.text}</React.Fragment>)}
    </Tag>
  );
}

// ─── ChatComposer ─────────────────────────────────────────────────────────────

export type ChatComposerProps = {
  automaticPolicy?:Readonly<{active:boolean;available:boolean}>;
  sendBlocked?:boolean;
  commandContext?: CommandContext;
  commandCapabilities?: CommandCapabilities;
  onCommandAction?: (action:CommandAction)=>boolean|void;
  busy: boolean;
  mode: ComposerMode;
  model: string;
  /** Selectable models, grouped by provider. The current model remains visible when empty. */
  modelOptions: Array<{ provider: string; providerId?: string; configured?: boolean; disabledReason?: string; models: Array<{ id: string; label: string; reasoningEfforts?: string[] }> }>;
  modelCatalogError?: boolean;
  onRetryModelCatalog?: () => void;
  modelProvider?: string;
  reasoningEffort: string;
  reasoningEfforts: string[];
  reasoningCapabilityState?: 'loading' | 'unknown' | 'ready';
  profile: string;
  ready: boolean;
  runState: ChatRunState;
  text: string;
  workspace: string;
  onMode: (mode: ComposerMode) => void;
  onModelChange: (model: string) => void;
  onReasoningEffort: (effort: string) => void;
  onSend: (message: string, reasoningEffort?: string) => void;
  onStop: () => void;
  onText: (text: string) => void;
};

const unavailableCommands:CommandCapabilities={plan:false,grill_me:false,boost:false,goal:false,gquota:false,plugins:false};

/** Derive the last segment of a workspace path for display in the chip row. */
function workspaceLabel(path?: string | null): string {
  if (!path || path === 'default') return 'default';
  const raw = String(path || '');
  const normalized = raw.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

export function ChatComposer({
  automaticPolicy,sendBlocked=false,
  commandContext,
  commandCapabilities=unavailableCommands,
  onCommandAction,
  busy,
  mode,
  model,
  modelProvider,
  reasoningEffort,
  reasoningEfforts,
  reasoningCapabilityState,
  modelOptions,
  modelCatalogError=false,
  onRetryModelCatalog,
  profile,
  ready,
  runState,
  text,
  workspace,
  onMode,
  onModelChange,
  onReasoningEffort,
  onSend,
  onStop,
  onText
}: ChatComposerProps): React.JSX.Element {
  const { t,locale } = useDesktopI18n();
  const commandCopy=chatCommandCopy(locale);
  const canSend = ready && text.trim().length > 0 && !busy && !sendBlocked;
  const running = runState === 'starting' || runState === 'streaming' || runState === 'cancelling';

  const [showSlashDropdown, setShowSlashDropdown] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [showManualModels, setShowManualModels] = useState(false);
  const [manualModelSearch, setManualModelSearch] = useState('');
  const composerInput=useRef<HTMLTextAreaElement>(null);
  const manualModelTrigger=useRef<HTMLButtonElement>(null);
  const manualModelSearchInput=useRef<HTMLInputElement>(null);
  const closeSlashMenu=()=>{setShowSlashDropdown(false);queueMicrotask(()=>composerInput.current?.focus());};
  useEffect(()=>{if(showManualModels)manualModelSearchInput.current?.focus();},[showManualModels]);
  function executeCommand(input:string):boolean {
    if(!commandContext||!onCommandAction)return false;
    const action=createChatCommandAction(input,'composer',{...commandContext,model,modelProvider,reasoningEffort:reasoningEffort||undefined},commandCapabilities);
    if(!action)return false;
    const accepted=onCommandAction(action);
    setShowSlashDropdown(false);
    if(action.kind!=='unavailable'&&accepted!==false)onText('');
    return true;
  }

  function handleComposerChange(value: string): void {
    onText(value);
    if (value.startsWith('/') && !value.includes(' ')) {
      setSlashFilter(value.slice(1).toLowerCase());
      setShowSlashDropdown(true);
    } else {
      setShowSlashDropdown(false);
    }
  }

  function submit(event?: FormEvent): void {
    event?.preventDefault();
    if(ready&&parseChatCommand(text)&&executeCommand(text))return;
    if (!canSend) return;
    setShowSlashDropdown(false);
    onSend(text, reasoningEffort || undefined);
  }

  const isTabsActive = /@tabs\b/i.test(text);
  const reasoningHelp = reasoningCapabilityState === 'loading'
    ? t('common.loading')
    : reasoningCapabilityState !== 'ready' || reasoningEfforts.length === 0
      ? t('chat.reasoningEffortUnavailable')
      : t('chat.reasoningEffort');
  const manualModelGroups=manualModelPickerOptions(modelOptions).map(group=>({...group,models:group.models.filter(entry=>
    `${group.provider} ${entry.label} ${entry.id}`.toLocaleLowerCase().includes(manualModelSearch.trim().toLocaleLowerCase()))}));

  return (
    <form className="chat-composer" onSubmit={submit}>
      <div className="composer-toolbar">
        <div className="composer-toolbar-group composer-command-group">
          {commandContext&&onCommandAction&&<button type="button" className="composer-command-button" title={commandCopy.menu} aria-label={commandCopy.menu}
            onClick={()=>{setSlashFilter('');setShowSlashDropdown(current=>!current);}}>/</button>}
          <div className="composer-mode" role="group" aria-label={`${t('chat.action')} / ${t('chat.plan')}`}>
            <button type="button" className={mode === 'action' ? 'active' : ''} onClick={() => onMode('action')}>
              <Sparkles size={13} />
              <span>{t('chat.action')}</span>
            </button>
            <button type="button" className={mode === 'plan' ? 'active' : ''} onClick={() => onMode('plan')}>
              <Columns3 size={13} />
              <span>{t('chat.plan')}</span>
            </button>
          </div>
        </div>
        <div className="composer-toolbar-group composer-context-group">
          <button
            type="button"
            className="composer-tab-btn"
            onClick={() => {
              if (isTabsActive) {
                onText(text.replace(/@tabs\s*/gi, '').trim());
              } else {
                onText(text ? `@tabs ${text}` : '@tabs ');
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              border: 'none',
              background: isTabsActive ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.06)',
              color: isTabsActive ? '#38bdf8' : 'rgba(232, 242, 255, 0.65)',
              padding: '3px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            title={`@tabs · ${t('browser.chrome.tabs')}`}
          >
            <Layers size={13} />
            <span>@tabs</span>
          </button>
        </div>
        <div className="composer-toolbar-group composer-model-group">
          <label className="composer-model composer-current-model" title={`${model || 'default'} · ${modelProvider || 'current'}`}>
              <Cpu size={13} />
              <select
                aria-label={`${t('chat.model')}: ${model || 'default'}`}
                title={`${model || 'default'} · ${modelProvider || 'current'}`}
                value={automaticPolicy?.active?'__lastbrowser_auto_policy__':qualifyModelForProvider(model, modelProvider)}
                disabled={!ready || running}
                onChange={(event) => onModelChange(event.target.value)}
                style={{ backgroundColor: '#0b1325', color: '#e8f2ff' }}
              >
                {automaticPolicy&&<option value="__lastbrowser_auto_policy__">AUTO{!automaticPolicy.available?` · ${modelPolicyCopy(locale).unavailable}`:''}</option>}
                {!automaticPolicy?.active&&!modelOptions.some(group=>!group.providerId&&group.models.some(entry=>entry.id===model))&&
                  <option value={qualifyModelForProvider(model, modelProvider)}>{model || 'default'} · {modelProvider || 'current'}</option>}
                {modelOptions.filter(group=>!group.providerId).map((group) => (
                  <optgroup key={group.providerId || group.provider} label={group.provider} style={{ backgroundColor: '#070c18', color: '#00d9ff', fontWeight: 700 }}>
                    {group.models.map((m) => (
                      <option key={`${group.providerId || group.provider}:${m.id}`} value={qualifyModelForProvider(m.id, group.providerId)} style={{ backgroundColor: '#0b1325', color: '#e8f2ff' }}>
                        {m.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
          </label>
          <button ref={manualModelTrigger} type="button" className="composer-command-button composer-model-trigger" aria-expanded={showManualModels}
            aria-label={t('chat.chooseModelManually')} title={t('chat.chooseModelManually')}
            aria-controls="composer-manual-models" onClick={()=>setShowManualModels(open=>!open)}>
            <ListFilter size={14} aria-hidden="true" />
            <span>{t('chat.chooseModelShort')}</span>
          </button>
          <details className="composer-reasoning-disclosure">
            <summary title={reasoningHelp} aria-label={t('chat.reasoningEffort')} data-testid="composer-reasoning-toggle">
              {t('chat.reasoningEffort')}
            </summary>
            <ReasoningEffortPicker
              value={reasoningEffort}
              efforts={reasoningEfforts}
              capabilityState={reasoningCapabilityState}
              disabled={!ready || running}
              onChange={onReasoningEffort}
            />
          </details>
        </div>
      </div>
      {modelCatalogError&&<div className="composer-model-notice" role="alert">
        <span>{t('chat.modelCatalogUnavailable')}</span>
        {onRetryModelCatalog&&<button type="button" className="secondary-action compact" onClick={onRetryModelCatalog}>{t('chat.retryModels')}</button>}
      </div>}
      {showManualModels&&<section id="composer-manual-models" className="composer-manual-models" role="region" aria-label={t('chat.chooseModelManually')}
        onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();setShowManualModels(false);setManualModelSearch('');manualModelTrigger.current?.focus();}}}>
        <label>{t('chat.modelSearch')}<input ref={manualModelSearchInput} type="search" value={manualModelSearch} onChange={event=>setManualModelSearch(event.target.value)}/></label>
        {manualModelGroups.map(group=><fieldset key={group.providerId||group.provider} disabled={group.configured===false}>
          <legend>{group.provider}{group.configured===false&&` · ${t(group.disabledReason==='unavailable'?'chat.modelProviderUnavailable':'chat.modelProviderNotConfigured')}`}</legend>
          {group.models.map(entry=><button key={`${group.providerId}:${entry.id}`} type="button" disabled={group.configured===false||!ready||running}
            title={`${entry.label} · ${entry.id}`}
            aria-pressed={model===entry.id&&modelProvider===group.providerId} onClick={()=>{onModelChange(qualifyModelForProvider(entry.id,group.providerId));setShowManualModels(false);setManualModelSearch('');manualModelTrigger.current?.focus();}}>
            <span className="composer-manual-model-name">{entry.label}</span><small>{entry.id}</small>
          </button>)}
        </fieldset>)}
        {!manualModelGroups.some(group=>group.models.length>0)&&<p role="status">{t('chat.noManualModels')}</p>}
      </section>}
      <div className="composer-input-row">
        {showSlashDropdown&&commandContext&&onCommandAction&&<SlashCommandMenu locale={locale} query={slashFilter} capabilities={commandCapabilities}
          onChoose={command=>{executeCommand('/'+command.name);}} onClose={closeSlashMenu}/>}
        <textarea
          ref={composerInput}
          value={text}
          placeholder={ready ? t('chat.composerPlaceholder') : t('chat.runtimeStarting')}
          rows={3}
          disabled={!ready}
          onChange={(event) => handleComposerChange(event.target.value)}
          onKeyDown={(event) => {
            if(event.nativeEvent.isComposing||event.nativeEvent.keyCode===229)return;
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
            if (event.key === 'Escape') setShowSlashDropdown(false);
          }}
        />
        {running ? (
          <button type="button" className="composer-send stop" onClick={onStop} aria-label={t('chat.stop')}>
            <StopCircle size={17} />
          </button>
        ) : (
          <button type="submit" className="composer-send" disabled={!canSend} aria-label={t('chat.send')}>
            <Send size={17} />
          </button>
        )}
      </div>
      <div className="composer-chips">
        {isTabsActive && (
          <span style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)', background: 'rgba(56, 189, 248, 0.1)' }}>
            @tabs · {t('browser.chrome.tabs')}
          </span>
        )}
        <span>{profile}</span>
        <span>{workspaceLabel(workspace)}</span>
      </div>
    </form>
  );
}
