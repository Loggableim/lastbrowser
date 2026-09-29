const STORAGE_KEY = 'lastbrowser.spaceModels.v1';

export interface SpaceModelSelection {
  model: string;
  provider?: string;
}

function readModels(storage: Storage): Record<string, SpaceModelSelection> {
  try {
    const value: unknown = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).flatMap(([path, entry]) => {
      if (!path) return [];
      if (typeof entry === 'string' && entry) return [[path, { model: entry }]];
      if (entry && typeof entry === 'object' && typeof (entry as SpaceModelSelection).model === 'string' && (entry as SpaceModelSelection).model) {
        return [[path, entry as SpaceModelSelection]];
      }
      return [];
    }));
  } catch {
    return {};
  }
}

export function loadSpaceModel(path: string, storage: Storage): string | null {
  return path ? readModels(storage)[path]?.model || null : null;
}

export function loadSpaceModelSelection(path: string, storage: Storage): SpaceModelSelection | null {
  return path ? readModels(storage)[path] || null : null;
}

export function saveSpaceModel(path: string, model: string, storage: Storage, provider?: string | null): void {
  if (!path || !model) return;
  const models = readModels(storage);
  models[path] = { model, ...(provider ? { provider } : {}) };
  storage.setItem(STORAGE_KEY, JSON.stringify(models));
}

export function removeSpaceModel(path: string, storage: Storage): void {
  const models = readModels(storage);
  if (!path || !(path in models)) return;
  delete models[path];
  storage.setItem(STORAGE_KEY, JSON.stringify(models));
}
