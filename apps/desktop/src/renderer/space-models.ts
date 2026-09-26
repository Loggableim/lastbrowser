const STORAGE_KEY = 'lastbrowser.spaceModels.v1';

function readModels(storage: Storage): Record<string, string> {
  try {
    const value: unknown = JSON.parse(storage.getItem(STORAGE_KEY) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([path, model]) => path && typeof model === 'string' && model));
  } catch {
    return {};
  }
}

export function loadSpaceModel(path: string, storage: Storage): string | null {
  return path ? readModels(storage)[path] || null : null;
}

export function saveSpaceModel(path: string, model: string, storage: Storage): void {
  if (!path || !model) return;
  const models = readModels(storage);
  models[path] = model;
  storage.setItem(STORAGE_KEY, JSON.stringify(models));
}

export function removeSpaceModel(path: string, storage: Storage): void {
  const models = readModels(storage);
  if (!path || !(path in models)) return;
  delete models[path];
  storage.setItem(STORAGE_KEY, JSON.stringify(models));
}
