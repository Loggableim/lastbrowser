import React, { useState, useEffect, useMemo, useRef, useSyncExternalStore, FormEvent } from 'react';
import {
  Puzzle,
  Sparkles,
  Shield,
  Cpu,
  Layers,
  Globe,
  FolderOpen,
  Plus,
  Trash2,
  ExternalLink,
  Check,
  CheckCircle2,
  X,
  Search,
  Sliders,
  RefreshCw
} from 'lucide-react';
import { usePanelStore } from '../stores/usePanelStore.js';
import type { ExtensionRecord, ExtensionPreset } from '../../main/extensions.js';
import { McpHubStateModel } from './mcp-hub-state.js';
import { BUILTIN_SKILLS_STORAGE_KEY, BUILTIN_SKILLS_CHANGED_EVENT } from '../terminal-feature.js';
import { useOptionalAiPolicy } from '../optional-ai-policy.js';
import { useDesktopI18n } from '../i18n.js';
import './extension-hub.css';
import { shellText } from '../i18n/shell-text.js';

export type McpPermissionType =
  | 'read_only'
  | 'filesystem_write'
  | 'terminal_execute'
  | 'network_outbound'
  | 'agent_autonomy';

export interface McpSkillItem {
  id: string;
  name: string;
  description: string;
  category: 'system' | 'ai' | 'research' | 'code' | 'design';
  icon: string;
  workspaceScope: 'all' | 'coding' | 'recherche' | 'design';
  permissions: McpPermissionType[];
  autoApprove: boolean;
  enabled: boolean;
  type: 'builtin' | 'mcp_server';
  serverType?: 'stdio' | 'sse' | 'http';
  endpoint?: string;
}

const BUILTIN_SKILL_ENGLISH: Record<string, { name: string; description: string }> = {
  'mcp-terminal': {
    name: 'Terminal Executor',
    description: 'Runs shell commands, CLI tools (node, python, git), and sidekick doctor in the native pseudo-terminal.'
  },
  'mcp-supermemory': {
    name: 'Memory & knowledge',
    description: 'Review preferences, facts, and documents. Cloud search only after separate consent.'
  },
  'mcp-scraper': {
    name: 'Deep Web Scraper',
    description: 'Cleans web DOMs of cookies and trackers, extracts articles as Markdown, and parses HTML tables to CSV.'
  },
  'mcp-devtools': {
    name: 'DevTools & CDP Inspector',
    description: 'Direct Chrome DevTools Protocol access for live inspection of the webview DOM, CSS, and console logs.'
  },
  'mcp-comfyui': {
    name: 'ComfyUI Image Generation',
    description: 'Generates and edits images through local or remote ComfyUI / Stable Diffusion REST pipelines.'
  },
  'mcp-fs': {
    name: 'File System Automator',
    description: 'Reads and writes project files, migrates configuration, and manages local workspace file trees.'
  }
};

export function terminalSkillDisplayName(platform: string): string {
  return /^win/i.test(platform) ? 'ConPTY Terminal Executor' : 'Terminal Executor';
}

export const BUILTIN_MCP_SKILLS: McpSkillItem[] = [
  {
    id: 'mcp-terminal',
    name: 'Terminal Executor',
    description: 'Führt Shell-Befehle, CLI-Tools (node, python, git) und sidekick doctor im nativen Pseudo-Terminal aus.',
    category: 'system',
    icon: '💻',
    workspaceScope: 'coding',
    permissions: ['terminal_execute', 'filesystem_write'],
    autoApprove: false,
    enabled: false,
    type: 'builtin'
  },
  {
    id: 'mcp-supermemory',
    name: 'Gedächtnis & Wissen',
    description: 'Vorlieben, Fakten und Dokumente kontrollieren. Cloud-Suche nur nach separater Zustimmung.',
    category: 'research',
    icon: '🧠',
    workspaceScope: 'recherche',
    permissions: ['read_only', 'filesystem_write'],
    autoApprove: true,
    enabled: false,
    type: 'builtin'
  },
  {
    id: 'mcp-scraper',
    name: 'Deep Web Scraper',
    description: 'Bereinigt Web-DOMs von Cookies/Trackern, extrahiert Artikel als Markdown und parst HTML-Tabellen zu CSV.',
    category: 'research',
    icon: '🌐',
    workspaceScope: 'recherche',
    permissions: ['read_only', 'network_outbound'],
    autoApprove: true,
    enabled: true,
    type: 'builtin'
  },
  {
    id: 'mcp-devtools',
    name: 'DevTools & CDP Inspector',
    description: 'Direkte Chrome DevTools Protocol Anbindung zur Live-Inspektion von Webview-DOM, CSS und Console Logs.',
    category: 'code',
    icon: '🔍',
    workspaceScope: 'coding',
    permissions: ['read_only'],
    autoApprove: true,
    enabled: true,
    type: 'builtin'
  },
  {
    id: 'mcp-comfyui',
    name: 'ComfyUI Image Generation',
    description: 'Generiert und editiert Bilder über lokale oder remote ComfyUI / Stable Diffusion REST API-Pipelines.',
    category: 'design',
    icon: '🎨',
    workspaceScope: 'design',
    permissions: ['network_outbound', 'agent_autonomy'],
    autoApprove: false,
    enabled: true,
    type: 'builtin'
  },
  {
    id: 'mcp-fs',
    name: 'File System Automator',
    description: 'Liest und schreibt Projektdateien, migriert Konfigurationen und verwaltet lokale Workspace-Dateibäume.',
    category: 'system',
    icon: '📁',
    workspaceScope: 'coding',
    permissions: ['read_only', 'filesystem_write'],
    autoApprove: false,
    enabled: true,
    type: 'builtin'
  }
];

