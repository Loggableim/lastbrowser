/**
 * HermesBrowser — App Definition Manager v2.2
 * Global app templates (Gmail, Discord, GitHub, etc.)
 * Each definition is a blueprint; actual accounts are AppAccounts.
 */
const store = require('../database/store');
const { uid } = require('../../shared/constants');

const COLLECTION = 'app_definitions';

// ── Built-in Presets ───────────────────────────────────────────────────
const BUILTIN_PRESETS = [
  { name: 'Gmail', baseUrl: 'https://mail.google.com', icon: '📧', category: 'communication', defaultColor: '#EA4335' },
  { name: 'Discord', baseUrl: 'https://discord.com/app', icon: '💬', category: 'communication', defaultColor: '#5865F2' },
  { name: 'YouTube Studio', baseUrl: 'https://studio.youtube.com', icon: '🎬', category: 'content', defaultColor: '#FF0000' },
  { name: 'TikTok', baseUrl: 'https://www.tiktok.com', icon: '🎵', category: 'content', defaultColor: '#000000' },
  { name: 'GitHub', baseUrl: 'https://github.com', icon: '🐙', category: 'development', defaultColor: '#333333' },
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai', icon: '🤖', category: 'ai', defaultColor: '#5436DA' },
  { name: 'ChatGPT', baseUrl: 'https://chat.openai.com', icon: '🤖', category: 'ai', defaultColor: '#10A37F' },
  { name: 'Claude', baseUrl: 'https://claude.ai', icon: '🧠', category: 'ai', defaultColor: '#6B4C9A' },
  { name: 'Notion', baseUrl: 'https://www.notion.so', icon: '📝', category: 'productivity', defaultColor: '#000000' },
  { name: 'Trello', baseUrl: 'https://trello.com', icon: '📊', category: 'productivity', defaultColor: '#0079BF' },
  { name: 'Google Drive', baseUrl: 'https://drive.google.com', icon: '📂', category: 'productivity', defaultColor: '#34A853' },
  { name: 'Google Calendar', baseUrl: 'https://calendar.google.com', icon: '📅', category: 'productivity', defaultColor: '#4285F4' },
  { name: 'Linear', baseUrl: 'https://linear.app', icon: '📐', category: 'development', defaultColor: '#5E6AD2' },
  { name: 'Slack', baseUrl: 'https://slack.com', icon: '💬', category: 'communication', defaultColor: '#4A154B' },
  { name: 'X / Twitter', baseUrl: 'https://x.com', icon: '🐦', category: 'social', defaultColor: '#1DA1F2' },
  { name: 'Instagram', baseUrl: 'https://www.instagram.com', icon: '📸', category: 'social', defaultColor: '#E4405F' },
  { name: 'LinkedIn', baseUrl: 'https://www.linkedin.com', icon: '👥', category: 'social', defaultColor: '#0A66C2' },
  { name: 'Reddit', baseUrl: 'https://www.reddit.com', icon: '🤠', category: 'social', defaultColor: '#FF4500' },
  { name: 'Jellyfin', baseUrl: '', icon: '🎬', category: 'media', defaultColor: '#00A4DC' },
  { name: 'Jellyseerr', baseUrl: '', icon: '🎬', category: 'media', defaultColor: '#0055FF' },
  { name: 'Custom', baseUrl: '', icon: '🌐', category: 'other', defaultColor: '#6366f1' },
];

// ── Manager API ─────────────────────────────────────────────────────────

function getAll() {
  return store.readCollection(COLLECTION);
}

function getById(id) {
  return store.findOne(COLLECTION, d => d.id === id);
}

function getByCategory(category) {
  return store.findAll(COLLECTION, d => d.category === category);
}

function getPresets() {
  return BUILTIN_PRESETS.map(p => ({ ...p, id: null, isPreset: true }));
}

function create(data) {
  const def = {
    id: uid(),
    name: data.name || 'Custom App',
    baseUrl: data.baseUrl || '',
    icon: data.icon || '🌐',
    category: data.category || 'other',
    defaultColor: data.defaultColor || '#6366f1',
    isBuiltin: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return store.insert(COLLECTION, def);
}

function update(id, changes) {
  return store.updateById(COLLECTION, id, { ...changes, updatedAt: new Date().toISOString() });
}

function remove(id) {
  return store.removeById(COLLECTION, id);
}

function findOrCreateFromPreset(presetName, baseUrl) {
  const preset = BUILTIN_PRESETS.find(p => p.name === presetName);
  if (!preset) {
    // Create custom
    const all = getAll();
    const existing = all.find(d => d.name === presetName);
    if (existing) return existing;
    return create({ name: presetName, baseUrl, icon: '🌐', category: 'other' });
  }

  // Check if already exists
  const all = getAll();
  const existing = all.find(d => d.name === preset.name);
  if (existing) return existing;

  return create({
    name: preset.name,
    baseUrl: baseUrl || preset.baseUrl,
    icon: preset.icon,
    category: preset.category,
    defaultColor: preset.defaultColor,
  });
}

function seedPresets() {
  const all = getAll();
  if (all.length > 0) return; // Already seeded

  for (const preset of BUILTIN_PRESETS) {
    store.insert(COLLECTION, {
      id: uid(),
      name: preset.name,
      baseUrl: preset.baseUrl,
      icon: preset.icon,
      category: preset.category,
      defaultColor: preset.defaultColor,
      isBuiltin: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
  console.log('[appDefs] Seeded ' + BUILTIN_PRESETS.length + ' app definitions');
}

module.exports = { getAll, getById, getByCategory, getPresets, create, update, remove,
  findOrCreateFromPreset, seedPresets, BUILTIN_PRESETS };
