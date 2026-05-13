/**
 * LastBrowser — Enhanced JSON File Store v2
 *
 * File-based persistence with:
 * - Atomic writes (tmp + rename)
 * - In-memory indexing for fast lookups
 * - Collection-level indexing
 * - Auto-backup support
 * - Migration framework
 * - Query helpers (findByIndex, pagination, sorting)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.lastbrowser', 'data');
const BACKUP_DIR = path.join(os.homedir(), '.lastbrowser', 'backups');
const MIGRATIONS_FILE = path.join(DATA_DIR, '_migrations.json');

// ── Auto-migrate from legacy .hermesbrowser data dir ─────────────────
function migrateLegacyData() {
  const oldDataDir = path.join(os.homedir(), '.hermesbrowser', 'data');
  const newDataDir = DATA_DIR;
  const oldBackupDir = path.join(os.homedir(), '.hermesbrowser', 'backups');
  const newBackupDir = BACKUP_DIR;

  // Only migrate if old data exists and new data doesn't
  if (fs.existsSync(oldDataDir) && !fs.existsSync(newDataDir)) {
    console.log('[lastbrowser:store] Detected legacy .hermesbrowser data — migrating...');
    try {
      if (!fs.existsSync(path.dirname(newDataDir))) {
        fs.mkdirSync(path.dirname(newDataDir), { recursive: true });
      }
      // Copy all data files
      const files = fs.readdirSync(oldDataDir);
      for (const f of files) {
        const src = path.join(oldDataDir, f);
        const dst = path.join(newDataDir, f);
        if (fs.statSync(src).isFile() && !fs.existsSync(dst)) {
          if (!fs.existsSync(path.dirname(dst))) {
            fs.mkdirSync(path.dirname(dst), { recursive: true });
          }
          fs.copyFileSync(src, dst);
        }
      }
      console.log(`[lastbrowser:store] Migrated ${files.length} data files from .hermesbrowser`);
      // Copy backups
      if (fs.existsSync(oldBackupDir)) {
        if (!fs.existsSync(newBackupDir)) {
          fs.mkdirSync(newBackupDir, { recursive: true });
        }
        const backupFiles = fs.readdirSync(oldBackupDir);
        for (const f of backupFiles) {
          const src = path.join(oldBackupDir, f);
          const dst = path.join(newBackupDir, f);
          if (fs.statSync(src).isFile() && !fs.existsSync(dst)) {
            fs.copyFileSync(src, dst);
          }
        }
        console.log(`[lastbrowser:store] Migrated ${backupFiles.length} backup files`);
      }
      console.log('[lastbrowser:store] Migration complete — old .hermesbrowser data preserved');
    } catch (err) {
      console.error('[lastbrowser:store] Migration failed:', err.message);
    }
  } else if (fs.existsSync(oldDataDir) && fs.existsSync(newDataDir)) {
    console.log('[lastbrowser:store] Both old and new data dirs exist — no migration needed');
  }
}

// Run migration immediately
migrateLegacyData();

// ── In-memory cache ───────────────────────────────────────────────────
const _cache = {};       // collection -> items[]
const _indexes = {};     // collection -> { field -> Map(value -> Set(ids)) }
const _dirty = new Set(); // collections modified since last flush

const AUTOSAVE_MS = 5000; // flush dirty collections every 5s
let _autosaveTimer = null;

// ── Init ───────────────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function filePath(collection) {
  return path.join(DATA_DIR, `${collection}.json`);
}

function getCache(collection) {
  if (!_cache[collection]) {
    _cache[collection] = _loadFromDisk(collection);
  }
  return _cache[collection];
}

function _loadFromDisk(collection) {
  const fp = filePath(collection);
  try {
    if (!fs.existsSync(fp)) return [];
    const raw = fs.readFileSync(fp, 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data;
  } catch (err) {
    console.error(`[store] Failed to load ${collection}: ${err.message}`);
    return [];
  }
}

function _writeToDisk(collection, data) {
  ensureDir(DATA_DIR);
  const fp = filePath(collection);
  const tmp = fp + '.tmp.' + Date.now() + '.' + Math.random().toString(36).slice(2, 6);
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, fp);
    return true;
  } catch (err) {
    console.error(`[store] Failed to write ${collection}: ${err.message}`);
    try { fs.unlinkSync(tmp); } catch (_) {}
    return false;
  }
}

function _flushCollection(collection) {
  if (_dirty.has(collection) && _cache[collection] !== undefined) {
    _writeToDisk(collection, _cache[collection]);
    _dirty.delete(collection);
  }
}

function _startAutosave() {
  if (_autosaveTimer) clearInterval(_autosaveTimer);
  _autosaveTimer = setInterval(() => {
    for (const col of [..._dirty]) {
      _flushCollection(col);
    }
  }, AUTOSAVE_MS);
  _autosaveTimer.unref();
}

function _flushAll() {
  for (const col of [..._dirty]) {
    _flushCollection(col);
  }
}

// ── Indexing ──────────────────────────────────────────────────────────
function _buildIndex(collection, field) {
  const items = getCache(collection);
  if (!_indexes[collection]) _indexes[collection] = {};
  const map = new Map();
  for (const item of items) {
    const val = item[field];
    const key = String(val ?? '');
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(item.id || JSON.stringify(item));
  }
  _indexes[collection][field] = map;
}

function _ensureIndex(collection, field) {
  if (!_indexes[collection]?.[field]) {
    _buildIndex(collection, field);
  }
}

function _invalidateIndex(collection) {
  delete _indexes[collection];
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Read all items from a collection.
 */