export const MCP_PERMISSION_LABELS: Record<McpPermissionType, { label: string; icon: string; level: 'safe' | 'warn' | 'danger' }> = {
  read_only: { label: 'read_only', icon: '🛡️', level: 'safe' },
  filesystem_write: { label: 'filesystem_write', icon: '⚠️', level: 'warn' },
  terminal_execute: { label: 'terminal_execute', icon: '🚨', level: 'danger' },
  network_outbound: { label: 'network_outbound', icon: '🌐', level: 'warn' },
  agent_autonomy: { label: 'agent_autonomy', icon: '🤖', level: 'warn' }
};

export interface UnifiedExtensionHubProps {
  open: boolean;
  onClose: () => void;
  activeSpace?: string;
}

export function UnifiedExtensionHub({
  open,
  onClose,
  activeSpace
}: UnifiedExtensionHubProps): React.JSX.Element | null {
  const optional = useOptionalAiPolicy(`${activeSpace || ''}:${open}`);
  const { locale } = useDesktopI18n();
  const openPanel = (panel: 'skills' | 'memory' | 'agents' | 'profiles' | 'kanban' | 'task-center') => {
    usePanelStore.getState().setActivePanel(panel);
    onClose();
  };
  const {
    extensionHubTab,
    setExtensionHubTab
  } = usePanelStore();

  const [activePillar, setActivePillar] = useState<'webextensions' | 'skills' | 'mcp'>(extensionHubTab || 'webextensions');
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'beta'>('all');
  const [extensions, setExtensions] = useState<ExtensionRecord[]>([]);
  const [presets, setPresets] = useState<ExtensionPreset[]>([]);
  const [cwsInput, setCwsInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);

  // Pillar 2 (MCP Skills) state
  const [builtinSkills, setBuiltinSkills] = useState<McpSkillItem[]>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(BUILTIN_SKILLS_STORAGE_KEY) || 'null');
      if (Array.isArray(stored)) {
        const savedBuiltins = stored.filter((item): item is McpSkillItem => item && typeof item === 'object'
          && (item as McpSkillItem).type === 'builtin');
        if (savedBuiltins.length) return BUILTIN_MCP_SKILLS.map(defaults => {
          const saved = savedBuiltins.find(item => item.id === defaults.id);
          return saved ? { ...defaults, ...saved, id: defaults.id, type: defaults.type } : defaults;
        });
      }
    } catch {}
    return BUILTIN_MCP_SKILLS;
  });
  const [mcpModel] = useState(() => new McpHubStateModel(window.lastbrowser.mcp));
  const mcp = useSyncExternalStore(mcpModel.subscribe, mcpModel.getSnapshot);
  const skills = useMemo<McpSkillItem[]>(() => [
    ...builtinSkills.map(skill => skill.id === 'mcp-supermemory' ? { ...skill, enabled: optional.loaded && optional.policy.enabled } : skill),
    ...mcp.servers.map((server): McpSkillItem => {
      const name = String(server.name || '');
      const transport = server.transport === 'stdio' ? 'stdio' : server.transport === 'sse' ? 'sse' : 'http';
      return {
        id: `mcp-ext-${name}`,
        name: `MCP: ${name}`,
        description: `${server.status === 'active' ? 'Verbunden' : server.enabled === false ? 'Deaktiviert' : 'Konfiguriert'} · Bekannte Werkzeuge: ${Number(server.tool_count || 0)}`,
        category: 'system',
        icon: transport === 'stdio' ? '⚙️' : '🌐',
        workspaceScope: 'all',
        permissions: [],
        autoApprove: false,
        enabled: server.enabled === true,
        type: 'mcp_server',
        serverType: transport
      };
    })
  ], [builtinSkills, mcp.servers, optional.loaded, optional.policy.enabled]);
  const [skillSearch, setSkillSearch] = useState('');
  const [skillWorkspaceFilter, setSkillWorkspaceFilter] = useState<'all' | 'coding' | 'recherche' | 'design'>('all');

  const [extensionScopes, setExtensionScopes] = useState<Record<string, 'all' | 'coding' | 'recherche' | 'design'>>(() => {
    try {
      const stored = localStorage.getItem('lastbrowser.extension_scopes.v1');
      if (stored) return JSON.parse(stored);
    } catch {}
    return {};
  });

  const [showMcpConfig, setShowMcpConfig] = useState(false);

  // Sync tab with store
  useEffect(() => {
    if (extensionHubTab) {
      setActivePillar(current => extensionHubTab === 'skills' && current === 'mcp' ? 'mcp' : extensionHubTab);
    }
  }, [extensionHubTab]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const nodes = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]') || [])]
        .filter(node => node.getClientRects().length > 0);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [open]);

  const loadExtensionData = async () => {
    try {
      if (window.lastbrowser?.extensions) {
        setLoading(true);
        const [extList, presetList] = await Promise.all([
          window.lastbrowser.extensions.list(),
          window.lastbrowser.extensions.presets()
        ]);
        setExtensions(extList || []);
        setPresets(presetList || []);
      }
    } catch (err) {
      console.error('Failed to load extensions in Hub:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadExtensionData();
      void mcpModel.load();
    }
    return mcpModel.dispose;
  }, [open, mcpModel]);

  // Persist skills state
  const updateSkill = (id: string, updates: Partial<McpSkillItem>) => {
    if (id === 'mcp-supermemory') {
      if (typeof updates.enabled === 'boolean') void optional.update({ enabled: updates.enabled });
      return;
    }
    if (id.startsWith('mcp-ext-') && typeof updates.enabled === 'boolean') {
      void mcpModel.toggle(id.slice('mcp-ext-'.length), updates.enabled);
      return;
    }
    setBuiltinSkills((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...updates } : s));
      try {
        localStorage.setItem(BUILTIN_SKILLS_STORAGE_KEY, JSON.stringify(next));
        queueMicrotask(() => window.dispatchEvent(new Event(BUILTIN_SKILLS_CHANGED_EVENT)));
      } catch {}
      return next;
    });
  };

  const notify = (text: string, error = false) => {
    setFeedback({ text, error });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleUpdateExtensionScope = (extId: string, scope: 'all' | 'coding' | 'recherche' | 'design') => {
    setExtensionScopes((prev) => {
      const next = { ...prev, [extId]: scope };
      try {
        localStorage.setItem('lastbrowser.extension_scopes.v1', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleApplyMcpConfig = () => { void mcpModel.save(); };
  const importLegacyMcpDraft = () => {
    try {
      const draft = localStorage.getItem('lastbrowser.mcp_config.v1');
      if (draft) mcpModel.setEditor(draft);
      else notify(shellText(locale, "Kein älterer lokaler MCP-Entwurf vorhanden.", "No older local MCP draft was found."));
    } catch { notify('Lokaler MCP-Entwurf konnte nicht gelesen werden.', true); }
  };

  // Preset install
  const handleInstallPreset = async (preset: ExtensionPreset) => {
    setInstallingId(preset.id);
    try {
      await window.lastbrowser.extensions.installCws(preset.cwsId);
      notify(`Erweiterung "${preset.name}" erfolgreich installiert!`);
      await loadExtensionData();
    } catch (err) {
      notify(`Installation von ${preset.name} fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`, true);
    } finally {
      setInstallingId(null);
    }
  };

  // CWS Direct Install
  const handleInstallCws = async (e: FormEvent) => {
    e.preventDefault();
    if (!cwsInput.trim()) return;
    setInstallingId('cws-custom');
    try {
      const rec = await window.lastbrowser.extensions.installCws(cwsInput.trim());
      notify(`"${rec.name}" aus dem Chrome Web Store installiert!`);
      setCwsInput('');
      await loadExtensionData();
    } catch (err) {
      notify(`CWS Installation fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`, true);
    } finally {
      setInstallingId(null);
    }
  };

  // Unpacked Install
  const handleInstallUnpacked = async () => {
    try {
      const dir = await window.lastbrowser.extensions.chooseDir();
      if (!dir) return;
      setInstallingId('unpacked');
      const rec = await window.lastbrowser.extensions.installUnpacked(dir);
      notify(`Entpackte Erweiterung "${rec.name}" erfolgreich geladen!`);
      await loadExtensionData();
    } catch (err) {
      notify(shellText(locale, `Fehler beim Laden: ${err instanceof Error ? err.message : String(err)}`, `Load failed: ${err instanceof Error ? err.message : String(err)}`), true);
    } finally {
      setInstallingId(null);
    }
  };

  // Toggle Extension
  const handleToggleExtension = async (ext: ExtensionRecord) => {
    try {
      await window.lastbrowser.extensions.toggle({ id: ext.id, enabled: !ext.enabled });
      await loadExtensionData();
    } catch (err) {
      notify(shellText(locale, `Fehler beim Umschalten: ${err instanceof Error ? err.message : String(err)}`, `Could not toggle: ${err instanceof Error ? err.message : String(err)}`), true);
    }
  };

  // Toggle Incognito
  const handleToggleIncognito = async (ext: ExtensionRecord) => {
    try {
      await window.lastbrowser.extensions.toggleIncognito({ id: ext.id, allow: !ext.allowInIncognito });
      await loadExtensionData();
    } catch (err) {
      notify(shellText(locale, `Fehler bei Inkognito-Freigabe: ${err instanceof Error ? err.message : String(err)}`, `Incognito permission failed: ${err instanceof Error ? err.message : String(err)}`), true);
    }
  };

  // Remove Extension
  const handleRemoveExtension = async (ext: ExtensionRecord) => {
    if (!window.confirm(`Erweiterung "${ext.name}" wirklich deinstallieren?`)) return;
    try {
      await window.lastbrowser.extensions.remove(ext.id);
      notify(`"${ext.name}" entfernt.`);
      await loadExtensionData();
    } catch (err) {
      notify(shellText(locale, `Fehler beim Entfernen: ${err instanceof Error ? err.message : String(err)}`, `Could not remove: ${err instanceof Error ? err.message : String(err)}`), true);
    }
  };

  const filteredSkills = useMemo(() => {
    return skills.filter((s) => {
      const matchesSearch =
        !skillSearch.trim() ||
        s.name.toLowerCase().includes(skillSearch.toLowerCase()) ||
        s.description.toLowerCase().includes(skillSearch.toLowerCase());
      const matchesWs =
        skillWorkspaceFilter === 'all' ||
        s.workspaceScope === 'all' ||
        s.workspaceScope === skillWorkspaceFilter;
      return matchesSearch && matchesWs;
    });
  }, [skills, skillSearch, skillWorkspaceFilter]);

  const de = locale === 'de';
  const text = (german: string, english: string) => de ? german : english;
  const matches = (name: string, description = '') => !skillSearch.trim()
    || `${name} ${description}`.toLocaleLowerCase().includes(skillSearch.trim().toLocaleLowerCase());
  const matchesStatus = (enabled: boolean, beta = false) => statusFilter === 'all'
    || statusFilter === 'active' && enabled || statusFilter === 'inactive' && !enabled || statusFilter === 'beta' && beta;
  const features = [
    { key: 'assistants_enabled', name: text('Zusätzliche Assistenten', 'Additional assistants'), description: text('Eigene Assistenten und ihre Profile verwalten.', 'Manage your assistants and their profiles.'), panel: 'agents', beta: '', icon: <Cpu size={20} /> },
    { key: 'gmail_ai_enabled', name: 'Gmail AI', description: text('KI-Funktionen für Gmail.', 'AI features for Gmail.'), beta: text('Beta · ungetestet', 'Beta · untested'), icon: <Globe size={20} /> },
    { key: 'discord_agents_enabled', name: 'Discord Agents', description: text('Assistenten mit Discord verbinden.', 'Connect assistants to Discord.'), beta: text('Beta · ungetestet', 'Beta · untested'), icon: <Sparkles size={20} /> },
    { key: 'kanban_enabled', name: text('Aufgaben-Board', 'Task board'), description: text('Gespeicherte Boards ansehen und Aufgaben ordnen.', 'View saved boards and organize tasks.'), panel: 'kanban', beta: text('Beta · unfertig / ungetestet', 'Beta · unfinished / untested'), icon: <Layers size={20} /> },
    { key: 'tasks_enabled', name: text('Aufgaben', 'Tasks'), description: text('Gespeicherte und geplante Aufgaben ansehen.', 'View saved and scheduled tasks.'), panel: 'task-center', beta: text('Beta · funktioniert derzeit nicht', 'Beta · not working'), icon: <CheckCircle2 size={20} /> }
  ] as const;
  const visibleFeatures = features.filter(feature => matches(feature.name, feature.description) && matchesStatus(optional.policy[feature.key], !!feature.beta));
  const visibleSkills = filteredSkills.filter(skill => (activePillar === 'mcp' ? skill.type === 'mcp_server' : skill.type === 'builtin') && matchesStatus(skill.enabled));
  const visibleExtensions = extensions.filter(extension => matches(extension.name, extension.description) && matchesStatus(extension.enabled));
  const visiblePresets = presets.filter(preset => matches(preset.name, preset.description) && statusFilter === 'all');
  const pickTab = (tab: typeof activePillar) => {
    setActivePillar(tab);
    setExtensionHubTab(tab === 'mcp' ? 'skills' : tab);
  };
  const status = (enabled: boolean) => <span className={`eh-state ${enabled ? 'is-active' : ''}`}>{enabled ? text('Aktiv', 'Active') : text('Inaktiv', 'Inactive')}</span>;

  if (!open) return null;

  return (
    <div className="unified-hub-backdrop eh-backdrop">
      <div ref={dialogRef} tabIndex={-1} className="eh-dialog" role="dialog" aria-modal="true" aria-labelledby="extension-hub-title">
        <header className="eh-header">
          <div className="eh-heading"><span className="eh-brand"><Puzzle size={23} /></span><div>
            <h2 id="extension-hub-title">{text('Erweiterungen & Skills', 'Extensions & skills')}</h2>
            <p>{text('Dein Browser. Deine Werkzeuge.', 'Your browser. Your tools.')}{activeSpace ? ` · ${activeSpace}` : ''}</p>
          </div></div>
          <button type="button" className="eh-icon-button" onClick={onClose} aria-label={text('Schließen', 'Close')} title="Esc"><X size={20} /></button>
        </header>

        <nav className="eh-tabs" role="tablist" aria-label={text('Bereich', 'Section')}>
          {([
            ['webextensions', text('Erweiterungen', 'Extensions'), <Puzzle size={16} />],
            ['skills', 'Skills', <Sparkles size={16} />],
            ['mcp', text('Verbindungen · MCP', 'Connections · MCP'), <Globe size={16} />]
          ] as const).map(([id, label, icon]) => <button key={id} id={`eh-tab-${id}`} type="button" role="tab"
            aria-selected={activePillar === id} aria-controls="eh-results" tabIndex={activePillar === id ? 0 : -1}
            onKeyDown={event => {
              const tabs = ['webextensions', 'skills', 'mcp'] as const;
              if (event.key === 'ArrowRight' || event.key === 'ArrowLeft' || event.key === 'Home' || event.key === 'End') {
                event.preventDefault();
                const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (tabs.indexOf(id) + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
                pickTab(tabs[index]); document.getElementById(`eh-tab-${tabs[index]}`)?.focus();
              }
            }} onClick={() => pickTab(id)}>{icon}{label}</button>)}
        </nav>

        <div className="eh-toolbar">
          <label className="eh-search"><Search size={17} /><input type="search" value={skillSearch} onChange={event => setSkillSearch(event.target.value)}
            aria-label={text('Hub durchsuchen', 'Search hub')} placeholder={text('Suchen…', 'Search…')} /></label>
          <select aria-label={text('Status filtern', 'Filter status')} value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)}>
            <option value="all">{text('Alle', 'All')}</option><option value="active">{text('Aktiv', 'Active')}</option>
            <option value="inactive">{text('Inaktiv', 'Inactive')}</option><option value="beta">Beta</option>
          </select>
          {activePillar !== 'webextensions' && <select aria-label={text('Zuordnung filtern', 'Filter category')} value={skillWorkspaceFilter}
            onChange={event => setSkillWorkspaceFilter(event.target.value as typeof skillWorkspaceFilter)}>
            <option value="all">{text('Alle Bereiche', 'All categories')}</option><option value="coding">Coding</option><option value="recherche">{text('Recherche', 'Research')}</option><option value="design">Design</option>
          </select>}
        </div>

        <div className="eh-scroll" id="eh-results" role="tabpanel" aria-labelledby={`eh-tab-${activePillar}`}>
          {feedback && <p className={`eh-notice ${feedback.error ? 'is-error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
          {optional.error && activePillar === 'skills' && <p className="eh-notice is-error" role="alert">{optional.error}</p>}
          {activePillar === 'webextensions' && <>
            <section className="eh-section">
              <div className="eh-section-heading"><h3>{text('Installiert', 'Installed')} <small>{extensions.length}</small></h3>
                <button type="button" className="eh-text-button" disabled={loading} onClick={() => void loadExtensionData()}><RefreshCw size={14} />{text('Aktualisieren', 'Refresh')}</button></div>
              {loading ? <p role="status" className="eh-empty">{text('Erweiterungen werden geladen…', 'Loading extensions…')}</p> : visibleExtensions.length === 0
                ? <p className="eh-empty">{extensions.length ? text('Keine passenden Erweiterungen.', 'No matching extensions.') : text('Noch keine Erweiterungen installiert.', 'No extensions installed yet.')}</p>
                : <div className="eh-grid">{visibleExtensions.map(ext => <article className="eh-card" key={ext.id}>
                  <div className="eh-card-head"><span className="eh-card-icon">{ext.iconDataUrl ? <img src={ext.iconDataUrl} alt="" /> : <Puzzle size={21} />}</span>
                    <div className="eh-card-title"><h4>{ext.name}</h4><span className="eh-muted">v{ext.version}{ext.source === 'unpacked' ? text(' · Lokal geladen', ' · Loaded locally') : ''}</span></div>{status(ext.enabled)}</div>
                  <p>{ext.description || text('Keine Beschreibung vorhanden.', 'No description available.')}</p>
                  <details className="eh-details"><summary>{text('Optionen & Berechtigungen', 'Options & permissions')}</summary>
                    <label>{text('Zuordnung', 'Category')}<select value={extensionScopes[ext.id] || 'all'} onChange={event => handleUpdateExtensionScope(ext.id, event.target.value as 'all' | 'coding' | 'recherche' | 'design')}>
                      <option value="all">{text('Alle Bereiche', 'All categories')}</option><option value="coding">Coding</option><option value="recherche">{text('Recherche', 'Research')}</option><option value="design">Design</option></select></label>
                    <label className="eh-check"><input type="checkbox" checked={!!ext.allowInIncognito} onChange={() => void handleToggleIncognito(ext)} />{text('In privaten Fenstern erlauben', 'Allow in private windows')}</label>
                    <div className="eh-permissions">{(ext.permissions || []).map(permission => <span key={permission}>{permission}</span>)}</div>
                  </details>
                  <footer className="eh-card-footer"><label className="eh-check"><input type="checkbox" checked={!!ext.enabled} onChange={() => void handleToggleExtension(ext)} />{text('Aktiviert', 'Enabled')}</label>
                    <button type="button" className="eh-icon-button is-danger" onClick={() => void handleRemoveExtension(ext)} aria-label={`${ext.name}: ${text('Entfernen', 'Remove')}`}><Trash2 size={16} /></button></footer>
                </article>)}</div>}
            </section>
            <section className="eh-section"><h3>{text('Hinzufügen', 'Add an extension')}</h3>
              <form className="eh-install-form" onSubmit={handleInstallCws}><input value={cwsInput} onChange={event => setCwsInput(event.target.value)}
                aria-label={text('Chrome Web Store Link oder Erweiterungs-ID', 'Chrome Web Store link or extension ID')} placeholder={text('Chrome Web Store Link oder ID', 'Chrome Web Store link or ID')} />
                <button type="submit" className="eh-primary" disabled={!cwsInput.trim() || installingId !== null}><Plus size={15} />{installingId === 'cws-custom' ? text('Installiert…', 'Installing…') : text('Installieren', 'Install')}</button>
                <button type="button" disabled={installingId !== null} onClick={() => void handleInstallUnpacked()}><FolderOpen size={15} />{text('Aus Ordner', 'From folder')}</button></form>
              {visiblePresets.length > 0 && <><h4 className="eh-subheading">{text('Entdecken', 'Discover')}</h4><div className="eh-grid">{visiblePresets.map(preset => {
                const installed = extensions.some(ext => ext.id === preset.cwsId || ext.name === preset.name);
                return <article key={preset.id} className="eh-card"><div className="eh-card-head"><span className="eh-card-icon">{preset.icon}</span><div className="eh-card-title"><h4>{preset.name}</h4><span className="eh-muted">{preset.category}</span></div></div>
                  <p>{preset.description}</p><footer className="eh-card-footer"><button type="button" disabled={installed || installingId !== null} onClick={() => void handleInstallPreset(preset)}>
                    {installed ? <Check size={15} /> : <Plus size={15} />}{installed ? text('Installiert', 'Installed') : installingId === preset.id ? text('Installiert…', 'Installing…') : text('Hinzufügen', 'Add')}</button></footer></article>;
              })}</div></>}
            </section>
          </>}

          {activePillar === 'skills' && <>
            <section className="eh-section"><div className="eh-section-heading"><h3>{text('Optionale Funktionen', 'Optional features')}</h3><span className="eh-muted">{text('Für das aktive KI-Profil', 'For the active AI profile')}</span></div>
              <div className="eh-grid">{visibleFeatures.map(feature => <article key={feature.key} className="eh-card">
                <div className="eh-card-head"><span className="eh-card-icon">{feature.icon}</span><div className="eh-card-title"><h4>{feature.name}</h4></div>{status(optional.loaded && optional.policy[feature.key])}</div>
                {feature.beta && <span className="eh-beta">{feature.beta}</span>}<p>{feature.description}</p>
                <footer className="eh-card-footer"><label className="eh-check"><input type="checkbox" checked={optional.policy[feature.key]} disabled={!optional.loaded || optional.busy}
                  onChange={event => void optional.update({ [feature.key]: event.target.checked })} />{text('Aktivieren', 'Enable')}</label>
                  {'panel' in feature && <button type="button" onClick={() => openPanel(feature.panel)}>{text('Verwalten', 'Manage')}</button>}</footer>
              </article>)}</div>
            </section>
            <section className="eh-section"><div className="eh-section-heading"><h3>{text('Werkzeuge', 'Tools')}</h3>
              <button type="button" onClick={() => openPanel('skills')}>{text('Alle Skills verwalten', 'Manage all skills')}<ExternalLink size={13} /></button></div>
              <div className="eh-grid">{visibleSkills.map(renderSkill)}</div>
              {visibleSkills.length === 0 && visibleFeatures.length === 0 && <p className="eh-empty">{text('Keine passenden Skills.', 'No matching skills.')}</p>}
            </section>
          </>}

          {activePillar === 'mcp' && <>
            <section className="eh-section"><div className="eh-section-heading"><div><h3>{text('App-Verbindungen', 'App connections')}</h3><p className="eh-muted">{text('Externe Werkzeuge über MCP verbinden.', 'Connect external tools through MCP.')}</p></div>
              <button type="button" onClick={() => setShowMcpConfig(value => !value)} aria-expanded={showMcpConfig}><Sliders size={15} />{text('Konfigurieren', 'Configure')}</button></div>
              <div aria-live="polite">{mcp.error && <p className="eh-notice is-error" role="alert">{mcp.error}</p>}{mcp.notice && <p className="eh-notice" role="status">{mcp.notice}</p>}
                {mcp.busy && <p className="eh-muted" role="status">{text('Verbindungen werden aktualisiert…', 'Updating connections…')}</p>}
                {mcp.runtimeAvailable === false && <p className="eh-notice">{text('Derzeit nicht verbindbar. Konfiguration bleibt möglich.', 'Connections are currently unavailable. Configuration is still possible.')}</p>}</div>
              {matches('Composio', 'Slack Gmail GitHub Notion') && matchesStatus(mcp.servers.some(server => server.name === 'composio' && server.enabled === true), true) && <article className="eh-card eh-connection-intro">
                <div className="eh-card-head"><span className="eh-card-icon"><Globe size={20} /></span><div className="eh-card-title"><h4>Composio</h4><span className="eh-beta">{text('Beta · ungetestet', 'Beta · untested')}</span></div></div>
                <p>{text('Slack, Gmail, GitHub und weitere Apps verbinden. Du gibst Konten und Zugriffe bei der Einrichtung frei.', 'Connect Slack, Gmail, GitHub and more. You approve accounts and access during setup.')}</p>
                <footer className="eh-card-footer"><button type="button" disabled={!mcp.loaded || mcp.busy} onClick={() => { if (mcpModel.prepareComposio()) setShowMcpConfig(true); }}>{text('Einrichten', 'Set up')}</button>
                  <a href="https://docs.composio.dev/docs/composio-connect" target="_blank" rel="noopener noreferrer">{text('Anleitung', 'Guide')}<ExternalLink size={13} /></a></footer>
              </article>}
              {showMcpConfig && <section className="eh-config" aria-label={text('MCP-Konfiguration', 'MCP configuration')}>
                <h4>{text('Verbindungen konfigurieren', 'Configure connections')}</h4>
                <p>{text('Serverkonfiguration für stdio oder HTTP. Änderungen benötigen einen Neustart von Sidekick. Maskierte Zugangsdaten bleiben erhalten.', 'Server configuration for stdio or HTTP. Changes require restarting Sidekick. Masked credentials are preserved.')}</p>
                <textarea aria-label={text('MCP-Serverkonfiguration', 'MCP server configuration')} value={mcp.editor} onChange={event => mcpModel.setEditor(event.target.value)} rows={8} spellCheck={false} />
                <p className="eh-muted" role="status">{mcp.editor === mcp.savedEditor ? text('Gespeichert', 'Saved') : text('Ungespeicherter Entwurf', 'Unsaved draft')}</p>
                <div className="eh-actions"><button type="button" className="eh-primary" onClick={handleApplyMcpConfig} disabled={!mcp.loaded || mcp.busy}>{text('Speichern', 'Save')}</button>
                  <button type="button" onClick={mcpModel.resetEditor} disabled={mcp.busy}>{text('Verwerfen', 'Discard')}</button>
                  <button type="button" onClick={() => void mcpModel.load()} disabled={mcp.busy}>{text('Status aktualisieren', 'Refresh status')}</button>
                  <button type="button" onClick={importLegacyMcpDraft} disabled={mcp.busy}>{text('Alten Entwurf laden', 'Load old draft')}</button></div>
              </section>}
              <div className="eh-grid">{visibleSkills.map(renderSkill)}</div>
              {visibleSkills.length === 0 && <p className="eh-empty">{text('Keine passenden Server konfiguriert.', 'No matching servers configured.')}</p>}
            </section>
          </>}
        </div>
        <footer className="eh-footer"><Shield size={14} /><span>{text('Du bestimmst, welche Funktionen aktiv sind.', 'You choose which features are enabled.')}</span><kbd>Esc</kbd></footer>
      </div>
    </div>
  );

  function renderSkill(skill: McpSkillItem) {
    const memory = skill.id === 'mcp-supermemory';
    const permissionNames: Record<McpPermissionType, string> = {
      read_only: text('Lesen', 'Read'), filesystem_write: text('Dateien ändern', 'Change files'), terminal_execute: text('Befehle ausführen', 'Run commands'),
      network_outbound: text('Internet', 'Internet'), agent_autonomy: text('Selbstständige Aktionen', 'Autonomous actions')
    };
    const english = BUILTIN_SKILL_ENGLISH[skill.id];
    const skillName = skill.id === 'mcp-terminal'
      ? terminalSkillDisplayName(window.navigator.platform)
      : text(skill.name, english?.name ?? skill.name);
    const skillDescription = text(skill.description, english?.description ?? skill.description);
    return <article key={skill.id} className="eh-card">
      <div className="eh-card-head"><span className="eh-card-icon">{skill.icon}</span><div className="eh-card-title"><h4>{skillName}</h4>
        <span className="eh-muted">{skill.type === 'builtin' ? text('Integriert', 'Built in') : skill.serverType?.toUpperCase()}</span></div>{status(skill.enabled)}</div>
      <p>{skillDescription}</p>
      {memory && <p className="eh-muted">{text('Gespeicherte Daten bleiben auch inaktiv einsehbar und löschbar. Cloud-Suche wird separat in den Gedächtnis-Einstellungen aktiviert.', 'Saved data can be viewed and deleted while inactive. Cloud search is enabled separately in memory settings.')}</p>}
      <details className="eh-details"><summary>{text('Details & Zuordnung', 'Details & category')}</summary>
        <div className="eh-permissions">{skill.permissions.map(permission => <span key={permission}>{permissionNames[permission]}</span>)}</div>
        <label>{text('Zuordnung', 'Category')}<select value={skill.workspaceScope} disabled={skill.type === 'mcp_server'}
          onChange={event => updateSkill(skill.id, { workspaceScope: event.target.value as McpSkillItem['workspaceScope'] })}>
          <option value="all">{text('Alle Bereiche', 'All categories')}</option><option value="coding">Coding</option><option value="recherche">{text('Recherche', 'Research')}</option><option value="design">Design</option>
        </select></label>
      </details>
      <footer className="eh-card-footer"><label className="eh-check"><input type="checkbox" checked={skill.enabled}
        aria-label={`${skillName}: ${text('Aktivieren', 'Enable')}`}
        disabled={memory ? !optional.loaded || optional.busy : skill.type === 'mcp_server' ? !mcp.loaded || mcp.busy : false}
        onChange={event => updateSkill(skill.id, { enabled: event.target.checked })} />{text('Aktivieren', 'Enable')}</label>
        {memory && <button type="button" onClick={() => openPanel('memory')}>{text('Daten verwalten', 'Manage data')}</button>}
      </footer>
    </article>;
  }
}
