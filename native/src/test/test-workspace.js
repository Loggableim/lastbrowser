/**
 * HermesBrowser — Workspace System Smoke Test
 *
 * Tests the JSON store and workspace manager in isolation
 * (no Electron needed for basic CRUD tests).
 *
 * Usage: node src/test/test-workspace.js
 */

const path = require('path');

// Override homedir for testing to avoid polluting real data
const os = require('os');
const originalHomedir = os.homedir;
os.homedir = () => path.join(__dirname, '..', '..', '.test-home');

// Clean test data
const store = require('../main/database/store');
const ws = require('../main/managers/workspaceManager');

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function run() {
  console.log('\n═══ HermesBrowser Workspace System Test ═══\n');

  // 1. Initial state: no workspaces
  console.log('1. Initial State');
  let all = ws.getAll();
  assert(all.length === 0, 'No workspaces on fresh start');

  // 2. Create workspace
  console.log('\n2. Create Workspace');
  const w1 = ws.create({ name: 'Arbeit', icon: '💼', color: '#6366f1' });
  assert(w1.id && w1.name === 'Arbeit', `Created workspace "${w1.name}" (${w1.id})`);
  assert(w1.sessionPartition.startsWith('persist:workspace_'), `Session partition: ${w1.sessionPartition}`);
  assert(w1.order === 0, 'Order = 0');

  const w2 = ws.create({ name: 'Streaming', icon: '🎮', color: '#ef4444' });
  assert(w2.order === 1, 'Second workspace order = 1');

  // 3. List workspaces
  console.log('\n3. List Workspaces');
  all = ws.getAll();
  assert(all.length === 2, `Total workspaces: ${all.length}`);

  // 4. Get by ID
  console.log('\n4. Get by ID');
  const found = ws.getById(w1.id);
  assert(found && found.name === 'Arbeit', `Found workspace "${found.name}"`);

  // 5. Update workspace
  console.log('\n5. Update Workspace');
  const updated = ws.update(w1.id, { color: '#22c55e', icon: '🏢' });
  assert(updated.color === '#22c55e', 'Color updated');
  assert(updated.icon === '🏢', 'Icon updated');
  assert(updated.updatedAt !== w1.updatedAt, 'updatedAt changed');

  // 6. Pause/Resume
  console.log('\n6. Pause/Resume');
  ws.setPaused(w2.id, true);
  assert(ws.getPaused(w2.id) === true, 'Streaming workspace paused');
  ws.setPaused(w2.id, false);
  assert(ws.getPaused(w2.id) === false, 'Streaming workspace resumed');

  // 7. Stats
  console.log('\n7. Stats');
  const stats = ws.getStats();
  assert(stats.length === 2, 'Stats for 2 workspaces');
  assert(stats[0].name === 'Arbeit', 'First workspace in stats');

  // 8. Export/Import
  console.log('\n8. Export/Import');
  const exported = ws.exportWorkspace(w1.id);
  assert(exported !== null, 'Export succeeded');
  assert(exported.workspace.name === 'Arbeit', 'Exported name correct');
  assert(exported.workspace.sessionPartition === undefined, 'Partition stripped from export');

  const imported = ws.importWorkspace(exported);
  assert(imported && imported.name === 'Arbeit', 'Imported workspace created');
  assert(imported.id !== w1.id, 'New ID on import');

  // 9. Reorder
  console.log('\n9. Reorder');
  const reordered = ws.reorder([w2.id, w1.id]);
  assert(reordered[0].id === w2.id, 'w2 moved to first position');

  // 10. Delete
  console.log('\n10. Delete');
  const removed = ws.remove(w1.id);
  assert(removed === true, 'Workspace removed');
  all = ws.getAll();
  assert(all.length === 2, '2 workspaces left (1 original + 1 imported)');

  // 11. Track created tabs via store (indirect test)
  console.log('\n11. Tab CRUD via Store');
  const tab = store.insert('tabs', {
    id: 'test-tab-1',
    title: 'Test Tab',
    url: 'https://example.com',
    workspaceId: w2.id,
    isSuspended: false,
    createdAt: new Date().toISOString(),
  });
  assert(tab.id === 'test-tab-1', 'Tab created');

  const tabs = store.findAll('tabs', t => t.workspaceId === w2.id);
  assert(tabs.length === 1, `Found ${tabs.length} tab for workspace`);

  store.update('tabs', t => t.id === 'test-tab-1', { isSuspended: true });
  const suspended = store.findOne('tabs', t => t.id === 'test-tab-1');
  assert(suspended.isSuspended === true, 'Tab suspended via store');

  // 12. Settings
  console.log('\n12. Settings Defaults');
  const settings = require('../main/managers/settingsManager');
  const s = settings.getAll();
  assert(s.theme === 'dark', `Default theme: ${s.theme}`);
  assert(s.resourceSaver === true, 'Default resource saver: on');
  
  settings.update({ theme: 'light', compactMode: true });
  const s2 = settings.getAll();
  assert(s2.theme === 'light', 'Theme updated to light');
  assert(s2.compactMode === true, 'Compact mode on');

  settings.reset();
  const s3 = settings.getAll();
  assert(s3.theme === 'dark', 'Theme reset to dark');

  // 13. Tasks
  console.log('\n13. Task CRUD');
  const taskManager = require('../main/ipc/router');
  // Use store directly
  const task = store.insert('tasks', {
    id: 'task-1',
    title: 'Testaufgabe',
    description: 'Eine Testaufgabe',
    workspaceId: w2.id,
    isCompleted: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  assert(task.title === 'Testaufgabe', 'Task created');

  // Cleanup
  console.log('\n14. Cleanup');
  // Remove test data
  const fs = require('fs');
  const testDir = path.join(__dirname, '..', '..', '.test-home', '.hermesbrowser');
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
    console.log('  ✓ Test data cleaned up');
  }

  // Restore homedir
  os.homedir = originalHomedir;

  console.log('\n═══ Test Complete ═══\n');
  if (process.exitCode) {
    console.log('Some tests FAILED.');
    process.exit(process.exitCode);
  } else {
    console.log('All tests PASSED.');
  }
}

run().catch(err => {
  console.error('Test crashed:', err);
  process.exit(1);
});
