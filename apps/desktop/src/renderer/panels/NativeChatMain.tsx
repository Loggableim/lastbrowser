/**
 * Native chat panel for Lastbrowser.
 *
 * Extracted from App.tsx. Renders the full chat interface:
 *   • Header with session title, status, queue, compression, control center, developer toggle
 *   • ChatTranscript (scrollable message list)
 *   • ApprovalPollManager / ApprovalCard
 *   • ChatComposer with model switcher, queue indicator, context usage
 *   • ControlCenter drawer
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Settings } from 'lucide-react';
import { brandAssets } from '../brand.js';
import { canCallSidekickApi } from '../runtime-readiness.js';
import { partitionChatMessages } from '../chat-display.js';
import { useChatQueue, CompressButton, QueueIndicator } from '../NativeCompressQueue.js';
import { ChatTranscript, ChatComposer } from './ChatComponents.js';
import { ApprovalPollManager, ApprovalCard } from '../NativeApproval.js';
import { ContextUsageIndicator } from '../NativeContextUsage.js';
import { ControlCenter } from '../NativeControlCenter.js';
import {
  sessionTitle,
  shortSessionId,
  type DesktopSessionDetail,
  type DesktopChatMessage,
  type ChatRunState
} from '../shell-state.js';
import {
  hasTabsMention,
  extractTargetTabNumbers,
  synthesizeTabsContext,
  buildPromptWithTabContext
} from '../tab-intelligence.js';
import { useGeminiAccountStore } from '../stores/useGeminiAccountStore.js';

type ServiceStatus = Awaited<ReturnType<typeof window.lastbrowser.services.status>>;
export type ComposerMode = 'action' | 'plan';

export type NativeChatMainProps = {
  activeSession: DesktopSessionDetail | null;
  activeSessionId: string | null;
  busy: boolean;
  chatError: string;
  messages: DesktopChatMessage[];
  runState: ChatRunState;
  composerMode: ComposerMode;
  composerText: string;
  serviceStatus: ServiceStatus | null;
  sessionLoading: boolean;
  setupModel: string;
  activeSpacePath: string;
  onComposerMode: (mode: ComposerMode) => void;
  onComposerText: (text: string) => void;
  onCreateSession: () => void;
  onSend: (message: string) => void;
  onStop: () => void;
};

export function NativeChatMain({
  activeSession,
  activeSessionId,
  busy,
  chatError,
  messages,
  runState,
  composerMode,
  composerText,
  serviceStatus,
  sessionLoading,
  setupModel,
  activeSpacePath,
  onComposerMode,
  onComposerText,
  onCreateSession,
  onSend,
  onStop
}: NativeChatMainProps): React.JSX.Element {
  const running = runState === 'starting' || runState === 'streaming' || runState === 'cancelling';
  const ready = canCallSidekickApi(serviceStatus);
  const [showDeveloperTools, setShowDeveloperTools] = useState(false);
  const [showControlCenter, setShowControlCenter] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const { queue, enqueue, dequeue, clearQueue, removeAt } = useChatQueue();
  const { visible: visibleMessages, developer: developerMessages } = useMemo(
    () => partitionChatMessages(messages),
    [messages]
  );
  const model = activeSession?.model || setupModel || 'default';
  const profile = activeSession?.profile || 'default';
  const workspace = activeSession?.workspace || activeSpacePath || 'default';

  // Models the user can pick for this conversation. The catalog comes from the
  // same /api/models payload the settings panel uses, so the composer offers
  // exactly the providers that are actually connected.
  const [modelCatalog, setModelCatalog] = useState<Array<{ provider: string; models: Array<{ id: string; label: string }> }>>([]);
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const load = async () => {
      try {
        const data = await window.lastbrowser.sidekick.requestWebui({ method: 'GET', path: '/api/models' });
        if (!alive) return;
        const groups = Array.isArray(data?.groups) ? data.groups : [];
        const rawParsed = groups
          .map((group) => {
            const record = (group || {}) as Record<string, unknown>;
            const provider = String(record.provider || record.provider_id || 'Provider');
            const models = Array.isArray(record.models) ? record.models : [];
            return {
              provider,
              models: models
                .map((entry) => {
                  const m = (entry || {}) as Record<string, unknown>;
                  const id = String(m.id || m.name || m.label || '');
                  return { id, label: String(m.label || m.name || m.id || id) };
                })
                .filter((m) => m.id)
            };
          })
          .filter((group) => group.models.length > 0);

        const geminiModels = [
          { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Standard • Empfohlen)' },
          { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
          { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
          { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
          { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
          { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' }
        ];

        const accounts = useGeminiAccountStore.getState().accounts;
        const geminiGroupLabel = accounts.length > 1
          ? `Google Gemini CLI (Antigravity) • Round-Robin (${accounts.length})`
          : accounts.length === 1
            ? `Google Gemini CLI (${accounts[0].label})`
            : 'Google Gemini CLI (Antigravity)';

        const hasCli = rawParsed.some((g) => g.provider.toLowerCase().includes('gemini'));
        const finalCatalog = hasCli
          ? rawParsed
          : [{ provider: geminiGroupLabel, models: geminiModels }, ...rawParsed];

        setModelCatalog(finalCatalog);
      } catch {
        const accounts = useGeminiAccountStore.getState().accounts;
        const geminiGroupLabel = accounts.length > 1
          ? `Google Gemini CLI (Antigravity) • Round-Robin (${accounts.length})`
          : accounts.length === 1
            ? `Google Gemini CLI (${accounts[0].label})`
            : 'Google Gemini CLI (Antigravity)';
        setModelCatalog([{
          provider: geminiGroupLabel,
          models: [
            { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Standard • Empfohlen)' },
            { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
            { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
            { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
            { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview' },
            { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview' }
          ]
        }]);
      }
    };
    void load();
    return () => { alive = false; };
  }, [ready]);

  /** Switch the model for this conversation (persists as the new default). */
  const handleComposerModelChange = useCallback((nextModel: string) => {
    if (!nextModel || nextModel === model) return;
    void window.lastbrowser.sidekick.setDefaultModel({ model: nextModel })
      .then(() => setStatusMessage(`Model set to ${nextModel}`))
      .catch((error: unknown) => {
        setStatusMessage(`Could not switch model: ${error instanceof Error ? error.message : String(error)}`);
      });
  }, [model]);

  // Wrap onSend to synthesize @tabs context and enqueue when busy instead of losing the message
  const handleSend = useCallback(async (text: string) => {
    let messageToSend = text;
    if (hasTabsMention(text)) {
      setStatusMessage('Synthesizing open tabs context…');
      try {
        const specificNumbers = extractTargetTabNumbers(text);
        const synth = await synthesizeTabsContext({ specificTabIndices: specificNumbers });
        if (synth && synth.tabCount > 0) {
          messageToSend = buildPromptWithTabContext(text, synth);
          setStatusMessage(`Context attached: ${synth.tabCount} tab(s), ~${synth.totalEstimatedTokens} tokens`);
        }
      } catch (err) {
        console.warn('[tab-intelligence] Failed to synthesize tabs context:', err);
      }
    }

    if (running) {
      enqueue({ text: messageToSend, model, profile });
      setStatusMessage(`Queued: "${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"`);
      return;
    }
    onSend(messageToSend);
  }, [running, enqueue, model, profile, onSend]);

  return (
    <section className="browser-main native-chat-main">
      <div className="native-chat-header">
        <div className="native-chat-title">
          <img src={brandAssets.sidekickAvatar} alt="" />
          <div>
            <span>{activeSessionId ? shortSessionId(activeSessionId) : 'New chat'}</span>
            <h1>{activeSession ? sessionTitle(activeSession) : 'Sidekick'}</h1>
          </div>
        </div>
        <div className="native-chat-header-actions">
          <CompressButton activeSessionId={activeSessionId} ready={ready} onResult={setStatusMessage} />
          <QueueIndicator queue={queue} onDrain={() => {
            if (running) { setStatusMessage('Wait for current turn to finish first.'); return; }
            const msg = dequeue();
            if (msg) handleSend(msg.text);
          }} onClear={clearQueue} onRemoveAt={removeAt} busy={running} />
          <button
            type="button"
            className="secondary-action compact"
            onClick={() => setShowControlCenter(true)}
            title="Control Center"
          >
            <Settings size={14} />
            <span>Control</span>
          </button>
          <button
            type="button"
            className={`secondary-action compact developer-toggle ${showDeveloperTools ? 'active' : ''}`}
            onClick={() => setShowDeveloperTools((current) => !current)}
          >
            {showDeveloperTools ? <Eye size={14} /> : <EyeOff size={14} />}
            <span>Developer</span>
          </button>
          <div className={`native-chat-status ${ready ? 'ready' : 'starting'}`}>
            <span className={ready ? 'status-dot ready' : 'status-dot'} />
            <span>{ready ? 'Online' : 'Starting'}</span>
          </div>
        </div>
      </div>
      <ChatTranscript
        activeSession={activeSession}
        error={chatError}
        developerMessages={developerMessages}
        loading={sessionLoading}
        messages={visibleMessages}
        pendingUserMessage={activeSession?.pending_user_message || ''}
        ready={ready}
        showDeveloperTools={showDeveloperTools}
        onCreateSession={onCreateSession}
        serviceStatus={serviceStatus}
      />
      <ApprovalPollManager
        activeSessionId={activeSessionId}
        serviceStatus={serviceStatus}
        busy={busy || running}
      >
        {({ pending, respond }) => (
          <>
            {pending && <ApprovalCard entry={pending} onRespond={respond} />}
            <div className="composer-with-usage">
            <ChatComposer
        busy={busy || running}
        mode={composerMode}
        model={model}
        modelOptions={modelCatalog}
        profile={profile}
        ready={ready}
        runState={runState}
        text={composerText}
        workspace={workspace}
        onMode={onComposerMode}
        onModelChange={handleComposerModelChange}
        onSend={handleSend}
        onStop={onStop}
        onText={onComposerText}
      />
            {statusMessage && <div className="chat-status-message" onClick={() => setStatusMessage('')}>{statusMessage}</div>}
            <ContextUsageIndicator activeSessionId={activeSessionId} ready={ready} />
            </div>
      </>
      )}
    </ApprovalPollManager>
    <ControlCenter
        open={showControlCenter}
        serviceStatus={serviceStatus}
        activeSessionId={activeSessionId}
        onClose={() => setShowControlCenter(false)}
      />
    </section>
  );
}
