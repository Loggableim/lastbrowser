import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowUpDown,
  BookOpen,
  Bookmark,
  Bot,
  Code2,
  Command,
  Copy,
  Cpu,
  Database,
  Download,
  ExternalLink,
  Folder,
  FolderPlus,
  HardDrive,
  History,
  Kanban,
  Layers,
  Maximize,
  Pin,
  Plus,
  Printer,
  Puzzle,
  RefreshCw,
  RotateCcw,
  Search,
  Server,
  Shield,
  CheckSquare,
  FileText,
  Scale,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Table,
  Terminal,
  Trash2,
  Users,
  Volume2,
  VolumeX,
  Wrench,
  X,
  Zap
} from 'lucide-react';
import { usePanelStore } from '../stores/usePanelStore.js';
import { useTabStore } from '../stores/useTabStore.js';
import { useGeminiAccountStore } from '../stores/useGeminiAccountStore.js';
import { executeBrowserAction } from '../browser-agent-tools.js';
import { browserStartUrl } from '../tabs.js';
import { discoverActiveForm, triggerLivePagination, abortLiveAutomation } from '../live-automation.js';
import { getActiveWebview } from '../grounding-anchors.js';
import { WORKFLOW_TEMPLATES, formatWorkflowPrompt } from '../workflow-templates.js';
import type { LastbrowserPanelId } from '../shell-state.js';
import { usePinnedAppStore } from '../stores/usePinnedAppStore.js';
import { useDesktopI18n } from '../i18n.js';

export interface CommandItem {
  id: string;
  title: string;
  description?: string;
  category: 'Nova AI' | 'Tabs' | 'Navigation' | 'System' | 'Offene Tabs' | 'Workflows' | 'Apps' | 'Sidekick CLI';
  icon: React.ReactNode;
  shortcut?: string;
  keywords?: string[];
  action: () => void;
}

function dispatchCliEvent(command: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lastbrowser:cli:execute', { detail: { command } }));
  }
}

