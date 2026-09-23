import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Bot,
  Check,
  CheckSquare,
  ChevronDown,
  Copy,
  Cpu,
  FileText,
  Filter,
  Minus,
  Paperclip,
  Scale,
  Search,
  Send,
  ShieldAlert,
  Smile,
  Sparkles,
  StopCircle,
  Table,
  ThumbsDown,
  ThumbsUp,
  X,
  Zap
} from 'lucide-react';
import type { DesktopChatMessage } from '../bridge.js';
import { RichTextRenderer } from '../NativeRichText.js';
import { AiFeedbackModal } from './AiFeedbackModal.js';
import type { QuickActionChip } from '../quick-actions.js';
import {
  WORKFLOW_TEMPLATES,
  formatWorkflowPrompt,
  type AgenticWorkflowTemplate
} from '../workflow-templates.js';
import { useGeminiAccountStore } from '../stores/useGeminiAccountStore.js';
import { useChatStore } from '../stores/useChatStore.js';
import { brandAssets } from '../brand.js';

export interface AvailableModelItem {
  id: string;
  label: string;
  provider: string;
  category: 'gemini' | 'claude' | 'openai' | 'local' | 'other';
  badge: string;
  badgeClass: string;
  isDefault?: boolean;
}

export const AVAILABLE_MODELS: AvailableModelItem[] = [
  // Google Gemini CLI
  {
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    provider: 'Google',
    category: 'gemini',
    badge: 'Standard • Schnell (CLI)',
    badgeClass: 'gemini',
    isDefault: true
  },
  {
    id: 'gemini-1.5-pro',
    label: 'Gemini 1.5 Pro',
    provider: 'Google',
    category: 'gemini',
    badge: 'Deep Reasoning (CLI)',
    badgeClass: 'gemini'
  },
  {
    id: 'gemini-1.5-flash',
    label: 'Gemini 1.5 Flash',
    provider: 'Google',
    category: 'gemini',
    badge: 'High-Speed (CLI)',
    badgeClass: 'gemini'
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'Google',
    category: 'gemini',
    badge: 'Ultra Reasoning (CLI)',
    badgeClass: 'gemini'
  },

  // Anthropic
  {
    id: 'claude-3-5-sonnet',
    label: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    category: 'claude',
    badge: 'Code & Logik',
    badgeClass: 'claude'
  },
  {
    id: 'claude-3-opus',
    label: 'Claude 3 Opus',
    provider: 'Anthropic',
    category: 'claude',
    badge: 'Komplexe Analyse',
    badgeClass: 'claude'
  },
  {
    id: 'claude-sonnet-4.6',
    label: 'Claude Sonnet 4.6',
    provider: 'Anthropic',
    category: 'claude',
    badge: 'Code & Analyse',
    badgeClass: 'claude'
  },

  // OpenAI
  {
    id: 'gpt-4o',
    label: 'GPT-4o',
    provider: 'OpenAI',
    category: 'openai',
    badge: 'Omni Flaggschiff',
    badgeClass: 'openai'
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o Mini',
    provider: 'OpenAI',
    category: 'openai',
    badge: 'Schnell & Günstig',
    badgeClass: 'openai'
  },
  {
    id: 'gpt-5.5',
    label: 'GPT-5.5',
    provider: 'OpenAI',
    category: 'openai',
    badge: 'Flaggschiff',
    badgeClass: 'openai'
  },

  // Lokale Modelle
  {
    id: 'ollama-local',
    label: 'Ollama / LocalAI',
    provider: 'Lokal',
    category: 'local',
    badge: 'Offline • Privat (11434)',
    badgeClass: 'ollama'
  },
  {
    id: 'llama3.3',
    label: 'Llama 3.3 (70B)',
    provider: 'Ollama',
    category: 'local',
    badge: 'Lokal • Offline',
    badgeClass: 'ollama'
  },

  // Weitere
  {
    id: 'deepseek-reasoner',
    label: 'DeepSeek R1',
    provider: 'DeepSeek',
    category: 'other',
    badge: 'Reasoning',
    badgeClass: 'deepseek'
  }
];

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
  onSelectModel?: (modelId: string) => void;
}

