# HermesBrowser v2 — Manager API Reference

## Store API (src/main/database/store.js)

```js
const store = require('./store');
// CRUD
store.readCollection(name)          -> items[]
store.writeCollection(name, items)  -> void
store.findOne(name, pred)           -> item|null
store.findAll(name, pred?)          -> items[]
store.findByIndex(name, field, val) -> items[]  // FAST: indexed lookup
store.query(name, {filter, sortBy, sortDir, offset, limit}) -> items[]
store.insert(name, item)            -> item
store.insertMany(name, items)       -> items[]
store.update(name, pred, changes)   -> count
store.updateById(name, id, changes) -> item|null
store.remove(name, pred)            -> removed[]
store.removeById(name, id)          -> item|null
store.count(name, pred?)            -> number
store.groupBy(name, field)          -> {fieldVal: [items]}
store.createBackup()                -> backupPath
store.listBackups()                 -> [{name, path, size, createdAt}]
store.restoreBackup(path)           -> bool
store.exportAll()                   -> {collection: items}
store.importAll(data)               -> void
```

## Constants Reference

IPC channels: `IPC.APP_LIST`, `IPC.TAB_CREATE`, etc. (see constants.js)
Defaults: `DEFAULTS.SETTINGS`, `DEFAULTS.WORKSPACE`, etc.
UID: `const { uid } = require('../../shared/constants');`

## Module Pattern

All managers follow:
```js
const store = require('../database/store');
const { uid } = require('../../shared/constants');
const COLLECTION = 'collection_name';

function getAll() { return store.readCollection(COLLECTION); }
function getById(id) { return store.findOne(COLLECTION, item => item.id === id); }
function create(data) { return store.insert(COLLECTION, { id: uid(), ...data }); }
function update(id, changes) { return store.updateById(COLLECTION, id, changes); }
function remove(id) { return store.removeById(COLLECTION, id); }

module.exports = { getAll, getById, create, update, remove };
`` Use full, not the simplified placeholder. No mocks, no todos.

## Data Files

- All data persisted under ~/.hermesbrowser/data/
- Collections: settings, workspaces, apps, accounts, tabs, closed_tabs, tab_sets, split_views, tasks, kanban_boards, kanban_columns, kanban_cards, agents, worker_jobs, cron_jobs, pipelines, git_repos, notifications, focus_sessions, distraction_rules