export function buildSidekickCliCommands(
  setActivePanel: (p: LastbrowserPanelId) => void,
  t?: (key: any) => string
): CommandItem[] {
  const cliCategory = (t ? t('commands.category.cli') : 'Sidekick CLI') as any;
  const fixDesc = t ? t('commands.fix.desc') : 'Systemzustand, beschädigte Caches und lokale Lockfiles automatisch reparieren';
  const doctorDesc = t ? t('commands.doctor.desc') : 'Systemdiagnose, Umgebungsvariablen, Python-Engine und API-Konnektivität prüfen';

  return [
    {
      id: 'sidekick-cli-fix',
      title: '> Sidekick: fix',
      description: fixDesc,
      category: cliCategory,
      icon: <Wrench size={16} />,
      keywords: ['fix', 'repair', 'reparatur', 'lockfile', 'cache', 'bereinigen', 'clean'],
      action: () => {
        dispatchCliEvent('sidekick fix');
      }
    },
    {
      id: 'sidekick-cli-doctor',
      title: '> Sidekick: doctor',
      description: doctorDesc,
      category: cliCategory,
      icon: <Activity size={16} />,
      keywords: ['doctor', 'diagnose', 'health', 'system', 'status', 'api', 'prüfen'],
      action: () => {
        setActivePanel('settings');
        dispatchCliEvent('sidekick doctor');
      }
    },
    {
      id: 'sidekick-cli-supermemory-index',
      title: '> Sidekick: supermemory index',
      description: 'Supermemory Vektor-Index mit 3-Tier Fallback (Gemini / Ollama / BM25) neu indizieren',
      category: 'Sidekick CLI',
      icon: <Database size={16} />,
      keywords: ['supermemory', 'index', 'vektor', 'vector', 'embedding', 'reindex', 'suche'],
      action: () => {
        if (typeof window !== 'undefined') {
          void window.lastbrowser?.sidekick?.reindexSupermemory?.();
        }
      }
    },
    {
      id: 'sidekick-cli-supermemory-dump',
      title: '> Sidekick: supermemory dump',
      description: 'Vollständigen Snapshot der Supermemory Vektor- und Wissensdatenbank exportieren',
      category: 'Sidekick CLI',
      icon: <HardDrive size={16} />,
      keywords: ['supermemory', 'dump', 'export', 'backup', 'snapshot', 'json', 'sqlite'],
      action: () => {
        if (typeof window !== 'undefined') {
          void window.lastbrowser?.sidekick?.dumpSupermemory?.();
        }
      }
    },
    {
      id: 'sidekick-cli-mcp-list',
      title: '> Sidekick: mcp list',
      description: 'Konfigurierte MCP-Server und deren JSON-RPC Verbindungsstatus (stdio / sse) anzeigen',
      category: 'Sidekick CLI',
      icon: <Server size={16} />,
      keywords: ['mcp', 'list', 'servers', 'stdio', 'sse', 'json-rpc', 'tools'],
      action: () => {
        setActivePanel('settings');
        if (typeof window !== 'undefined') {
          void window.lastbrowser?.mcp?.listServers?.();
        }
      }
    },
    {
      id: 'sidekick-cli-mcp-tools',
      title: '> Sidekick: mcp tools',
      description: 'Registrierte MCP-Tools und Nova Function-Calling Schemas mit Sicherheitsmodell einsehen',
      category: 'Sidekick CLI',
      icon: <Code2 size={16} />,
      keywords: ['mcp', 'tools', 'schema', 'nova', 'functions', 'permissions', 'security'],
      action: () => {
        setActivePanel('chat');
        if (typeof window !== 'undefined') {
          void window.lastbrowser?.mcp?.listTools?.();
        }
      }
    },
    {
      id: 'sidekick-cli-config-show',
      title: '> Sidekick: config show',
      description: 'Aktuelle Sidekick-Konfiguration, Profile und aktive Einstellungen einsehen',
      category: 'Sidekick CLI',
      icon: <Settings size={16} />,
      keywords: ['config', 'show', 'yaml', 'einstellungen', 'profil', 'parameter'],
      action: () => {
        setActivePanel('settings');
      }
    },
    {
      id: 'sidekick-cli-config-edit',
      title: '> Sidekick: config edit',
      description: 'Konfigurationsdatei config.yaml im Standard-Editor oder Einstellungsfenster öffnen',
      category: 'Sidekick CLI',
      icon: <FileText size={16} />,
      keywords: ['config', 'edit', 'bearbeiten', 'yaml', 'editor', 'anpassen'],
      action: () => {
        setActivePanel('settings');
      }
    },
    {
      id: 'sidekick-cli-config-set',
      title: '> Sidekick: config set',
      description: 'Einen Konfigurationsparameter (Modell, Provider, Fallback, Pfade) festlegen',
      category: 'Sidekick CLI',
      icon: <Settings size={16} />,
      keywords: ['config', 'set', 'ändern', 'setzen', 'konfiguration', 'parameter'],
      action: () => {
        setActivePanel('settings');
      }
    },
    {
      id: 'sidekick-cli-gateway-start',
      title: '> Sidekick: gateway start',
      description: 'Messaging Gateway Daemon für externe Kanäle (WhatsApp, Slack, Telegram) im Hintergrund starten',
      category: 'Sidekick CLI',
      icon: <Zap size={16} />,
      keywords: ['gateway', 'start', 'daemon', 'hintergrund', 'service', 'messaging'],
      action: () => {
        dispatchCliEvent('sidekick gateway start');
      }
    },
    {
      id: 'sidekick-cli-gateway-stop',
      title: '> Sidekick: gateway stop',
      description: 'Laufenden Sidekick Gateway Daemon sauber anhalten',
      category: 'Sidekick CLI',
      icon: <X size={16} />,
      keywords: ['gateway', 'stop', 'beenden', 'stoppen', 'anhalten', 'kill'],
      action: () => {
        dispatchCliEvent('sidekick gateway stop');
      }
    },
    {
      id: 'sidekick-cli-gateway-status',
      title: '> Sidekick: gateway status',
      description: 'Betriebszustand und Verbindungsmetriken des Gateway Daemons abfragen',
      category: 'Sidekick CLI',
      icon: <Activity size={16} />,
      keywords: ['gateway', 'status', 'health', 'abfrage', 'daemon', 'ping'],
      action: () => {
        dispatchCliEvent('sidekick gateway status');
      }
    },
    {
      id: 'sidekick-cli-gateway-restart',
      title: '> Sidekick: gateway restart',
      description: 'Gateway Daemon neu starten und alle WebSocket-/Polling-Verbindungen erneuern',
      category: 'Sidekick CLI',
      icon: <RefreshCw size={16} />,
      keywords: ['gateway', 'restart', 'neustart', 'reload', 'erneuern'],
      action: () => {
        dispatchCliEvent('sidekick gateway restart');
      }
    },
    {
      id: 'sidekick-cli-gateway-install',
      title: '> Sidekick: gateway install',
      description: 'Sidekick Gateway als persistenten Systemdienst für automatischen Systemstart registrieren',
      category: 'Sidekick CLI',
      icon: <Server size={16} />,
      keywords: ['gateway', 'install', 'service', 'autostart', 'dienst', 'systemd'],
      action: () => {
        dispatchCliEvent('sidekick gateway install');
      }
    },
    {
      id: 'sidekick-cli-token-count',
      title: '> Sidekick: token count',
      description: 'Token-Verbrauch und Kontextfenster-Auslastung der aktuellen Konversation berechnen',
      category: 'Sidekick CLI',
      icon: <Scale size={16} />,
      keywords: ['token', 'count', 'tokens', 'verbrauch', 'auslastung', 'kontext', 'kosten'],
      action: () => {
        setActivePanel('chat');
      }
    },
    {
      id: 'sidekick-cli-rag-update',
      title: '> Sidekick: rag update',
      description: 'Lokalen RAG-Wissensindex aus Workspace-Dateien und Notizen aktualisieren',
      category: 'Sidekick CLI',
      icon: <BookOpen size={16} />,
      keywords: ['rag', 'update', 'wissen', 'retrieval', 'dokumente', 'workspace', 'embed'],
      action: () => {
        if (typeof window !== 'undefined') {
          void window.lastbrowser?.sidekick?.reindexSupermemory?.();
        }
      }
    },
    {
      id: 'sidekick-cli-model-list',
      title: '> Sidekick: model list',
      description: 'Alle verfügbaren KI-Modelle (Gemini, Claude, GPT, Ollama) auflisten',
      category: 'Sidekick CLI',
      icon: <Cpu size={16} />,
      keywords: ['model', 'list', 'modelle', 'gemini', 'claude', 'ollama', 'gpt', 'anbieter'],
      action: () => {
        setActivePanel('settings');
      }
    },
    {
      id: 'sidekick-cli-model-switch',
      title: '> Sidekick: model switch',
      description: 'Standard-Inferenzmodell für Nova AI interaktiv wechseln',
      category: 'Sidekick CLI',
      icon: <Shuffle size={16} />,
      keywords: ['model', 'switch', 'wechseln', 'auswahl', 'standard', 'umschalten'],
      action: () => {
        setActivePanel('settings');
      }
    },
    {
      id: 'sidekick-cli-fallback-list',
      title: '> Sidekick: fallback list',
      description: 'Aktuelle Provider-Ausfallkette (Fallback Chain) für Ausfallsicherheit anzeigen',
      category: 'Sidekick CLI',
      icon: <Layers size={16} />,
      keywords: ['fallback', 'list', 'ausfall', 'kette', 'chain', 'provider', 'backup'],
      action: () => {
        setActivePanel('settings');
      }
    },
    {
      id: 'sidekick-cli-sessions-list',
      title: '> Sidekick: sessions list',
      description: 'Alle protokollierten Chat- und Agentensitzungen mit Metadaten auflisten',
      category: 'Sidekick CLI',
      icon: <History size={16} />,
      keywords: ['sessions', 'list', 'sitzungen', 'verlauf', 'historie', 'chats'],
      action: () => {
        setActivePanel('chat');
      }
    },
    {
      id: 'sidekick-cli-sessions-browse',
      title: '> Sidekick: sessions browse',
      description: 'Interaktiver Sitzungs-Browser zum Durchsuchen und Wiederaufnehmen vergangener Aufgaben',
      category: 'Sidekick CLI',
      icon: <Search size={16} />,
      keywords: ['sessions', 'browse', 'durchsuchen', 'wiederaufnahme', 'resume'],
      action: () => {
        setActivePanel('chat');
      }
    },
    {
      id: 'sidekick-cli-sessions-rename',
      title: '> Sidekick: sessions rename',
      description: 'Titel einer bestehenden Agentensitzung für bessere Übersicht umbenennen',
      category: 'Sidekick CLI',
      icon: <FileText size={16} />,
      keywords: ['sessions', 'rename', 'titel', 'umbenennen', 'name', 'sitzung'],
      action: () => {
        setActivePanel('chat');
      }
    },
    {
      id: 'sidekick-cli-auth-status',
      title: '> Sidekick: auth status',
      description: 'Gültigkeit und Quoten aller hinterlegten API-Schlüssel und OAuth-Tokens prüfen',
      category: 'Sidekick CLI',
      icon: <ShieldCheck size={16} />,
      keywords: ['auth', 'status', 'token', 'quota', 'guthaben', 'prüfung', 'oauth'],
      action: () => {
        setActivePanel('settings');
      }
    },
    {
      id: 'sidekick-cli-auth-list',
      title: '> Sidekick: auth list',
      description: 'Alle im Schlüsselbund gespeicherten Provider-Anmeldedaten und Pools einsehen',
      category: 'Sidekick CLI',
      icon: <Shield size={16} />,
      keywords: ['auth', 'list', 'keys', 'schlüssel', 'credentials', 'pool'],
      action: () => {
        setActivePanel('settings');
      }
    },
    {
      id: 'sidekick-cli-auth-reset',
      title: '> Sidekick: auth reset',
      description: 'Erschöpfungsstatus (Rate Limit / Quota Exhaustion) für einen Provider zurücksetzen',
      category: 'Sidekick CLI',
      icon: <RotateCcw size={16} />,
      keywords: ['auth', 'reset', 'rate limit', 'entsperren', 'exhaustion', 'zurücksetzen'],
      action: () => {
        dispatchCliEvent('sidekick auth reset');
      }
    },
    {
      id: 'sidekick-cli-auth-logout',
      title: '> Sidekick: auth logout',
      description: 'Gespeicherte Authentifizierungsschlüssel und Anmelde-Tokens sicher aus dem Speicher löschen',
      category: 'Sidekick CLI',
      icon: <Trash2 size={16} />,
      keywords: ['auth', 'logout', 'abmelden', 'entfernen', 'löschen', 'clear'],
      action: () => {
        setActivePanel('settings');
      }
    },
    {
      id: 'sidekick-cli-cron-list',
      title: '> Sidekick: cron list',
      description: 'Geplante periodische Agenten-Aufgaben, Ausführungszeiten und Trigger anzeigen',
      category: 'Sidekick CLI',
      icon: <Kanban size={16} />,
      keywords: ['cron', 'list', 'zeitplan', 'jobs', 'zeitgesteuert', 'scheduler'],
      action: () => {
        setActivePanel('kanban');
      }
    },
    {
      id: 'sidekick-cli-cron-status',
      title: '> Sidekick: cron status',
      description: 'Betriebsbereitschaft des integrierten Cron-Schedulers prüfen',
      category: 'Sidekick CLI',
      icon: <Activity size={16} />,
      keywords: ['cron', 'status', 'scheduler', 'laufend', 'aktiv', 'trigger'],
      action: () => {
        dispatchCliEvent('sidekick cron status');
      }
    },
    {
      id: 'sidekick-cli-cron-pause',
      title: '> Sidekick: cron pause',
      description: 'Ausführung aller anstehenden Cron-Jobs vorübergehend unterbrechen',
      category: 'Sidekick CLI',
      icon: <X size={16} />,
      keywords: ['cron', 'pause', 'anhalten', 'unterbrechen', 'pausieren'],
      action: () => {
        dispatchCliEvent('sidekick cron pause');
      }
    },
    {
      id: 'sidekick-cli-cron-resume',
      title: '> Sidekick: cron resume',
      description: 'Pausierte Cron-Jobs und Zeitplaner wieder aufnehmen',
      category: 'Sidekick CLI',
      icon: <Zap size={16} />,
      keywords: ['cron', 'resume', 'fortsetzen', 'wiederaufnehmen', 'aktivieren'],
      action: () => {
        dispatchCliEvent('sidekick cron resume');
      }
    },
    {
      id: 'sidekick-cli-logs-tail',
      title: '> Sidekick: logs',
      description: 'Neueste System- und Agenten-Ereignisse aus agent.log in Echtzeit verfolgen',
      category: 'Sidekick CLI',
      icon: <Terminal size={16} />,
      keywords: ['logs', 'tail', 'agent.log', 'protokoll', 'terminal', 'ausgabe'],
      action: () => {
        setActivePanel('settings');
      }
    },
    {
      id: 'sidekick-cli-logs-errors',
      title: '> Sidekick: logs errors',
      description: 'Gefilterte Fehlerprotokolle und Exception-Stacktraces aus errors.log anzeigen',
      category: 'Sidekick CLI',
      icon: <ShieldAlert size={16} />,
      keywords: ['logs', 'errors', 'fehler', 'exception', 'errors.log', 'crash'],
      action: () => {
        setActivePanel('settings');
      }
    },
    {
      id: 'sidekick-cli-backup-create',
      title: '> Sidekick: backup create',
      description: 'Vollständige Sicherung aller Konfigurationen, Memories und Arbeitsstände erstellen',
      category: 'Sidekick CLI',
      icon: <Download size={16} />,
      keywords: ['backup', 'create', 'sicherung', 'export', 'archiv', 'erstellen'],
      action: () => {
        dispatchCliEvent('sidekick backup create');
      }
    },
    {
      id: 'sidekick-cli-backup-restore',
      title: '> Sidekick: backup restore',
      description: 'Systemzustand und Datenbestände aus einem früheren Sicherungsarchiv wiederherstellen',
      category: 'Sidekick CLI',
      icon: <RotateCcw size={16} />,
      keywords: ['backup', 'restore', 'wiederherstellen', 'archiv', 'import', 'laden'],
      action: () => {
        dispatchCliEvent('sidekick backup restore');
      }
    },
    {
      id: 'sidekick-cli-checkpoints-list',
      title: '> Sidekick: checkpoints list',
      description: 'Automatische Dateisystem-Wiederherstellungspunkte vor Dateiänderungen anzeigen',
      category: 'Sidekick CLI',
      icon: <Bookmark size={16} />,
      keywords: ['checkpoints', 'list', 'prüfpunkte', 'wiederherstellung', 'dateien', 'stände'],
      action: () => {
        setActivePanel('workspaces');
      }
    },
    {
      id: 'sidekick-cli-checkpoints-rollback',
      title: '> Sidekick: checkpoints rollback',
      description: 'Dateisystem auf den unmittelbar vorherigen Sicherheits-Checkpoint zurücksetzen',
      category: 'Sidekick CLI',
      icon: <RotateCcw size={16} />,
      keywords: ['checkpoints', 'rollback', 'zurücksetzen', 'undo', 'revert', 'sicherheit'],
      action: () => {
        dispatchCliEvent('sidekick checkpoints rollback');
      }
    },
    {
      id: 'sidekick-cli-skills-list',
      title: '> Sidekick: skills list',
      description: 'Übersicht aller aktiven und erweiterbaren Agenten-Skills im integrierten Katalog',
      category: 'Sidekick CLI',
      icon: <Puzzle size={16} />,
      keywords: ['skills', 'list', 'fähigkeiten', 'katalog', 'prompts', 'werkzeuge'],
      action: () => {
        setActivePanel('chat');
      }
    },
    {
      id: 'sidekick-cli-kanban-diagnostics',
      title: '> Sidekick: kanban diagnostics',
      description: 'Datenbank-Integritätsprüfung für Kanban-Board und Task-Pipelines durchführen',
      category: 'Sidekick CLI',
      icon: <Kanban size={16} />,
      keywords: ['kanban', 'diagnostics', 'board', 'aufgaben', 'pipeline', 'datenbank'],
      action: () => {
        setActivePanel('kanban');
      }
    },
    {
      id: 'sidekick-cli-insights-report',
      title: '> Sidekick: insights',
      description: 'Produktivitäts-Kennzahlen, Token-Statistiken und Agenten-Erfolgsraten einsehen',
      category: 'Sidekick CLI',
      icon: <Table size={16} />,
      keywords: ['insights', 'analytics', 'metriken', 'statistik', 'bericht', 'produktivität'],
      action: () => {
        setActivePanel('chat');
      }
    },
    {
      id: 'sidekick-cli-version',
      title: '> Sidekick: version',
      description: 'Installierte Engine-Version, Commit-Hash und Umgebungsinformationen abfragen',
      category: 'Sidekick CLI',
      icon: <Terminal size={16} />,
      keywords: ['version', 'build', 'commit', 'info', 'release', 'stand'],
      action: () => {
        dispatchCliEvent('sidekick version');
      }
    }
  ];
}

