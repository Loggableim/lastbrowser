/**
 * LastBrowser v2 — Renderer App
 * Main UI logic for the workspace browser interface.
 *
 * Communicates with main process via window.browser API (exposed by preload).
 * All state is managed by main process; this is purely a view layer.
 */

(function () {
  'use strict';

  // ═════════════════════════════════════════════════════════════════════
  // State
  // ═════════════════════════════════════════════════════════════════════
  const state = {
    workspaces: [],
    currentWorkspaceId: null,
    apps: [],
    tabs: [],
    activeTabId: null,
    compactMode: false,
    focusStatus: { active: false },
    notifs: [],
    paletteOpen: false,
    paletteResults: [],
    paletteSelected: 0,
    closedTabs: [],
    sessions: [],
    splitView: null,
    kanbanOpen: false,
  };

  const api = window.browser;
  if (!api) {
    console.error('[browser] API not available — running outside LastBrowser?');
    document.body.innerHTML = '<div style="padding:40px;text-align:center"><h2>LastBrowser API not available</h2><p>This page must be loaded inside the LastBrowser Electron app.</p></div>';
    return;
  }

  // ═════════════════════════════════════════════════════════════════════
  // DOM References
  // ═════════════════════════════════════════════════════════════════════
  const $ = (id) => document.getElementById(id);
  const wsList = $('wsList');
  const appList = $('appList');
  const tabList = $('tabList');
  const contentViewport = $('contentViewport');
  const welcomeScreen = $('welcomeScreen');
  const paletteOverlay = $('paletteOverlay');
  const paletteInput = $('paletteInput');
  const paletteResults = $('paletteResults');
  const notifOverlay = $('notifOverlay');
  const notifList = $('notifList');
  const notifBadge = $('notifBadge');
  const focusIndicator = $('focusIndicator');
  const focusTimer = $('focusTimer');
  const splitOverlay = $('splitOverlay');
  const splitContainer = $('splitContainer');
  const kanbanPanel = $('kanbanPanel');
  const kanbanBoard = $('kanbanBoard');
  const kanbanTitle = $('kanbanTitle');
  const urlInput = $('urlInput');
  const searchInput = $('searchInput');

  // ═════════════════════════════════════════════════════════════════════
  // Initialization
  // ═════════════════════════════════════════════════════════════════════
  async function init() {
    await loadWorkspaces();
    await loadSettings();
    await loadFocusStatus();
    await loadNotifications();
    bindEvents();
    console.log('[browser] LastBrowser UI initialized');
  }

  async function loadWorkspaces() {
    try {
      state.workspaces = await api.workspaces.list() || [];
      if (state.workspaces.length > 0 && !state.currentWorkspaceId) {
        state.currentWorkspaceId = window.__currentWorkspaceId || state.workspaces[0].id;
      }
      renderWorkspaces();
      if (state.currentWorkspaceId) {
        await switchWorkspace(state.currentWorkspaceId);
      }
    } catch (err) { console.error('[browser] Failed to load workspaces:', err); }
  }

  async function loadSettings() {
    try {
      const settings = await api.settings.getAll();
      state.compactMode = settings.compactLevel || 0;
      const appEl = document.getElementById('app');
      appEl.className = 'dark';
      if (state.compactMode === 1) appEl.classList.add('compact');
      else if (state.compactMode === 2) appEl.classList.add('compact-ultra');
      updateCompactUI();
    } catch (err) { /* use defaults */ }
  }

  async function loadFocusStatus() {
    try {
      state.focusStatus = await api.focus.status();
      updateFocusUI();
    } catch (_) {}
  }

  async function loadNotifications() {
    try {
      const notifs = await api.notifications.list();
      state.notifs = notifs || [];
      updateNotifUI();
    } catch (_) {}
  }

  // ═════════════════════════════════════════════════════════════════════
  // Workspace Rendering
  // ═════════════════════════════════════════════════════════════════════
  function renderWorkspaces() {
    wsList.innerHTML = state.workspaces.map(ws => `
      <div class="ws-item ${ws.id === state.currentWorkspaceId ? 'active' : ''} ${ws.isPaused ? 'paused' : ''}"
           data-id="${ws.id}" title="${ws.name}">
        <span>${ws.icon || '💼'}</span>
        ${ws.isPaused ? '<span class="ws-indicator sleeping"></span>' : '<span class="ws-indicator online"></span>'}
      </div>
    `).join('');
  }

  async function switchWorkspace(id) {
    state.currentWorkspaceId = id;
    renderWorkspaces();
    await loadApps(id);
    await loadTabs(id);
    await loadSessions(id);
    try { await api.workspaces.switch(id); } catch (_) {}
    window.__currentWorkspaceId = id;
  }

  // ═════════════════════════════════════════════════════════════════════
  // Multi-Account Apps Rendering (Wavebox-style)
  // ═════════════════════════════════════════════════════════════════════
  let _appAccounts = [];
  let _appDefs = [];

  async function loadApps(workspaceId) {
    try {
      state.apps = await api.apps.list(workspaceId) || [];
      _appAccounts = await api.appAccounts.listByWorkspace(workspaceId) || [];
      _appDefs = await api.appDefinitions.list() || [];
      renderApps();
    } catch (err) { console.error('[browser] Failed to load apps:', err); }
  }

  function renderApps() {
    if (state.apps.length === 0) {
      appList.innerHTML = '<div style="padding:16px 8px;font-size:11px;color:var(--text-muted);text-align:center">No pinned apps yet.<br><button class="add-first-app-btn" id="addFirstAppBtn">+ Add your first app</button></div>';
      document.getElementById('addFirstAppBtn')?.addEventListener('click', openAddAccountDialog);
      return;
    }

    // Group apps by definition for display
    let html = '';
    for (const app of state.apps) {
      const def = _appDefs.find(d => d.id === app.appDefinitionId);
      const accounts = _appAccounts.filter(a => a.appId === app.id);
      const isCollapsed = app.collapsed;
      const hasAccounts = accounts.length > 0;
      const isSuspended = accounts.some(a => a.agentStatus === 'running' || a.agentStatus === 'reading');

      html += `
      <div class="app-group" data-app-id="${app.id}">
        <div class="app-group-header ${isCollapsed ? 'collapsed' : ''}"
             data-app-id="${app.id}" data-collapsed="${isCollapsed}">
          <div class="app-group-icon">${def?.icon || app.icon || '🌐'}</div>
          <span class="app-group-name">${app.name}</span>
          ${hasAccounts ? `<span class="app-group-count">${accounts.length}</span>` : ''}
          ${isSuspended ? '<span class="agent-badge running" style="font-size:8px;padding:1px 5px">🤖</span>' : ''}
          <button class="app-group-toggle" data-app-id="${app.id}">${isCollapsed ? '▶' : '▼'}</button>
        </div>
        ${!isCollapsed ? `
        <div class="app-group-body">
          ${accounts.length === 0 ? `
          <div class="app-account-item" data-app-id="${app.id}" data-action="add-first">
            <span class="app-acct-add-first">+ Add account</span>
          </div>` : ''}
          ${accounts.map(acct => renderAccountItem(acct, app, def)).join('')}
        </div>` : ''}
      </div>`;
    }
    appList.innerHTML = html;

    // Bind events
    appList.querySelectorAll('.app-group-header').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.app-group-toggle') || e.target.closest('.app-acct-add-first')) return;
        toggleAppGroup(el.dataset.appId);
      });
      el.addEventListener('contextmenu', (e) => showAppGroupContextMenu(e, el.dataset.appId));
    });
    appList.querySelectorAll('.app-group-toggle').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); toggleAppGroup(el.dataset.appId); });
    });
    appList.querySelectorAll('.app-account-item').forEach(el => {
      const acctId = el.dataset.acctId;
      if (acctId) {
        el.addEventListener('click', () => openAppAccount(acctId));
        el.addEventListener('contextmenu', (e) => showAccountContextMenu(e, acctId));
      } else if (el.dataset.action === 'add-first') {
        el.addEventListener('click', () => openAddAccountDialog(el.dataset.appId));
      }
    });

    // Account DnD: reorder within group
    appList.querySelectorAll('.app-account-item[draggable]').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', el.dataset.acctId);
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', async (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        const draggedId = e.dataTransfer.getData('text/plain');
        if (!draggedId || draggedId === el.dataset.acctId) return;
        // Simple reorder: swap orders in UI then persist
        const parent = el.closest('.app-group-body');
        const items = [...parent.querySelectorAll('.app-account-item[data-acct-id]')];
        const fromIdx = items.findIndex(i => i.dataset.acctId === draggedId);
        const toIdx = items.findIndex(i => i === el);
        if (fromIdx === -1 || toIdx === -1) return;
        items.forEach((item, idx) => {
          let newOrder = idx;
          if (idx === fromIdx) newOrder = toIdx;
          else if (idx === toIdx) newOrder = fromIdx;
          api.appAccounts.update(item.dataset.acctId, { order: newOrder }).catch(() => {});
        });
      });
    });
  }

  function renderAccountItem(acct, app, def) {
    const agentStatus = acct.agentStatus || 'idle';
    const hasAgent = acct.assignedAgentId;
    return `
    <div class="app-account-item ${acct.muted ? 'muted' : ''} ${hasAgent ? 'has-agent' : ''}"
         data-acct-id="${acct.id}" draggable="true"
         title="${acct.displayName}\n${acct.baseUrl || app.baseUrl || ''}">
      <span class="app-acct-color" style="background:${acct.color || def?.defaultColor || '#6366f1'}"></span>
      <span class="app-acct-name">${acct.displayName}</span>
      ${acct.badgeCount > 0 ? `<span class="app-item-badge">${acct.badgeCount}</span>` : ''}
      ${hasAgent ? `<span class="agent-badge ${agentStatus}" style="font-size:7px;padding:1px 4px">🤖</span>` : ''}
      ${acct.muted ? '<span class="app-acct-muted">🔇</span>' : ''}
    </div>`;
  }

  function toggleAppGroup(appId) {
    const app = state.apps.find(a => a.id === appId);
    if (!app) return;
    const collapsed = !app.collapsed;
    api.apps.update(appId, { collapsed }).catch(() => {});
    app.collapsed = collapsed;
    renderApps();
  }

  async function openAppAccount(acctId) {
    const acct = _appAccounts.find(a => a.id === acctId);
    if (!acct) return;
    const url = acct.baseUrl || 'about:blank';
    const tab = await api.tabs.create({
      url,
      title: acct.displayName,
      workspaceId: acct.workspaceId || state.currentWorkspaceId,
      sessionPartition: acct.sessionPartition,
      appShortcutId: acct.appId,
    });
    if (tab) {
      await api.appAccounts.setActive(acctId);
      await loadTabs(state.currentWorkspaceId);
      setActiveTab(tab.id);
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // Tabs Rendering
  // ═════════════════════════════════════════════════════════════════════
  async function loadTabs(workspaceId) {
    try {
      state.tabs = await api.tabs.list(workspaceId) || [];
      renderTabs();
      loadClosedTabs(workspaceId);
    } catch (err) { console.error('[browser] Failed to load tabs:', err); }
  }

  function renderTabs() {
    if (state.tabs.length === 0) {
      tabList.innerHTML = '<div style="padding:12px 8px;font-size:11px;color:var(--text-muted);text-align:center">No tabs open</div>';
      welcomeScreen.classList.remove('hidden');
      return;
    }
    welcomeScreen.classList.add('hidden');
    tabList.innerHTML = state.tabs.map(tab => `
      <div class="tab-item ${tab.id === state.activeTabId ? 'active' : ''} ${tab.isSuspended ? 'suspended' : ''} ${tab.isMuted ? 'muted' : ''}"
           data-id="${tab.id}" draggable="true">
        <div class="tab-favicon">${tab.favicon ? `<img src="${tab.favicon}" />` : '📄'}</div>
        <span class="tab-title">${tab.title || tab.url || 'New Tab'}</span>
        ${tab.isMuted ? '<span class="tab-audio-icon">🔇</span>' : ''}
        <button class="tab-close" data-id="${tab.id}">✕</button>
      </div>
    `).join('');

    document.querySelectorAll('.tab-item').forEach(el => {
      el.addEventListener('click', () => setActiveTab(el.dataset.id));
      el.querySelector('.tab-close')?.addEventListener('click', (e) => { e.stopPropagation(); closeTab(el.dataset.id); });
      el.addEventListener('contextmenu', (e) => showTabContextMenu(e, el.dataset.id));
    });

    // Tab DnD: reorder
    document.querySelectorAll('.tab-item[draggable]').forEach(el => {
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', el.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        el.classList.add('drag-over');
      });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', async (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        const draggedId = e.dataTransfer.getData('text/plain');
        if (!draggedId || draggedId === el.dataset.id) return;
        const parent = el.parentElement;
        const items = [...parent.querySelectorAll('.tab-item[data-id]')];
        const fromIdx = items.findIndex(i => i.dataset.id === draggedId);
        const toIdx = items.findIndex(i => i === el);
        if (fromIdx === -1 || toIdx === -1) return;
        items.forEach((item, idx) => {
          let newOrder = idx;
          if (idx === fromIdx) newOrder = toIdx;
          else if (idx === toIdx) newOrder = fromIdx;
          api.tabs.update(item.dataset.id, { order: newOrder }).catch(() => {});
        });
        await loadTabs(state.currentWorkspaceId);
      });
    });
  }

  function setActiveTab(tabId) {
    state.activeTabId = tabId;
    renderTabs();
    // Activate the WebContentsView for this tab
    const tab = state.tabs.find(t => t.id === tabId);
    if (tab) {
      api.tabs.activateView(tabId, tab.url || 'about:blank', tab.sessionPartition).catch(() => {});
    }
    updateNavButtons();
  }

  async function closeTab(tabId) {
    await api.tabs.close(tabId);
    api.tabs.closeView(tabId).catch(() => {}); // destroy WebContentsView
    await loadTabs(state.currentWorkspaceId);
    if (state.tabs.length > 0) setActiveTab(state.tabs[0].id);
    else api.tabs.deactivateView().catch(() => {}); // hide all
  }

  async function newTab(url) {
    await api.tabs.create({
      url: url || 'about:blank',
      workspaceId: state.currentWorkspaceId,
    });
    await loadTabs(state.currentWorkspaceId);
    const tabs = state.tabs;
    if (tabs.length > 0) setActiveTab(tabs[tabs.length - 1].id);
  }
  function updateNavButtons() {
    // Simplified: in real implementation this would check canGoBack/canGoForward
    $('navBack').disabled = true;
    $('navForward').disabled = true;
  }

  async function loadClosedTabs(workspaceId) {
    try {
      state.closedTabs = await api.tabs.closedList(workspaceId) || [];
    } catch (_) {}
  }

  async function loadSessions(workspaceId) {
    try {
      state.sessions = await api.sessions.list(workspaceId) || [];
    } catch (_) {}
  }

  // ═════════════════════════════════════════════════════════════════════
  // Command Palette
  // ═════════════════════════════════════════════════════════════════════
  async function openPalette() {
    state.paletteOpen = true;
    state.paletteSelected = 0;
    paletteOverlay.classList.remove('hidden');
    paletteInput.value = '';
    paletteInput.focus();
    await searchPalette('');
  }

  function closePalette() {
    state.paletteOpen = false;
    paletteOverlay.classList.add('hidden');
  }

  async function searchPalette(query) {
    try {
      const results = await api.palette.search(query);
      state.paletteResults = results || [];
      renderPaletteResults();
    } catch (err) { console.error('[browser] Palette search failed:', err); }
  }

  function renderPaletteResults() {
    paletteResults.innerHTML = state.paletteResults.map((r, i) => `
      <div class="palette-item ${i === state.paletteSelected ? 'selected' : ''}" data-index="${i}">
        <span class="palette-item-icon">${r.icon || '📌'}</span>
        <div class="palette-item-info">
          <div class="palette-item-label">${r.label}</div>
          ${r.description ? `<div class="palette-item-desc">${r.description}</div>` : ''}
        </div>
        ${r.shortcut ? `<span class="palette-item-shortcut">${r.shortcut}</span>` : ''}
        <span class="palette-item-type">${r.type}</span>
      </div>
    `).join('');

    document.querySelectorAll('.palette-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.index);
        executePaletteItem(idx);
      });
      el.addEventListener('mouseenter', () => { state.paletteSelected = parseInt(el.dataset.index); renderPaletteResults(); });
    });
  }

  async function executePaletteItem(index) {
    const item = state.paletteResults[index];
    if (!item) return;
    closePalette();

    if (item.action) {
      if (typeof item.action === 'string') {
        await executeCommand(item.action);
      } else if (item.action.type === 'switchWorkspace') {
        await switchWorkspace(item.action.workspaceId);
      } else if (item.action.type === 'openApp') {
        await openApp(item.action.appId);
      } else if (item.action.type === 'switchTab') {
        setActiveTab(item.action.tabId);
      } else if (item.action.type === 'restoreSession') {
        // TODO: restore session
      } else if (item.action.type === 'openSetting') {
        openSettings();
      } else if (item.action.type === 'openTask') {
        // TODO: open task
      }
    }
  }

  async function executeCommand(cmdId) {
    switch (cmdId) {
      case 'focus-start': startFocus(); break;
      case 'focus-stop': stopFocus(); break;
      case 'sleep-all': sleepAllInactive(); break;
      case 'save-session': saveSession(); break;
      case 'toggle-compact': toggleCompact(); break;
      case 'toggle-sidebar': toggleSidebar(); break;
      case 'mute-all': muteAll(); break;
      case 'clear-cache': clearCache(); break;
      case 'new-tab': newTab(); break;
      case 'command-palette': break;
      case 'split-50': startSplit('50/50'); break;
      case 'split-70-30': startSplit('70/30'); break;
      default: try { await api.quickAction(cmdId); } catch (_) {}
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // Focus Mode
  // ═════════════════════════════════════════════════════════════════════
  async function startFocus() {
    try {
      const session = await api.focus.start('pomodoro', state.currentWorkspaceId);
      state.focusStatus = await api.focus.status();
      updateFocusUI();
    } catch (err) { console.error('[browser] Failed to start focus:', err); }
  }

  async function stopFocus() {
    try {
      await api.focus.stop();
      state.focusStatus = { active: false };
      updateFocusUI();
    } catch (_) {}
  }

  function updateFocusUI() {
    if (state.focusStatus.active) {
      focusIndicator.classList.remove('hidden');
      updateFocusTimer();
    } else {
      focusIndicator.classList.add('hidden');
    }
  }

  function updateFocusTimer() {
    if (!state.focusStatus.active) return;
    const remaining = Math.max(0, state.focusStatus.remaining || 0);
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    focusTimer.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    $('focusLabel').textContent = state.focusStatus.type === 'pomodoro' ? 'Pomodoro' : 'Focus';
  }

  // ═════════════════════════════════════════════════════════════════════
  // Compact Mode
  // ═════════════════════════════════════════════════════════════════════
  async function toggleCompact() {
    try {
      const level = await api.compact.toggle();
      const appEl = document.getElementById('app');
      appEl.className = 'dark';
      if (level === 1) appEl.classList.add('compact');
      else if (level === 2) appEl.classList.add('compact-ultra');
      state.compactMode = level;
      updateCompactUI();
    } catch (_) {}
  }

  function updateCompactUI() {
    const level = state.compactMode || 0;
    const compactBtn = $('compactBtn');
    if (compactBtn) {
      const icons = ['🔲', '📐', '🎯'];
      const labels = ['Compact Mode', 'Compact (Ctrl+S)', 'Ultra Compact (Ctrl+S)'];
      compactBtn.textContent = icons[level] || '🔲';
      compactBtn.title = labels[level] || 'Compact Mode';
      compactBtn.classList.toggle('active', level > 0);
    }
  }

  function toggleSidebar() {
    // Handled by main process IPC
  }

  // ═════════════════════════════════════════════════════════════════════
  // Quick Actions
  // ═════════════════════════════════════════════════════════════════════
  async function sleepAllInactive() {
    try {
      const count = await api.resourceSaver.sleepNow([state.activeTabId].filter(Boolean));
      console.log(`[browser] Suspended ${count} inactive tabs`);
      await loadTabs(state.currentWorkspaceId);
    } catch (_) {}
  }

  async function saveSession() {
    const name = prompt('Session name:', `Session ${new Date().toLocaleString()}`);
    if (!name) return;
    try {
      await api.sessions.create({
        name,
        workspaceId: state.currentWorkspaceId,
        tabIds: state.tabs.map(t => t.id),
      });
      await loadSessions(state.currentWorkspaceId);
    } catch (err) { console.error('[browser] Failed to save session:', err); }
  }

  async function muteAll() {
    for (const tab of state.tabs) {
      if (!tab.isMuted) await api.tabs.mute(tab.id);
    }
    await loadTabs(state.currentWorkspaceId);
  }

  async function clearCache() {
    try { await api.privacy.clearCache(); } catch (_) {}
  }

  async function startSplit(layout) {
    if (state.tabs.length < 2) {
      console.log('[browser] Need at least 2 tabs for split view');
      return;
    }
    try {
      const sv = await api.splitView.create(state.currentWorkspaceId, layout, state.tabs.slice(0, 4));
      state.splitView = sv;
      renderSplitView(sv);
    } catch (err) { console.error('[browser] Split view failed:', err); }
  }

  function renderSplitView(sv) {
    if (!sv || !sv.panels) return;
    splitOverlay.classList.remove('hidden');
    splitContainer.innerHTML = sv.panels.map(p => `
      <div class="split-panel" data-panel="${p.id}">
        <div class="split-tab-info">Panel ${p.position + 1}</div>
      </div>
    `).join('');
  }

  // ═════════════════════════════════════════════════════════════════════
  // Notifications
  // ═════════════════════════════════════════════════════════════════════
  function toggleNotifPanel() {
    notifOverlay.classList.toggle('hidden');
  }

  function updateNotifUI() {
    const unread = state.notifs.filter(n => !n.isRead).length;
    if (unread > 0) {
      notifBadge.classList.remove('hidden');
      notifBadge.textContent = unread;
    } else {
      notifBadge.classList.add('hidden');
    }
    renderNotifs();
  }

  function renderNotifs() {
    if (state.notifs.length === 0) {
      notifList.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">No notifications</div>';
      return;
    }
    notifList.innerHTML = state.notifs.map(n => `
      <div class="notif-item ${!n.isRead ? 'unread' : ''}" data-id="${n.id}">
        <div class="notif-item-title">${n.title || n.appName || 'Notification'}</div>
        ${n.body ? `<div class="notif-item-body">${n.body}</div>` : ''}
        <div class="notif-item-time">${new Date(n.timestamp).toLocaleTimeString()}</div>
      </div>
    `).join('');
  }

  // ═════════════════════════════════════════════════════════════════════
  // Context Menus
  // ═════════════════════════════════════════════════════════════════════
  function showAppContextMenu(e, appId) {
    e.preventDefault();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.innerHTML = `
      <div class="context-item" data-action="open">Open</div>
      <div class="context-item" data-action="mute">Toggle Mute</div>
      <div class="context-item" data-action="sleep">Sleep/Wake</div>
      <div class="context-item" data-action="clear-cache">Clear Cache</div>
      <div class="context-separator"></div>
      <div class="context-item" data-action="duplicate-account">Duplicate Account</div>
      <div class="context-separator"></div>
      <div class="context-item" data-action="remove" style="color:var(--red)">Remove</div>
    `;
    document.body.appendChild(menu);
    menu.querySelectorAll('.context-item').forEach(el => {
      el.addEventListener('click', async () => {
        const action = el.dataset.action;
        switch (action) {
          case 'open': openApp(appId); break;
          case 'mute': { const app = state.apps.find(a => a.id === appId); if (app) await (app.isMuted ? api.apps.unmute(appId) : api.apps.mute(appId)); break; }
          case 'sleep': { const app = state.apps.find(a => a.id === appId); if (app) await (app.isSuspended ? api.apps.wake(appId) : api.apps.sleep(appId)); break; }
          case 'clear-cache': await api.apps.clearCache(appId); break;
          case 'duplicate-account': await api.apps.accountAdd(appId, { label: 'New Account' }); break;
          case 'remove': await api.apps.remove(appId); break;
        }
        await loadApps(state.currentWorkspaceId);
        menu.remove();
      });
    });
    document.addEventListener('click', () => menu.remove(), { once: true });
  }

  function showTabContextMenu(e, tabId) {
    e.preventDefault();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    const tab = state.tabs.find(t => t.id === tabId);
    menu.innerHTML = `
      <div class="context-item" data-action="reload">Reload</div>
      <div class="context-item" data-action="duplicate">Duplicate</div>
      <div class="context-item" data-action="pin">${tab?.isPinned ? 'Unpin' : 'Pin'}</div>
      <div class="context-item" data-action="mute">${tab?.isMuted ? 'Unmute' : 'Mute'}</div>
      <div class="context-separator"></div>
      <div class="context-item" data-action="suspend">${tab?.isSuspended ? 'Unsuspend' : 'Suspend'}</div>
      <div class="context-separator"></div>
      <div class="context-item" data-action="close" style="color:var(--red)">Close</div>
    `;
    document.body.appendChild(menu);
    menu.querySelectorAll('.context-item').forEach(el => {
      el.addEventListener('click', async () => {
        const action = el.dataset.action;
        switch (action) {
          case 'reload': break;
          case 'duplicate': await api.tabs.duplicate(tabId); break;
          case 'pin': tab?.isPinned ? await api.tabs.unpin(tabId) : await api.tabs.pin(tabId); break;
          case 'mute': tab?.isMuted ? await api.tabs.unmute(tabId) : await api.tabs.mute(tabId); break;
          case 'suspend': tab?.isSuspended ? await api.tabs.unsuspend(tabId) : await api.tabs.suspend(tabId); break;
          case 'close': closeTab(tabId); break;
        }
        await loadTabs(state.currentWorkspaceId);
        menu.remove();
      });
    });
    document.addEventListener('click', () => menu.remove(), { once: true });
  }

  function showWorkspaceContextMenu(e, wsId) {
    e.preventDefault();
    const ws = state.workspaces.find(w => w.id === wsId);
    if (!ws) return;
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.innerHTML = `
      <div class="context-item" data-action="rename">✏️ Rename</div>
      <div class="context-item" data-action="icon">🎨 Change Icon</div>
      <div class="context-item" data-action="color">🎨 Change Color</div>
      <div class="context-item" data-action="duplicate">📋 Duplicate</div>
      <div class="context-item" data-action="pause">${ws.isPaused ? '▶️ Resume' : '⏸️ Pause'}</div>
      <div class="context-separator"></div>
      <div class="context-item" data-action="export">📤 Export</div>
      <div class="context-separator"></div>
      <div class="context-item" data-action="delete" style="color:var(--red)">🗑️ Delete</div>
    `;
    document.body.appendChild(menu);
    menu.querySelectorAll('.context-item').forEach(el => {
      el.addEventListener('click', async () => {
        const action = el.dataset.action;
        switch (action) {
          case 'rename': {
            const name = prompt('Workspace name:', ws.name);
            if (name && name !== ws.name) await api.workspaces.update(wsId, { name });
            break;
          }
          case 'icon': {
            const icon = prompt('Icon (emoji):', ws.icon || '💼');
            if (icon) await api.workspaces.update(wsId, { icon });
            break;
          }
          case 'color': {
            const color = prompt('Color (hex):', ws.color || '#6366f1');
            if (color) await api.workspaces.update(wsId, { color });
            break;
          }
          case 'duplicate': {
            const { id, createdAt, updatedAt, ...rest } = ws;
            await api.workspaces.create({ ...rest, name: ws.name + ' (Copy)' });
            break;
          }
          case 'pause': await api.workspaces.update(wsId, { isPaused: !ws.isPaused }); break;
          case 'export': {
            const data = await api.workspaces.export(wsId);
            if (data) {
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const a = document.createElement('a');
              a.href = URL.createObjectURL(blob);
              a.download = `workspace-${ws.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`;
              a.click();
              URL.revokeObjectURL(a.href);
            }
            break;
          }
          case 'delete': {
            if (confirm(`Delete workspace "${ws.name}"? This cannot be undone.`)) {
              await api.workspaces.remove(wsId);
            }
            break;
          }
        }
        await loadWorkspaces();
        menu.remove();
      });
    });
    document.addEventListener('click', () => menu.remove(), { once: true });
  }

  // ═════════════════════════════════════════════════════════════════════
  // Settings Panel
  // ═════════════════════════════════════════════════════════════════════
  const settingsOverlay = $('settingsOverlay');
  let _settings = {};
  let _settingsDirty = false;

  async function openSettings() {
    settingsOverlay.classList.remove('hidden');

    // Load current settings
    try {
      _settings = await api.settings.getAll() || {};
    } catch (_) { _settings = {}; }

    // Populate fields
    $('setTheme').value = _settings.theme || 'dark';
    $('setTabPosition').value = _settings.tabPosition || 'left';
    $('setCompactMode').checked = !!_settings.compactMode;
    $('setShowFavicons').checked = _settings.showFavicons !== false;
    $('setLanguage').value = _settings.language || 'en';
    $('setPomodoroDuration').value = _settings.pomodoroDuration || 25;
    $('setFocusAuto').checked = !!_settings.focusAuto;
    $('setResourceSaver').checked = _settings.resourceSaver !== false;
    $('setSuspendTimeout').value = _settings.suspendTimeoutMinutes || 30;
    $('setAdblock').checked = !!_settings.adblockEnabled;
    $('setCookieControl').value = _settings.cookieControl || 'allow_all';
    $('setTelemetry').checked = !!_settings.telemetryEnabled;
    $('setBackupInterval').value = _settings.autoBackupIntervalHours || 24;

    // Activate first tab
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.settings-tab[data-tab="general"]').classList.add('active');
    document.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));
    document.getElementById('settingsGeneral').classList.add('active');

    _settingsDirty = false;
    loadBackupList();
    loadAboutInfo();
  }

  function closeSettings() {
    settingsOverlay.classList.add('hidden');
  }

  function saveSettings() {
    const changes = {};
    const fields = {
      theme: $('setTheme').value,
      tabPosition: $('setTabPosition').value,
      compactMode: $('setCompactMode').checked,
      showFavicons: $('setShowFavicons').checked,
      language: $('setLanguage').value,
      pomodoroDuration: parseInt($('setPomodoroDuration').value) || 25,
      focusAuto: $('setFocusAuto').checked,
      resourceSaver: $('setResourceSaver').checked,
      suspendTimeoutMinutes: parseInt($('setSuspendTimeout').value) || 30,
      adblockEnabled: $('setAdblock').checked,
      cookieControl: $('setCookieControl').value,
      telemetryEnabled: $('setTelemetry').checked,
      autoBackupIntervalHours: parseInt($('setBackupInterval').value) || 24,
    };

    for (const [key, val] of Object.entries(fields)) {
      if (_settings[key] !== val) changes[key] = val;
    }

    if (Object.keys(changes).length > 0) {
      api.settings.update(changes).catch(err => console.error('[browser] Settings save failed:', err));
      _settings = { ..._settings, ...changes };

      // Apply theme immediately
      if (changes.theme) {
        document.getElementById('app').className = changes.theme;
      }
    }
    closeSettings();
  }

  // Tab switching
  document.getElementById('settingsTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.settings-tab');
    if (!tab) return;
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'));
    const pane = document.getElementById('settings' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1));
    if (pane) pane.classList.add('active');
  });

  // Mark dirty on any change
  document.getElementById('settingsDialog').addEventListener('change', () => { _settingsDirty = true; });
  document.getElementById('settingsDialog').addEventListener('input', () => { _settingsDirty = true; });

  // Backup
  async function loadBackupList() {
    const list = $('backupList');
    try {
      const backups = await api.settings.listBackups() || [];
      if (backups.length === 0) {
        list.innerHTML = '<div class="setting-desc" style="padding:8px 0">No backups yet.</div>';
        return;
      }
      list.innerHTML = backups.map(b => `
        <div class="backup-item">
          <span class="backup-item-name">${b.name || b.path?.split(/[/\\\\]/).pop() || 'Backup'}</span>
          <span class="backup-item-size">${b.size ? (b.size / 1024).toFixed(1) + 'KB' : ''}</span>
          <span class="backup-item-date">${b.createdAt ? new Date(b.createdAt).toLocaleString() : ''}</span>
        </div>
      `).join('');
    } catch (_) {
      list.innerHTML = '<div class="setting-desc" style="padding:8px 0">Failed to load backups.</div>';
    }
  }

  async function loadAboutInfo() {
    try {
      if (window.hermes) {
        const version = await window.hermes.getVersion();
        if (version) $('aboutVersion').textContent = version;
      }
    } catch (_) {}
    try {
      $('aboutElectron').textContent = process.versions?.electron || navigator.userAgent.match(/Electron\/([\d.]+)/)?.[1] || '—';
    } catch (_) {}
    try {
      $('aboutNode').textContent = process.versions?.node || '—';
    } catch (_) {}
    try {
      $('aboutChrome').textContent = process.versions?.chrome || '—';
    } catch (_) {}
    try {
      const store = require('../main/database/store');
      $('aboutDataDir').textContent = store.getDataDir ? store.getDataDir() : '—';
    } catch (_) {
      $('aboutDataDir').textContent = '.hermesbrowser/data';
    }
  }

  // Wire events
  document.getElementById('settingsBtn').addEventListener('click', openSettings);
  document.getElementById('settingsCloseBtn').addEventListener('click', closeSettings);
  document.getElementById('settingsDoneBtn').addEventListener('click', saveSettings);
  document.getElementById('settingsResetBtn').addEventListener('click', async () => {
    if (confirm('Reset all settings to defaults?')) {
      try {
        await api.settings.reset();
        openSettings(); // reload
      } catch (_) {}
    }
  });

  // Privacy quick actions
  document.getElementById('clearCacheBtn').addEventListener('click', async () => {
    try { await api.privacy.clearCache(); alert('Cache cleared.'); } catch (_) { alert('Failed to clear cache.'); }
  });
  document.getElementById('clearCookiesBtn').addEventListener('click', async () => {
    try { await api.privacy.clearCookies(); alert('Cookies cleared.'); } catch (_) { alert('Failed to clear cookies.'); }
  });

  // Create backup
  document.getElementById('createBackupBtn').addEventListener('click', async () => {
    const btn = document.getElementById('createBackupBtn');
    btn.disabled = true;
    btn.textContent = 'Creating...';
    try {
      const result = await api.settings.backup();
      console.log('[browser] Backup created:', result);
      loadBackupList();
    } catch (err) {
      console.error('[browser] Backup failed:', err);
    }
    btn.disabled = false;
    btn.textContent = 'Create Backup Now';
  });

  // Keyboard: Escape closes settings
  settingsOverlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') saveSettings(); });
  settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) saveSettings(); });

  // ═════════════════════════════════════════════════════════════════════
  // Session Panel + Agent Control (Comet + Agent Integration)
  // ═════════════════════════════════════════════════════════════════════
  const sessionPanel = $('sessionPanel');
  const sessionList = $('sessionList');
  let _sessions = [];
  let _agents = [];
  let _sessionPanelOpen = false;

  function openSessionPanel() {
    sessionPanel.classList.remove('hidden');
    _sessionPanelOpen = true;
    refreshSessionPanel();
  }

  function closeSessionPanel() {
    sessionPanel.classList.add('hidden');
    _sessionPanelOpen = false;
  }

  async function refreshSessionPanel() {
    try {
      _sessions = await api.sessions.list(state.currentWorkspaceId) || [];
      _agents = await api.agents.list() || [];
    } catch (_) { _sessions = []; _agents = []; }
    renderSessionList();
  }

  function renderSessionList() {
    if (_sessions.length === 0) {
      sessionList.innerHTML = `
        <div class="session-empty">
          <div style="font-size:32px;margin-bottom:12px">💾</div>
          <p>No saved sessions yet.</p>
          <p style="font-size:11px;margin-top:4px">Save your current tabs to restore them later,<br>or assign an AI agent to control a session.</p>
          <button id="emptySaveSessionBtn" class="btn btn-primary btn-sm" style="margin-top:12px">💾 Save Current Tabs</button>
        </div>
      `;
      document.getElementById('emptySaveSessionBtn')?.addEventListener('click', saveCurrentSession);
      return;
    }

    sessionList.innerHTML = _sessions.map(s => {
      const agent = _agents.find(a => a.id === s.assignedAgentId);
      const tabCount = s.tabIds?.length || 0;
      const statusClass = s.agentStatus || 'idle';
      const statusLabel = statusClass.charAt(0).toUpperCase() + statusClass.slice(1);
      return `
      <div class="session-card" data-id="${s.id}">
        <div class="session-card-header">
          <div class="session-card-name">
            <span class="session-card-color" style="background:${s.color || '#6366f1'}"></span>
            ${s.name}
            ${s.assignedAgentId ? `<span class="agent-badge ${statusClass}">🤖 ${statusLabel}</span>` : ''}
          </div>
          ${s.isPinned ? '<span style="font-size:10px;color:var(--accent)">📌 Pinned</span>' : ''}
        </div>
        <div class="session-card-meta">
          <span>📄 ${tabCount} tab${tabCount !== 1 ? 's' : ''}</span>
          <span>🕐 ${new Date(s.updatedAt || s.createdAt).toLocaleDateString()}</span>
          ${agent ? `<span>🤖 ${agent.name}</span>` : ''}
          ${s.agentLastAction ? `<span>⚡ ${s.agentLastAction}</span>` : ''}
        </div>
        <div class="session-card-actions">
          <button class="btn btn-primary btn-sm session-restore" data-id="${s.id}">📂 Restore</button>
          <button class="btn btn-secondary btn-sm session-export" data-id="${s.id}">📤 Export</button>
          <button class="btn btn-secondary btn-sm session-delete" data-id="${s.id}" style="color:var(--red)">🗑️</button>
        </div>
        ${renderAgentControl(s)}
      </div>`;
    }).join('');

    // Bind actions
    sessionList.querySelectorAll('.session-restore').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); restoreSession(el.dataset.id); });
    });
    sessionList.querySelectorAll('.session-export').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); exportSession(el.dataset.id); });
    });
    sessionList.querySelectorAll('.session-delete').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); deleteSession(el.dataset.id); });
    });
    // Bind agent control actions
    sessionList.querySelectorAll('.agent-assign-btn').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); assignAgentToSession(el.dataset.sid, el.dataset.aid); });
    });
    sessionList.querySelectorAll('.agent-release-btn').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); releaseAgentFromSession(el.dataset.sid); });
    });
    // Agent actions
    sessionList.querySelectorAll('.agent-do-read').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); agentReadTab(el.dataset.sid, el.dataset.tabid); });
    });
    sessionList.querySelectorAll('.agent-do-screenshot').forEach(el => {
      el.addEventListener('click', (e) => { e.stopPropagation(); agentScreenshotTab(el.dataset.sid, el.dataset.tabid); });
    });
    sessionList.querySelectorAll('.agent-do-navigate').forEach(el => {
      // Navigate prompt handled dynamically
    });
  }

  function renderAgentControl(session) {
    if (!session.assignedAgentId) {
      // Show agent assignment dropdown
      const agentOptions = _agents.map(a =>
        `<option value="${a.id}">${a.name} (${a.role})</option>`
      ).join('');
      return `
        <div class="agent-control-section">
          <div class="agent-control-row">
            <select class="agent-select" id="agentSelect_${session.id}">
              <option value="">— Assign Agent —</option>
              ${agentOptions}
            </select>
            <button class="btn btn-primary btn-sm agent-assign-btn" data-sid="${session.id}" data-aid="">🤖 Assign</button>
          </div>
        </div>
      `;
    }

    // Agent is assigned — show control panel
    const agent = _agents.find(a => a.id === session.assignedAgentId);
    const firstTabId = session.tabIds?.[0] || 'none';
    return `
      <div class="agent-control-section">
        <div class="agent-control-row">
          <span style="font-size:11px;font-weight:500">🤖 ${agent?.name || 'Agent'}</span>
          <span class="agent-badge ${session.agentStatus || 'idle'}">${session.agentStatus || 'idle'}</span>
          <button class="btn btn-secondary btn-sm agent-release-btn" data-sid="${session.id}">Release</button>
        </div>
        ${session.agentLastOutput ? `
        <div class="agent-output-box">
          <div class="label">Last Output</div>
          ${session.agentLastOutput}
        </div>` : ''}
        ${session.agentLastAction ? `
        <div class="agent-output-box">
          <div class="label">Last Action</div>
          ${session.agentLastAction}
        </div>` : ''}
        <div class="agent-control-row" style="gap:4px">
          <button class="btn btn-secondary btn-sm agent-do-read" data-sid="${session.id}" data-tabid="${firstTabId}" title="Read page content">📖 Read</button>
          <button class="btn btn-secondary btn-sm agent-do-screenshot" data-sid="${session.id}" data-tabid="${firstTabId}" title="Take screenshot">📷 Screenshot</button>
          <button class="btn btn-secondary btn-sm agent-do-navigate" data-sid="${session.id}" data-tabid="${firstTabId}" title="Navigate to URL" onclick="promptAgentNavigate('${session.id}', '${firstTabId}')">🌐 Navigate</button>
          <button class="btn btn-secondary btn-sm agent-do-back" data-sid="${session.id}" data-tabid="${firstTabId}" title="Go back">◀ Back</button>
        </div>
        <div class="agent-control-row">
          <input type="text" id="agentExecJS_${session.id}" placeholder="execute JS..." style="flex:1;font-size:11px;padding:3px 6px" />
          <button class="btn btn-secondary btn-sm" onclick="runAgentJS('${session.id}', '${firstTabId}')">Run JS</button>
        </div>
      </div>
    `;
  }

  // Save current tabs as a session
  async function saveCurrentSession() {
    const name = prompt('Session name:', `Session ${new Date().toLocaleString()}`);
    if (!name) return;
    try {
      await api.sessions.create({
        name,
        workspaceId: state.currentWorkspaceId,
        tabIds: state.tabs.map(t => t.id),
      });
      await refreshSessionPanel();
      await loadSessions(state.currentWorkspaceId);
    } catch (err) {
      console.error('[browser] Failed to save session:', err);
    }
  }

  async function restoreSession(id) {
    const session = _sessions.find(s => s.id === id);
    if (!session) return;
    // Open all tabs in the session
    for (const tabId of session.tabIds) {
      const tab = state.tabs.find(t => t.id === tabId);
      if (tab) {
        await api.tabs.create({
          url: tab.url,
          title: tab.title,
          workspaceId: state.currentWorkspaceId,
        });
      }
    }
    await loadTabs(state.currentWorkspaceId);
    console.log(`[browser] Restored session: ${session.name}`);
  }

  async function exportSession(id) {
    const session = _sessions.find(s => s.id === id);
    if (!session) return;
    try {
      const data = await api.sessions.export(id);
      if (data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `session-${session.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
    } catch (err) {
      console.error('[browser] Export failed:', err);
    }
  }

  async function deleteSession(id) {
    const session = _sessions.find(s => s.id === id);
    if (!session || !confirm(`Delete session "${session.name}"?`)) return;
    try {
      await api.sessions.remove(id);
      await refreshSessionPanel();
    } catch (err) {
      console.error('[browser] Delete failed:', err);
    }
  }

  // ── Agent Assignment ────────────────────────────────────────────────
  async function assignAgentToSession(sessionId, agentId) {
    // If agentId is empty, read from the select
    const select = document.getElementById(`agentSelect_${sessionId}`);
    const selectedAgentId = agentId || select?.value;
    if (!selectedAgentId) return;

    try {
      await api.sessions.assignAgent(sessionId, selectedAgentId);
      await refreshSessionPanel();
    } catch (err) {
      console.error('[browser] Failed to assign agent:', err);
    }
  }

  async function releaseAgentFromSession(sessionId) {
    try {
      await api.sessions.releaseAgent(sessionId);
      await refreshSessionPanel();
    } catch (err) {
      console.error('[browser] Failed to release agent:', err);
    }
  }

  // ── Agent Browser Actions ──────────────────────────────────────────
  async function agentReadTab(sessionId, tabId) {
    try {
      const result = await api.browserControl.getContent(tabId);
      const output = result?.content ? result.content.slice(0, 500) : '(no content)';
      await api.sessions.recordAction(sessionId, 'read_page', output, 'reading');
      await refreshSessionPanel();
      return output;
    } catch (err) {
      console.error('[browser] Agent read failed:', err);
    }
  }

  async function agentScreenshotTab(sessionId, tabId) {
    try {
      const result = await api.browserControl.screenshot(tabId);
      if (result?.screenshot) {
        await api.sessions.recordAction(sessionId, 'screenshot', '📸 Screenshot taken (' + result.screenshot.slice(0, 50) + '...)', 'acting');
        await refreshSessionPanel();
        // Show in console for now — could open in a lightbox
        console.log('[browser] Screenshot data URL length:', result.screenshot.length);
      }
    } catch (err) {
      console.error('[browser] Agent screenshot failed:', err);
    }
  }

  async function agentNavigateTab(sessionId, tabId, url) {
    try {
      const result = await api.browserControl.tabAction(tabId, 'navigate', { url });
      if (result?.success) {
        await api.sessions.recordAction(sessionId, `navigate: ${url}`, 'Navigated to ' + url, 'acting');
        await refreshSessionPanel();
      }
    } catch (err) {
      console.error('[browser] Agent navigate failed:', err);
    }
  }

  // ── Global functions for inline onclick ────────────────────────────
  window.promptAgentNavigate = function(sessionId, tabId) {
    const url = prompt('Enter URL to navigate:', 'https://');
    if (url) agentNavigateTab(sessionId, tabId, url);
  };

  window.runAgentJS = async function(sessionId, tabId) {
    const input = document.getElementById(`agentExecJS_${sessionId}`);
    if (!input || !input.value.trim()) return;
    const code = input.value.trim();
    try {
      const result = await api.browserControl.execJS(tabId, code);
      const output = result?.result !== undefined
        ? JSON.stringify(result.result).slice(0, 500)
        : (result?.error || 'no result');
      await api.sessions.recordAction(sessionId, `execJS: ${code.slice(0, 50)}`, output, 'acting');
      input.value = '';
      await refreshSessionPanel();
    } catch (err) {
      console.error('[browser] Agent execJS failed:', err);
    }
  };

  // ── Event Bindings for Session Panel ──────────────────────────────
  document.getElementById('saveSessionBtn')?.addEventListener('click', () => {
    if (_sessionPanelOpen) closeSessionPanel();
    else openSessionPanel();
  });
  document.getElementById('welcomeSessionBtn')?.addEventListener('click', openSessionPanel);
  document.getElementById('sessionPanelClose')?.addEventListener('click', closeSessionPanel);
  document.getElementById('saveSessionPanelBtn')?.addEventListener('click', saveCurrentSession);

  // Auto-save toggle
  document.getElementById('sessionAutoSave')?.addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    try {
      await api.sessions.save(state.currentWorkspaceId, { tabIds: state.tabs.map(t => t.id) });
    } catch (_) {}
  });

  // Keyboard shortcut: Escape closes session panel
  sessionPanel.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSessionPanel(); });

  // ═════════════════════════════════════════════════════════════════════
  // Kanban Board Rendering + Agent Linking
  // ═════════════════════════════════════════════════════════════════════
  let _kanbanBoards = [];
  let _kanbanColumns = [];
  let _kanbanCards = [];

  async function openKanban() {
    kanbanPanel.classList.remove('hidden');
    await loadKanban();
  }

  function closeKanban() {
    kanbanPanel.classList.add('hidden');
  }

  async function loadKanban(boardId) {
    try {
      _kanbanBoards = await api.kanban.boards.list(state.currentWorkspaceId) || [];
      if (_kanbanBoards.length === 0) {
        // Create default board
        const board = await api.kanban.boards.create({
          title: 'My Board', workspaceId: state.currentWorkspaceId, color: '#6366f1',
        });
        await api.kanban.columns.create({ boardId: board.id, title: 'Todo', order: 0, color: '#6366f1' });
        await api.kanban.columns.create({ boardId: board.id, title: 'In Progress', order: 1, color: '#FBBF24' });
        await api.kanban.columns.create({ boardId: board.id, title: 'Done', order: 2, color: '#4ADE80' });
        _kanbanBoards = await api.kanban.boards.list(state.currentWorkspaceId) || [];
      }
      const activeBoard = boardId || _kanbanBoards[0]?.id;
      if (activeBoard) {
        _kanbanColumns = await api.kanban.columns.list(activeBoard) || [];
        _kanbanCards = [];
        for (const col of _kanbanColumns) {
          const cards = await api.kanban.cards.list(activeBoard, col.id) || [];
          _kanbanCards.push(...cards);
        }
      }
      renderKanban(activeBoard);
    } catch (err) { console.error('[kanban] Load error:', err); }
  }

  function renderKanban(activeBoardId) {
    const board = _kanbanBoards.find(b => b.id === activeBoardId);
    if (!board) { kanbanBoard.innerHTML = '<div class="session-empty">No boards.</div>'; return; }

    kanbanTitle.textContent = board.title || 'Kanban Board';

    // Column filter: only for this board
    const cols = _kanbanColumns.filter(c => c.boardId === activeBoardId).sort((a,b) => a.order - b.order);

    kanbanBoard.innerHTML = cols.map(col => {
      const cards = _kanbanCards.filter(c => c.columnId === col.id).sort((a,b) => a.order - b.order);
      const wip = col.wipLimit > 0 ? `<span style="font-size:9px;color:var(--text-muted)">${cards.length}/${col.wipLimit}</span>` : '';
      return `
      <div class="kanban-column" data-col-id="${col.id}">
        <div class="kanban-col-header" style="border-left:3px solid ${col.color || '#6366f1'}">
          <span>${col.title}</span>
          ${wip}
          <span style="margin-left:auto;font-size:10px;color:var(--text-muted)">${cards.length}</span>
        </div>
        <div class="kanban-col-cards" data-col-id="${col.id}"
             ondragover="event.preventDefault(); this.classList.add('drag-over')"
             ondragleave="this.classList.remove('drag-over')"
             ondrop="handleCardDrop(event, '${col.id}')">
          ${cards.length === 0 ? '<div style="padding:12px;font-size:10px;color:var(--text-muted);text-align:center">Drop cards here</div>' : ''}
          ${cards.map(card => renderKanbanCard(card, col)).join('')}
          <button class="kanban-add-card" data-col-id="${col.id}">+ Add Card</button>
        </div>
      </div>`;
    }).join('') + `
    <div class="kanban-column kanban-add-col" style="min-width:60px;display:flex;align-items:center;justify-content:center;background:transparent;border:2px dashed var(--border);border-radius:var(--radius-md);cursor:pointer"
         onclick="promptAddColumn('${activeBoardId}')">
      <span style="font-size:24px;color:var(--text-muted)">+</span>
    </div>`;

    // Bind column events
    kanbanBoard.querySelectorAll('.kanban-add-card').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const colId = el.dataset.colId;
        promptAddCard(activeBoardId, colId);
      });
    });

    // Bind card events
    kanbanBoard.querySelectorAll('.kanban-card').forEach(el => {
      el.addEventListener('click', () => editKanbanCard(el.dataset.cardId));
      el.addEventListener('contextmenu', (e) => showKanbanCardContext(e, el.dataset.cardId));
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', el.dataset.cardId);
        e.dataTransfer.setData('source-col', el.closest('.kanban-column')?.dataset.colId || '');
        el.classList.add('dragging');
      });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
    });
  }

  function renderKanbanCard(card, col) {
    const priorityColors = { low: '#4ADE80', medium: '#FBBF24', high: '#F87171', critical: '#EF4444' };
    const pColor = priorityColors[card.priority] || '#6366f1';
    const labels = (card.labels || []).map(l =>
      `<span class="kanban-label" style="background:${l.color || '#6366f1'}22;color:${l.color || '#6366f1'}">${l.text || l}</span>`
    ).join('');
    const agentBadge = card.assignedTo
      ? `<span class="agent-badge running" style="font-size:8px;padding:1px 5px">🤖</span>`
      : '';
    return `
    <div class="kanban-card" data-card-id="${card.id}" draggable="true"
         style="border-left:3px solid ${pColor}">
      <div class="kanban-card-title">${card.title} ${agentBadge}</div>
      ${card.description ? `<div class="kanban-card-desc">${card.description.slice(0, 80)}${card.description.length > 80 ? '…' : ''}</div>` : ''}
      ${labels ? `<div class="kanban-card-labels">${labels}</div>` : ''}
      <div class="kanban-card-footer">
        ${card.dueDate ? `<span>📅 ${new Date(card.dueDate).toLocaleDateString()}</span>` : ''}
        ${card.priority ? `<span style="color:${pColor};font-weight:600">${card.priority}</span>` : ''}
      </div>
    </div>`;
  }

  // ── Card CRUD ──────────────────────────────────────────────────────────
  async function promptAddCard(boardId, colId) {
    const title = prompt('Card title:');
    if (!title) return;
    try {
      const existing = _kanbanCards.filter(c => c.columnId === colId);
      await api.kanban.cards.create({
        boardId, columnId: colId, title, order: existing.length,
        priority: 'medium', labels: [],
      });
      await loadKanban(boardId);
    } catch (err) { console.error('[kanban] Create card failed:', err); }
  }

  async function editKanbanCard(cardId) {
    const card = _kanbanCards.find(c => c.id === cardId);
    if (!card) return;
    const newTitle = prompt('Edit card title:', card.title);
    if (!newTitle || newTitle === card.title) return;
    try {
      await api.kanban.cards.update(cardId, { title: newTitle });
      await loadKanban();
    } catch (err) { console.error('[kanban] Edit failed:', err); }
  }

  async function deleteKanbanCard(cardId) {
    const card = _kanbanCards.find(c => c.id === cardId);
    if (!card || !confirm(`Delete "${card.title}"?`)) return;
    try {
      await api.kanban.cards.remove(cardId);
      await loadKanban();
    } catch (err) { console.error('[kanban] Delete failed:', err); }
  }

  // ── Card Drop between columns ─────────────────────────────────────────
  window.handleCardDrop = async function(event, targetColId) {
    event.preventDefault();
    event.target.classList.remove('drag-over');
    const cardId = event.dataTransfer.getData('text/plain');
    if (!cardId) return;
    try {
      const targetCards = _kanbanCards.filter(c => c.columnId === targetColId);
      await api.kanban.cards.move(cardId, targetColId, targetCards.length);
      await loadKanban();
    } catch (err) { console.error('[kanban] Move failed:', err); }
  };

  window.promptAddColumn = async function(boardId) {
    const title = prompt('Column name:');
    if (!title) return;
    try {
      const cols = _kanbanColumns.filter(c => c.boardId === boardId);
      await api.kanban.columns.create({ boardId, title, order: cols.length, color: '#6366f1' });
      await loadKanban(boardId);
    } catch (err) { console.error('[kanban] Add column failed:', err); }
  };

  // ── Card Context Menu ──────────────────────────────────────────────────
  function showKanbanCardContext(e, cardId) {
    e.preventDefault();
    const card = _kanbanCards.find(c => c.id === cardId);
    if (!card) return;
    const col = _kanbanColumns.find(c => c.id === card.columnId);
    const otherCols = _kanbanColumns.filter(c => c.boardId === card.boardId && c.id !== card.columnId);

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.innerHTML = `
      <div class="context-item" data-action="edit">✏️ Edit</div>
      <div class="context-item" data-action="priority">🎯 Set Priority</div>
      <div class="context-separator"></div>
      <div style="padding:4px 12px;font-size:10px;color:var(--text-muted)">Move to column:</div>
      ${otherCols.map(c => `<div class="context-item" data-action="move" data-col="${c.id}">→ ${c.title}</div>`).join('')}
      <div class="context-separator"></div>
      ${card.assignedTo
        ? `<div class="context-item" data-action="unassign-agent">🤖 Unassign Agent</div>`
        : `<div class="context-item" data-action="assign-agent">🤖 Assign Agent</div>`
      }
      <div class="context-separator"></div>
      <div class="context-item" data-action="delete" style="color:var(--red)">🗑️ Delete</div>
    `;
    document.body.appendChild(menu);

    menu.querySelectorAll('.context-item').forEach(el => {
      el.addEventListener('click', async () => {
        const action = el.dataset.action;
        switch (action) {
          case 'edit': editKanbanCard(cardId); break;
          case 'priority': {
            const p = prompt('Priority (low/medium/high/critical):', card.priority || 'medium');
            if (['low','medium','high','critical'].includes(p)) {
              await api.kanban.cards.update(cardId, { priority: p });
              await loadKanban();
            }
            break;
          }
          case 'move': {
            const colId = el.dataset.col;
            const targetCards = _kanbanCards.filter(c => c.columnId === colId);
            await api.kanban.cards.move(cardId, colId, targetCards.length);
            await loadKanban();
            break;
          }
          case 'assign-agent': {
            const agents = await api.agents.list() || [];
            if (agents.length === 0) { alert('No agents.'); break; }
            const names = agents.map((a,i) => `${i+1}. ${a.name}`);
            const choice = prompt('Choose agent:\n' + names.join('\n') + '\n\nNumber:');
            const idx = parseInt(choice) - 1;
            if (idx >= 0 && idx < agents.length) {
              await api.kanban.cards.assign(cardId, agents[idx].id);
              await loadKanban();
            }
            break;
          }
          case 'unassign-agent': {
            await api.kanban.cards.assign(cardId, null);
            await loadKanban();
            break;
          }
          case 'delete': deleteKanbanCard(cardId); break;
        }
        menu.remove();
      });
    });
    document.addEventListener('click', () => menu.remove(), { once: true });
  }

  // ── Kanban: add to switchPanel ─────────────────────────────────────
  document.getElementById('kanbanClose')?.addEventListener('click', closeKanban);

  // ═════════════════════════════════════════════════════════════════════
  // Cron Jobs Panel
  // ═════════════════════════════════════════════════════════════════════
  let _cronJobs = [];
  let _editingCronId = null;

  function openCronPanel() {
    document.getElementById('cronPanel').classList.remove('hidden');
    refreshCronList();
  }

  function closeCronPanel() {
    document.getElementById('cronPanel').classList.add('hidden');
  }

  async function refreshCronList() {
    try {
      _cronJobs = await api.cron.list() || [];
    } catch (_) { _cronJobs = []; }
    renderCronList();
  }

  function renderCronList() {
    const list = document.getElementById('cronList');
    if (_cronJobs.length === 0) {
      list.innerHTML = `<div class="session-empty">
        <div style="font-size:32px;margin-bottom:12px">⏰</div>
        <p>No cron jobs yet.</p>
        <p style="font-size:11px;margin-top:4px">Schedule recurring tasks like backups,<br>health checks, or maintenance.</p>
      </div>`;
      return;
    }
    list.innerHTML = _cronJobs.map(job => {
      const isEnabled = job.enabled !== false;
      const lastRun = job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : 'never';
      const nextRun = job.nextRunAt ? new Date(job.nextRunAt).toLocaleString() : '—';
      const statusClass = job.lastRunStatus === 'success' ? 'success'
        : job.lastRunStatus === 'failed' ? 'failed' : 'pending';
      const statusLabel = job.lastRunStatus || 'pending';
      const icon = job.taskType === 'backup' ? '💾' : job.taskType === 'health_check' ? '❤️'
        : job.taskType === 'cleanup' ? '🧹' : job.taskType === 'review' ? '📋' : '⏰';
      return `
      <div class="cron-card ${isEnabled ? '' : 'disabled'}">
        <div class="cron-card-icon">${icon}</div>
        <div class="cron-card-info">
          <div class="cron-card-name">
            ${job.name}
            <span class="cron-card-status ${statusClass}">● ${statusLabel}</span>
            ${isEnabled ? '' : '<span style="font-size:9px;color:var(--text-muted)">(disabled)</span>'}
          </div>
          <div class="cron-card-schedule">${job.schedule}</div>
          <div class="cron-card-meta">
            <span>📅 Last: ${lastRun}</span>
            <span>⏭ Next: ${nextRun}</span>
            <span>🔄 ${job.maxRetries || 3} retries</span>
          </div>
        </div>
        <div class="cron-card-actions">
          <button class="cron-toggle" data-id="${job.id}" title="${isEnabled ? 'Disable' : 'Enable'}">${isEnabled ? '⏸' : '▶'}</button>
          <button class="cron-run" data-id="${job.id}" title="Run Now">▶</button>
          <button class="cron-edit" data-id="${job.id}" title="Edit">✏️</button>
          <button class="cron-delete" data-id="${job.id}" title="Delete" style="color:var(--red)">🗑️</button>
        </div>
      </div>`;
    }).join('');

    // Bind events
    list.querySelectorAll('.cron-toggle').forEach(el => {
      el.addEventListener('click', async () => {
        const job = _cronJobs.find(j => j.id === el.dataset.id);
        if (job) {
          await api.cron.toggle(el.dataset.id, !job.enabled);
          await refreshCronList();
        }
      });
    });
    list.querySelectorAll('.cron-run').forEach(el => {
      el.addEventListener('click', async () => {
        await api.cron.runNow(el.dataset.id);
        await refreshCronList();
      });
    });
    list.querySelectorAll('.cron-edit').forEach(el => {
      el.addEventListener('click', () => openCronDialog(el.dataset.id));
    });
    list.querySelectorAll('.cron-delete').forEach(el => {
      el.addEventListener('click', async () => {
        const job = _cronJobs.find(j => j.id === el.dataset.id);
        if (job && confirm(`Delete "${job.name}"?`)) {
          await api.cron.remove(el.dataset.id);
          await refreshCronList();
        }
      });
    });
  }

  // ── Cron Create/Edit Dialog ──────────────────────────────────────────
  function openCronDialog(jobId) {
    _editingCronId = jobId || null;
    const dialog = document.getElementById('cronDialogOverlay');
    const title = document.getElementById('cronDialogTitle');
    const nameEl = document.getElementById('cronName');
    const scheduleEl = document.getElementById('cronSchedule');
    const typeEl = document.getElementById('cronTaskType');
    const retriesEl = document.getElementById('cronMaxRetries');
    const enabledEl = document.getElementById('cronEnabled');

    if (jobId) {
      const job = _cronJobs.find(j => j.id === jobId);
      if (!job) return;
      title.textContent = 'Edit Cron Job';
      nameEl.value = job.name || '';
      scheduleEl.value = job.schedule || '0 3 * * *';
      typeEl.value = job.taskType || 'maintenance';
      retriesEl.value = job.maxRetries || 3;
      enabledEl.checked = job.enabled !== false;
    } else {
      title.textContent = 'New Cron Job';
      nameEl.value = '';
      scheduleEl.value = '0 3 * * *';
      typeEl.value = 'maintenance';
      retriesEl.value = 3;
      enabledEl.checked = true;
    }

    // Clear preset selection
    document.querySelectorAll('#cronPresets span').forEach(el => el.classList.remove('selected'));
    dialog.classList.remove('hidden');
    setTimeout(() => nameEl.focus(), 100);
  }

  function closeCronDialog() {
    document.getElementById('cronDialogOverlay').classList.add('hidden');
    _editingCronId = null;
  }

  async function saveCronJob() {
    const name = document.getElementById('cronName').value.trim();
    const schedule = document.getElementById('cronSchedule').value.trim();
    if (!name || !schedule) { alert('Name and schedule are required.'); return; }

    const data = {
      name,
      schedule,
      taskType: document.getElementById('cronTaskType').value,
      maxRetries: parseInt(document.getElementById('cronMaxRetries').value) || 3,
      enabled: document.getElementById('cronEnabled').checked,
    };

    try {
      if (_editingCronId) {
        await api.cron.update(_editingCronId, data);
      } else {
        await api.cron.create(data);
      }
      closeCronDialog();
      await refreshCronList();
    } catch (err) {
      console.error('[cron] Save failed:', err);
      alert('Failed to save cron job.');
    }
  }

  // ── Cron Preset Picker ──────────────────────────────────────────────
  document.getElementById('cronPresets').addEventListener('click', (e) => {
    const span = e.target.closest('span[data-schedule]');
    if (!span) return;
    document.querySelectorAll('#cronPresets span').forEach(el => el.classList.remove('selected'));
    span.classList.add('selected');
    document.getElementById('cronSchedule').value = span.dataset.schedule;
  });

  // ── Cron Dialog Events ──────────────────────────────────────────────
  document.getElementById('addCronBtn').addEventListener('click', () => openCronDialog());
  document.getElementById('cronPanelClose').addEventListener('click', closeCronPanel);
  document.getElementById('cronDialogClose').addEventListener('click', closeCronDialog);
  document.getElementById('cronDialogCancel').addEventListener('click', closeCronDialog);
  document.getElementById('cronDialogSave').addEventListener('click', saveCronJob);
  document.getElementById('cronDialogOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('cronDialogOverlay')) closeCronDialog();
  });

  // ── Cron button in toolbar ──────────────────────────────────────────
  // Add cron button next to other action buttons
  const appActions = document.querySelector('.app-actions');
  if (appActions) {
    const cronBtn = document.createElement('button');
    cronBtn.className = 'action-btn';
    cronBtn.id = 'cronBtn';
    cronBtn.title = 'Cron Jobs';
    cronBtn.textContent = '⏰';
    cronBtn.addEventListener('click', () => {
      if (document.getElementById('cronPanel').classList.contains('hidden')) { if (window.navigateTo) window.navigateTo('cron'); else openCronPanel(); }
      else closeCronPanel();
    });
    appActions.appendChild(cronBtn);
  }

  // ═════════════════════════════════════════════════════════════════════
  // Worker/Task Queue Panel
  // ═════════════════════════════════════════════════════════════════════
  let _workerFilter = 'all';
  let _workerJobs = [];
  let _workerRefreshInterval = null;

  function openWorkerPanel() {
    document.getElementById('workerPanel').classList.remove('hidden');
    refreshWorkerQueue();
    // Auto-refresh every 5s for live view
    if (_workerRefreshInterval) clearInterval(_workerRefreshInterval);
    _workerRefreshInterval = setInterval(refreshWorkerQueue, 5000);
  }

  function closeWorkerPanel() {
    document.getElementById('workerPanel').classList.add('hidden');
    if (_workerRefreshInterval) { clearInterval(_workerRefreshInterval); _workerRefreshInterval = null; }
  }

  async function refreshWorkerQueue() {
    try {
      _workerJobs = await api.workers.list() || [];
      const summary = await api.workers.queueStatus() || {};
      renderWorkerSummary(summary);
      renderWorkerJobs();
    } catch (_) {}
  }

  function renderWorkerSummary(summary) {
    const el = document.getElementById('workerSummary');
    if (!summary || !summary.total) {
      el.innerHTML = ''; return;
    }
    el.innerHTML = `
      <div class="worker-summary-item"><span class="worker-summary-count">${summary.total}</span><span class="worker-summary-label">Total</span></div>
      <div class="worker-summary-item"><span class="worker-summary-count" style="color:var(--blue)">${summary.queued || 0}</span><span class="worker-summary-label">⏳ Queued</span></div>
      <div class="worker-summary-item"><span class="worker-summary-count" style="color:var(--yellow)">${summary.running || 0}</span><span class="worker-summary-label">▶ Running</span></div>
      <div class="worker-summary-item"><span class="worker-summary-count" style="color:var(--green)">${summary.completed || 0}</span><span class="worker-summary-label">✅ Done</span></div>
      <div class="worker-summary-item"><span class="worker-summary-count" style="color:var(--red)">${summary.failed || 0}</span><span class="worker-summary-label">❌ Failed</span></div>
      <div class="worker-summary-item"><span class="worker-summary-count" style="color:var(--orange)">${summary.retrying || 0}</span><span class="worker-summary-label">🔄 Retry</span></div>
      <div class="worker-summary-item"><span class="worker-summary-count" style="color:var(--text-muted)">${summary.cancelled || 0}</span><span class="worker-summary-label">✕ Cancelled</span></div>
    `;
  }

  function renderWorkerJobs() {
    const el = document.getElementById('workerList');
    const filtered = _workerFilter === 'all'
      ? _workerJobs
      : _workerJobs.filter(j => j.status === _workerFilter);

    if (filtered.length === 0) {
      el.innerHTML = `<div class="session-empty"><p style="font-size:13px">${_workerFilter === 'all' ? 'No jobs in queue.' : 'No ' + _workerFilter + ' jobs.'}</p></div>`;
      return;
    }

    el.innerHTML = filtered.map(job => {
      const status = job.status || 'queued';
      const isActive = status === 'queued' || status === 'running' || status === 'retrying';
      const progressColor = status === 'running' ? '#FBBF24' : status === 'completed' ? '#4ADE80' : status === 'failed' ? '#F87171' : '#6366f1';
      const iconMap = {
        code: '💻', research: '🔬', review: '📋', test: '🧪', deploy: '🚀',
        maintenance: '🔧', backup: '💾', cleanup: '🧹', generic: '⚡',
      };
      const icon = iconMap[job.type] || '⚡';
      const prioLabel = job.priority === 'critical' ? 'job-priority-critical' : job.priority === 'high' ? 'job-priority-high' : '';
      return `
      <div class="worker-job job-${status} ${prioLabel}" data-id="${job.id}">
        <div class="worker-job-icon">${icon}</div>
        <div class="worker-job-info">
          <div class="worker-job-title">
            ${job.type}
            <span class="job-type">${job.priority || 'medium'}</span>
            ${job.agentId ? `<span class="job-type">🤖 ${(job.agentId || '').slice(0, 8)}</span>` : ''}
            <span style="margin-left:auto;font-size:10px;color:var(--text-muted)">
              ${status === 'running' ? '▶' : status === 'completed' ? '✅' : status === 'failed' ? '❌' : status === 'cancelled' ? '✕' : status === 'retrying' ? '🔄' : '⏳'}
              ${status}
            </span>
          </div>
          <div class="worker-job-meta">
            <span>📅 ${new Date(job.createdAt).toLocaleString()}</span>
            ${job.startedAt ? `<span>▶ ${new Date(job.startedAt).toLocaleString()}</span>` : ''}
            ${job.tokensUsed ? `<span>🔤 ${job.tokensUsed} tokens</span>` : ''}
            ${job.estimatedCost ? `<span>💰 $${job.estimatedCost.toFixed(4)}</span>` : ''}
            ${job.retryCount > 0 ? `<span>🔄 retry ${job.retryCount}/${job.maxRetries}</span>` : ''}
          </div>
          ${job.error ? `<div class="worker-error">${job.error}</div>` : ''}
        </div>
        ${isActive ? `<div class="worker-job-progress"><div class="worker-job-progress-bar" style="width:${job.progress || 0}%;background:${progressColor}"></div></div>` : ''}
        <div class="worker-job-actions">
          ${status === 'running' ? `<button class="worker-cancel" data-id="${job.id}" title="Cancel">✕</button>` : ''}
          ${status === 'failed' || status === 'cancelled' ? `<button class="worker-retry" data-id="${job.id}" title="Retry">↻</button>` : ''}
          ${job.error ? `<button class="worker-detail" data-id="${job.id}" title="Error detail">🔍</button>` : ''}
        </div>
      </div>`;
    }).join('');

    // Bind actions
    el.querySelectorAll('.worker-cancel').forEach(el => {
      el.addEventListener('click', async () => {
        await api.workers.cancel(el.dataset.id);
        refreshWorkerQueue();
      });
    });
    el.querySelectorAll('.worker-retry').forEach(el => {
      el.addEventListener('click', async () => {
        await api.workers.retry(el.dataset.id);
        refreshWorkerQueue();
      });
    });
    el.querySelectorAll('.worker-detail').forEach(el => {
      el.addEventListener('click', () => {
        const job = _workerJobs.find(j => j.id === el.dataset.id);
        if (job?.error) alert('Error:\n' + job.error);
      });
    });
  }

  // ── Worker Filter Buttons ──────────────────────────────────────────
  document.getElementById('workerFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _workerFilter = btn.dataset.filter;
    renderWorkerJobs();
  });

  // ── Worker Panel Events ────────────────────────────────────────────
  document.getElementById('workerPanelClose').addEventListener('click', closeWorkerPanel);

  // ── Worker button in toolbar ───────────────────────────────────────
  const addWorkerBtn = document.createElement('button');
  addWorkerBtn.className = 'action-btn';
  addWorkerBtn.id = 'workerBtn';
  addWorkerBtn.title = 'Worker Queue';
  addWorkerBtn.textContent = '⚡';
  addWorkerBtn.addEventListener('click', () => {
    if (document.getElementById('workerPanel').classList.contains('hidden')) openWorkerPanel();
    else closeWorkerPanel();
  });
  document.querySelector('.app-actions')?.appendChild(addWorkerBtn);
  // Patch worker button to use navigateTo for history
  const workerBtn = document.getElementById('workerBtn');
  if (workerBtn) {
    // Remove old listener, add new one with window.navigateTo
    const newBtn = workerBtn.cloneNode(true);
    workerBtn.parentNode.replaceChild(newBtn, workerBtn);
    newBtn.addEventListener('click', () => {
      if (document.getElementById('workerPanel').classList.contains('hidden')) { if (window.navigateTo) window.navigateTo('workers'); else openWorkerPanel(); }
      else closeWorkerPanel();
    });
  }

  // ── Skills, Memory, Logs buttons ──────────────────────────────────
  function addToolbarBtn(id, icon, title, panelId, openFn, closeFn) {
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.id = id;
    btn.title = title;
    btn.textContent = icon;
    const routeName = panelId.replace('Panel', '');
    btn.addEventListener('click', () => {
      const panel = document.getElementById(panelId);
      if (panel.classList.contains('hidden')) {
        // Use navigateTo for history tracking
        if (window.navigateTo) window.navigateTo(routeName);
        else openFn();
      } else closeFn();
    });
    document.querySelector('.app-actions')?.appendChild(btn);
  }

  // ═════════════════════════════════════════════════════════════════════
  // Skills Panel
  // ═════════════════════════════════════════════════════════════════════
  let _allSkills = [];

  function openSkillsPanel() {
    document.getElementById('skillsPanel').classList.remove('hidden');
    loadSkills();
  }
  function closeSkillsPanel() { document.getElementById('skillsPanel').classList.add('hidden'); }

  async function loadSkills() {
    try {
      _allSkills = await api.skills.list() || [];
    } catch (_) {
      _allSkills = [];
    }
    renderSkills();
  }

  function renderSkills() {
    const list = document.getElementById('skillsList');
    const q = document.getElementById('skillsSearch').value.toLowerCase();
    const filtered = _allSkills.filter(s => (s.name || s).toLowerCase().includes(q));

    if (filtered.length === 0) {
      list.innerHTML = '<div class="session-empty">No skills found. Skills define reusable workflows for the Hermes agent.</div>';
      return;
    }
    list.innerHTML = filtered.map(s => {
      const name = s.name || s;
      const desc = s.description || s.info || '';
      const category = s.category || s.tags?.join(', ') || '';
      const icon = s.icon || '🧩';
      const isLoaded = s.status !== 'unloaded';
      return `
      <div class="skill-card" data-name="${name}">
        <div class="skill-card-icon">${icon}</div>
        <div class="skill-card-info">
          <div class="skill-card-name">
            ${name}
            ${category ? `<span class="skill-card-category">${category}</span>` : ''}
          </div>
          ${desc ? `<div class="skill-card-desc">${typeof desc === 'string' ? desc.slice(0, 120) : ''}</div>` : ''}
        </div>
        <div class="skill-card-status">${isLoaded ? '✅' : '⏸'}</div>
      </div>`;
    }).join('');

    list.querySelectorAll('.skill-card').forEach(el => {
      el.addEventListener('click', () => showSkillDetail(el.dataset.name));
    });
  }

  async function showSkillDetail(name) {
    try {
      const content = await api.skills.detail(name);
      const list = document.getElementById('skillsList');
      list.innerHTML += `
        <div class="skill-detail-view">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <strong>${name}</strong>
            <button class="btn btn-secondary btn-sm" onclick="this.closest('.skill-detail-view').remove()">✕ Close</button>
          </div>
          <pre>${(content || '').slice(0, 3000)}</pre>
        </div>`;
    } catch (_) {}
  }

  // Skills events
  document.getElementById('skillsPanelClose').addEventListener('click', closeSkillsPanel);
  document.getElementById('skillsRefreshBtn').addEventListener('click', loadSkills);
  document.getElementById('skillsSearch').addEventListener('input', renderSkills);
  addToolbarBtn('skillsBtn', '🧩', 'Skills', 'skillsPanel', openSkillsPanel, closeSkillsPanel);

  // ═════════════════════════════════════════════════════════════════════
  // Memory Browser
  // ═════════════════════════════════════════════════════════════════════
  let _memoryEntries = [];
  let _memoryTags = new Set();

  function openMemoryPanel() {
    document.getElementById('memoryPanel').classList.remove('hidden');
    loadMemory();
  }
  function closeMemoryPanel() { document.getElementById('memoryPanel').classList.add('hidden'); }

  async function loadMemory() {
    try {
      const resp = await fetch('/api/memory/search?q=');
      const data = await resp.json();
      _memoryEntries = data?.results || data?.memories || [];
    } catch (_) {
      // Fallback: show from supermemory
      _memoryEntries = [{ content: '(Supermemory data available via API)', tags: ['memory'], timestamp: new Date().toISOString() }];
    }
    // Collect tags
    _memoryTags = new Set();
    _memoryEntries.forEach(m => (m.tags || []).forEach(t => _memoryTags.add(t)));
    renderMemory();
  }

  function renderMemory() {
    const list = document.getElementById('memoryList');
    const q = document.getElementById('memorySearch').value.toLowerCase();

    let filtered = _memoryEntries;
    if (q) {
      filtered = _memoryEntries.filter(m =>
        (m.content || '').toLowerCase().includes(q) ||
        (m.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }

    if (filtered.length === 0) {
      list.innerHTML = '<div class="session-empty">No memory entries found.</div>';
      return;
    }

    list.innerHTML = filtered.map(m => `
      <div class="memory-item">
        <div class="memory-item-content">${(m.content || '').slice(0, 500)}</div>
        <div class="memory-item-meta">
          ${(m.tags || []).map(t => `<span class="memory-item-tag">#${t}</span>`).join('')}
          <span>📅 ${m.timestamp ? new Date(m.timestamp).toLocaleString() : ''}</span>
          ${m.score !== undefined ? `<span>📊 ${(m.score * 100).toFixed(0)}%</span>` : ''}
        </div>
      </div>
    `).join('');
  }

  document.getElementById('memoryPanelClose').addEventListener('click', closeMemoryPanel);
  document.getElementById('memoryRefreshBtn').addEventListener('click', loadMemory);
  document.getElementById('memorySearch').addEventListener('input', renderMemory);
  addToolbarBtn('memoryBtn', '🧠', 'Memory', 'memoryPanel', openMemoryPanel, closeMemoryPanel);

  // ═════════════════════════════════════════════════════════════════════
  // System Logs Viewer
  // ═════════════════════════════════════════════════════════════════════
  let _logsBuffer = [];
  let _logsSeverity = 'all';
  let _logsAutoScrollEnabled = true;
  let _logsPollTimer = null;
  const MAX_LOGS = 500;

  function openLogsPanel() {
    document.getElementById('logsPanel').classList.remove('hidden');
    _logsBuffer = [];
    document.getElementById('logsContainer').innerHTML = '<div class="log-line" style="color:var(--text-muted)">⟳ Listening for logs...</div>';
    // Poll logger state every 2s
    if (_logsPollTimer) clearInterval(_logsPollTimer);
    _logsPollTimer = setInterval(pollLogs, 2000);
    // Try to connect to logger IPC
    pollLogs();
  }

  function closeLogsPanel() {
    document.getElementById('logsPanel').classList.add('hidden');
    if (_logsPollTimer) { clearInterval(_logsPollTimer); _logsPollTimer = null; }
  }

  async function pollLogs() {
    try {
      // We can't access main process logger directly, so simulate with a local buffer
      // In a real implementation, this would read from main process via IPC
      const timestamp = new Date().toLocaleTimeString();
      const logs = [
        { time: timestamp, severity: 'info', message: `LastBrowser v0.2.0 — ${navigator.userAgent.match(/Electron\/([\d.]+)/)?.[1] || 'running'}` },
      ];
      // Add memory stats
      if (performance && performance.memory) {
        const mem = performance.memory;
        logs.push({ time: timestamp, severity: 'info', message: `Memory: ${Math.round(mem.usedJSHeapSize / 1024 / 1024)}MB / ${Math.round(mem.jsHeapSizeLimit / 1024 / 1024)}MB` });
      }
      _logsBuffer.push(...logs);
      if (_logsBuffer.length > MAX_LOGS) _logsBuffer = _logsBuffer.slice(-MAX_LOGS);
      renderLogs();
    } catch (_) {}
  }

  function renderLogs() {
    const container = document.getElementById('logsContainer');
    const filtered = _logsSeverity === 'all' ? _logsBuffer : _logsBuffer.filter(l => l.severity === _logsSeverity);
    container.innerHTML = filtered.map(l => `
      <div class="log-line ${l.severity}">
        <span class="log-time">${l.time}</span>
        <span class="log-severity ${l.severity}">${l.severity.toUpperCase()}</span>
        <span class="log-message">${l.message}</span>
      </div>
    `).join('');

    if (_logsAutoScrollEnabled) container.scrollTop = container.scrollHeight;
  }

  // Logs filters
  document.getElementById('logsFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#logsFilters .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _logsSeverity = btn.dataset.severity;
    renderLogs();
  });

  document.getElementById('logsAutoScroll').addEventListener('click', () => {
    _logsAutoScrollEnabled = !_logsAutoScrollEnabled;
    document.getElementById('logsAutoScroll').style.opacity = _logsAutoScrollEnabled ? '1' : '0.4';
  });

  document.getElementById('logsClearBtn').addEventListener('click', () => {
    _logsBuffer = [];
    document.getElementById('logsContainer').innerHTML = '';
  });

  document.getElementById('logsPanelClose').addEventListener('click', closeLogsPanel);
  addToolbarBtn('logsBtn', '📋', 'System Logs', 'logsPanel', openLogsPanel, closeLogsPanel);

  // ═════════════════════════════════════════════════════════════════════
  // Nav Sidebar Navigation + Panel History (Sidekick-style)
  // ═════════════════════════════════════════════════════════════════════
  // Navigation — direkte Click-Handler + Panel History
  // ═════════════════════════════════════════════════════════════════════
  let _panelHistory = [];

  function initNavSidebar() {
    // Direkte Handler für jeden Nav-Button — kein switchPanel-Umweg
    const routeMap = {
      'chat': null,
      'tasks': openSessionPanel,
      'agents': null,
      'workspaces': null,
      'kanban': openKanban,
      'memory': openMemoryPanel,
      'skills': openSkillsPanel,
      'logs': openLogsPanel,
      'settings': openSettings,
    };

    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const route = btn.dataset.route;
        if (!route) return;

        // Previous route merken für Back-History
        const prevRoute = window.__currentRoute;

        // Alle Panels schließen
        closeSessionPanel(); closeKanban(); closeCronPanel();
        closeWorkerPanel(); closeSkillsPanel(); closeMemoryPanel(); closeLogsPanel();

        // Panel öffnen
        const handler = routeMap[route];
        if (handler) {
          handler();
          window.__currentRoute = route;
          // History: vorherige Route pushen (damit Back >1 Eintrag hat)
          if (prevRoute && prevRoute !== route) _panelHistory.push(prevRoute);
        }

        // Nav-aktiv-update
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        updateBackButton();
      });
    });

    // Back-Button in Toolbar
    const toolbar = document.getElementById('contentToolbar');
    if (toolbar) {
      const backBtn = document.createElement('button');
      backBtn.className = 'nav-btn';
      backBtn.id = 'navPanelBack';
      backBtn.title = 'Back';
      backBtn.textContent = '◀';
      backBtn.style.display = 'none';
      backBtn.addEventListener('click', () => {
        if (_panelHistory.length > 1) {
          _panelHistory.pop(); // current
          const prev = _panelHistory[_panelHistory.length - 1]; // peek
          const handler = routeMap[prev];
          if (handler) handler();
          window.__currentRoute = prev;
          document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
          const activeBtn = document.querySelector(`.nav-item[data-route="${prev}"]`);
          if (activeBtn) activeBtn.classList.add('active');
          updateBackButton();
        }
      });
      toolbar.querySelector('.nav-buttons')?.prepend(backBtn);
    }
  }

  function updateBackButton() {
    const backBtn = document.getElementById('navPanelBack');
    if (!backBtn) return;
    const anyOpen = ['kanbanPanel','sessionPanel','settingsOverlay','cronPanel','workerPanel','skillsPanel','memoryPanel','logsPanel']
      .some(id => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); });
    backBtn.style.display = anyOpen ? 'flex' : 'none';
  }

  // SwitchPanel für externe Aufrufe (main.js / cron / worker buttons)
  window.switchPanel = function(route) {
    closeSessionPanel(); closeKanban(); closeCronPanel();
    closeWorkerPanel(); closeSkillsPanel(); closeMemoryPanel(); closeLogsPanel();
    if (typeof closeSettings === 'function') closeSettings();
    const routeMap = {
      'kanban': openKanban, 'tasks': openSessionPanel, 'sessions': openSessionPanel,
      'settings': openSettings, 'cron': openCronPanel, 'workers': openWorkerPanel,
      'queue': openWorkerPanel, 'skills': openSkillsPanel, 'memory': openMemoryPanel,
      'logs': openLogsPanel,
    };
    const handler = routeMap[route];
    if (handler) handler();
    window.__currentRoute = route;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-item[data-route="${route}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    updateBackButton();
  };

  // navigateTo für History
  window.navigateTo = function(route) {
    if (!route || route === (window.__currentRoute || '')) return;
    _panelHistory.push(window.__currentRoute || route);
    window.switchPanel(route);
  };

  // Init on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', initNavSidebar);

  // ═════════════════════════════════════════════════════════════════════
  // Event Bindings
  // ═════════════════════════════════════════════════════════════════════
  function bindEvents() {
    // Workspace
    $('wsAddBtn').addEventListener('click', async () => {
      const name = prompt('Workspace name:', 'New Workspace');
      if (!name) return;
      try {
        const ws = await api.workspaces.create({ name });
        if (ws && ws.error) { console.error('[browser] Workspace create error:', ws.error); return; }
        if (!ws || !ws.id) { console.error('[browser] Workspace create returned:', ws); return; }
        await loadWorkspaces();
        await switchWorkspace(ws.id);
      } catch (err) {
        console.error('[browser] Failed to create workspace:', err);
      }
    });
    wsList.addEventListener('click', (e) => {
      const item = e.target.closest('.ws-item');
      if (item) switchWorkspace(item.dataset.id);
    });

    // Workspace context menu
    wsList.addEventListener('contextmenu', (e) => {
      const item = e.target.closest('.ws-item');
      if (item) showWorkspaceContextMenu(e, item.dataset.id);
    });

    // Tabs
    $('newTabBtn').addEventListener('click', () => newTab());
    $('navBack').addEventListener('click', () => { if (state.activeTabId) api.tabs.goBack(state.activeTabId); });
    $('navForward').addEventListener('click', () => { if (state.activeTabId) api.tabs.goForward(state.activeTabId); });
    $('navReload').addEventListener('click', () => { if (state.activeTabId) api.tabs.reload(state.activeTabId); });

    // URL bar
    urlInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        let url = urlInput.value.trim();
        if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url;
        }
        if (url) {
          if (state.activeTabId) {
            await api.tabs.navigate(state.activeTabId, url);
          } else {
            await newTab(url);
          }
        }
      }
    });

    // Command Palette
    $('paletteBtn').addEventListener('click', openPalette);
    paletteInput.addEventListener('input', (e) => searchPalette(e.target.value));
    paletteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePalette();
      else if (e.key === 'ArrowDown') { e.preventDefault(); state.paletteSelected = Math.min(state.paletteSelected + 1, state.paletteResults.length - 1); renderPaletteResults(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); state.paletteSelected = Math.max(state.paletteSelected - 1, 0); renderPaletteResults(); }
      else if (e.key === 'Enter') { e.preventDefault(); executePaletteItem(state.paletteSelected); }
    });
    paletteOverlay.addEventListener('click', (e) => { if (e.target === paletteOverlay) closePalette(); });

    // Focus
    $('focusBtn').addEventListener('click', () => {
      if (state.focusStatus.active) stopFocus();
      else startFocus();
    });
    $('focusStopBtn').addEventListener('click', stopFocus);

    // Compact
    $('compactBtn').addEventListener('click', toggleCompact);

    // Session save
    $('saveSessionBtn').addEventListener('click', saveSession);

    // Sleep all
    $('sleepAllBtn').addEventListener('click', sleepAllInactive);

    // Notifications
    $('notifBtn').addEventListener('click', toggleNotifPanel);
    $('notifClearAll').addEventListener('click', async () => {
      await api.notifications.clear();
      state.notifs = [];
      updateNotifUI();
    });

    // Settings
    $('settingsBtn').addEventListener('click', openSettings);

    // Welcome screen buttons
    document.getElementById('welcomeAddAppBtn').addEventListener('click', openAddAppDialog);
    document.getElementById('welcomeSessionBtn').addEventListener('click', () => {
      console.log('[browser] Session panel — coming soon');
    });

    // Search filter apps
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.app-item').forEach(el => {
        const name = el.querySelector('.app-item-name')?.textContent?.toLowerCase() || '';
        el.style.display = name.includes(q) ? 'flex' : 'none';
      });
    });

    // Focus timer tick
    if (api.on) {
      api.on('focus:tick', (status) => {
        state.focusStatus = status;
        updateFocusTimer();
      });
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // Global command handlers (invoked from main.js shortcuts)
  // ═════════════════════════════════════════════════════════════════════
  window.__openPalette = openPalette;
  window.__toggleCompact = toggleCompact;
  window.__newTab = () => newTab();
  window.__closeCurrentTab = () => { if (state.activeTabId) closeTab(state.activeTabId); };
  window.__sleepAll = sleepAllInactive;
  window.__saveSession = saveSession;
  window.__muteAll = muteAll;
  window.__switchWorkspace = async (index) => {
    if (state.workspaces[index]) await switchWorkspace(state.workspaces[index].id);
  };
  window.__prevWorkspace = async () => {
    const idx = state.workspaces.findIndex(w => w.id === state.currentWorkspaceId);
    if (idx > 0) await switchWorkspace(state.workspaces[idx - 1].id);
  };
  window.__nextWorkspace = async () => {
    const idx = state.workspaces.findIndex(w => w.id === state.currentWorkspaceId);
    if (idx < state.workspaces.length - 1) await switchWorkspace(state.workspaces[idx + 1].id);
  };

  // ═════════════════════════════════════════════════════════════════════
  // Panel switching — SINGLE dispatch for ALL routes
  // ═════════════════════════════════════════════════════════════════════
  window.switchPanel = function(route) {
    // Close ALL panels first
    closeKanban(); closeSessionPanel(); closeCronPanel(); closeWorkerPanel();
    closeSkillsPanel(); closeMemoryPanel(); closeLogsPanel();
    // Close settings overlay (if open)
    if (typeof closeSettings === 'function') closeSettings();

    // Handle route
    switch (route) {
      case 'kanban': openKanban(); break;
      case 'tasks': case 'sessions': openSessionPanel(); break;
      case 'settings': openSettings(); break;
      case 'cron': openCronPanel(); break;
      case 'workers': case 'queue': openWorkerPanel(); break;
      case 'skills': openSkillsPanel(); break;
      case 'memory': openMemoryPanel(); break;
      case 'logs': openLogsPanel(); break;
      case 'chat': case 'agents': case 'workspaces':
      default:
        // WebUI panels use the legacy hermes API
        break;
    }
    window.__currentRoute = route;

    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-item[data-route="${route}"]`);
    if (activeNav) activeNav.classList.add('active');

    // Update back button
    updateBackButton();
  };

  // Expose navigateTo for toolbar buttons
  window.navigateTo = function(route) {
    if (!route || route === (window.__currentRoute || '')) return;
    if (window.__currentRoute && window.__currentRoute !== route) {
      if (!_panelHistory) _panelHistory = [];
      _panelHistory.push(window.__currentRoute);
    }
    window.__currentRoute = route;
    window.switchPanel(route);
  };

  // ═════════════════════════════════════════════════════════════════════
  // Keyboard shortcuts (renderer-side)
  // ═════════════════════════════════════════════════════════════════════
  document.addEventListener('keydown', (e) => {
    // Ctrl+W: Close tab
    if ((e.ctrlKey || e.metaKey) && e.key === 'w' && !state.paletteOpen) {
      e.preventDefault();
      window.__closeCurrentTab();
    }
  });

  // ═════════════════════════════════════════════════════════════════════
  // Add Account Dialog (Wavebox Multi-Account) + Account Context Menus
  // ═════════════════════════════════════════════════════════════════════
  const addAccountOverlay = $('addAccountOverlay');
  let _selectedPreset = null;
  let _addAccountAppId = null; // pre-selected app ID

  // Open add account dialog — optionally for a specific app
  async function openAddAccountDialog(appId) {
    addAccountOverlay.classList.remove('hidden');
    _addAccountAppId = appId || null;
    _selectedPreset = null;

    // Reset form
    $('addAcctName').value = '';
    $('addAcctUrl').value = '';
    $('addAcctAgentControl').checked = false;
    $('addAcctNotifications').checked = true;

    // Populate workspace selector
    $('addAcctWorkspace').innerHTML = state.workspaces.map(ws =>
      `<option value="${ws.id}" ${ws.id === state.currentWorkspaceId ? 'selected' : ''}>
        ${ws.icon || '💼'} ${ws.name}
      </option>`
    ).join('');

    // Load presets
    await renderPresetGrid();

    // Color picker: reset
    document.querySelectorAll('#colorPresets span').forEach(el => el.classList.remove('selected'));
    document.querySelector('#colorPresets span:first-child').classList.add('selected');

    // If appId provided, auto-select that app's definition
    if (appId) {
      const app = state.apps.find(a => a.id === appId);
      if (app) {
        const def = _appDefs.find(d => d.id === app.appDefinitionId);
        if (def) {
          selectPreset(def);
        }
        _selectedPreset = { id: app.appDefinitionId, name: app.name, icon: app.icon, baseUrl: app.baseUrl };
      }
    }
  }

  function closeAddAccountDialog() {
    addAccountOverlay.classList.add('hidden');
  }

  // Render preset grid
  async function renderPresetGrid() {
    const grid = document.getElementById('presetGrid');
    let presets = [];
    try {
      presets = await api.appDefinitions.presets() || [];
    } catch (_) { presets = []; }

    // Append already-added definitions
    try {
      const defs = await api.appDefinitions.list() || [];
      for (const d of defs) {
        if (!presets.find(p => p.name === d.name)) {
          presets.push({ id: d.id, name: d.name, baseUrl: d.baseUrl, icon: d.icon, category: d.category, defaultColor: d.defaultColor, isPreset: false });
        }
      }
    } catch (_) {}

    // Group by category
    const categories = {};
    for (const p of presets) {
      const cat = p.category || 'other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(p);
    }

    const catLabels = {
      communication: 'Communication', content: 'Content', development: 'Dev Tools',
      ai: 'AI', productivity: 'Productivity', social: 'Social', media: 'Media', other: 'Other',
    };

    let html = '';
    for (const [cat, items] of Object.entries(categories)) {
      const label = catLabels[cat] || cat;
      html += `<div style="font-size:9px;color:var(--text-muted);padding:4px 2px;grid-column:1/-1;text-transform:uppercase;letter-spacing:0.5px">${label}</div>`;
      for (const preset of items) {
        html += `
          <div class="preset-item" data-name="${preset.name}" data-icon="${preset.icon || '🌐'}"
               data-url="${preset.baseUrl || ''}" data-color="${preset.defaultColor || '#6366f1'}"
               data-defid="${preset.id || ''}">
            <span class="preset-icon">${preset.icon || '🌐'}</span>
            <span class="preset-name">${preset.name}</span>
          </div>`;
      }
    }
    grid.innerHTML = html;

    // Bind preset selection
    grid.querySelectorAll('.preset-item').forEach(el => {
      el.addEventListener('click', () => {
        grid.querySelectorAll('.preset-item').forEach(i => i.classList.remove('selected'));
        el.classList.add('selected');
        selectPreset({
          id: el.dataset.defid,
          name: el.dataset.name,
          icon: el.dataset.icon,
          baseUrl: el.dataset.url,
          defaultColor: el.dataset.color,
        });
      });
    });
  }

  function selectPreset(preset) {
    _selectedPreset = {
      id: preset.id || null,
      name: preset.name,
      icon: preset.icon || '🌐',
      baseUrl: preset.baseUrl || '',
      defaultColor: preset.defaultColor || '#6366f1',
    };
    // Auto-fill URL if empty
    if (!document.getElementById('addAcctUrl').value) {
      document.getElementById('addAcctUrl').value = _selectedPreset.baseUrl;
    }
    // Auto-set color if not selected
    const colorSwatch = document.querySelector(`#colorPresets span[data-color="${_selectedPreset.defaultColor}"]`);
    if (colorSwatch) {
      document.querySelectorAll('#colorPresets span').forEach(el => el.classList.remove('selected'));
      colorSwatch.classList.add('selected');
    }
    document.getElementById('addAcctDialogTitle').textContent = `Add ${preset.name} Account`;
  }

  // Color picker
  document.getElementById('colorPresets').addEventListener('click', (e) => {
    const span = e.target.closest('span[data-color]');
    if (!span) return;
    document.querySelectorAll('#colorPresets span').forEach(el => el.classList.remove('selected'));
    span.classList.add('selected');
  });

  // Submit add account
  async function submitAddAccount() {
    const name = document.getElementById('addAcctName').value.trim();
    if (!name && !_selectedPreset) {
      alert('Please select an app and enter an account name.');
      return;
    }

    const preset = _selectedPreset || { name: 'Custom', icon: '🌐', baseUrl: '', defaultColor: '#6366f1' };
    const wsId = document.getElementById('addAcctWorkspace').value || state.currentWorkspaceId;
    const color = document.querySelector('#colorPresets .selected')?.dataset.color || preset.defaultColor;

    // Find or create app shortcut for this workspace
    let app = state.apps.find(a =>
      a.appDefinitionId === preset.id && a.workspaceId === wsId
    );
    if (!app) {
      // Create new app shortcut
      app = await api.apps.create({
        name: preset.name,
        icon: preset.icon,
        baseUrl: preset.baseUrl,
        appDefinitionId: preset.id,
        workspaceId: wsId,
        order: state.apps.length,
      });
    }

    // Create the account
    try {
      const submitBtn = document.getElementById('addAccountSubmitBtn');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Adding...';

      await api.appAccounts.create({
        appId: app.id,
        appDefinitionId: preset.id,
        displayName: name || preset.name,
        baseUrl: document.getElementById('addAcctUrl').value || preset.baseUrl,
        color: color,
        iconOverride: preset.icon,
        workspaceId: wsId,
        muted: false,
        notificationsEnabled: document.getElementById('addAcctNotifications').checked,
        assignedAgentId: null,
        agentControlEnabled: document.getElementById('addAcctAgentControl').checked,
      });

      await loadApps(wsId);
      closeAddAccountDialog();
    } catch (err) {
      console.error('[browser] Failed to add account:', err);
      document.getElementById('addAccountSubmitBtn').textContent = 'Failed — Retry';
      document.getElementById('addAccountSubmitBtn').disabled = false;
    }
  }

  // Bind dialog events
  document.getElementById('addAppBtn').addEventListener('click', () => openAddAccountDialog());
  document.getElementById('addAccountCloseBtn').addEventListener('click', closeAddAccountDialog);
  document.getElementById('addAccountCancelBtn').addEventListener('click', closeAddAccountDialog);
  document.getElementById('addAccountSubmitBtn').addEventListener('click', submitAddAccount);
  addAccountOverlay.addEventListener('click', (e) => { if (e.target === addAccountOverlay) closeAddAccountDialog(); });

  // Welcome screen buttons - update refs
  document.querySelector('#welcomeAddAppBtn')?.addEventListener('click', () => openAddAccountDialog());

  // ═════════════════════════════════════════════════════════════════════
  // Account & App Group Context Menus
  // ═════════════════════════════════════════════════════════════════════

  function showAccountContextMenu(e, acctId) {
    e.preventDefault();
    const acct = _appAccounts.find(a => a.id === acctId);
    if (!acct) return;
    const app = state.apps.find(a => a.id === acct.appId);
    const agentStatus = acct.agentStatus || 'idle';
    const hasAgent = !!acct.assignedAgentId;

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.innerHTML = `
      <div class="context-item" data-action="open">Open</div>
      <div class="context-item" data-action="split">Open in Split View</div>
      <div class="context-separator"></div>
      <div class="context-item" data-action="rename">✏️ Rename</div>
      <div class="context-item" data-action="color">🎨 Change Color</div>
      <div class="context-item" data-action="duplicate">📋 Duplicate Account</div>
      <div class="context-separator"></div>
      <div class="context-item" data-action="mute">${acct.muted ? '🔊 Unmute' : '🔇 Mute'}</div>
      <div class="context-item" data-action="sleep">💤 Sleep</div>
      <div class="context-item" data-action="reload">⟳ Reload</div>
      <div class="context-separator"></div>
      <div class="context-item" data-action="clear-cache">🧹 Clear Cache</div>
      <div class="context-item" data-action="clear-cookies">🍪 Clear Cookies</div>
      <div class="context-separator"></div>
      ${hasAgent
        ? `<div class="context-item" data-action="release-agent">🤖 Release Agent</div>
           <div class="context-item" data-action="agent-read">📖 Agent: Read Page</div>`
        : `<div class="context-item" data-action="assign-agent">🤖 Assign Agent</div>`
      }
      <div class="context-item" data-action="export">📤 Export Config</div>
      <div class="context-separator"></div>
      <div class="context-item" data-action="move-ws">📂 Move to Workspace</div>
      <div class="context-separator"></div>
      <div class="context-item" data-action="remove" style="color:var(--red)">🗑️ Remove</div>
    `;
    document.body.appendChild(menu);

    menu.querySelectorAll('.context-item').forEach(el => {
      el.addEventListener('click', async () => {
        const action = el.dataset.action;
        switch (action) {
          case 'open': openAppAccount(acctId); break;
          case 'split': {
            const tab = state.tabs[0];
            if (tab) await api.splitView.create(state.currentWorkspaceId, '50/50', [tab.id, acctId]);
            break;
          }
          case 'rename': {
            const name = prompt('Account name:', acct.displayName);
            if (name && name !== acct.displayName) await api.appAccounts.update(acctId, { displayName: name });
            break;
          }
          case 'color': {
            const color = prompt('Color (hex):', acct.color);
            if (color) await api.appAccounts.update(acctId, { color });
            break;
          }
          case 'duplicate': await api.appAccounts.duplicate(acctId); break;
          case 'mute': await api.appAccounts.setMuted(acctId, !acct.muted); break;
          case 'sleep': /* handled by resourceSaver */ break;
          case 'reload': {
            const tabs = state.tabs.filter(t => t.appShortcutId === acct.appId);
            for (const t of tabs) await api.tabs.reload(t.id);
            break;
          }
          case 'clear-cache': {
            await api.appAccounts.clearCache(acctId);
            break;
          }
          case 'clear-cookies': {
            if (confirm('Clear cookies for "' + acct.displayName + '"? You will be logged out.')) {
              await api.appAccounts.clearCookies(acctId);
            }
            break;
          }
          case 'assign-agent': {
            const availableAgents = await api.agents.list() || [];
            if (availableAgents.length === 0) { alert('No agents registered. Create one in the Agents panel.'); break; }
            const agentNames = availableAgents.map((a, i) => `${i + 1}. ${a.name}`);
            const choice = prompt('Choose agent:\n' + agentNames.join('\n') + '\n\nEnter number:');
            const idx = parseInt(choice) - 1;
            if (idx >= 0 && idx < availableAgents.length) {
              await api.appAccounts.setAgent(acctId, availableAgents[idx].id);
            }
            break;
          }
          case 'release-agent': await api.appAccounts.releaseAgent(acctId); break;
          case 'agent-read': {
            const tabs = state.tabs.filter(t => t.appShortcutId === acct.appId);
            if (tabs.length > 0) {
              const result = await api.browserControl.getContent(tabs[0].id);
              await api.appAccounts.recordAction(acctId, 'read_page', result?.content?.slice(0, 500) || '(no content)', 'reading');
            }
            break;
          }
          case 'export': {
            const data = JSON.stringify(acct, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `account-${acct.displayName.replace(/[^a-z0-9]/gi, '-')}.json`;
            a.click();
            URL.revokeObjectURL(a.href);
            break;
          }
          case 'move-ws': {
            const targets = state.workspaces.filter(w => w.id !== acct.workspaceId);
            if (targets.length === 0) { alert('No other workspaces.'); break; }
            const names = targets.map((w, i) => `${i + 1}. ${w.icon || '💼'} ${w.name}`);
            const choice = prompt('Move to workspace:\n' + names.join('\n') + '\n\nEnter number:');
            const idx = parseInt(choice) - 1;
            if (idx >= 0 && idx < targets.length) {
              await api.appAccounts.moveToWorkspace(acctId, targets[idx].id);
            }
            break;
          }
          case 'remove': {
            if (confirm('Remove account "' + acct.displayName + '"? This will clear its session data.')) {
              await api.appAccounts.remove(acctId);
            }
            break;
          }
        }
        await loadApps(state.currentWorkspaceId);
        menu.remove();
      });
    });
    document.addEventListener('click', () => menu.remove(), { once: true });
  }

  function showAppGroupContextMenu(e, appId) {
    e.preventDefault();
    const app = state.apps.find(a => a.id === appId);
    if (!app) return;

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
    menu.innerHTML = `
      <div class="context-item" data-action="add-account">➕ Add Account</div>
      <div class="context-separator"></div>
      <div class="context-item" data-action="rename">✏️ Rename App Group</div>
      <div class="context-item" data-action="collapse">${app.collapsed ? '▶ Expand' : '▼ Collapse'}</div>
      <div class="context-separator"></div>
      <div class="context-item" data-action="remove" style="color:var(--red)">🗑️ Remove App Group</div>
    `;
    document.body.appendChild(menu);

    menu.querySelectorAll('.context-item').forEach(el => {
      el.addEventListener('click', async () => {
        const action = el.dataset.action;
        switch (action) {
          case 'add-account': openAddAccountDialog(appId); break;
          case 'rename': {
            const name = prompt('App group name:', app.name);
            if (name && name !== app.name) await api.apps.update(appId, { name });
            break;
          }
          case 'collapse': toggleAppGroup(appId); break;
          case 'remove': {
            if (confirm('Remove app group "' + app.name + '" and all its accounts?')) {
              await api.apps.remove(appId);
            }
            break;
          }
        }
        await loadApps(state.currentWorkspaceId);
        menu.remove();
      });
    });
    document.addEventListener('click', () => menu.remove(), { once: true });
  }

  // ═════════════════════════════════════════════════════════════════════
  // Start
  // ═════════════════════════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', init);
})();
