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

// ─── Types ───────────────────────────────────────────────────────────────────

type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;
type ComposerMode = 'action' | 'plan';

// ─── ChatTranscript ──────────────────────────────────────────────────────────

export type ChatTranscriptProps = {
  activeSession: DesktopSessionDetail | null;
  error: string;
  developerMessages: DesktopChatMessage[];
  loading: boolean;
  messages: DesktopChatMessage[];
  pendingUserMessage: string;
  ready: boolean;
  showDeveloperTools: boolean;
  onCreateSession: () => void;
  serviceStatus: ServiceStatus | null;
};

export function ChatTranscript({
  activeSession,
  error,
  developerMessages,
  loading,
  messages,
  pendingUserMessage,
  ready,
  showDeveloperTools,
  onCreateSession,
  serviceStatus
}: ChatTranscriptProps): React.JSX.Element {
  if (loading) {
    return (
      <div className="chat-transcript chat-state">
        <Loader2 size={22} className="spin" />
        <span>Loading session...</span>
      </div>
    );
  }

  if (!activeSession && !messages.length) {
    return (
      <div className="chat-transcript chat-empty-state">
        <img src={brandAssets.sidekickAvatar} alt="" />
        <h2>Start a Sidekick chat</h2>
        <p>Chat, browser actions, planning and workspace runs now use native Lastbrowser UI.</p>
        <button type="button" className="primary-action compact" onClick={onCreateSession} disabled={!ready}>
          <Plus size={15} />
          <span>New chat</span>
        </button>
      </div>
    );
  }

  return (
    <div className="chat-transcript">
      {error && <div className="chat-error">{error}</div>}
      {messages.map((message, index) => (
        <article key={`${message.role || 'message'}-${index}`} className={`chat-message ${message.role || 'assistant'} ${message.pending ? 'pending' : ''}`}>
          <div className="message-avatar">
            {message.role === 'user' ? <UserCircle size={17} /> : <img src={brandAssets.sidekickAvatar} alt="" />}
          </div>
          <div className="message-body">
            <div className="message-meta">
              <strong>{message.role === 'user' ? 'You' : message.role === 'system' ? 'System' : 'Sidekick'}</strong>
              {message.pending && <Loader2 size={13} className="spin" />}
            </div>
            <ChatMessageBody content={String(message.content || '')} />
          </div>
        </article>
      ))}
      {pendingUserMessage && (
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

// ─── ChatMessageBody ─────────────────────────────────────────────────────────

export function ChatMessageBody({ content }: { content: string }): React.JSX.Element {
  const view = useMemo(() => describeChatContent(content), [content]);

  switch (view.kind) {
    case 'empty':
      return <p>...</p>;
    case 'text':
      return <RichTextRenderer content={view.text} />;
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
            <strong>{view.summary}</strong>
            <span>{view.results.length} results</span>
          </div>
          {view.keyPoints.length > 0 && (
            <div className="chat-chip-row">
              {view.keyPoints.map((point, index) => <span key={`${point}-${index}`}>{point}</span>)}
            </div>
          )}
          {view.results.length > 0 && (
            <div className="chat-result-list">
              {view.results.map((result, index) => (
                <article key={`${result.title}-${index}`} className="chat-result-card">
                  <div className="chat-result-card-head">
                    <strong>{result.title}</strong>
                    {result.source && <span>{result.source}</span>}
                  </div>
                  {result.url && (
                    <a href={result.url} target="_blank" rel="noreferrer">
                      {result.url}
                    </a>
                  )}
                  {result.snippet && <p>{result.snippet}</p>}
                </article>
              ))}
            </div>
          )}
          {view.nextSteps.length > 0 && (
            <div className="chat-next-steps">
              <strong>Next steps</strong>
              <ul>
                {view.nextSteps.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}
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
                <dd>{entry.value || '-'}</dd>
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

// ─── ChatComposer ─────────────────────────────────────────────────────────────

export type ChatComposerProps = {
  busy: boolean;
  mode: ComposerMode;
  model: string;
  /** Selectable models, grouped by provider. Empty hides the picker. */
  modelOptions: Array<{ provider: string; models: Array<{ id: string; label: string }> }>;
  profile: string;
  ready: boolean;
  runState: ChatRunState;
  text: string;
  workspace: string;
  onMode: (mode: ComposerMode) => void;
  onModelChange: (model: string) => void;
  onSend: (message: string) => void;
  onStop: () => void;
  onText: (text: string) => void;
};

type SlashCmd = { name: string; help: string; action: string };

const SLASH_COMMANDS: SlashCmd[] = [
  { name: 'help', help: 'Show available commands', action: 'local' },
  { name: 'tabs', help: 'Synthesize open browser tabs (@tabs)', action: 'context' },
  { name: 'clear', help: 'Clear current conversation', action: 'local' },
  { name: 'new', help: 'Start a new conversation', action: 'local' },
  { name: 'compress', help: 'Compress conversation context', action: 'api' },
  { name: 'model', help: 'Switch model: /model <name>', action: 'api' },
  { name: 'workspace', help: 'Switch workspace: /workspace <path>', action: 'api' },
  { name: 'usage', help: 'Show token usage', action: 'api' },
  { name: 'theme', help: 'Toggle theme: /theme <name>', action: 'local' },
  { name: 'undo', help: 'Undo last exchange', action: 'local' },
];

/** Derive the last segment of a workspace path for display in the chip row. */
function workspaceLabel(path?: string | null): string {
  if (!path || path === 'default') return 'default';
  const raw = String(path || '');
  const normalized = raw.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
}

export function ChatComposer({
  busy,
  mode,
  model,
  modelOptions,
  profile,
  ready,
  runState,
  text,
  workspace,
  onMode,
  onModelChange,
  onSend,
  onStop,
  onText
}: ChatComposerProps): React.JSX.Element {
  const canSend = ready && text.trim().length > 0 && !busy;
  const running = runState === 'starting' || runState === 'streaming' || runState === 'cancelling';

  const [showSlashDropdown, setShowSlashDropdown] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const slashRef = useRef<HTMLDivElement>(null);

  const filteredSlashCommands = useMemo(
    () => slashFilter ? SLASH_COMMANDS.filter((c) => c.name.startsWith(slashFilter)) : SLASH_COMMANDS,
    [slashFilter]
  );

  // Close slash dropdown on outside click
  useEffect(() => {
    if (!showSlashDropdown) return;
    function handleClick(e: MouseEvent) {
      if (slashRef.current && !slashRef.current.contains(e.target as Node)) setShowSlashDropdown(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showSlashDropdown]);

  function executeSlashCommand(name: string): void {
    setShowSlashDropdown(false);
    const cmd = SLASH_COMMANDS.find((c) => c.name === name);
    if (!cmd) return;

    if (name === 'help') {
      const helpText = SLASH_COMMANDS.map((c) => `/${c.name} — ${c.help}`).join('\n');
      alert(`Available commands:\n\n${helpText}`);
      return;
    }
    if (name === 'clear') {
      if (confirm('Clear the current conversation?')) onText('');
      return;
    }
    if (name === 'new') {
      window.location.reload();
      return;
    }
    if (name === 'tabs') {
      onText(text ? `@tabs ${text}` : '@tabs ');
      return;
    }
    if (name === 'undo') {
      onText('/undo');
      onSend('/undo');
      return;
    }
    // For API commands, send as message to agent
    onText('/' + name);
    onSend('/' + name);
  }

  function handleComposerChange(value: string): void {
    onText(value);
    if (value.startsWith('/') && value.length > 1 && !value.includes(' ')) {
      setSlashFilter(value.slice(1).toLowerCase());
      setShowSlashDropdown(true);
    } else {
      setShowSlashDropdown(false);
    }
  }

  function submit(event?: FormEvent): void {
    event?.preventDefault();
    if (!canSend) return;
    setShowSlashDropdown(false);
    onSend(text);
  }

  const isTabsActive = /@tabs\b/i.test(text);

  return (
    <form className="chat-composer" onSubmit={submit}>
      <div className="composer-toolbar">
        <div className="composer-mode" role="group" aria-label="Composer mode">
          <button type="button" className={mode === 'action' ? 'active' : ''} onClick={() => onMode('action')}>
            <Sparkles size={13} />
            <span>Action</span>
          </button>
          <button type="button" className={mode === 'plan' ? 'active' : ''} onClick={() => onMode('plan')}>
            <Columns3 size={13} />
            <span>Plan</span>
          </button>
        </div>
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
          title="Offene Browser-Tabs als Kontext einbinden (@tabs)"
        >
          <Layers size={13} />
          <span>@tabs</span>
        </button>
        {modelOptions.length > 0 && (
          <label className="composer-model" title="Model for this conversation">
            <Cpu size={13} />
            <select
              value={model}
              disabled={!ready || running}
              onChange={(event) => onModelChange(event.target.value)}
            >
              {/* Keep the current model visible even when the catalog has not
                  loaded yet or the model is no longer offered. */}
              {!modelOptions.some((group) => group.models.some((m) => m.id === model)) && (
                <option value={model}>{model || 'default'}</option>
              )}
              {modelOptions.map((group) => (
                <optgroup key={group.provider} label={group.provider}>
                  {group.models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="composer-input-row" ref={slashRef}>
        {showSlashDropdown && filteredSlashCommands.length > 0 && (
          <div className="slash-dropdown">
            {filteredSlashCommands.map((cmd) => (
              <button key={cmd.name} type="button" className="slash-dropdown-item" onClick={() => executeSlashCommand(cmd.name)}>
                <span className="slash-cmd-name">/{cmd.name}</span>
                <span className="slash-cmd-help">{cmd.help}</span>
                <span className="slash-cmd-badge">{cmd.action}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          value={text}
          placeholder={ready ? 'Message Sidekick... (type @tabs or / for commands)' : 'Sidekick runtime is starting...'}
          rows={3}
          disabled={!ready}
          onChange={(event) => handleComposerChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
            if (event.key === 'Escape') setShowSlashDropdown(false);
          }}
        />
        {running ? (
          <button type="button" className="composer-send stop" onClick={onStop}>
            <StopCircle size={17} />
          </button>
        ) : (
          <button type="submit" className="composer-send" disabled={!canSend}>
            <Send size={17} />
          </button>
        )}
      </div>
      <div className="composer-chips">
        <span>{mode}</span>
        {isTabsActive && (
          <span style={{ color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)', background: 'rgba(56, 189, 248, 0.1)' }}>
            @tabs aktiv
          </span>
        )}
        <span>{model}</span>
        <span>{profile}</span>
        <span>{workspaceLabel(workspace)}</span>
      </div>
    </form>
  );
}
