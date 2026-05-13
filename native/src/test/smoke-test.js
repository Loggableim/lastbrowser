/**
 * LastBrowser v2 — Full Smoke Test
 *
 * Tests ALL managers and the store in isolation.
 * No Electron needed for CRUD tests.
 *
 * Usage: node src/test/smoke-test.js
 */
const path = require('path');
const os = require('os');

// Override homedir for testing
const originalHomedir = os.homedir;
os.homedir = () => path.join(__dirname, '..', '..', '.test-home');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  } else {
    console.log(`  ✓ ${message}`);
    passed++;
  }
}

async function run() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  LastBrowser v2 — Smoke Test Suite');
  console.log('══════════════════════════════════════════════════════════\n');

  const store = require('../main/database/store');

  // ── Clear any leftover data from previous runs ─────────────────────
  const collections = ['workspaces', 'apps', 'accounts', 'tabs', 'closed_tabs', 'tab_sets',
    'split_views', 'focus_sessions', 'distraction_rules', 'tasks', 'kanban_boards',
    'kanban_columns', 'kanban_cards', 'agents', 'worker_jobs', 'cron_jobs', 'pipelines',
    'git_repos', 'notifications', 'settings'];
  for (const col of collections) {
    store.writeCollection(col, []);
  }

  // ── 1. Store Basics ─────────────────────────────────────────────────
  console.log('1. Store Basics');
  assert(typeof store.readCollection === 'function', 'readCollection exists');
  assert(typeof store.insert === 'function', 'insert exists');
  assert(typeof store.update === 'function', 'update exists');
  assert(typeof store.remove === 'function', 'remove exists');
  assert(typeof store.exportAll === 'function', 'exportAll exists');
  assert(typeof store.createBackup === 'function', 'createBackup exists');

  // ── 2. Workspace Manager ────────────────────────────────────────────
  console.log('\n2. Workspace Manager');
  const ws = require('../main/managers/workspaceManager');
  let all = ws.getAll();
  assert(all.length === 0, 'No workspaces initially');
  const w1 = ws.create({ name: 'Test WS', icon: '🧪', color: '#6366f1' });
  assert(w1.id && w1.name === 'Test WS', `Created workspace "${w1.name}"`);
  assert(w1.sessionPartition.startsWith('persist:workspace_'), 'Has session partition');
  const w2 = ws.create({ name: 'Work', icon: '💼', color: '#22c55e' });
  all = ws.getAll();
  assert(all.length === 2, '2 workspaces total');
  const updated = ws.update(w1.id, { name: 'Test WS Updated' });
  assert(updated.name === 'Test WS Updated', 'Workspace updated');
  ws.setPaused(w2.id, true);
  assert(ws.getPaused(w2.id) === true, 'Workspace paused');
  const stats = ws.getStats();
  assert(stats.length === 2, 'Stats work');
  const exported = ws.exportWorkspace(w1.id);
  assert(exported !== null && exported.workspace.name === 'Test WS Updated', 'Export works');
  const imported = ws.importWorkspace(exported);
  assert(imported !== null && imported.name === 'Test WS Updated' && imported.id !== w1.id, 'Import works');

  // ── 3. App Manager ──────────────────────────────────────────────────
  console.log('\n3. App Manager');
  const appMgr = require('../main/managers/appManager');
  const a1 = appMgr.create({ name: 'Gmail', url: 'https://mail.google.com', workspaceId: w1.id });
  assert(a1.id && a1.name === 'Gmail', 'App created');
  const a2 = appMgr.create({ name: 'Discord', url: 'https://discord.com', workspaceId: w1.id });
  let apps = appMgr.getByWorkspace(w1.id);
  assert(apps.length === 2, '2 apps in workspace');
  appMgr.setMuted(a1.id, true);
  assert(appMgr.getById(a1.id).isMuted === true, 'App muted');
  appMgr.reorder([a2.id, a1.id]);
  apps = appMgr.getByWorkspace(w1.id);
  assert(apps[0].id === a2.id, 'Reorder works');

  // ── 4. Account Manager ──────────────────────────────────────────────
  console.log('\n4. Account Manager');
  const acctMgr = require('../main/managers/accountManager');
  const acct1 = acctMgr.create({ appShortcutId: a1.id, label: 'Personal', isActive: true });
  assert(acct1.id && acct1.label === 'Personal', 'Account created');
  const acct2 = acctMgr.create({ appShortcutId: a1.id, label: 'Work' });
  let accts = acctMgr.getByApp(a1.id);
  assert(accts.length === 2, '2 accounts for app');
  acctMgr.setActive(acct2.id);
  assert(acctMgr.getById(acct2.id).isActive === true, 'Account activated');

  // ── 5. Tab Manager ──────────────────────────────────────────────────
  console.log('\n5. Tab Manager');
  const tabMgr = require('../main/managers/tabManager');
  const t1 = tabMgr.create({ title: 'Google', url: 'https://google.com', workspaceId: w1.id });
  const t2 = tabMgr.create({ title: 'GitHub', url: 'https://github.com', workspaceId: w1.id });
  assert(t1.id && t1.title === 'Google', 'Tab created');
  let tabs = tabMgr.getAll(w1.id);
  assert(tabs.length === 2, '2 tabs in workspace');
  tabMgr.setSuspended(t2.id, true);
  assert(tabMgr.getById(t2.id).isSuspended === true, 'Tab suspended');
  const closed = tabMgr.remove(t1.id);
  assert(closed !== null, 'Tab removed and saved to closed_tabs');
  tabs = tabMgr.getAll(w1.id);
  assert(tabs.length === 1, '1 tab after removal');
  const restored = tabMgr.restoreClosed(w1.id);
  assert(restored !== null && restored.title === 'Google', 'Closed tab restored');
  tabs = tabMgr.getAll(w1.id);
  assert(tabs.length === 2, '2 tabs after restore');
  tabMgr.pin(t2.id);
  assert(tabMgr.getById(t2.id).isPinned === true, 'Tab pinned');
  tabMgr.setMuted(t2.id, true);
  assert(tabMgr.getById(t2.id).isMuted === true, 'Tab muted');
  const dup = tabMgr.duplicate(t2.id);
  assert(dup !== null && !dup.isPinned, 'Tab duplicated');
  tabMgr.suspendAllInactive([t2.id]);
  assert(tabMgr.getAll(w1.id).filter(t => t.isSuspended).length >= 1, 'Inactive tabs suspended');

  // ── 6. Session Manager ──────────────────────────────────────────────
  console.log('\n6. Session Manager');
  const sessMgr = require('../main/managers/sessionManager');
  const s1 = sessMgr.create({ name: 'Work Session', workspaceId: w1.id, tabIds: [t2.id] });
  assert(s1.id && s1.name === 'Work Session', 'Session created');
  const sessions = sessMgr.getByWorkspace(w1.id);
  assert(sessions.length === 1, '1 session in workspace');
  const exportedSess = sessMgr.exportSet(s1.id);
  assert(exportedSess !== null, 'Session exported');

  // ── 7. Split View Manager ──────────────────────────────────────────
  console.log('\n7. Split View Manager');
  const svMgr = require('../main/managers/splitViewManager');
  const sv = svMgr.create(w1.id, '50/50', [t2, dup]);
  assert(sv.id && sv.layout === '50/50', 'Split view created');
  assert(sv.panels.length === 2, '2 panels in split');
  const found = svMgr.getByWorkspace(w1.id);
  assert(found !== null, 'Split view found by workspace');
  svMgr.setLayout(sv.id, '70/30');
  assert(svMgr.getById(sv.id).layout === '70/30', 'Layout changed');

  // ── 8. Focus Manager ────────────────────────────────────────────────
  console.log('\n8. Focus Manager');
  const focusMgr = require('../main/managers/focusManager');
  const session = focusMgr.start('pomodoro', w1.id);
  assert(session !== null && session.status === 'running', 'Focus session started');
  assert(session.notificationsMuted === true, 'Notifications muted in focus');
  let status = focusMgr.getStatus();
  assert(status.active === true && status.type === 'pomodoro', 'Focus status correct');
  focusMgr.pause();
  status = focusMgr.getStatus();
  assert(status.status === 'paused', 'Focus paused');
  focusMgr.resume();
  focusMgr.stop();
  status = focusMgr.getStatus();
  assert(status.active === false, 'Focus stopped');

  // Distraction rule
  const rule = focusMgr.createRule({ pattern: '*youtube.com*', action: 'block', workspaceId: w1.id });
  assert(rule.id && rule.pattern === '*youtube.com*', 'Distraction rule created');
  // Need active session for checkUrl
  focusMgr.start('pomodoro', w1.id);
  const check = focusMgr.checkUrl('https://www.youtube.com/watch?v=test', w1.id);
  assert(check.blocked === true, 'YouTube blocked in focus mode');
  focusMgr.stop();

  // ── 9. Task Manager ──────────────────────────────────────────────────
  console.log('\n9. Task Manager');
  const taskMgr = require('../main/managers/taskManager');
  const task1 = taskMgr.create({ title: 'Test task', workspaceId: w1.id, priority: 'high' });
  assert(task1.id && task1.title === 'Test task', 'Task created');
  const tasks = taskMgr.getByWorkspace(w1.id);
  assert(tasks.length === 1, '1 task in workspace');
  taskMgr.setCompleted(task1.id, true);
  assert(taskMgr.getById(task1.id).isCompleted === true, 'Task completed');
  taskMgr.pinToTab(task1.id, t2.id);
  assert(taskMgr.getById(task1.id).pinnedToTabId === t2.id, 'Task pinned to tab');

  // ── 10. Resource Saver ──────────────────────────────────────────────
  console.log('\n10. Resource Saver');
  const saver = require('../main/managers/resourceSaver');
  let config = saver.getConfig();
  assert(config.enabled === true, 'Resource saver enabled by default');
  saver.addException('*music.youtube.com*');
  config = saver.getConfig();
  assert(config.exceptions.length === 1, 'Exception added');
  const memStats = saver.getMemoryStats();
  assert(memStats.totalTabs >= 0, 'Memory stats available');

  // ── 11. Notification Manager ────────────────────────────────────────
  console.log('\n11. Notification Manager');
  const notifMgr = require('../main/managers/notificationManager');
  const n1 = notifMgr.add({ title: 'Test Notification', body: 'This is a test', appId: a1.id, appName: 'Gmail' });
  assert(n1.id && n1.title === 'Test Notification', 'Notification created');
  assert(notifMgr.getUnreadCount() === 1, '1 unread notification');
  notifMgr.markRead(n1.id);
  assert(notifMgr.getUnreadCount() === 0, 'Notification marked read');
  notifMgr.muteApp(a1.id, true);
  assert(notifMgr.isMuted(a1.id, w1.id) === true, 'App muted');

  // ── 12. Privacy Manager ─────────────────────────────────────────────
  console.log('\n12. Privacy Manager');
  const priv = require('../main/managers/privacyManager');
  let pConfig = priv.getConfig();
  assert(pConfig.adblockEnabled === false, 'Adblock disabled by default');
  priv.toggleAdblock(true);
  pConfig = priv.getConfig();
  assert(pConfig.adblockEnabled === true, 'Adblock enabled');
  const pStats = priv.getStats();
  assert(typeof pStats === 'object', 'Privacy stats available');

  // ── 13. Command Palette ─────────────────────────────────────────────
  console.log('\n13. Command Palette');
  const palette = require('../main/managers/commandPalette');
  const commands = palette.getCommands();
  assert(commands.length > 0, 'Commands available');
  const searchResults = palette.search('focus');
  assert(searchResults.length > 0, 'Search returns results for "focus"');
  const allResults = palette.search('');
  assert(allResults.length > 0, 'Empty search returns commands');

  // ── 14. Kanban Manager ──────────────────────────────────────────────
  console.log('\n14. Kanban Manager');
  const kanban = require('../main/managers/kanbanManager');
  const board = kanban.createBoard({ title: 'Test Board', workspaceId: w1.id });
  assert(board.id && board.title === 'Test Board', 'Board created');
  assert(board.columnOrder.length === 9, '9 default columns');
  const columns = kanban.getColumns(board.id);
  assert(columns.length === 9, '9 columns found');
  const card = kanban.createCard({ boardId: board.id, columnId: columns[0].id, title: 'Test Card', priority: 'high' });
  assert(card.id && card.title === 'Test Card', 'Card created');
  assert(card.priority === 'high', 'Card priority set');
  const comment = kanban.addComment(card.id, 'This is a comment', 'user');
  assert(comment !== null && comment.text === 'This is a comment', 'Comment added');
  kanban.moveCard(card.id, columns[2].id);
  const movedCard = kanban.getCard(card.id);
  assert(movedCard.columnId === columns[2].id, 'Card moved to planned column');

  // ── 15. Worker Manager ──────────────────────────────────────────────
  console.log('\n15. Worker Manager');
  const worker = require('../main/managers/workerManager');
  const job = worker.submit({ type: 'test', priority: 'high', agentId: 'test-agent' });
  assert(job.id && job.status === 'queued', 'Job submitted');
  worker.start(job.id);
  assert(worker.getById(job.id).status === 'running', 'Job started');
  worker.complete(job.id, { result: 'success' });
  assert(worker.getById(job.id).status === 'completed', 'Job completed');
  const qStatus = worker.getQueueStatus();
  assert(qStatus.completed >= 1, 'Queue status accurate');

  // ── 16. Agent Manager ──────────────────────────────────────────────
  console.log('\n16. Agent Manager');
  const agentMgr = require('../main/managers/agentManager');
  const agent = agentMgr.create({ name: 'Test Coder', role: 'coder', model: 'deepseek-v4-flash' });
  assert(agent.id && agent.name === 'Test Coder', 'Agent created');
  agentMgr.recordTaskComplete(agent.id, 500, true);
  assert(agentMgr.getById(agent.id).totalTasksRun === 1, 'Task recorded');
  const dashboard = agentMgr.getDashboard();
  assert(dashboard.totalAgents >= 1, 'Dashboard shows agents');
  const models = agentMgr.getModelOptions();
  assert(models.length > 0, 'Model options available');

  // ── 17. Cron Manager ────────────────────────────────────────────────
  console.log('\n17. Cron Manager');
  const cron = require('../main/managers/cronManager');
  const cJob = cron.create({ name: 'Daily Backup', schedule: '0 3 * * *', taskType: 'backup' });
  assert(cJob.id && cJob.enabled === true, 'Cron job created');
  assert(cJob.nextRunAt !== null, 'Next run calculated');
  cron.toggle(cJob.id, false);
  assert(cron.getById(cJob.id).enabled === false, 'Cron job disabled');

  // ── 18. Pipeline Manager ───────────────────────────────────────────
  console.log('\n18. Pipeline Manager');
  const pipeline = require('../main/managers/pipelineManager');
  const p = pipeline.create({ name: 'Dev Pipeline' });
  assert(p.id && p.steps.length > 0, 'Pipeline created');
  pipeline.toggleStep(p.id, 'testing', false);
  const steps = pipeline.getEnabledSteps(p.id);
  assert(!steps.includes('testing'), 'Testing step disabled');

  // ── 19. Git Manager ─────────────────────────────────────────────────
  console.log('\n19. Git Manager (basic)');
  const git = require('../main/managers/gitManager');
  // Git tests require actual repos, just test the manager itself
  assert(typeof git.getAll === 'function', 'Git manager loaded');
  assert(typeof git.getBranches === 'function', 'Branch methods available');

  // ── 20. Compact Manager ─────────────────────────────────────────────
  console.log('\n20. Compact Manager');
  const compact = require('../main/managers/compactManager');
  assert(compact.isCompact() === false, 'Not compact initially');
  compact.toggle();
  assert(compact.isCompact() === true, 'Compact toggled on');
  compact.toggle();
  assert(compact.isCompact() === false, 'Compact toggled off');

  // ── 21. Export/Backup ─────────────────────────────────────────────
  console.log('\n21. Export/Backup');
  const exportedData = store.exportAll();
  assert(Object.keys(exportedData).length > 0, 'Export returns data');
  const backupPath = store.createBackup();
  assert(backupPath !== null, 'Backup created');
  const backups = store.listBackups();
  assert(backups.length >= 1, 'Backup listed');

  // ── Cleanup ─────────────────────────────────────────────────────────
  console.log('\n22. Cleanup');
  store.shutdown();
  const fs = require('fs');
  const testDir = path.join(__dirname, '..', '..', '.test-home', '.lastbrowser');
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
    console.log('  ✓ Test data cleaned up');
  }
  os.homedir = originalHomedir;

  // ── Results ─────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('══════════════════════════════════════════════════════════\n');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\n  ✗ CRASH:', err.message, err.stack);
  process.exit(1);
});
