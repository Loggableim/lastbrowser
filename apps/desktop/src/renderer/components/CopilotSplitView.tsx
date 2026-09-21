import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Check,
  CheckSquare,
  ChevronDown,
  Copy,
  FileText,
  Minus,
  Paperclip,
  Scale,
  Send,
  ShieldAlert,
  Smile,
  Sparkles,
  StopCircle,
  Table,
  X,
  Zap
} from 'lucide-react';
import type { DesktopChatMessage } from '../bridge.js';
import { RichTextRenderer } from '../NativeRichText.js';
import type { QuickActionChip } from '../quick-actions.js';
import {
  WORKFLOW_TEMPLATES,
  formatWorkflowPrompt,
  type AgenticWorkflowTemplate
} from '../workflow-templates.js';

export interface CopilotSplitViewProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  botName?: string;
  modelName?: string;
  messages: DesktopChatMessage[];
  busy: boolean;
  onSendMessage: (text: string) => void;
  onStopChat?: () => void;
  activeUrl?: string;
  activeTitle?: string;
  quickActions?: QuickActionChip[];
  onExecuteQuickAction?: (chip: QuickActionChip) => void;
}

export function CopilotSplitView({
  isOpen,
  onClose,
  onMinimize,
  botName = 'Nova',
  modelName = 'Sidekick Pro',
  messages,
  busy,
  onSendMessage,
  onStopChat,
  activeUrl,
  activeTitle,
  quickActions,
  onExecuteQuickAction
}: CopilotSplitViewProps): React.JSX.Element | null {
  const [inputText, setInputText] = useState('');
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [workflowsMenuOpen, setWorkflowsMenuOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const workflowDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (workflowDropdownRef.current && !workflowDropdownRef.current.contains(event.target as Node)) {
        setWorkflowsMenuOpen(false);
      }
    }
    if (workflowsMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [workflowsMenuOpen]);

  function handleSelectWorkflow(template: AgenticWorkflowTemplate) {
    setWorkflowsMenuOpen(false);
    const prompt = formatWorkflowPrompt(template, activeUrl, activeTitle);
    onSendMessage(prompt);
  }

  if (!isOpen) return null;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || busy) return;
    onSendMessage(trimmed);
    setInputText('');
  }

  function handleCopy(code: string, id: string) {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  }

  // Format code blocks inside message content
  function renderMessageContent(content: string, msgIndex: number) {
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <p key={`text-${lastIndex}`} className="copilot-text-p">
            {content.slice(lastIndex, match.index)}
          </p>
        );
      }
      const lang = match[1] || 'code';
      const code = match[2];
      const snippetId = `code-${msgIndex}-${match.index}`;
      parts.push(
        <div key={snippetId} className="copilot-code-block">
          <div className="copilot-code-header">
            <span className="copilot-code-lang">{lang}</span>
            <button
              type="button"
              className="copilot-code-copy-btn"
              title="Copy code"
              onClick={() => handleCopy(code, snippetId)}
            >
              {copiedCodeId === snippetId ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedCodeId === snippetId ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre className="copilot-code-content">
            <code>{code}</code>
          </pre>
        </div>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push(
        <p key={`text-${lastIndex}`} className="copilot-text-p">
          {content.slice(lastIndex)}
        </p>
      );
    }

    return parts.length > 0 ? parts : <p className="copilot-text-p">{content}</p>;
  }

  return (
    <aside className="copilot-split-panel" aria-label="Sidekick AI Copilot">
      {/* Top Header */}
      <div className="copilot-header">
        <div className="copilot-header-brand">
          <div className="copilot-logo-circle">
            <Sparkles size={14} className="copilot-sparkle-icon" />
          </div>
          <span className="copilot-header-title">Sidekick AI Copilot</span>
        </div>
        <div className="copilot-header-actions" ref={workflowDropdownRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className={`copilot-workflows-btn ${workflowsMenuOpen ? 'active' : ''}`}
            title="Agentic 1-Klick-Workflows"
            onClick={() => setWorkflowsMenuOpen((prev) => !prev)}
          >
            <Zap size={12} className="copilot-zap-icon" />
            <span>Workflows</span>
            <ChevronDown size={11} className={`copilot-chevron-icon ${workflowsMenuOpen ? 'open' : ''}`} />
          </button>

          {workflowsMenuOpen && (
            <div className="copilot-workflows-dropdown" role="menu">
              <div className="copilot-workflows-dropdown-header">
                <span className="dropdown-title">⚡ Agentic Workflows</span>
                <span className="dropdown-subtitle">Kuratierte 1-Klick Recherche & Analyse</span>
              </div>
              <div className="copilot-workflows-list">
                {WORKFLOW_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    type="button"
                    className="copilot-workflow-item"
                    role="menuitem"
                    onClick={() => handleSelectWorkflow(tmpl)}
                  >
                    <div className="workflow-item-icon">
                      {tmpl.id === 'competitor-analysis' && <Scale size={15} />}
                      {tmpl.id === 'markdown-extractor' && <FileText size={15} />}
                      {tmpl.id === 'table-to-csv' && <Table size={15} />}
                      {tmpl.id === 'page-audit' && <ShieldAlert size={15} />}
                      {tmpl.id === 'action-items' && <CheckSquare size={15} />}
                    </div>
                    <div className="workflow-item-text">
                      <div className="workflow-item-title-row">
                        <span className="workflow-item-title">{tmpl.title}</span>
                        <span className={`workflow-cat-badge cat-${tmpl.category}`}>
                          {tmpl.category}
                        </span>
                      </div>
                      <span className="workflow-item-desc">{tmpl.description}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {onMinimize && (
            <button
              type="button"
              className="copilot-action-btn"
              title="Minimize Copilot"
              onClick={onMinimize}
            >
              <Minus size={14} />
            </button>
          )}
          <button
            type="button"
            className="copilot-action-btn close"
            title="Close Copilot"
            onClick={onClose}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Messages Stream */}
      <div className="copilot-messages-container" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="copilot-empty-state">
            <div className="copilot-empty-icon">
              <Bot size={28} />
            </div>
            <h4>Frag {botName} zur aktuellen Seite</h4>
            <p>
              {activeTitle ? `„${activeTitle.slice(0, 45)}…“` : 'Stelle Fragen oder analysiere den Inhalt dieser Webseite.'}
            </p>

            <div className="copilot-workflow-empty-section">
              <span className="copilot-chips-heading">⚡ Agentic 1-Klick-Workflows:</span>
              <div className="copilot-workflow-pill-row">
                {WORKFLOW_TEMPLATES.map((tmpl) => (
                  <button
                    key={`wf-empty-${tmpl.id}`}
                    type="button"
                    className="copilot-workflow-chip"
                    title={tmpl.description}
                    onClick={() => handleSelectWorkflow(tmpl)}
                  >
                    <Zap size={11} className="chip-zap" />
                    <span>{tmpl.title}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="copilot-quick-prompts">
              {quickActions && quickActions.length > 0 && onExecuteQuickAction && (
                <>
                  {quickActions.map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      className="copilot-quick-btn"
                      style={{ borderColor: 'rgba(168, 85, 247, 0.4)', background: 'rgba(168, 85, 247, 0.12)', color: '#f3e8ff' }}
                      title={chip.tooltip}
                      onClick={() => onExecuteQuickAction(chip)}
                    >
                      <span>{chip.label}</span>
                    </button>
                  ))}
                </>
              )}
              <button
                type="button"
                className="copilot-quick-btn"
                onClick={() => onSendMessage('Fasse diese Seite in 3 Kernpunkten zusammen.')}
              >
                📄 Seite zusammenfassen
              </button>
              <button
                type="button"
                className="copilot-quick-btn"
                onClick={() => onSendMessage('Welche Kernfragen oder Thesen werden hier diskutiert?')}
              >
                💡 Wichtigste Erkenntnisse
              </button>
              <button
                type="button"
                className="copilot-quick-btn"
                onClick={() => onSendMessage('Erstelle eine fundierte Deep Research zu diesem Thema.')}
              >
                🔍 Deep Research starten
              </button>
            </div>
          </div>
        ) : (
          <div className="copilot-messages-list">
            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id || idx}
                  className={`copilot-message-row ${isUser ? 'user-row' : 'assistant-row'}`}
                >
                  {!isUser && (
                    <div className="copilot-avatar-circle" title={botName}>
                      <Bot size={13} />
                    </div>
                  )}
                  <div className={`copilot-bubble ${isUser ? 'user' : 'assistant'}`}>
                    {isUser ? (
                      <p className="copilot-text-p">{msg.content}</p>
                    ) : (
                      <RichTextRenderer content={msg.content} />
                    )}
                  </div>
                </div>
              );
            })}
            {busy && (
              <div className="copilot-message-row assistant-row">
                <div className="copilot-avatar-circle spin">
                  <Sparkles size={13} />
                </div>
                <div className="copilot-bubble assistant thinking">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Controls: Model Selector & Glowing Input */}
      <div className="copilot-footer">
        <div className="copilot-model-row">
          <span className="copilot-model-label">Model</span>
          <div className="copilot-model-pill" title={`Active engine: ${modelName}`}>
            <span>{modelName}</span>
            <ChevronDown size={12} />
          </div>
        </div>

        <form className="copilot-input-container" onSubmit={handleSubmit}>
          <button
            type="button"
            className="copilot-input-extra-btn"
            title="Emoji / Tone"
          >
            <Smile size={16} />
          </button>
          <input
            type="text"
            className="copilot-input-field"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask about this page..."
            disabled={busy}
          />
          {busy && onStopChat ? (
            <button
              type="button"
              className="copilot-send-btn stop"
              title="Stop response"
              onClick={onStopChat}
            >
              <StopCircle size={15} />
            </button>
          ) : (
            <button
              type="submit"
              className={`copilot-send-btn ${inputText.trim() ? 'active' : ''}`}
              title="Send (Enter)"
              disabled={!inputText.trim()}
            >
              <span>Send</span>
              <Send size={13} />
            </button>
          )}
        </form>
      </div>
    </aside>
  );
}