function readCollection(collection) {
  return [...getCache(collection)];
}

/**
 * Write a complete collection (replaces all items).
 */
function writeCollection(collection, data) {
  if (!Array.isArray(data)) throw new Error('writeCollection: data must be an array');
  _cache[collection] = [...data];
  _dirty.add(collection);
  _invalidateIndex(collection);
  _flushCollection(collection);
  return true;
}

/**
 * Find first item matching predicate.
 */
function findOne(collection, pred) {
  return getCache(collection).find(pred) || null;
}

/**
 * Find all items matching predicate, or all if no predicate.
 */
function findAll(collection, pred) {
  const items = getCache(collection);
  if (!pred) return [...items];
  return items.filter(pred);
}

/**
 * Find all items by indexed field value (fast path).
 */
function findByIndex(collection, field, value) {
  _ensureIndex(collection, field);
  const map = _indexes[collection][field];
  const key = String(value ?? '');
  const ids = map.get(key);
  if (!ids || ids.size === 0) return [];
  const items = getCache(collection);
  return items.filter(item => ids.has(item.id || JSON.stringify(item)));
}

/**
 * Find items with pagination and sorting.
 */
function query(collection, opts = {}) {
  let items = getCache(collection);

  // Filter
  if (opts.filter) {
    items = items.filter(opts.filter);
  }

  // Sort
  if (opts.sortBy) {
    const dir = opts.sortDir === 'desc' ? -1 : 1;
    items = [...items].sort((a, b) => {
      const va = a[opts.sortBy] ?? '';
      const vb = b[opts.sortBy] ?? '';
      if (typeof va === 'string') return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });
  }

  // Paginate
  if (opts.offset) items = items.slice(opts.offset);
  if (opts.limit) items = items.slice(0, opts.limit);

  return items;
}

/**
 * Insert a single item. Returns the inserted item.
 */
function insert(collection, item) {
  const items = getCache(collection);
  items.push(item);
  _cache[collection] = items;
  _dirty.add(collection);
  _invalidateIndex(collection);
  _flushCollection(collection);
  return item;
}

/**
 * Insert multiple items at once.
 */
function insertMany(collection, newItems) {
  const items = getCache(collection);
  items.push(...newItems);
  _cache[collection] = items;
  _dirty.add(collection);
  _invalidateIndex(collection);
  _flushCollection(collection);
  return newItems;
}

/**
 * Update items matching predicate. Returns count of updated items.
 */
function update(collection, pred, changes) {
  const items = getCache(collection);
  let count = 0;
  for (let i = 0; i < items.length; i++) {
    if (pred(items[i], i)) {
      items[i] = { ...items[i], ...changes };
      count++;
    }
  }
  if (count > 0) {
    _cache[collection] = items;
    _dirty.add(collection);
    _invalidateIndex(collection);
    _flushCollection(collection);
  }
  return count;
}

/**
 * Update a single item by id. Returns updated item or null.
 */
