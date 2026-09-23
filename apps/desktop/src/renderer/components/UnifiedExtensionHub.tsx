import React, { useState, useEffect, useMemo, FormEvent } from 'react';
import {
  Puzzle,
  Sparkles,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
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
  AlertTriangle,
  RefreshCw,
  FileCode,
  HardDrive
} from 'lucide-react';
import { usePanelStore } from '../stores/usePanelStore.js';
import type { ExtensionRecord, ExtensionPreset } from '../../main/extensions.js';

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
  serverType?: 'stdio' | 'sse';
  endpoint?: string;
}

export const BUILTIN_MCP_SKILLS: McpSkillItem[] = [
  {
    id: 'mcp-terminal',
    name: 'ConPTY Terminal Executor',
    description: 'Führt Shell-Befehle, CLI-Tools (node, python, git) und sidekick doctor im nativen Pseudo-Terminal aus.',
    category: 'system',
    icon: '💻',
    workspaceScope: 'coding',
    permissions: ['terminal_execute', 'filesystem_write'],
    autoApprove: false,
    enabled: true,
    type: 'builtin'
  },
  {
    id: 'mcp-supermemory',
    name: 'Supermemory Vector Search',
    description: 'Semantische Vektorsuche und persistente Notiz- & Wissensverwaltung in lokalem SQLite Supermemory.',
    category: 'research',
    icon: '🧠',
    workspaceScope: 'recherche',
    permissions: ['read_only', 'filesystem_write'],
    autoApprove: true,
    enabled: true,
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
  const {
    extensionHubTab,
    setExtensionHubTab
  } = usePanelStore();

  const [activePillar, setActivePillar] = useState<'webextensions' | 'skills'>(extensionHubTab || 'webextensions');
  const [extensions, setExtensions] = useState<ExtensionRecord[]>([]);
  const [presets, setPresets] = useState<ExtensionPreset[]>([]);
  const [cwsInput, setCwsInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);

  // Pillar 2 (MCP Skills) state
  const [skills, setSkills] = useState<McpSkillItem[]>(() => {
    try {
      const stored = localStorage.getItem('lastbrowser.mcp_skills.v1');
      if (stored) return JSON.parse(stored);
    } catch {}
    return BUILTIN_MCP_SKILLS;
  });
  const [skillSearch, setSkillSearch] = useState('');
  const [skillWorkspaceFilter, setSkillWorkspaceFilter] = useState<'all' | 'coding' | 'recherche' | 'design'>('all');

  const DEFAULT_MCP_CONFIG = `{
  "mcpServers": {
    "git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git"]
    },
    "memory": {
      "command": "python",
      "args": ["-m", "sidekick.runtime.mcp_memory"]
    }
  }
}`;

  const [mcpConfigJson, setMcpConfigJson] = useState<string>(() => {
    try {
      const stored = localStorage.getItem('lastbrowser.mcp_config.v1');
      if (stored) return stored;
    } catch {}
    return DEFAULT_MCP_CONFIG;
  });

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
      setActivePillar(extensionHubTab);
    }
  }, [extensionHubTab]);

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
    }
  }, [open]);

  // Persist skills state
  const updateSkill = (id: string, updates: Partial<McpSkillItem>) => {
    setSkills((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...updates } : s));
      try {
        localStorage.setItem('lastbrowser.mcp_skills.v1', JSON.stringify(next));
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

  const handleApplyMcpConfig = () => {
    try {
      const parsed = JSON.parse(mcpConfigJson);
      if (!parsed || typeof parsed !== 'object') {
        notify('JSON-Konfiguration muss ein valides Objekt sein', true);
        return;
      }
      try {
        localStorage.setItem('lastbrowser.mcp_config.v1', mcpConfigJson);
      } catch {}

      const servers = (parsed.mcpServers || parsed.servers) as Record<string, any> | undefined;
      let registeredCount = 0;
      if (servers && typeof servers === 'object') {
        setSkills((prev) => {
          const next = [...prev];
          for (const [serverKey, config] of Object.entries(servers)) {
            const skillId = `mcp-ext-${serverKey}`;
            const existingIdx = next.findIndex((s) => s.id === skillId);
            const serverConf = (config && typeof config === 'object') ? config : {};
            const isStdio = Boolean(serverConf.command);
            const permissions: McpPermissionType[] = isStdio
              ? ['terminal_execute', 'filesystem_write']
              : ['network_outbound', 'read_only'];
            const newSkill: McpSkillItem = {
              id: skillId,
              name: `MCP: ${serverKey}`,
              description: `Externer ${isStdio ? 'stdio' : 'sse'} Server (${serverConf.command || serverConf.url || 'custom'}).`,
              category: 'system',
              icon: isStdio ? '⚙️' : '🌐',
              workspaceScope: 'coding',
              permissions,
              autoApprove: false,
              enabled: existingIdx >= 0 ? next[existingIdx].enabled : true,
              type: 'mcp_server',
              serverType: isStdio ? 'stdio' : 'sse',
              endpoint: serverConf.url || serverConf.command
            };
            if (existingIdx >= 0) {
              next[existingIdx] = { ...next[existingIdx], ...newSkill };
            } else {
              next.push(newSkill);
            }
            registeredCount++;
          }
          try {
            localStorage.setItem('lastbrowser.mcp_skills.v1', JSON.stringify(next));
          } catch {}
          return next;
        });
      }

      notify(`mcp_servers.json erfolgreich validiert & ${registeredCount} MCP-Server registriert!`);
    } catch (err) {
      notify(`Ungültiges JSON-Format: ${err instanceof Error ? err.message : String(err)}`, true);
    }
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
      notify(`Fehler beim Laden: ${err instanceof Error ? err.message : String(err)}`, true);
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
      notify(`Fehler beim Umschalten: ${err instanceof Error ? err.message : String(err)}`, true);
    }
  };

  // Toggle Incognito
  const handleToggleIncognito = async (ext: ExtensionRecord) => {
    try {
      await window.lastbrowser.extensions.toggleIncognito({ id: ext.id, allow: !ext.allowInIncognito });
      await loadExtensionData();
    } catch (err) {
      notify(`Fehler bei Inkognito-Freigabe: ${err instanceof Error ? err.message : String(err)}`, true);
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
      notify(`Fehler beim Entfernen: ${err instanceof Error ? err.message : String(err)}`, true);
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

  if (!open) return null;

  return (
    <div
      className="unified-hub-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Unified Extension & Skill Hub"
    >
      <div className="unified-hub-modal">
        {/* Modal Header */}
        <header className="unified-hub-header">
          <div className="hub-header-branding">
            <div className="hub-brand-icon">
              <Puzzle size={22} className="puzzle-icon" />
              <Sparkles size={14} className="sparkles-overlay" />
            </div>
            <div>
              <div className="hub-title-row">
                <h2>Unified Extension & Skill Hub</h2>
                <span className="hub-shortcut-chip" title="Globaler Shortcut">Ctrl+Shift+X</span>
              </div>
              <p className="hub-subtitle">
                Zwei-Säulen-Architektur: Chrome MV3 WebExtensions & Native Nova AI Skills (MCP)
              </p>
            </div>
          </div>

          <button
            type="button"
            className="hub-close-btn"
            aria-label="Schließen (Esc)"
            title="Schließen"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        {/* Feedback Banner */}
        {feedback && (
          <div className={`hub-feedback-banner ${feedback.error ? 'error' : 'success'}`}>
            {feedback.error ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Two-Pillar Switcher Tabs */}
        <nav className="hub-pillar-nav" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activePillar === 'webextensions'}
            className={`hub-pillar-tab ${activePillar === 'webextensions' ? 'active' : ''}`}
            onClick={() => {
              setActivePillar('webextensions');
              setExtensionHubTab('webextensions');
            }}
          >
            <Globe size={16} />
            <span>Web-Erweiterungen (Chrome MV3)</span>
            <span className="hub-tab-badge">{extensions.length}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activePillar === 'skills'}
            className={`hub-pillar-tab ${activePillar === 'skills' ? 'active' : ''}`}
            onClick={() => {
              setActivePillar('skills');
              setExtensionHubTab('skills');
            }}
          >
            <Cpu size={16} />
            <span>Nova AI Skills & Tools (MCP)</span>
            <span className="hub-tab-badge green">{skills.filter((s) => s.enabled).length}</span>
          </button>
        </nav>

        {/* ── PILLAR 1: CHROME MV3 WEBEXTENSIONS ── */}
        {activePillar === 'webextensions' && (
          <div className="hub-content-pane webextensions-pane">
            {/* Quick-Install Showcase */}
            <section className="hub-section">
              <div className="hub-section-head">
                <h3>Kuratierter 1-Klick Showcase</h3>
                <p>Verifizierte Manifest V3 Erweiterungen für Privatsphäre, Sicherheit und Styles.</p>
              </div>

              <div className="hub-preset-grid">
                {presets.map((preset) => {
                  const isInstalled = extensions.some((e) => e.cwsId === preset.cwsId || e.name === preset.name);
                  const isBusy = installingId === preset.id;
                  return (
                    <div key={preset.id} className="hub-preset-card">
                      <div className="preset-card-top">
                        <span className="preset-icon">{preset.icon}</span>
                        <div>
                          <strong>{preset.name}</strong>
                          <span className="preset-category">{preset.category}</span>
                        </div>
                      </div>
                      <p className="preset-desc">{preset.description}</p>
                      <button
                        type="button"
                        className={`preset-install-btn ${isInstalled ? 'installed' : ''}`}
                        disabled={isInstalled || isBusy}
                        onClick={() => handleInstallPreset(preset)}
                      >
                        {isBusy ? (
                          <RefreshCw size={13} className="spin" />
                        ) : isInstalled ? (
                          <Check size={13} />
                        ) : (
                          <Plus size={13} />
                        )}
                        <span>{isInstalled ? 'Installiert' : 'Hinzufügen'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Install from CWS or Unpacked */}
            <section className="hub-section install-actions-section">
              <div className="hub-section-head">
                <h3>Weitere Erweiterung installieren</h3>
              </div>
              <div className="install-actions-row">
                <form className="cws-url-form" onSubmit={handleInstallCws}>
                  <Globe size={15} />
                  <input
                    type="text"
                    value={cwsInput}
                    onChange={(e) => setCwsInput(e.target.value)}
                    placeholder="Chrome Web Store URL oder 32-Zeichen Extension-ID..."
                    className="cws-input"
                  />
                  <button
                    type="submit"
                    className="cws-submit-btn"
                    disabled={!cwsInput.trim() || installingId === 'cws-custom'}
                  >
                    {installingId === 'cws-custom' ? <RefreshCw size={14} className="spin" /> : <Plus size={14} />}
                    <span>Installieren</span>
                  </button>
                </form>

                <button
                  type="button"
                  className="unpacked-load-btn"
                  disabled={installingId === 'unpacked'}
                  onClick={handleInstallUnpacked}
                  title="Entpackten Erweiterungsordner mit manifest.json auswählen"
                >
                  <FolderOpen size={15} />
                  <span>Entpackte Erweiterung laden...</span>
                </button>
              </div>
            </section>

            {/* Installed Extensions List */}
            <section className="hub-section installed-section">
              <div className="hub-section-head">
                <h3>Installierte Erweiterungen ({extensions.length})</h3>
                <p>Granulare Schalter für Normal- und Inkognito-Modus sowie Workspace-Zuordnung.</p>
              </div>

              {loading ? (
                <div className="hub-loading">Lade Erweiterungen...</div>
              ) : extensions.length === 0 ? (
                <div className="hub-empty-state">
                  <Puzzle size={28} />
                  <p>Noch keine Erweiterungen installiert. Wähle oben ein Preset oder lade eine CRX-Datei.</p>
                </div>
              ) : (
                <div className="hub-installed-list">
                  {extensions.map((ext) => (
                    <div key={ext.id} className={`hub-extension-row ${!ext.enabled ? 'disabled' : ''}`}>
                      <div className="ext-row-left">
                        {ext.iconDataUrl ? (
                          <img src={ext.iconDataUrl} alt="" className="ext-icon-img" />
                        ) : (
                          <div className="ext-icon-fallback">🧩</div>
                        )}
                        <div className="ext-meta">
                          <div className="ext-name-row">
                            <strong>{ext.name}</strong>
                            <span className="ext-version">v{ext.version}</span>
                            {ext.isUnpacked && <span className="ext-pill unpacked">Entpackt</span>}
                          </div>
                          <p className="ext-desc">{ext.description || 'Keine Beschreibung hinterlegt.'}</p>
                          <div className="ext-permissions-pills">
                            {(ext.permissions || []).map((perm) => (
                              <span key={perm} className="ext-perm-pill">{perm}</span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="ext-row-controls">
                        {/* Scope Selector */}
                        <div className="ext-scope-control">
                          <label>Workspace:</label>
                          <select
                            value={extensionScopes[ext.id] || 'all'}
                            onChange={(e) => handleUpdateExtensionScope(ext.id, e.target.value as any)}
                            className="ext-workspace-select"
                            title="Workspace-Scoping"
                          >
                            <option value="all">Alle Workspaces</option>
                            <option value="coding">Coding</option>
                            <option value="recherche">Recherche</option>
                            <option value="design">Design</option>
                          </select>
                        </div>

                        {/* Incognito Switch */}
                        <label className="hub-toggle-label" title="Im privaten / Inkognito-Fenster erlauben">
                          <input
                            type="checkbox"
                            checked={Boolean(ext.allowInIncognito)}
                            onChange={() => handleToggleIncognito(ext)}
                          />
                          <span className="hub-toggle-text">Inkognito</span>
                        </label>

                        {/* Enable/Disable Switch */}
                        <label className="hub-toggle-label main-toggle">
                          <input
                            type="checkbox"
                            checked={Boolean(ext.enabled)}
                            onChange={() => handleToggleExtension(ext)}
                          />
                          <span className="hub-toggle-text">{ext.enabled ? 'Aktiv' : 'Inaktiv'}</span>
                        </label>

                        {/* Delete Button */}
                        <button
                          type="button"
                          className="ext-delete-btn"
                          title="Erweiterung deinstallieren"
                          onClick={() => handleRemoveExtension(ext)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ── PILLAR 2: NOVA AI SKILLS & TOOLS (MCP) ── */}
        {activePillar === 'skills' && (
          <div className="hub-content-pane skills-pane">
            {/* Filter & Search Bar */}
            <div className="hub-skills-filterbar">
              <div className="skills-search-wrap">
                <Search size={15} />
                <input
                  type="text"
                  value={skillSearch}
                  onChange={(e) => setSkillSearch(e.target.value)}
                  placeholder="Skills, Werkzeuge oder Berechtigungen durchsuchen..."
                  className="skills-search-input"
                />
              </div>

              <div className="skills-scope-chips">
                <span className="scope-chip-label">Workspace-Scoping:</span>
                {(['all', 'coding', 'recherche', 'design'] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    className={`scope-filter-pill ${skillWorkspaceFilter === scope ? 'active' : ''}`}
                    onClick={() => setSkillWorkspaceFilter(scope)}
                  >
                    {scope === 'all' ? 'Alle Workspaces' : scope.charAt(0).toUpperCase() + scope.slice(1)}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className={`mcp-config-btn ${showMcpConfig ? 'active' : ''}`}
                onClick={() => setShowMcpConfig((prev) => !prev)}
                title="mcp_servers.json Konfiguration öffnen"
              >
                <FileCode size={14} />
                <span>mcp_servers.json</span>
              </button>
            </div>

            {/* MCP Servers Config Drawer */}
            {showMcpConfig && (
              <div className="mcp-config-drawer">
                <div className="mcp-config-head">
                  <div>
                    <strong>Model Context Protocol (MCP) Server Konfiguration</strong>
                    <p>Definiere externe stdio- und sse-Server (vollständig kompatibel zum Claude Desktop Ökosystem).</p>
                  </div>
                  <button
                    type="button"
                    className="save-mcp-btn"
                    onClick={handleApplyMcpConfig}
                  >
                    <Check size={14} />
                    <span>Konfiguration anwenden</span>
                  </button>
                </div>
                <textarea
                  className="mcp-json-editor"
                  value={mcpConfigJson}
                  onChange={(e) => setMcpConfigJson(e.target.value)}
                  rows={8}
                  spellCheck={false}
                />
              </div>
            )}

            {/* Security & Sandboxing Manifesto Notice */}
            <div className="hub-security-banner">
              <ShieldCheck size={18} className="shield-good" />
              <div>
                <strong>Granulares Sandboxing & Berechtigungsmanagement (Security First)</strong>
                <p>
                  Kritische Fähigkeiten wie <code>terminal_execute</code> oder <code>filesystem_write</code> verlangen standardmäßig eine interaktive Bestätigung im Chat (Human-in-the-Loop).
                </p>
              </div>
            </div>

            {/* Skills Grid */}
            <div className="hub-skills-grid">
              {filteredSkills.map((skill) => (
                <div key={skill.id} className={`mcp-skill-card ${!skill.enabled ? 'disabled' : ''}`}>
                  <div className="skill-card-header">
                    <span className="skill-avatar">{skill.icon}</span>
                    <div className="skill-title-block">
                      <div className="skill-name-row">
                        <strong>{skill.name}</strong>
                        <span className={`skill-type-pill ${skill.type}`}>
                          {skill.type === 'builtin' ? 'Nativ' : 'MCP Server'}
                        </span>
                      </div>
                      <span className="skill-category-tag">{skill.category.toUpperCase()}</span>
                    </div>

                    {/* Enable/Disable Toggle */}
                    <label className="skill-main-switch" title={skill.enabled ? 'Skill aktiv' : 'Skill deaktiviert'}>
                      <input
                        type="checkbox"
                        checked={skill.enabled}
                        onChange={(e) => updateSkill(skill.id, { enabled: e.target.checked })}
                      />
                      <span className="slider round" />
                    </label>
                  </div>

                  <p className="skill-description">{skill.description}</p>

                  {/* Permission Pills */}
                  <div className="skill-permissions-block">
                    <span className="block-label">Erforderliche Berechtigungen:</span>
                    <div className="permission-chips-row">
                      {skill.permissions.map((perm) => {
                        const meta = MCP_PERMISSION_LABELS[perm] || { label: perm, icon: '🛡️', level: 'safe' };
                        return (
                          <span key={perm} className={`perm-chip ${meta.level}`}>
                            <span className="perm-chip-icon">{meta.icon}</span>
                            <span>{meta.label}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Scoping and Auto-Approve Controls */}
                  <div className="skill-card-footer">
                    <div className="skill-workspace-picker">
                      <label>Workspace:</label>
                      <select
                        value={skill.workspaceScope}
                        onChange={(e) => updateSkill(skill.id, { workspaceScope: e.target.value as any })}
                      >
                        <option value="all">Alle Workspaces</option>
                        <option value="coding">Coding</option>
                        <option value="recherche">Recherche</option>
                        <option value="design">Design</option>
                      </select>
                    </div>

                    <label className="auto-approve-toggle" title="Ohne vorherige Bestätigung im Chat ausführen">
                      <input
                        type="checkbox"
                        checked={skill.autoApprove}
                        onChange={(e) => updateSkill(skill.id, { autoApprove: e.target.checked })}
                      />
                      <span>{skill.autoApprove ? 'Immer vertrauen (Auto-Approve)' : 'Interaktiv bestätigen'}</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
