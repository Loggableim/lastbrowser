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
  History,
  Minus,
  Paperclip,
  Plus,
  Scale,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Smile,
  Sparkles,
  StopCircle,
  Table,
  Target,
  ThumbsDown,
  ThumbsUp,
  Users,
  X,
  Zap
} from 'lucide-react';
import type { DesktopChatMessage } from '../bridge.js';
import type { DesktopSessionSummary } from '../sidekick-client.js';
import { RichTextRenderer } from '../NativeRichText.js';
import { AiFeedbackModal } from './AiFeedbackModal.js';
import { TeamworkProcessCard, type TeamworkMetadata } from './TeamworkProcessCard.js';
import { SmartTrackProcessCard } from './SmartTrackProcessCard.js';
import type { QuickActionChip } from '../quick-actions.js';
import {
  WORKFLOW_TEMPLATES,
  formatWorkflowPrompt,
  type AgenticWorkflowTemplate
} from '../workflow-templates.js';
import { useGeminiAccountStore } from '../stores/useGeminiAccountStore.js';
import { useChatStore } from '../stores/useChatStore.js';
import { brandAssets } from '../brand.js';
import { useDesktopI18n } from '../i18n.js';

export interface AvailableModelItem {
  id: string;
  label: string;
  provider: string;
  category: 'gemini' | 'claude' | 'openai' | 'local' | 'teamwork' | 'other';
  badge: string;
  badgeClass: string;
  isDefault?: boolean;
  remainingPercent?: number;
  remainingFraction?: number;
  account?: string;
}