export function CommandPalette(): JSX.Element | null {
  const { t } = useDesktopI18n();
  const { commandPaletteOpen, setCommandPaletteOpen, setActivePanel, toggleFindOpen, setDownloadsOpen, setHistoryOpen, setPermissionsOpen } =
    usePanelStore();
  const {
    tabs,
    activeTabId,
    setActiveTabId,
    addTab,
    closeTab,
    reopenClosedTab,
    closeDuplicateTabs,
    sortTabsByDomain,
    closeUnpinnedTabs,
    toggleTabPinned,
    toggleTabMute
  } = useTabStore();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? tabs[0],
    [tabs, activeTabId]
  );

  const pinnedApps = usePinnedAppStore(s => s.apps);

  // Focus input when opened and reset query
  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [commandPaletteOpen]);

  // Build command catalog
  const staticCommands = useMemo<CommandItem[]>(() => {
    const cmds: CommandItem[] = [
      // --- Nova AI ---
      {
        id: 'sidekick-chat',
        title: 'Nova: Neuer Chat',
        description: 'Öffnet den KI-Chat-Arbeitsbereich',
        category: 'Nova AI',
        icon: <Sparkles size={16} />,
        keywords: ['ai', 'chat', 'sidekick', 'gpt', 'claude', 'gemini', 'frage', 'dialog'],
        action: () => {
          setActivePanel('chat');
        }
      },
      {
        id: 'ai-discover-form',
        title: 'KI-Assistent: Formularfelder analysieren',
        description: 'Scannt alle Formularfelder, Eingaben und Submit-Buttons der aktuellen Seite',
        category: 'Nova AI',
        icon: <Sparkles size={16} />,
        keywords: ['formular', 'form', 'felder', 'inputs', 'ausfüllen', 'analyse', 'autofill'],
        action: () => {
          const webview = getActiveWebview();
          void discoverActiveForm(webview);
        }
      },
      {
        id: 'ai-paginate',
        title: 'KI-Assistent: Nächste Seite aufrufen (Paginieren)',
        description: 'Findet den nächsten Seitenlink und blättert live mit visuellem Marker weiter',
        category: 'Nova AI',
        icon: <ExternalLink size={16} />,
        keywords: ['paginieren', 'weiter', 'nächste seite', 'next', 'pagination', 'blättern'],
        action: () => {
          const webview = getActiveWebview();
          void triggerLivePagination(webview);
        }
      },
      {
        id: 'ai-abort-automation',
        title: 'KI-Assistent: Automatisierung abbrechen',
        description: 'Bricht jede laufende Live-Aktion sofort ab und entfernt visuelle Marker',
        category: 'Nova AI',
        icon: <X size={16} />,
        shortcut: 'Esc',
        keywords: ['abbrechen', 'stop', 'abort', 'cancel', 'halt'],
        action: () => {
          const webview = getActiveWebview();
          abortLiveAutomation(webview);
        }
      },
      {
        id: 'sidekick-doctor',
        title: 'Doctor: Systemdiagnose ausführen',
        description: 'Prüft Status aller KI-Runtimes, Profile und Services',
        category: 'Nova AI',
        icon: <Cpu size={16} />,
        keywords: ['doctor', 'health', 'diagnose', 'system', 'check', 'status', 'prüfen'],
        action: () => {
          setActivePanel('settings');
        }
      },
      {
        id: 'sidekick-supermemory',
        title: 'Supermemory: Reindizieren & Suchen',
        description: 'Verwaltet Fakten, Kontext und Langzeitgedächtnis',
        category: 'Nova AI',
        icon: <Database size={16} />,
        keywords: ['memory', 'gedächtnis', 'supermemory', 'fakten', 'kontext', 'vektor'],
        action: () => {
          setActivePanel('memory');
        }
      },
      {
        id: 'sidekick-profiles',
        title: 'Profil wechseln / Profile verwalten',
        description: 'Wechselt Identitäten, isolierte Cookies und Profile',
        category: 'Nova AI',
        icon: <Users size={16} />,
        keywords: ['profil', 'profile', 'identität', 'user', 'persona', 'account'],
        action: () => {
          setActivePanel('profiles');
        }
      },
      {
        id: 'sidekick-models',
        title: 'Modell & Provider konfigurieren',
        description: 'Öffnet KI-Modellauswahl (Claude, OpenAI, Gemini, Ollama)',
        category: 'Nova AI',
        icon: <Bot size={16} />,
        keywords: ['modell', 'model', 'provider', 'ollama', 'anthropic', 'openai', 'gemini', 'openrouter'],
        action: () => {
          setActivePanel('settings');
        }
      },
      {
        id: 'sidekick-google-accounts',
        title: 'Google Accounts & Round-Robin verwalten',
        description: 'Multi-Account OAuth für Google Gemini CLI (Antigravity) konfigurieren',
        category: 'Nova AI',
        icon: <Users size={16} />,
        keywords: ['google', 'account', 'oauth', 'round-robin', 'gemini', 'gravity', 'antigravity', 'token', 'verbrauch'],
        action: () => {
          setActivePanel('settings');
          usePanelStore.getState().setActiveContextItem('google-accounts');
        }
      },
      {
        id: 'sidekick-gemini-cli-flash-38',
        title: 'Modell: Gemini 3.8 Flash (Google CLI / Antigravity - Standard)',
        description: 'Neuestes Standardmodell von Google mit extrem hoher Geschwindigkeit & 1M Kontext',
        category: 'Nova AI',
        icon: <Zap size={16} />,
        keywords: ['gemini', '3.8', 'flash', 'google', 'cli', 'antigravity', 'gravity', 'modell', 'default', 'standard'],
        action: () => {
          void window.lastbrowser?.sidekick?.setDefaultModel({ model: 'gemini-3.8-flash' });
        }
      },
      {
        id: 'sidekick-gemini-cli-flash',
        title: 'Modell: Gemini 2.5 Flash (Google CLI / Antigravity)',
        description: 'Schnelles KI-Modell mit Google OAuth & 1M Token Kontext',
        category: 'Nova AI',
        icon: <Zap size={16} />,
        keywords: ['gemini', 'flash', 'google', 'cli', 'antigravity', 'gravity', 'modell'],
        action: () => {
          void window.lastbrowser?.sidekick?.setDefaultModel({ model: 'gemini-2.5-flash' });
        }
      },
      {
        id: 'sidekick-gemini-cli-pro',
        title: 'Modell: Gemini 2.5 Pro (Google CLI / Antigravity)',
        description: 'Tiefes Reasoning & komplexes Coding mit Google OAuth',
        category: 'Nova AI',
        icon: <Bot size={16} />,
        keywords: ['gemini', 'pro', 'google', 'cli', 'antigravity', 'gravity', 'reasoning', 'modell'],
        action: () => {
          void window.lastbrowser?.sidekick?.setDefaultModel({ model: 'gemini-2.5-pro' });
        }
      },
      {
        id: 'sidekick-gemini-round-robin-toggle',
        title: 'Google Round-Robin: Token-Rotation umschalten',
        description: 'Gleichmäßigen Tokenverbrauch über alle Google-Konten ein-/ausschalten',
        category: 'Nova AI',
        icon: <Shuffle size={16} />,
        keywords: ['round-robin', 'google', 'rotation', 'token', 'balance', 'wechseln'],
        action: () => {
          const s = useGeminiAccountStore.getState();
          s.setRoundRobinEnabled(!s.roundRobinEnabled);
        }
      },
      {
        id: 'sidekick-gemini-round-robin-next',
        title: 'Google Round-Robin: Nächstes Konto aktivieren',
        description: 'Sofort zum nächsten verbundenen Google-Konto rotieren',
        category: 'Nova AI',
        icon: <RefreshCw size={16} />,
        keywords: ['round-robin', 'nächstes', 'konto', 'account', 'wechseln', 'rotieren'],
        action: () => {
          useGeminiAccountStore.getState().getNextAccount();
        }
      },
      {
        id: 'sidekick-terminal',
        title: 'TUI / Terminal öffnen',
        description: 'Integriertes Developer-Terminal und Shell starten',
        category: 'Nova AI',
        icon: <Terminal size={16} />,
        keywords: ['terminal', 'tui', 'shell', 'bash', 'cmd', 'powershell', 'cli'],
        action: () => {
          setActivePanel('terminal');
        }
      },
      {
        id: 'sidekick-agents',
        title: 'Agenten Dashboard anzeigen',
        description: 'Autonome Hintergrund-Agenten und Aufgaben steuern',
        category: 'Nova AI',
        icon: <Bot size={16} />,
        keywords: ['agent', 'agenten', 'worker', 'subagent', 'aufgaben', 'bot'],
        action: () => {
          setActivePanel('agents');
        }
      },
      {
        id: 'sidekick-skills',
        title: 'Skills verwalten & bearbeiten',
        description: 'Agent Skills, Tool-Integrationen und Workflows anpassen',
        category: 'Nova AI',
        icon: <Puzzle size={16} />,
        keywords: ['skill', 'fähigkeiten', 'mcp', 'tools', 'werkzeuge'],
        action: () => {
          setActivePanel('skills');
        }
      },
      {
        id: 'sidekick-kanban',
        title: 'Kanban Board öffnen',
        description: 'Aufgaben-Pipeline und Projekt-Board ansehen',
        category: 'Nova AI',
        icon: <Kanban size={16} />,
        keywords: ['kanban', 'tasks', 'board', 'aufgaben', 'triage', 'todo'],
        action: () => {
          setActivePanel('kanban');
        }
      },
      {
        id: 'sidekick-workspaces',
        title: 'Workspaces & Spaces durchsuchen',
        description: 'Lokale Verzeichnisse, Projekte und Arbeitsbereiche öffnen',
        category: 'Nova AI',
        icon: <Folder size={16} />,
        keywords: ['workspace', 'spaces', 'verzeichnis', 'projekt', 'dateien'],
        action: () => {
          setActivePanel('workspaces');
        }
      },

      // --- Sidekick CLI Subcommands (Paket 1.2) ---
      ...buildSidekickCliCommands(setActivePanel, t),

      // --- Agentic Workflow Templates (Phase 11.2) ---
      ...WORKFLOW_TEMPLATES.map((tmpl): CommandItem => ({
        id: `workflow-${tmpl.id}`,
        title: `> Workflow: ${tmpl.title}`,
        description: tmpl.description,
        category: 'Workflows',
        icon: tmpl.id === 'competitor-analysis' ? <Scale size={16} /> :
              tmpl.id === 'markdown-extractor' ? <FileText size={16} /> :
              tmpl.id === 'table-to-csv' ? <Table size={16} /> :
              tmpl.id === 'page-audit' ? <ShieldAlert size={16} /> :
              tmpl.id === 'action-items' ? <CheckSquare size={16} /> :
              <Zap size={16} />,
        keywords: [
          'workflow',
          'agent',
          tmpl.category,
          tmpl.id,
          ...tmpl.title.toLowerCase().split(' '),
          ...tmpl.description.toLowerCase().split(' ')
        ],
        action: () => {
          const prompt = formatWorkflowPrompt(tmpl, activeTab?.url, activeTab?.title);
          usePanelStore.getState().setCopilotOpen(true);
          window.dispatchEvent(new CustomEvent('lastbrowser:workflow:send', { detail: { prompt } }));
        }
      })),

      // --- Tab Management Tools (Phase 10.4) ---
      {
        id: 'tab-close-duplicates',
        title: 'Doppelte Tabs schließen',
        description: 'Findet identische URLs und schließt redundante Tabs',
        category: 'Tabs',
        icon: <Copy size={16} />,
        keywords: ['doppelt', 'duplikate', 'duplicate', 'bereinigen', 'clean', 'redundant'],
        action: () => {
          closeDuplicateTabs();
        }
      },
      {
        id: 'tab-sort-by-domain',
        title: 'Tabs nach Domain sortieren',
        description: 'Gruppiert offene Tabs alphabetisch nach Hostname / Website',
        category: 'Tabs',
        icon: <ArrowUpDown size={16} />,
        keywords: ['sortieren', 'domain', 'host', 'alphabetisch', 'ordnung', 'group'],
        action: () => {
          sortTabsByDomain();
        }
      },
      {
        id: 'tab-close-unpinned',
        title: 'Nicht angepinnte Tabs schließen',
        description: 'Behält nur angeheftete Tabs und schließt alle anderen',
        category: 'Tabs',
        icon: <Trash2 size={16} />,
        keywords: ['unpinned', 'löschen', 'schließen', 'close all', 'nicht angepinnt'],
        action: () => {
          closeUnpinnedTabs();
        }
      },
      {
        id: 'tab-bookmark-all',
        title: 'Lesezeichen-Ordner aus Tabs erstellen',
        description: 'Speichert alle gültigen offenen Tabs in einem Lesezeichen-Ordner',
        category: 'Tabs',
        icon: <Bookmark size={16} />,
        keywords: ['lesezeichen', 'bookmark', 'ordner', 'speichern', 'folder', 'tabs merken'],
        action: () => {
          void executeBrowserAction({
            type: 'create_bookmark_folder',
            params: { folderName: `Tabs ${new Date().toLocaleDateString()}` }
          });
        }
      },
      {
        id: 'tab-group-workspace',
        title: 'Tabs in neuem Workspace bündeln',
        description: 'Erstellt einen neuen Workspace mit einer Markdown-Übersicht aller aktiven Tabs',
        category: 'Tabs',
        icon: <FolderPlus size={16} />,
        keywords: ['workspace', 'space', 'bündeln', 'group', 'projekt', 'tab gruppe'],
        action: () => {
          void executeBrowserAction({
            type: 'group_tabs_to_space',
            params: { spaceName: `Session-${new Date().toISOString().slice(0, 10)}` }
          });
        }
      },
      {
        id: 'tab-new',
        title: 'Neuer Tab',
        description: 'Öffnet einen leeren neuen Tab',
        category: 'Tabs',
        icon: <Plus size={16} />,
        shortcut: 'Ctrl+T',
        keywords: ['neu', 'new tab', 'öffnen', 'reiter'],
        action: () => {
          addTab();
          setActivePanel('browser');
        }
      },
      {
        id: 'tab-new-incognito',
        title: 'Neuer Inkognito-Tab',
        description: 'Öffnet einen privaten Tab ohne Verlaufsspeicherung',
        category: 'Tabs',
        icon: <ShieldCheck size={16} />,
        shortcut: 'Ctrl+Shift+N',
        keywords: ['privat', 'inkognito', 'incognito', 'anonym'],
        action: () => {
          addTab(browserStartUrl, { incognito: true });
          setActivePanel('browser');
        }
      },
      {
        id: 'tab-close-current',
        title: 'Aktuellen Tab schließen',
        description: 'Schließt den derzeit aktiven Tab',
        category: 'Tabs',
        icon: <X size={16} />,
        shortcut: 'Ctrl+W',
        keywords: ['close', 'schließen', 'tab weg', 'reiter zu'],
        action: () => {
          if (activeTab) closeTab(activeTab.id);
        }
      },
      {
        id: 'tab-reopen-closed',
        title: 'Geschlossenen Tab wiederherstellen',
        description: 'Öffnet den zuletzt geschlossenen Tab erneut',
        category: 'Tabs',
        icon: <RefreshCw size={16} />,
        shortcut: 'Ctrl+Shift+T',
        keywords: ['wiederherstellen', 'undo', 'reopen', 'restore', 'rückgängig'],
        action: () => {
          reopenClosedTab();
          setActivePanel('browser');
        }
      },
      {
        id: 'tab-toggle-pin',
        title: activeTab?.pinned ? 'Tab lösen (Unpin)' : 'Tab anpinnen (Pin)',
        description: 'Pinnt den aktuellen Tab links in der Tab-Leiste fest',
        category: 'Tabs',
        icon: <Pin size={16} />,
        keywords: ['pin', 'anpinnen', 'festheften', 'fixieren'],
        action: () => {
          if (activeTab) toggleTabPinned(activeTab.id);
        }
      },
      {
        id: 'tab-toggle-mute',
        title: activeTab?.muted ? 'Audio aktivieren (Unmute)' : 'Tab stummschalten (Mute)',
        description: 'Schaltet die Audioausgabe des Tabs stumm oder aktiv',
        category: 'Tabs',
        icon: activeTab?.muted ? <Volume2 size={16} /> : <VolumeX size={16} />,
        keywords: ['mute', 'stumm', 'lautstärke', 'ton', 'audio', 'sound'],
        action: () => {
          if (activeTab) toggleTabMute(activeTab.id);
        }
      },

      // --- Navigation & Browser Actions ---
      {
        id: 'nav-downloads',
        title: 'Downloads anzeigen',
        description: 'Öffnet die Liste aller heruntergeladenen Dateien',
        category: 'Navigation',
        icon: <Download size={16} />,
        shortcut: 'Ctrl+J',
        keywords: ['download', 'downloads', 'dateien', 'übertragungen'],
        action: () => {
          setDownloadsOpen(true);
        }
      },
      {
        id: 'nav-history',
        title: 'Verlauf anzeigen',
        description: 'Zeigt die Chronik der besuchten Webseiten',
        category: 'Navigation',
        icon: <History size={16} />,
        shortcut: 'Ctrl+H',
        keywords: ['history', 'verlauf', 'chronik', 'besucht', 'seiten'],
        action: () => {
          setHistoryOpen(true);
        }
      },
      {
        id: 'nav-find',
        title: 'In Seite suchen',
        description: 'Öffnet die Textsuche für die aktuelle Webseite',
        category: 'Navigation',
        icon: <Search size={16} />,
        shortcut: 'Ctrl+F',
        keywords: ['suchen', 'find', 'page search', 'textsuche'],
        action: () => {
          toggleFindOpen();
        }
      },
      {
        id: 'nav-settings',
        title: 'Einstellungen öffnen',
        description: 'Browser-Konfiguration, Themes und Vorlieben anpassen',
        category: 'Navigation',
        icon: <Settings size={16} />,
        shortcut: 'Ctrl+,',
        keywords: ['settings', 'einstellungen', 'optionen', 'config', 'präferenzen'],
        action: () => {
          setActivePanel('settings');
        }
      },
      {
        id: 'nav-permissions',
        title: 'Website-Berechtigungen',
        description: 'Kamera, Mikrofon und Standort-Rechte verwalten',
        category: 'Navigation',
        icon: <ShieldCheck size={16} />,
        keywords: ['permissions', 'rechte', 'berechtigungen', 'kamera', 'mikrofon'],
        action: () => {
          setPermissionsOpen(true);
        }
      },
      {
        id: 'nav-devtools',
        title: 'Developer Tools umschalten',
        description: 'Öffnet die Chromium Entwicklerwerkzeuge für Web-Debugging',
        category: 'Navigation',
        icon: <Code2 size={16} />,
        shortcut: 'F12',
        keywords: ['devtools', 'inspect', 'elemente', 'console', 'debug'],
        action: () => {
          // Devtools toggle shortcut
          window.dispatchEvent(new CustomEvent('lastbrowser:toggle-devtools'));
        }
      },
      {
        id: 'nav-fullscreen',
        title: 'Vollbild umschalten',
        description: 'Vollbildmodus aktivieren oder verlassen',
        category: 'Navigation',
        icon: <Maximize size={16} />,
        shortcut: 'F11',
        keywords: ['fullscreen', 'vollbild', 'maximieren'],
        action: () => {
          void window.lastbrowser?.window?.toggleFullScreen?.();
        }
      },
      {
        id: 'nav-print',
        title: 'Aktuelle Seite drucken',
        description: 'Druckdialog für den aktuellen Tab aufrufen',
        category: 'Navigation',
        icon: <Printer size={16} />,
        shortcut: 'Ctrl+P',
        keywords: ['print', 'drucken', 'pdf', 'exportieren'],
        action: () => {
          window.dispatchEvent(new CustomEvent('lastbrowser:print-page'));
        }
      },
      // --- Pinned Apps (dynamic) ---
      ...pinnedApps.map((app): CommandItem => ({
        id: `pinned-app-${app.id}`,
        title: `> App: ${app.name}`,
        description: app.url || app.panel,
        category: 'Apps',
        icon: <Pin size={16} />,
        keywords: ['app', 'pinned', 'pin', app.name.toLowerCase(), ...(app.url ? [app.url] : [])],
        action: () => {
          if (app.panel) {
            setActivePanel(app.panel);
          } else if (app.url) {
            addTab(app.url);
          }
        }
      })),
    ];

    const categoryMap: Record<string, string> = {
      'Nova AI': t('commands.category.nova'),
      'Tabs': t('commands.category.tabs'),
      'Navigation': t('commands.category.navigation'),
      'System': t('commands.category.system'),
      'Workflows': t('commands.category.workflows'),
      'Apps': t('commands.category.apps'),
      'Sidekick CLI': t('commands.category.cli')
    };

    return cmds.map((cmd) => ({
      ...cmd,
      category: (categoryMap[cmd.category] || cmd.category) as any
    }));
  }, [
    activeTab,
    pinnedApps,
    addTab,
    closeDuplicateTabs,
    closeTab,
    closeUnpinnedTabs,
    reopenClosedTab,
    setActivePanel,
    setDownloadsOpen,
    setHistoryOpen,
    setPermissionsOpen,
    sortTabsByDomain,
    toggleFindOpen,
    toggleTabMute,
    toggleTabPinned,
    t
  ]);

  // Dynamic commands: Matching open tabs
  const tabCommands = useMemo<CommandItem[]>(() => {
    return tabs.map((tItem) => ({
      id: `tab-jump-${tItem.id}`,
      title: tItem.title || 'Neuer Tab',
      description: tItem.url,
      category: t('commands.category.openTabs') as any,
      icon: <ExternalLink size={16} />,
      keywords: [tItem.title, tItem.url, 'switch tab', 'tab wechseln'],
      action: () => {
        setActiveTabId(tItem.id);
        setActivePanel('browser');
      }
    }));
  }, [tabs, setActiveTabId, setActivePanel, t]);

  // Combined and filtered items
  const filteredItems = useMemo(() => {
    const rawClean = query.trim().replace(/^>/, '').trim().toLowerCase();
    if (!rawClean) {
      return staticCommands;
    }

    const matchesFilter = (item: CommandItem): boolean => {
      if (item.title.toLowerCase().includes(rawClean)) return true;
      if (item.description?.toLowerCase().includes(rawClean)) return true;
      if (item.category.toLowerCase().includes(rawClean)) return true;
      if (item.keywords?.some((k) => k.toLowerCase().includes(rawClean))) return true;
      return false;
    };

    const matchedStatic = staticCommands.filter(matchesFilter);
    const matchedTabs = tabCommands.filter(matchesFilter);

    return [...matchedTabs, ...matchedStatic];
  }, [query, staticCommands, tabCommands]);

  // Adjust selection bounds when items change
  useEffect(() => {
    setSelectedIndex((prev) => {
      if (filteredItems.length === 0) return 0;
      return Math.min(prev, filteredItems.length - 1);
    });
  }, [filteredItems.length]);

  // Ensure selected item is scrolled into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector<HTMLElement>('[data-selected="true"]');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!commandPaletteOpen) {
    return null;
  }

  const handleExecute = (item: CommandItem) => {
    setCommandPaletteOpen(false);
    item.action();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setCommandPaletteOpen(false);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length ? (prev + 1) % filteredItems.length : 0));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length ? (prev - 1 + filteredItems.length) % filteredItems.length : 0));
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredItems[selectedIndex];
      if (selected) {
        handleExecute(selected);
      }
    }
  };

  return (
    <div
      className="command-palette-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setCommandPaletteOpen(false);
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Universal Command Palette"
    >
      <div className="command-palette-dialog" onKeyDown={handleKeyDown}>
        <div className="command-palette-search-wrapper">
          <Command size={18} className="command-palette-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            value={query}
            placeholder={t('commands.placeholder')}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            aria-autocomplete="list"
          />
          <span className="command-palette-shortcut-badge">{`ESC ${t('common.close')}`}</span>
        </div>

        <div className="command-palette-list" ref={listRef} role="listbox">
          {filteredItems.length === 0 ? (
            <div className="command-palette-empty">
              <p>{t('common.noData')}</p>
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  className={`command-palette-item ${isSelected ? 'selected' : ''}`}
                  data-selected={isSelected}
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => handleExecute(item)}
                >
                  <div className="command-palette-item-icon">{item.icon}</div>
                  <div className="command-palette-item-content">
                    <span className="command-palette-item-title">{item.title}</span>
                    {item.description && (
                      <span className="command-palette-item-desc">{item.description}</span>
                    )}
                  </div>
                  <div className="command-palette-item-meta">
                    <span className="command-palette-item-category">{item.category}</span>
                    {item.shortcut && (
                      <kbd className="command-palette-item-kbd">{item.shortcut}</kbd>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="command-palette-footer">
          <span className="command-palette-footer-hint">
            <kbd>↑</kbd> <kbd>↓</kbd> {t('common.view')}
          </span>
          <span className="command-palette-footer-hint">
            <kbd>↵</kbd> {t('common.run')}
          </span>
          <span className="command-palette-footer-hint">
            <kbd>ESC</kbd> {t('common.cancel')}
          </span>
        </div>
      </div>
    </div>
  );
}
