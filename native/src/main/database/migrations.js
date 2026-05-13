/**
 * LastBrowser v2 — Migration Script
 * Migrates existing v1 data to v2 format.
 * Run once on app startup.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const store = require('./store');

const OLD_DATA_DIR = path.join(os.homedir(), '.lastbrowser', 'data');
const MIGRATIONS_FILE = path.join(OLD_DATA_DIR, '_migrations.json');

function getAppliedMigrations() {
  try {
    if (fs.existsSync(MIGRATIONS_FILE)) {
      return JSON.parse(fs.readFileSync(MIGRATIONS_FILE, 'utf-8'));
    }
  } catch (_) {}
  return [];
}

function markMigrationApplied(name) {
  const applied = getAppliedMigrations();
  applied.push({ name, timestamp: new Date().toISOString() });
  fs.writeFileSync(MIGRATIONS_FILE, JSON.stringify(applied, null, 2), 'utf-8');
}

function needsMigration(name) {
  return !getAppliedMigrations().includes(name);
}

function runMigrations() {
  console.log('[migration] Checking for pending migrations...');

  if (needsMigration('v1-to-v2-workspaces')) {
    console.log('[migration] Running: v1-to-v2-workspaces');
    try {
      // Workspaces v1 already compatible with v2 — just ensure all fields
      const workspaces = store.readCollection('workspaces');
      for (const ws of workspaces) {
        const updates = {};
        if (ws.isSleeping === undefined) updates.isSleeping = false;
        if (ws.downloadPath === undefined) updates.downloadPath = '';
        if (ws.useGlobalDownloadPath === undefined) updates.useGlobalDownloadPath = true;
        if (ws.customUserAgent === undefined) updates.customUserAgent = '';
        if (ws.focusModeEnabled === undefined) updates.focusModeEnabled = false;
        if (ws.distractionRules === undefined) updates.distractionRules = [];
        if (ws.splitLayoutId === undefined) updates.splitLayoutId = null;
        if (ws.tabSetAutoSave === undefined) updates.tabSetAutoSave = true;
        if (ws.tabSetAutoSaveMinutes === undefined) updates.tabSetAutoSaveMinutes = 5;
        if (Object.keys(updates).length > 0) {
          store.updateById('workspaces', ws.id, updates);
        }
      }
      markMigrationApplied('v1-to-v2-workspaces');
    } catch (err) {
      console.error('[migration] v1-to-v2-workspaces failed:', err.message);
    }
  }

  if (needsMigration('v1-to-v2-settings')) {
    console.log('[migration] Running: v1-to-v2-settings');
    try {
      const settings = store.findOne('settings', () => true);
      if (settings) {
        const v2Defaults = {
          language: 'en', sidebarWidth: 280, tabPosition: 'left',
          showFavicons: true, hardwareAcceleration: true, autoUpdate: true,
          proxyEnabled: false, proxyUrl: '', telemetryEnabled: false,
          autoBackupIntervalHours: 24, mutedApps: [], mutedWorkspaces: [],
          globalMuted: false, saverExceptions: [], adblockBlockedCount: 0,
          estimatedCacheSize: 0, estimatedCookiesCount: 0,
        };
        const updates = {};
        for (const [key, val] of Object.entries(v2Defaults)) {
          if (settings[key] === undefined) updates[key] = val;
        }
        if (Object.keys(updates).length > 0) {
          store.updateById('settings', settings.id, updates);
        }
      }
      markMigrationApplied('v1-to-v2-settings');
    } catch (err) {
      console.error('[migration] v1-to-v2-settings failed:', err.message);
    }
  }

  if (needsMigration('v1-to-v2-accounts')) {
    console.log('[migration] Running: v1-to-v2-accounts');
    try {
      // Migrate inline accounts (from apps array) to separate accounts collection
      const apps = store.readCollection('apps');
      for (const app of apps) {
        if (app.accounts && Array.isArray(app.accounts)) {
          for (const acct of app.accounts) {
            // Check if this account already exists in accounts collection
            const existing = store.findOne('accounts', a => a.id === acct.id);
            if (!existing) {
              store.insert('accounts', {
                id: acct.id,
                appShortcutId: app.id,
                label: acct.label || 'Account',
                sessionPartition: acct.sessionPartition || `persist:app_account_${acct.id}`,
                isActive: acct.isActive || false,
                profileColor: acct.profileColor || '#6366f1',
                lastUsed: acct.lastUsed || new Date().toISOString(),
              });
            }
          }
        }
      }
      markMigrationApplied('v1-to-v2-accounts');
    } catch (err) {
      console.error('[migration] v1-to-v2-accounts failed:', err.message);
    }
  }

  if (needsMigration('v2-to-v2.2-app-definitions')) {
    console.log('[migration] Running: v2-to-v2.2-app-definitions');
    try {
      // Migration: old apps → app_definitions
      const oldApps = store.readCollection('apps') || [];
      const oldAccounts = store.readCollection('accounts') || [];
      const appDefs = store.readCollection('app_definitions') || [];

      // Create app definitions from existing apps (group by name)
      const nameToDef = {};
      for (const app of oldApps) {
        if (!app.name || nameToDef[app.name]) continue;
        // Check if definition already exists
        const existingDef = appDefs.find(d => d.name === app.name);
        if (existingDef) {
          nameToDef[app.name] = existingDef.id;
          continue;
        }
        const defId = uid();
        store.insert('app_definitions', {
          id: defId,
          name: app.name,
          baseUrl: app.url || '',
          icon: app.icon || '🌐',
          category: 'other',
          defaultColor: app.color || '#6366f1',
          isBuiltin: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        nameToDef[app.name] = defId;
      }

      // Migrate old accounts → new app_accounts format
      for (const acct of oldAccounts) {
        const app = oldApps.find(a => a.id === acct.appShortcutId);
        const defId = app ? nameToDef[app.name] : null;
        const existing = store.findOne('app_accounts', a => a.id === acct.id);
        if (!existing) {
          store.insert('app_accounts', {
            id: acct.id,
            appId: acct.appShortcutId || null,
            appDefinitionId: defId,
            displayName: acct.label || acct.displayName || 'Account',
            accountLabel: acct.label || '',
            baseUrl: app?.url || '',
            color: acct.profileColor || '#6366f1',
            iconOverride: app?.icon || '',
            sessionPartition: acct.sessionPartition || `persist:appaccount_${acct.id}`,
            workspaceId: app?.workspaceId || null,
            order: app?.order || 0,
            muted: app?.isMuted || false,
            notificationsEnabled: true,
            badgeCount: 0,
            lastActiveAt: acct.lastUsed || null,
            assignedAgentId: null,
            agentControlEnabled: false,
            agentStatus: 'idle',
            agentLastAction: null,
            agentLastOutput: null,
            lastUrl: '',
            sharedSession: false,
            createdAt: acct.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
      }

      // Update apps with appDefinitionId
      for (const app of oldApps) {
        const defId = nameToDef[app.name];
        if (defId) {
          store.updateById('apps', app.id, { appDefinitionId: defId });
        }
      }

      markMigrationApplied('v2-to-v2.2-app-definitions');
      console.log('[migration] v2-to-v2.2-app-definitions complete');
    } catch (err) {
      console.error('[migration] v2-to-v2.2-app-definitions failed:', err.message);
    }
  }

  console.log('[migration] All pending migrations applied');
}

module.exports = { runMigrations };
