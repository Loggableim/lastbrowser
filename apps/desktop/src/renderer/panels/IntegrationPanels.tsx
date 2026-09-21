import React, { FormEvent, useEffect, useState } from 'react';
import {
  Edit3,
  Inbox,
  Mail,
  MessageSquare,
  Plus,
  Save,
  Search,
  Send,
  Shield,
  Sparkles,
  Terminal,
  Trash2,
  Users,
  Radio,
  RefreshCw,
  Play,
  Square,
  Smartphone,
  Globe,
  Hash
} from 'lucide-react';
import { AdvancedWebUiTools } from './AdvancedWebUiTools.js';
import {
  type ServiceStatus,
  type AnyRecord,
  useApiState,
  isReady,
  arrayFrom,
  text,
  titleOf,
  idOf,
  jsonPreview,
  NativeHeader,
  ErrorLine,
  EmptyState
} from './RestPanelShared.js';

export function NativeGmailMain({ serviceStatus, activeContextItem }: { serviceStatus: ServiceStatus | null; activeContextItem: string }): JSX.Element {
  const ready = isReady(serviceStatus);
  const accounts = useApiState(() => window.lastbrowser.sidekick.listGmailAccounts(), [ready], ready);
  const folders = useApiState(() => window.lastbrowser.sidekick.listGmailFolders(), [ready], ready);
  const [folder, setFolder] = useState('inbox');
  const [query, setQuery] = useState('');
  const [section, setSection] = useState(activeContextItem || 'Inbox');
  const messages = useApiState(() => query.trim()
    ? window.lastbrowser.sidekick.searchGmailMessages({ query, max: 25 })
    : window.lastbrowser.sidekick.listGmailMessages({ folder, max: 25 }), [ready, folder, query], ready);
  const [selected, setSelected] = useState<AnyRecord | null>(null);
  const [detail, setDetail] = useState<AnyRecord | null>(null);
  const [compose, setCompose] = useState({ to: '', subject: '', body: '' });
  const mailItems = arrayFrom(messages.data, ['messages', 'threads', 'items']);

  useEffect(() => {
    const nextSection = activeContextItem || 'Inbox';
    setSection(nextSection);
    if (nextSection === 'Accounts') {
      setFolder('inbox');
      setQuery('');
    }
    if (nextSection === 'Search') {
      setQuery((current) => current || '');
    }
    if (nextSection === 'Inbox') {
      setQuery('');
      setFolder('inbox');
    }
  }, [activeContextItem]);

  async function openMessage(item: AnyRecord): Promise<void> {
    setSelected(item);
    setDetail(await window.lastbrowser.sidekick.readGmailMessage({ id: idOf(item), messageId: idOf(item), threadId: text(item.thread_id) }));
  }

  async function aiAction(action: 'summary' | 'draft' | 'task'): Promise<void> {
    const request = { id: idOf(selected || {}), messageId: idOf(selected || {}), threadId: text(selected?.thread_id), title: titleOf(selected || {}, 'Follow up') };
    const payload = action === 'summary'
      ? await window.lastbrowser.sidekick.summarizeGmailThread(request)
      : action === 'draft'
        ? await window.lastbrowser.sidekick.draftGmailReply({ ...request, variants: 3, instruction: 'Draft a concise reply.' })
        : await window.lastbrowser.sidekick.createGmailTask(request);
    setDetail(payload);
  }

  async function sendCompose(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!compose.to.trim() || !compose.body.trim()) return;
    const payload = await window.lastbrowser.sidekick.sendGmailMessage(compose);
    setDetail(payload);
    setCompose({ to: '', subject: '', body: '' });
    await messages.refresh();
  }

  async function deleteSelected(): Promise<void> {
    if (!selected || !window.confirm(`Delete ${titleOf(selected, 'message')}?`)) return;
    await window.lastbrowser.sidekick.deleteGmailMessage({ id: idOf(selected), messageId: idOf(selected), threadId: text(selected.thread_id) });
    setSelected(null);
    setDetail(null);
    await messages.refresh();
  }

  async function moveSelected(targetFolder: string): Promise<void> {
    if (!selected) return;
    await window.lastbrowser.sidekick.moveGmailMessage({ id: idOf(selected), messageId: idOf(selected), threadId: text(selected.thread_id), folder: targetFolder });
    await messages.refresh();
  }

  return (
    <section className="browser-main native-rest-main gmail-main">
      <NativeHeader icon={<Mail size={21} />} title="Gmail" kicker="Mail" detail="Accounts, folders, search, thread readout and AI actions with native controls." loading={messages.loading} ready={ready} onRefresh={messages.refresh} />
      <AdvancedWebUiTools panel="gmail" serviceStatus={serviceStatus} compact />
      <div className="native-card-actions insights-tabs">
        {['Accounts', 'Inbox', 'Search', 'AI actions'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </div>
      <div className="native-rest-split">
        <aside className="integration-list">
          <div className="native-search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Gmail..." /></div>
          <select value={folder} onChange={(event) => setFolder(event.target.value)}>
            {['inbox', ...arrayFrom(folders.data, ['folders', 'labels']).map((item) => titleOf(item))].map((item) => <option key={item}>{item}</option>)}
          </select>
          {section !== 'Accounts' && mailItems.map((item) => <button key={idOf(item)} type="button" className="integration-row" onClick={() => void openMessage(item)}><Inbox size={18} /><span>{titleOf(item, 'Message')}</span><small>{text(item.from || item.sender || item.date)}</small></button>)}
          {!mailItems.length && section !== 'Accounts' && <EmptyState icon={<Mail size={22} />} label={ready ? 'No mail loaded.' : 'Sidekick is starting.'} />}
          {section === 'Accounts' && <EmptyState icon={<Mail size={22} />} label={ready ? 'Accounts overview selected.' : 'Sidekick is starting.'} />}
        </aside>
        <main className="native-rest-detail">
          <ErrorLine error={accounts.error || folders.error || messages.error} />
          <section className="native-work-card detail-json-card">
            <header>
              <strong>{section}: {selected ? titleOf(selected, 'Selected message') : 'Gmail detail'}</strong>
              <div className="native-card-actions">
                <button type="button" onClick={() => void aiAction('summary')} disabled={!selected}><Sparkles size={13} /><span>Summary</span></button>
                <button type="button" onClick={() => void aiAction('draft')} disabled={!selected}><Edit3 size={13} /><span>Draft</span></button>
                <button type="button" onClick={() => void aiAction('task')} disabled={!selected}><Plus size={13} /><span>Task</span></button>
                <button type="button" onClick={() => void moveSelected('archive')} disabled={!selected}><Inbox size={13} /><span>Archive</span></button>
                <button type="button" className="danger" onClick={() => void deleteSelected()} disabled={!selected}><Trash2 size={13} /><span>Delete</span></button>
              </div>
            </header>
            <pre>{jsonPreview(section === 'Accounts' ? accounts.data || {} : section === 'Search' ? { query, results: messages.data || {} } : detail || accounts.data || {})}</pre>
          </section>
          <form className="native-work-card gmail-compose" onSubmit={(event) => void sendCompose(event)}>
            <header><strong>Compose</strong><button type="submit" disabled={!ready || !compose.to.trim() || !compose.body.trim()}><Send size={13} />Send</button></header>
            <input value={compose.to} onChange={(event) => setCompose({ ...compose, to: event.target.value })} placeholder="To" />
            <input value={compose.subject} onChange={(event) => setCompose({ ...compose, subject: event.target.value })} placeholder="Subject" />
            <textarea value={compose.body} onChange={(event) => setCompose({ ...compose, body: event.target.value })} placeholder="Message body" />
          </form>
        </main>
      </div>
    </section>
  );
}

export function NativeDiscordMain({ serviceStatus, activeContextItem }: { serviceStatus: ServiceStatus | null; activeContextItem: string }): JSX.Element {
  const ready = isReady(serviceStatus);
  const guild = useApiState(() => window.lastbrowser.sidekick.getDiscordGuild(), [ready], ready);
  const channels = useApiState(() => window.lastbrowser.sidekick.listDiscordChannels(), [ready], ready);
  const channelTree = useApiState(() => window.lastbrowser.sidekick.listDiscordChannelsTree(), [ready], ready);
  const roles = useApiState(() => window.lastbrowser.sidekick.listDiscordRoles(), [ready], ready);
  const stats = useApiState(() => window.lastbrowser.sidekick.getDiscordStats(), [ready], ready);
  const botInfo = useApiState(() => window.lastbrowser.sidekick.getDiscordBotInfo(), [ready], ready);
  const warns = useApiState(() => window.lastbrowser.sidekick.getDiscordWarns(), [ready], ready);
  const [channelId, setChannelId] = useState('');
  const [messageText, setMessageText] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [purgeAmount, setPurgeAmount] = useState(10);
  const [selectedMember, setSelectedMember] = useState<AnyRecord | null>(null);
  const [section, setSection] = useState(activeContextItem || 'Guild');
  const members = useApiState(() => window.lastbrowser.sidekick.listDiscordMembers({ query: memberQuery }), [ready, memberQuery], ready);
  const messages = useApiState(() => channelId ? window.lastbrowser.sidekick.listDiscordMessages({ channelId, limit: 50 }) : Promise.resolve({}), [ready, channelId], ready && Boolean(channelId));
  const treeChannels = arrayFrom(channelTree.data, ['uncategorized', 'channels', 'items']);
  const categoryChannels = arrayFrom(channelTree.data, ['categories']).flatMap((category) => arrayFrom(category, ['channels']));
  const channelItems = [...treeChannels, ...categoryChannels, ...arrayFrom(channels.data, ['channels', 'items'])];

  useEffect(() => {
    if (!channelId && channelItems[0]) setChannelId(idOf(channelItems[0]));
  }, [channelId, channelItems]);

  useEffect(() => {
    setSection(activeContextItem || 'Guild');
  }, [activeContextItem]);

  async function send(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!channelId || !messageText.trim()) return;
    await window.lastbrowser.sidekick.sendDiscordMessage({ channelId, content: messageText.trim() });
    setMessageText('');
    await messages.refresh();
  }

  async function moderate(action: 'warn' | 'timeout' | 'kick' | 'ban' | 'untimeout' | 'unban'): Promise<void> {
    if (!selectedMember) return;
    const request = { userId: idOf(selectedMember), reason: 'Manual moderation', minutes: 10, deleteDays: 1 };
    if (action === 'warn') await window.lastbrowser.sidekick.warnDiscordMember(request);
    if (action === 'timeout') await window.lastbrowser.sidekick.timeoutDiscordMember(request);
    if (action === 'kick') await window.lastbrowser.sidekick.kickDiscordMember(request);
    if (action === 'ban') await window.lastbrowser.sidekick.banDiscordMember(request);
    if (action === 'untimeout') await window.lastbrowser.sidekick.untimeoutDiscordMember(request);
    if (action === 'unban') await window.lastbrowser.sidekick.unbanDiscordMember(request);
    await warns.refresh();
  }

  async function purgeChannel(): Promise<void> {
    if (!channelId || !window.confirm(`Delete up to ${purgeAmount} messages in this channel?`)) return;
    await window.lastbrowser.sidekick.purgeDiscordChannel({ channelId, amount: purgeAmount });
    await messages.refresh();
  }

  async function saveModerationConfig(): Promise<void> {
    await window.lastbrowser.sidekick.configureDiscord({
      action: 'save',
      values: { auto_mod_enabled: true, spam_timeout_minutes: 10 }
    });
  }

  return (
    <section className="browser-main native-rest-main discord-main">
      <NativeHeader icon={<Users size={21} />} title="Discord" kicker="Community" detail="Guild, channels, members, messages and moderation actions in native UI." loading={channels.loading} ready={ready} onRefresh={channels.refresh} />
      <AdvancedWebUiTools panel="discord" serviceStatus={serviceStatus} compact />
      <div className="native-card-actions insights-tabs">
        {['Guild', 'Channels', 'Members', 'Moderation'].map((item) => (
          <button key={item} type="button" className={item === section ? 'active' : ''} onClick={() => setSection(item)}>{item}</button>
        ))}
      </div>
      <div className="discord-grid">
        {section !== 'Members' && (
          <aside className="integration-list">
            {channelItems.map((channel) => <button key={idOf(channel)} type="button" className={`integration-row ${idOf(channel) === channelId ? 'active' : ''}`} onClick={() => setChannelId(idOf(channel))}><MessageSquare size={17} /><span>{titleOf(channel)}</span><small>{idOf(channel)}</small></button>)}
          </aside>
        )}
        <main className="native-work-card discord-messages">
          <ErrorLine error={guild.error || channels.error || channelTree.error || roles.error || stats.error || botInfo.error || warns.error || messages.error} />
          <header>
            <strong>{section}: {channelId || 'Channel'}</strong>
            <div className="native-card-actions discord-moderation">
              <input type="number" value={purgeAmount} min={1} max={100} onChange={(event) => setPurgeAmount(Number(event.target.value))} />
              <button type="button" className="danger" onClick={() => void purgeChannel()} disabled={!ready || !channelId}><Trash2 size={13} />Purge</button>
              <button type="button" onClick={() => void saveModerationConfig()} disabled={!ready}><Save size={13} />Config</button>
            </div>
          </header>
          <pre>{jsonPreview(section === 'Guild' ? { guild: guild.data, stats: stats.data, bot: botInfo.data, roles: roles.data } : section === 'Moderation' ? { selectedMember, warns: warns.data } : { channelId, messages: messages.data, roles: roles.data })}</pre>
          {section !== 'Guild' && section !== 'Moderation' && (
            <>
              <div className="compact-list">{arrayFrom(messages.data, ['messages', 'items']).map((item) => <article key={idOf(item)}><strong>{text(item.author || item.username || item.user)}</strong><span>{text(item.content || item.message)}</span></article>)}</div>
              <form className="inline-form" onSubmit={(event) => void send(event)}>
                <input value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder="Send message..." />
                <button type="submit" disabled={!ready || !channelId || !messageText.trim()}><Send size={14} /></button>
              </form>
            </>
          )}
        </main>
        {section !== 'Guild' && (
          <aside className="native-work-card discord-members">
            <div className="native-search"><Search size={14} /><input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="Search members..." /></div>
            {arrayFrom(members.data, ['members', 'items']).map((member) => (
              <article key={idOf(member)} className={idOf(member) === idOf(selectedMember || {}) ? 'active' : ''} onClick={() => setSelectedMember(member)}>
                <strong>{titleOf(member, idOf(member))}</strong>
                <div className="native-card-actions">
                  <button type="button" onClick={() => void moderate('warn')}><Shield size={13} />Warn</button>
                  <button type="button" onClick={() => void moderate('timeout')}><Terminal size={13} />Timeout</button>
                  <button type="button" onClick={() => void moderate('kick')}>Kick</button>
                  <button type="button" onClick={() => void moderate('ban')}>Ban</button>
                  <button type="button" onClick={() => void moderate('untimeout')}>Untimeout</button>
                  <button type="button" onClick={() => void moderate('unban')}>Unban</button>
                </div>
              </article>
            ))}
            <pre>{jsonPreview({ section, selectedMember, warns: warns.data })}</pre>
          </aside>
        )}
      </div>
    </section>
  );
}