export const AVAILABLE_MODELS: AvailableModelItem[] = [
  // Teamwork Multi-Agent Orchestrator
  {
    id: 'teamwork',
    label: '🤝 Teamwork (Multi-Agent)',
    provider: 'Orchestrator',
    category: 'teamwork',
    badge: 'Multi-Agent • Konsens & Debatte',
    badgeClass: 'teamwork',
    isDefault: false
  },
  // Smart Track Single-Track Orchestrator
  {
    id: 'smart-track-low',
    label: '🎯 Smart Track (Low)',
    provider: 'Orchestrator',
    category: 'teamwork',
    badge: 'Max. Ersparnis • Schnelle Modelle',
    badgeClass: 'teamwork',
    isDefault: false
  },
  {
    id: 'smart-track-medium',
    label: '🎯 Smart Track (Medium)',
    provider: 'Orchestrator',
    category: 'teamwork',
    badge: 'Ausgewogen • Optimiert für Alltag & Code',
    badgeClass: 'teamwork',
    isDefault: false
  },
  {
    id: 'smart-track-high',
    label: '🎯 Smart Track (High)',
    provider: 'Orchestrator',
    category: 'teamwork',
    badge: 'Maximale Tiefe • Reasoning & Vorplanung',
    badgeClass: 'teamwork',
    isDefault: false
  },
  // Google Gemini CLI
  {
    id: 'gemini-2.5-flash',
    label: 'Gemini 2.5 Flash',
    provider: 'Google',
    category: 'gemini',
    badge: 'Standard • Schnell (CLI)',
    badgeClass: 'gemini',
    isDefault: true
  },
  {
    id: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    provider: 'Google',
    category: 'gemini',
    badge: 'Ultra Reasoning (CLI)',
    badgeClass: 'gemini'
  },
  {
    id: 'gemini-2.5-flash-lite',
    label: 'Gemini 2.5 Flash Lite',
    provider: 'Google',
    category: 'gemini',
    badge: 'High-Speed (CLI)',
    badgeClass: 'gemini'
  },
  {
    id: 'gemini-2.0-flash',
    label: 'Gemini 2.0 Flash',
    provider: 'Google',
    category: 'gemini',
    badge: 'Effizient & Schnell (CLI)',
    badgeClass: 'gemini'
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

  // Lokale & Cloud-Ollama Modelle
  {
    id: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    provider: 'Ollama Cloud',
    category: 'local',
    badge: 'Ollama Cloud • Fast Reasoning',
    badgeClass: 'ollama'
  },
  {
    id: 'qwen3:32b',
    label: 'Qwen 3 (32B)',
    provider: 'Ollama Cloud',
    category: 'local',
    badge: 'Ollama Cloud • Code & Chat',
    badgeClass: 'ollama'
  },
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
  onNewChat?: () => void;
  sessions?: DesktopSessionSummary[];
  activeSessionId?: string | null;
  onSelectSession?: (sessionId: string) => void;
  onOpenSettings?: (section?: string) => void;
}

export function CopilotSplitView({
  isOpen,
  onClose,
  onMinimize,
  botName = 'Nova',
  modelName = 'Gemini 2.5 Flash',
  messages,
  busy,
  onSendMessage,
  onStopChat,
  activeUrl,
  activeTitle,
  quickActions,
  onExecuteQuickAction,
  onSelectModel,
  onNewChat,
  sessions = [],
  activeSessionId = null,
  onSelectSession,
  onOpenSettings
}: CopilotSplitViewProps): React.JSX.Element | null {
  const { t } = useDesktopI18n();
  const [inputText, setInputText] = useState('');
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [workflowsMenuOpen, setWorkflowsMenuOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [historyMenuOpen, setHistoryMenuOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [workflowCategory, setWorkflowCategory] = useState<string>('all');
  const [workflowSearch, setWorkflowSearch] = useState<string>('');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [copiedMsgIdx, setCopiedMsgIdx] = useState<number | null>(null);
  const [upvotedIndices, setUpvotedIndices] = useState<Set<number>>(new Set());

  const { activeAccount } = useGeminiAccountStore();
  const currentGeminiAccount = activeAccount();
  const { selectedModel, setSelectedModel } = useChatStore();

  const [modelList, setModelList] = useState<AvailableModelItem[]>(AVAILABLE_MODELS);

  // Phase 13.6: Dynamic live discovery via /api/models with quota status
  useEffect(() => {
    let alive = true;
    async function loadLiveModels() {
      try {
        if (!window?.lastbrowser?.sidekick?.requestWebui) return;
        const res = (await window.lastbrowser.sidekick.requestWebui({
          method: 'GET',
          path: '/api/models'
        })) as { groups?: Array<{ provider_id?: string; provider?: string; account?: string; models?: Array<any> }> } | null;
        if (!alive || !res || !Array.isArray(res.groups)) return;

        const dynamicModels: AvailableModelItem[] = [];

        for (const g of res.groups) {
          const pid = (g.provider_id || g.provider || '').toLowerCase();
          const gAccount = g.account || (pid.includes('gemini') || pid.includes('google') ? currentGeminiAccount?.email : undefined);

          let category: 'gemini' | 'claude' | 'openai' | 'local' | 'other' = 'other';
          let providerLabel = g.provider || pid;
          let badgeClass = 'other';

          if (pid.includes('gemini') || pid.includes('google')) {
            category = 'gemini';
            providerLabel = 'Google';
            badgeClass = 'gemini';
          } else if (pid.includes('ollama')) {
            category = 'local';
            providerLabel = pid.includes('cloud') ? 'Ollama Cloud' : 'Ollama';
            badgeClass = 'ollama';
          } else if (pid.includes('claude') || pid.includes('anthropic')) {
            category = 'claude';
            providerLabel = 'Anthropic';
            badgeClass = 'claude';
          } else if (pid.includes('openai') || pid.includes('codex')) {
            category = 'openai';
            providerLabel = 'OpenAI';
            badgeClass = 'openai';
          } else if (pid.includes('deepseek')) {
            category = 'other';
            providerLabel = 'DeepSeek';
            badgeClass = 'deepseek';
          }

          for (const m of g.models || []) {
            const rawId = String(m.id || '');
            const cleanId = rawId.startsWith('@') && rawId.includes(':') ? rawId.split(':')[1] : rawId;
            const pct = typeof m.remaining_percent === 'number' ? m.remaining_percent : undefined;
            const frac = typeof m.remaining_fraction === 'number' ? m.remaining_fraction : undefined;
            const account = m.account || gAccount;
            const badge = pct !== undefined
              ? `${pct}% Kontingent verfügbar`
              : (pid.includes('cloud') ? 'Ollama Cloud' : (category === 'gemini' ? 'Live Quota Discovery' : providerLabel));

            dynamicModels.push({
              id: cleanId,
              label: m.label || cleanId,
              provider: providerLabel,
              category,
              badge,
              badgeClass,
              remainingPercent: pct,
              remainingFraction: frac,
              account,
              isDefault: cleanId === 'gemini-2.5-flash'
            });
          }
        }

        if (dynamicModels.length > 0) {
          setModelList((prev) => {
            const dynamicCategories = new Set(dynamicModels.map((m) => m.category));
            const fallbacks = AVAILABLE_MODELS.filter(
              (req) => !dynamicCategories.has(req.category) && !dynamicModels.some((d) => d.id === req.id)
            );
            return [...dynamicModels, ...fallbacks];
          });
        }
      } catch {
        // Retain baseline AVAILABLE_MODELS on offline/network errors
      }
    }
    void loadLiveModels();
    return () => {
      alive = false;
    };
  }, [currentGeminiAccount]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const workflowDropdownRef = useRef<HTMLDivElement | null>(null);
  const modelPickerRef = useRef<HTMLDivElement | null>(null);
  const footerModelRef = useRef<HTMLDivElement | null>(null);
  const historyDropdownRef = useRef<HTMLDivElement | null>(null);

  const activeModelId = selectedModel || modelName;
  const activeModelItem = useMemo(() => {
    return (
      modelList.find(
        (m) =>
          m.id === activeModelId ||
          m.label.toLowerCase() === activeModelId.toLowerCase() ||
          activeModelId.toLowerCase().includes(m.id.toLowerCase())
      ) || modelList[0] || AVAILABLE_MODELS[0]
    );
  }, [activeModelId, modelList]);

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

  // Click outside history dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (historyDropdownRef.current && !historyDropdownRef.current.contains(event.target as Node)) {
        setHistoryMenuOpen(false);
      }
    }
    if (historyMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [historyMenuOpen]);

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    if (!historySearch.trim()) return sessions;
    const q = historySearch.toLowerCase();
    return sessions.filter((s) => (s.title || '').toLowerCase().includes(q));
  }, [sessions, historySearch]);

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
      (m.id === 'gemini-2.5-flash' && modelName.toLowerCase().includes('gemini'));

    const quotaBadge =
      m.remainingPercent !== undefined ? (
        <span className={`quota-percent-pill ${m.remainingPercent < 20 ? 'low' : 'ok'}`}>
          {m.remainingPercent}% Quota
        </span>
      ) : null;

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
            <div className="model-name-row">
              <span className="model-option-name">{m.label}</span>
              {quotaBadge}
            </div>
            <span className="model-option-desc">
              {m.remainingPercent !== undefined
                ? `${m.remainingPercent}% Kontingent verfügbar${m.account ? ` (${m.account})` : ''}`
                : m.badge}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {(m.id === 'teamwork' || m.id.startsWith('smart-track')) && onOpenSettings && (
            <span
              role="button"
              tabIndex={0}
              title="Orchestrierungs-Einstellungen öffnen"
              className="model-option-settings-btn"
              style={{
                padding: '3px 6px',
                borderRadius: '4px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                background: 'rgba(255,255,255,0.06)'
              }}
              onClick={(e) => {
                e.stopPropagation();
                setModelPickerOpen(false);
                onOpenSettings('teamwork');
              }}
            >
              <Settings size={13} style={{ marginRight: '3px' }} />
              <span style={{ fontSize: '0.72rem' }}>Setup</span>
            </span>
          )}
          {isSelected && <Check size={14} className="model-check-icon" />}
        </div>
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
          {/* 0. Multi-Agent Teamwork */}
          {modelList.some((m) => m.category === 'teamwork') && (
            <>
              <div className="model-group-title">
                <span>Multi-Agent Orchestrator</span>
                <span className="account-tag" style={{ color: 'var(--accent, #6366f1)' }}>(Konsens & Debatte)</span>
              </div>
              {modelList.filter((m) => m.category === 'teamwork').map(renderModelItem)}
            </>
          )}

          {/* 1. Google Gemini CLI */}
          <div className="model-group-title">
            <span>Google Gemini CLI</span>
            {currentGeminiAccount && (
              <span className="account-tag">({currentGeminiAccount.email})</span>
            )}
          </div>
          {modelList.filter((m) => m.category === 'gemini').map(renderModelItem)}

          {/* 2. Anthropic */}
          <div className="model-group-title">Anthropic</div>
          {modelList.filter((m) => m.category === 'claude').map(renderModelItem)}

          {/* 3. OpenAI */}
          <div className="model-group-title">OpenAI</div>
          {modelList.filter((m) => m.category === 'openai').map(renderModelItem)}

          {/* 4. Lokale Modelle */}
          <div className="model-group-title">Lokale Modelle (Ollama / LocalAI)</div>
          {modelList.filter((m) => m.category === 'local').map(renderModelItem)}

          {/* 5. Weitere Engines */}
          {modelList.some((m) => m.category === 'other') && (
            <>
              <div className="model-group-title">Weitere Engines</div>
              {modelList.filter((m) => m.category === 'other').map(renderModelItem)}
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
    <aside className="copilot-split-panel" aria-label={`${botName} AI Workspace`}>
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

          {activeModelItem.id === 'teamwork' && onOpenSettings && (
            <button
              type="button"
              className="copilot-action-btn"
              title="Teamwork & Agenten-Einstellungen öffnen"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '3px 7px', color: 'var(--accent, #6366f1)' }}
              onClick={() => onOpenSettings('teamwork')}
            >
              <Settings size={12} />
              <span style={{ fontSize: '0.73rem' }}>Team-Setup</span>
            </button>
          )}

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

          {/* New Chat Button */}
          {onNewChat && (
            <button
              type="button"
              className="copilot-action-btn copilot-new-chat-btn"
              title={t('sidebar.drawer.newChat')}
              onClick={onNewChat}
            >
              <Plus size={13} />
              <span>{t('common.add')}</span>
            </button>
          )}

          {/* Session History Dropdown */}
          {sessions && sessions.length > 0 && (
            <div className="copilot-history-wrapper" ref={historyDropdownRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className={`copilot-action-btn ${historyMenuOpen ? 'active' : ''}`}
                title={`Chat-Historie (${sessions.length} Chats)`}
                onClick={() => setHistoryMenuOpen((prev) => !prev)}
                aria-label="Chat-Historie"
                aria-haspopup="menu"
                aria-expanded={historyMenuOpen}
              >
                <History size={13} />
              </button>

              {historyMenuOpen && (
                <div className="copilot-history-dropdown" role="menu">
                  <div className="history-dropdown-header">
                    <span className="history-dropdown-title">Chat-Historie</span>
                    <button
                      type="button"
                      className="history-new-btn"
                      onClick={() => {
                        setHistoryMenuOpen(false);
                        onNewChat?.();
                      }}
                      title={t('sidebar.drawer.newChat')}
                    >
                      <Plus size={11} />
                      <span>{t('common.add')}</span>
                    </button>
                  </div>

                  <div className="history-search-box">
                    <Search size={11} />
                    <input
                      type="text"
                      placeholder={t('chat.filterPlaceholder')}
                      value={historySearch}
                      onChange={(e) => setHistorySearch(e.target.value)}
                      className="history-search-input"
                      autoFocus
                    />
                    {historySearch && (
                      <button type="button" className="clear-search-btn" onClick={() => setHistorySearch('')}>
                        <X size={10} />
                      </button>
                    )}
                  </div>

                  <div className="history-items-list">
                    {filteredSessions.length === 0 ? (
                      <div className="history-empty-search">
                        <span>{t('chat.noSessions')}</span>
                      </div>
                    ) : (
                      filteredSessions.map((s) => {
                        const isCurrent = s.session_id === activeSessionId;
                        return (
                          <button
                            key={s.session_id}
                            type="button"
                            className={`history-session-item ${isCurrent ? 'active' : ''}`}
                            onClick={() => {
                              setHistoryMenuOpen(false);
                              onSelectSession?.(s.session_id);
                            }}
                          >
                            <div className="history-session-info">
                              <span className="history-session-title">
                                {s.title || 'Chat ohne Titel'}
                              </span>
                              <span className="history-session-time">
                                {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : ''}
                              </span>
                            </div>
                            {isCurrent && <Check size={12} className="history-check-icon" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {onMinimize && (
            <button
              type="button"
              className="copilot-action-btn"
              title={t('common.hide')}
              onClick={onMinimize}
            >
              <Minus size={14} />
            </button>
          )}
          <button
            type="button"
            className="copilot-action-btn close"
            title={t('common.close')}
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
                      {isAssistant && msg.teamwork && (
                        <TeamworkProcessCard metadata={msg.teamwork as TeamworkMetadata} />
                      )}
                      {isAssistant && msg.smartTrack && (
                        <SmartTrackProcessCard metadata={msg.smartTrack} />
                      )}
                      {isAssistant && msg.pending && activeModelItem.id === 'teamwork' && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '4px 10px', borderRadius: '6px', background: 'rgba(99, 102, 241, 0.12)', color: 'var(--accent, #6366f1)', fontSize: '0.78rem', marginBottom: '0.5rem', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                          <Users size={13} className="spin" />
                          <span>Teamwork aktiv: Subagenten debattieren & prüfen...</span>
                        </div>
                      )}
                      {isAssistant && msg.pending && activeModelItem.id.startsWith('smart-track') && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '4px 10px', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6', fontSize: '0.78rem', marginBottom: '0.5rem', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
                          <Target size={13} className="spin" />
                          <span>Smart Track aktiv: Kuriertes Modell wird gestartet...</span>
                        </div>
                      )}
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
            placeholder={t('chat.composerPlaceholder')} /* Ask about this page... */
            disabled={busy}
          />
          {busy && onStopChat ? (
            <button
              type="button"
              className="copilot-send-btn stop"
              title={t('chat.stop')}
              onClick={onStopChat}
            >
              <StopCircle size={15} />
            </button>
          ) : (
            <button
              type="submit"
              className={`copilot-send-btn ${inputText.trim() ? 'active' : ''}`}
              title={t('chat.send')}
              disabled={!inputText.trim()}
            >
              <span>{t('chat.send')}</span>
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