export function CopilotSplitView({
  isOpen,
  onClose,
  onMinimize,
  botName = 'Nova',
  modelName = 'Gemini 3.8 Flash',
  messages,
  busy,
  onSendMessage,
  onStopChat,
  activeUrl,
  activeTitle,
  quickActions,
  onExecuteQuickAction,
  onSelectModel
}: CopilotSplitViewProps): React.JSX.Element | null {
  const [inputText, setInputText] = useState('');
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [workflowsMenuOpen, setWorkflowsMenuOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [workflowCategory, setWorkflowCategory] = useState<string>('all');
  const [workflowSearch, setWorkflowSearch] = useState<string>('');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [copiedMsgIdx, setCopiedMsgIdx] = useState<number | null>(null);
  const [upvotedIndices, setUpvotedIndices] = useState<Set<number>>(new Set());

  const { activeAccount } = useGeminiAccountStore();
  const currentGeminiAccount = activeAccount();
  const { selectedModel, setSelectedModel } = useChatStore();

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const workflowDropdownRef = useRef<HTMLDivElement | null>(null);
  const modelPickerRef = useRef<HTMLDivElement | null>(null);
  const footerModelRef = useRef<HTMLDivElement | null>(null);

  const activeModelId = selectedModel || modelName;
  const activeModelItem = useMemo(() => {
    return (
      AVAILABLE_MODELS.find(
        (m) =>
          m.id === activeModelId ||
          m.label.toLowerCase() === activeModelId.toLowerCase() ||
          activeModelId.toLowerCase().includes(m.id.toLowerCase())
      ) || AVAILABLE_MODELS[0]
    );
  }, [activeModelId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, busy]);

  // Click outside workflow dropdown
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

  // Click outside model picker dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const insideHeader = modelPickerRef.current && modelPickerRef.current.contains(target);
      const insideFooter = footerModelRef.current && footerModelRef.current.contains(target);
      if (!insideHeader && !insideFooter) {
        setModelPickerOpen(false);
      }
    }
    if (modelPickerOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [modelPickerOpen]);

  const filteredWorkflows = useMemo(() => {
    return WORKFLOW_TEMPLATES.filter((tmpl) => {
      const matchesCat = workflowCategory === 'all' || tmpl.category === workflowCategory;
      const matchesSearch = !workflowSearch.trim() ||
        tmpl.title.toLowerCase().includes(workflowSearch.toLowerCase()) ||
        tmpl.description.toLowerCase().includes(workflowSearch.toLowerCase());
      return matchesCat && matchesSearch;
    });
  }, [workflowCategory, workflowSearch]);

  function handleSelectWorkflow(template: AgenticWorkflowTemplate) {
    setWorkflowsMenuOpen(false);
    const prompt = formatWorkflowPrompt(template, activeUrl, activeTitle);
    onSendMessage(prompt);
  }

  function handlePickModel(model: AvailableModelItem) {
    setModelPickerOpen(false);
    setSelectedModel(model.id);
    onSelectModel?.(model.id);
  }

  function renderModelItem(m: AvailableModelItem) {
    const isSelected =
      activeModelItem.id === m.id ||
      modelName.toLowerCase().includes(m.id.toLowerCase()) ||
      (m.id === 'gemini-3.8-flash' && modelName.toLowerCase().includes('gemini'));

    return (
      <button
        key={m.id}
        type="button"
        className={`model-option-item ${isSelected ? 'selected' : ''}`}
        role="menuitem"
        onClick={() => handlePickModel(m)}
      >
        <div className="model-option-left">
          <span className={`model-provider-badge ${m.badgeClass}`}>{m.provider}</span>
          <div className="model-option-text">
            <span className="model-option-name">{m.label}</span>
            <span className="model-option-desc">{m.badge}</span>
          </div>
        </div>
        {isSelected && <Check size={14} className="model-check-icon" />}
      </button>
    );
  }

  function renderModelDropdown(placement: 'header' | 'footer') {
    return (
      <div className={`copilot-model-dropdown ${placement}-dropdown`} role="menu">
        <div className="model-dropdown-header">
          <span className="model-dropdown-title">KI-Modell auswählen</span>
          {currentGeminiAccount ? (
            <span
              className="gemini-account-badge online"
              title={`Verbundenes Google-Konto: ${currentGeminiAccount.email}`}
            >
              <span className="gemini-account-dot online" />
              <span>{currentGeminiAccount.label || currentGeminiAccount.email}</span>
            </span>
          ) : (
            <span className="gemini-account-badge standard">
              <span className="gemini-account-dot" />
              <span>Google CLI Ready</span>
            </span>
          )}
        </div>

        <div className="model-dropdown-list">
          {/* 1. Google Gemini CLI */}
          <div className="model-group-title">
            <span>Google Gemini CLI</span>
            {currentGeminiAccount && (
              <span className="account-tag">({currentGeminiAccount.email})</span>
            )}
          </div>
          {AVAILABLE_MODELS.filter((m) => m.category === 'gemini').map(renderModelItem)}

          {/* 2. Anthropic */}
          <div className="model-group-title">Anthropic</div>
          {AVAILABLE_MODELS.filter((m) => m.category === 'claude').map(renderModelItem)}

          {/* 3. OpenAI */}
          <div className="model-group-title">OpenAI</div>
          {AVAILABLE_MODELS.filter((m) => m.category === 'openai').map(renderModelItem)}

          {/* 4. Lokale Modelle */}
          <div className="model-group-title">Lokale Modelle (Ollama / LocalAI)</div>
          {AVAILABLE_MODELS.filter((m) => m.category === 'local').map(renderModelItem)}

          {/* 5. Weitere Engines */}
          {AVAILABLE_MODELS.some((m) => m.category === 'other') && (
            <>
              <div className="model-group-title">Weitere Engines</div>
              {AVAILABLE_MODELS.filter((m) => m.category === 'other').map(renderModelItem)}
            </>
          )}
        </div>
      </div>
    );
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
    const rawContent = String(content || '');
    const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const parts = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(rawContent)) !== null) {
      if (match.index > lastIndex) {
        parts.push(
          <p key={`text-${lastIndex}`} className="copilot-text-p">
            {rawContent.slice(lastIndex, match.index)}
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
              title="Code kopieren"
              onClick={() => handleCopy(code, snippetId)}
            >
              {copiedCodeId === snippetId ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedCodeId === snippetId ? 'Kopiert' : 'Kopieren'}</span>
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
    <aside className="copilot-split-panel" aria-label={`${botName} AI Workspace (Sidekick AI Copilot)`}>
      {/* Top Header */}
      <div className="copilot-header">
        <div className="copilot-header-brand">
          <div className="copilot-logo-circle">
            <img src={brandAssets.sidekickAvatar} alt="" className="copilot-header-avatar" draggable={false} />
          </div>
          <span className="copilot-header-title">{botName} AI</span>
        </div>
        <div className="copilot-header-actions">
          {/* Universal Model Picker in Header */}
          <div className="copilot-header-model-wrapper" ref={modelPickerRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className={`copilot-header-model-btn ${modelPickerOpen ? 'active' : ''}`}
              title={`KI-Engine: ${activeModelItem.label} • Klicken zum Wechseln`}
              onClick={() => setModelPickerOpen((prev) => !prev)}
              aria-label="KI-Modell auswählen"
              aria-haspopup="menu"
              aria-expanded={modelPickerOpen}
            >
              <Cpu size={12} className="copilot-model-icon" />
              <span className="copilot-header-model-name">{activeModelItem.label}</span>
              <ChevronDown size={11} className={`copilot-chevron-icon ${modelPickerOpen ? 'open' : ''}`} />
            </button>

            {modelPickerOpen && renderModelDropdown('header')}
          </div>

          {/* Workflows Button */}
          <div className="copilot-workflows-wrapper" ref={workflowDropdownRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className={`copilot-workflows-btn ${workflowsMenuOpen ? 'active' : ''}`}
              title={`Agentic Workflows (${WORKFLOW_TEMPLATES.length} Skills)`}
              onClick={() => setWorkflowsMenuOpen((prev) => !prev)}
              aria-label="Agentic Workflows"
              aria-haspopup="menu"
              aria-expanded={workflowsMenuOpen}
            >
              <Zap size={12} className="copilot-zap-icon" />
              <span>Workflows</span>
              <ChevronDown size={11} className={`copilot-chevron-icon ${workflowsMenuOpen ? 'open' : ''}`} />
            </button>

            {workflowsMenuOpen && (
              <div className="copilot-workflows-dropdown" role="menu">
                <div className="copilot-workflows-dropdown-header">
                  <div className="dropdown-title-row">
                    <span className="dropdown-title">⚡ Agentic Workflows</span>
                    <span className="workflow-count-pill">{WORKFLOW_TEMPLATES.length} Skills</span>
                  </div>
                  <span className="dropdown-subtitle">Kuratierte 1-Klick Recherche, Analyse & Code-Workflows</span>

                  {/* Workflow Search input */}
                  <div className="workflow-search-box">
                    <Search size={12} />
                    <input
                      type="text"
                      value={workflowSearch}
                      onChange={(e) => setWorkflowSearch(e.target.value)}
                      placeholder="Workflows durchsuchen..."
                      className="workflow-search-input"
                      autoFocus
                    />
                    {workflowSearch && (
                      <button type="button" className="clear-search-btn" onClick={() => setWorkflowSearch('')}>
                        <X size={11} />
                      </button>
                    )}
                  </div>

                  {/* Category Filter Tabs */}
                  <div className="workflow-category-tabs" role="tablist">
                    {[
                      { id: 'all', label: `Alle (${WORKFLOW_TEMPLATES.length})` },
                      { id: 'research', label: 'Recherche' },
                      { id: 'content', label: 'Content' },
                      { id: 'code', label: 'Engineering' },
                      { id: 'data', label: 'Daten' },
                      { id: 'audit', label: 'Audit' }
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        role="tab"
                        aria-selected={workflowCategory === cat.id}
                        className={`workflow-tab-chip ${workflowCategory === cat.id ? 'active' : ''}`}
                        onClick={() => setWorkflowCategory(cat.id)}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

              <div className="copilot-workflows-list">
                {filteredWorkflows.length === 0 ? (
                  <div className="workflows-empty-search">
                    <span>Keine Workflows für „{workflowSearch}“ gefunden.</span>
                  </div>
                ) : (
                  filteredWorkflows.map((tmpl) => (
                    <button
                      key={tmpl.id}
                      type="button"
                      className="copilot-workflow-item"
                      role="menuitem"
                      onClick={() => handleSelectWorkflow(tmpl)}
                    >
                      <div className="workflow-item-icon">
                        {tmpl.category === 'research' && <Scale size={14} />}
                        {tmpl.category === 'content' && <FileText size={14} />}
                        {tmpl.category === 'code' && <Cpu size={14} />}
                        {tmpl.category === 'data' && <Table size={14} />}
                        {tmpl.category === 'audit' && <ShieldAlert size={14} />}
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
                  ))
                )}
              </div>
            </div>
          )}
          </div>

          {onMinimize && (
            <button
              type="button"
              className="copilot-action-btn"
              title="Minimieren"
              onClick={onMinimize}
            >
              <Minus size={14} />
            </button>
          )}
          <button
            type="button"
            className="copilot-action-btn close"
            title="Schließen"
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
              <img src={brandAssets.sidekickAvatar} alt={botName} className="copilot-empty-avatar" draggable={false} />
            </div>
            <h4>Frag {botName} zur aktuellen Seite</h4>
            <p>
              Erhalte Zusammenfassungen, Übersetzungen, Code-Analysen oder starte
              automatisierte Recherche-Agenten.
            </p>

            {quickActions && quickActions.length > 0 && (
              <div className="copilot-starter-chips">
                {quickActions.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    className="copilot-starter-chip"
                    onClick={() => onExecuteQuickAction?.(chip)}
                  >
                    <span>{chip.icon}</span>
                    <span>{chip.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="copilot-messages-list">
            {messages.map((msg, index) => {
              const isUser = msg.role === 'user';
              const isAssistant = msg.role === 'assistant';

              return (
                <div
                  key={msg.timestamp ? `${msg.timestamp}-${index}` : index}
                  className={`copilot-message-row ${isUser ? 'user-row' : 'assistant-row'}`}
                >
                  {!isUser && (
                    <div className="copilot-avatar-circle" title={botName}>
                      <img src={brandAssets.sidekickAvatar} alt="" className="copilot-msg-avatar" draggable={false} />
                    </div>
                  )}

                  <div className={`copilot-bubble ${isUser ? 'user' : 'assistant'}`}>
                    <div className="copilot-bubble-body">
                      {isAssistant ? (
                        <RichTextRenderer content={msg.content || ''} text={msg.content || ''} />
                      ) : (
                        renderMessageContent(msg.content || '', index)
                      )}
                    </div>

                    {isAssistant && (
                      <div className="copilot-msg-actions-bar">
                        <button
                          type="button"
                          className="msg-action-icon-btn"
                          title="Nachricht kopieren"
                          onClick={() => {
                            navigator.clipboard.writeText(msg.content || '').catch(() => {});
                            setCopiedMsgIdx(index);
                            setTimeout(() => setCopiedMsgIdx(null), 1800);
                          }}
                        >
                          {copiedMsgIdx === index ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                        <button
                          type="button"
                          className={`msg-action-icon-btn ${upvotedIndices.has(index) ? 'voted' : ''}`}
                          title="Gute Antwort (Upvote)"
                          onClick={() => {
                            setUpvotedIndices((prev) => {
                              const next = new Set(prev);
                              if (next.has(index)) next.delete(index);
                              else next.add(index);
                              return next;
                            });
                          }}
                        >
                          <ThumbsUp size={12} />
                        </button>
                        <button
                          type="button"
                          className="msg-action-icon-btn"
                          title="Problem melden (Feedback)"
                          onClick={() => setFeedbackMessage(msg.content || '')}
                        >
                          <ThumbsDown size={12} />
                        </button>
                      </div>
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

      {/* Bottom Controls: Dynamic Model Selector & Input */}
      <div className="copilot-footer">
        <div className="copilot-model-row" ref={footerModelRef} style={{ position: 'relative' }}>
          <span className="copilot-model-label">Modell:</span>
          <div
            className={`copilot-model-pill ${modelPickerOpen ? 'open' : ''}`}
            title={`Aktive KI-Engine: ${activeModelItem.label} • Klicken zum Wechseln`}
            onClick={() => setModelPickerOpen((prev) => !prev)}
            role="button"
            tabIndex={0}
            aria-label="KI-Modell auswählen"
          >
            <span className="model-pill-text">{activeModelItem.label}</span>
            <ChevronDown size={12} className={`model-chevron ${modelPickerOpen ? 'open' : ''}`} />
          </div>

          {/* Model Selector Dropdown */}
          {modelPickerOpen && renderModelDropdown('footer')}
        </div>

        <form className="copilot-input-container" onSubmit={handleSubmit}>
          <button
            type="button"
            className="copilot-input-extra-btn"
            title="Tonalität & Prompts"
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
              title="Antwort stoppen"
              onClick={onStopChat}
            >
              <StopCircle size={15} />
            </button>
          ) : (
            <button
              type="submit"
              className={`copilot-send-btn ${inputText.trim() ? 'active' : ''}`}
              title="Senden (Enter)"
              disabled={!inputText.trim()}
            >
              <span>Senden</span>
              <Send size={13} />
            </button>
          )}
        </form>
      </div>

      <AiFeedbackModal
        open={Boolean(feedbackMessage)}
        messageContent={feedbackMessage || ''}
        onClose={() => setFeedbackMessage(null)}
      />
    </aside>
  );
}