export function NativeGatewayMain({
  serviceStatus
}: {
  serviceStatus: ServiceStatus | null;
}): JSX.Element {
  const ready = isReady(serviceStatus);
  const [gatewayStatus, setGatewayStatus] = useState<{
    running: boolean;
    pid: number | null;
    lastError: string | null;
    startedAt: number | null;
  }>({ running: false, pid: null, lastError: null, startedAt: null });
  const [platforms, setPlatforms] = useState<
    Array<{ id: string; name: string; protocol: string; icon: string; status: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState('');

  const refreshStatus = React.useCallback(async () => {
    try {
      if (window.lastbrowser?.gateway?.status) {
        const s = await window.lastbrowser.gateway.status();
        setGatewayStatus(s);
      }
      if (window.lastbrowser?.gateway?.platforms) {
        const p = await window.lastbrowser.gateway.platforms();
        setPlatforms(p);
      }
    } catch (e) {
      console.warn('Failed to refresh gateway status:', e);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    const interval = setInterval(() => {
      void refreshStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  async function handleStart(): Promise<void> {
    setLoading(true);
    setActionError('');
    try {
      const s = await window.lastbrowser.gateway.start();
      setGatewayStatus(s);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleStop(): Promise<void> {
    setLoading(true);
    setActionError('');
    try {
      const s = await window.lastbrowser.gateway.stop();
      setGatewayStatus(s);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleRestart(): Promise<void> {
    setLoading(true);
    setActionError('');
    try {
      const s = await window.lastbrowser.gateway.restart();
      setGatewayStatus(s);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function getPlatformIcon(icon: string): JSX.Element {
    switch (icon) {
      case 'send': return <Send size={18} />;
      case 'message-circle': return <MessageSquare size={18} />;
      case 'shield': return <Shield size={18} />;
      case 'message-square': return <MessageSquare size={18} />;
      case 'hash': return <Hash size={18} />;
      case 'globe': return <Globe size={18} />;
      case 'smartphone': return <Smartphone size={18} />;
      case 'mail': return <Mail size={18} />;
      default: return <Radio size={18} />;
    }
  }

  return (
    <section className="browser-main native-rest-main gateway-main">
      <NativeHeader
        icon={<Radio size={21} />}
        title="Messaging Gateway Daemon"
        kicker="Multi-Platform Relay"
        detail="Multi-Platform Chat Gateway Daemon mit Windows System Tray für 24/7 Hintergrundempfang."
        loading={loading}
        ready={ready}
        onRefresh={() => void refreshStatus()}
      />

      <ErrorLine error={actionError || gatewayStatus.lastError} />

      <div className="native-work-card" style={{ marginBottom: '16px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <strong>Daemon Status:</strong>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 600,
                background: gatewayStatus.running ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: gatewayStatus.running ? '#4ade80' : '#f87171'
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: gatewayStatus.running ? '#4ade80' : '#f87171'
                }}
              />
              {gatewayStatus.running ? `Aktiv (PID ${gatewayStatus.pid})` : 'Gestoppt'}
            </span>
          </div>

          <div className="native-card-actions" style={{ display: 'flex', gap: '8px' }}>
            {!gatewayStatus.running ? (
              <button
                type="button"
                className="primary-action compact"
                onClick={() => void handleStart()}
                disabled={loading || !ready}
              >
                <Play size={13} style={{ marginRight: '4px' }} />
                Gateway starten
              </button>
            ) : (
              <button
                type="button"
                className="danger compact"
                onClick={() => void handleStop()}
                disabled={loading}
              >
                <Square size={13} style={{ marginRight: '4px' }} />
                Gateway stoppen
              </button>
            )}

            <button
              type="button"
              className="secondary-action compact"
              onClick={() => void handleRestart()}
              disabled={loading || !gatewayStatus.running}
            >
              <RefreshCw size={13} style={{ marginRight: '4px' }} />
              Neu starten
            </button>
          </div>
        </header>

        <p style={{ fontSize: '12px', color: 'var(--muted, #888)', marginTop: '8px', marginBottom: 0 }}>
          🔔 <strong>System Tray Integration:</strong> Der Gateway-Daemon bleibt auch bei geschlossenem Browserfenster im Windows System Tray aktiv. Eingehende Nachrichten auf verknüpften Kanälen werden rund um die Uhr verarbeitet.
        </p>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 10px 0' }}>Unterstützte Messenger & Protokolle</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: '12px'
          }}
        >
          {platforms.map((p) => (
            <div
              key={p.id}
              className="native-work-card"
              style={{
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                borderRadius: '8px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ color: 'var(--accent, #60a5fa)' }}>{getPlatformIcon(p.icon)}</div>
                  <strong style={{ fontSize: '14px' }}>{p.name}</strong>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    background: gatewayStatus.running ? 'rgba(34, 197, 94, 0.1)' : 'rgba(255, 255, 255, 0.05)',
                    color: gatewayStatus.running ? '#4ade80' : 'var(--muted, #888)'
                  }}
                >
                  {gatewayStatus.running ? 'Relay bereit' : 'Bereit'}
                </span>
              </div>
              <span style={{ fontSize: '12px', color: 'var(--muted, #888)' }}>{p.protocol}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="native-work-card" style={{ marginTop: '16px' }}>
        <header>
          <strong>CLI-Diagnose & Setup-Assistent</strong>
        </header>
        <p style={{ fontSize: '12px', color: 'var(--muted, #888)', margin: '6px 0 10px 0' }}>
          Um neue Plattformen zu verbinden (z.B. WhatsApp QR-Code scannen, Telegram Bot Token eintragen oder Matrix Homeserver konfigurieren), nutze den interaktiven Assistenten im Terminal:
        </p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <code
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              background: 'rgba(0, 0, 0, 0.3)',
              fontFamily: 'monospace',
              fontSize: '13px'
            }}
          >
            sidekick gateway setup
          </code>
          <span style={{ fontSize: '12px', color: 'var(--muted, #888)' }}>
            oder im PowerShell-Terminal eingeben
          </span>
        </div>
      </div>
    </section>
  );
}