function updateById(collection, id, changes) {
  const items = getCache(collection);
  const idx = items.findIndex(item => item.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...changes };
  _cache[collection] = items;
  _dirty.add(collection);
  _invalidateIndex(collection);
  _flushCollection(collection);
  return items[idx];
}

/**
 * Remove items matching predicate. Returns removed items.
 */
function remove(collection, pred) {
  const items = getCache(collection);
  const kept = [];
  const removed = [];
  for (const item of items) {
    if (pred(item)) {
      removed.push(item);
    } else {
      kept.push(item);
    }
  }
  if (removed.length > 0) {
    _cache[collection] = kept;
    _dirty.add(collection);
    _invalidateIndex(collection);
    _flushCollection(collection);
  }
  return removed;
}

/**
 * Remove a single item by id. Returns removed item or null.
 */
function removeById(collection, id) {
  const removed = remove(collection, item => item.id === id);
  return removed.length > 0 ? removed[0] : null;
}

/**
 * Count items matching predicate.
 */
function count(collection, pred) {
  const items = getCache(collection);
  if (!pred) return items.length;
  return items.filter(pred).length;
}

// ── Grouped operations ────────────────────────────────────────────────

/**
 * Get all items grouped by a field value.
 */
function groupBy(collection, field) {
  const items = getCache(collection);
  const groups = {};
  for (const item of items) {
    const val = item[field] ?? '__null__';
    if (!groups[val]) groups[val] = [];
    groups[val].push(item);
  }
  return groups;
}

// ── Backup / Restore ──────────────────────────────────────────────────

/**
 * Export entire database as a JSON object.
 */
function exportAll() {
  ensureDir(DATA_DIR);
  const result = {};
  // Export all collections currently in cache
  for (const col of Object.keys(_cache)) {
    result[col] = [..._cache[col]];
  }
  // Also scan disk for collections not yet cached
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  for (const f of files) {
    const name = f.replace('.json', '');
    if (!result[name]) {
      result[name] = readCollection(name);
    }
  }
  return result;
}

/**
 * Import data from a JSON object (overwrites collections).
 */
function importAll(data) {
  for (const [collection, items] of Object.entries(data)) {
    if (Array.isArray(items)) {
      _cache[collection] = [...items];
      _dirty.add(collection);
      _invalidateIndex(collection);
      _flushCollection(collection);
    }
  }
}

/**
 * Create a timestamped backup.
 */
function createBackup() {
  ensureDir(BACKUP_DIR);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}.json`);
  const data = exportAll();
  fs.writeFileSync(backupPath, JSON.stringify(data, null, 2), 'utf-8');
  return backupPath;
}

/**
 * List available backups.
 */
function listBackups() {
  ensureDir(BACKUP_DIR);
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json')).sort().reverse();
  return files.map(f => {
    const stat = fs.statSync(path.join(BACKUP_DIR, f));
    return {
      name: f,
      path: path.join(BACKUP_DIR, f),
      size: stat.size,
      createdAt: stat.birthtime.toISOString(),
    };
  });
}

/**
 * Restore from a backup file.
 */
function restoreBackup(backupPath) {
  if (!fs.existsSync(backupPath)) throw new Error(`Backup not found: ${backupPath}`);
  const raw = fs.readFileSync(backupPath, 'utf-8');
  const data = JSON.parse(raw);
  importAll(data);
  return true;
}

// ── Data Directory ────────────────────────────────────────────────────

function getDataDir() {
  ensureDir(DATA_DIR);
  return DATA_DIR;
}

// ── Shutdown ──────────────────────────────────────────────────────────

function shutdown() {
  if (_autosaveTimer) clearInterval(_autosaveTimer);
  _flushAll();
}

// ── Initialize autosave ───────────────────────────────────────────────
_startAutosave();

// Graceful shutdown
process.on('exit', shutdown);
process.on('SIGINT', () => { shutdown(); process.exit(0); });
process.on('SIGTERM', () => { shutdown(); process.exit(0); });

module.exports = {
  readCollection,
  writeCollection,
  findOne,
  findAll,
  findByIndex,
  query,
  insert,
  insertMany,
  update,
  updateById,
  remove,
  removeById,
  count,
  groupBy,
  exportAll,
  importAll,
  createBackup,
  listBackups,
  restoreBackup,
  getDataDir,
  shutdown,
};
