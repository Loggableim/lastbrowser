import { describe, expect, it } from 'vitest';
import { loadSpaceModel, removeSpaceModel, saveSpaceModel } from '../src/renderer/space-models.js';

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() { return values.size; }
  } as Storage;
}

describe('per-Space model preferences', () => {
  it('keeps model choices isolated by Space and removes deleted Space choices', () => {
    const storage = createStorage();
    saveSpaceModel('C:/work/a', 'smart-track', storage);
    saveSpaceModel('C:/work/b', 'ollama:llama3', storage);

    expect(loadSpaceModel('C:/work/a', storage)).toBe('smart-track');
    expect(loadSpaceModel('C:/work/b', storage)).toBe('ollama:llama3');

    removeSpaceModel('C:/work/a', storage);
    expect(loadSpaceModel('C:/work/a', storage)).toBeNull();
    expect(loadSpaceModel('C:/work/b', storage)).toBe('ollama:llama3');
  });

  it('recovers from invalid stored data', () => {
    const storage = createStorage();
    storage.setItem('lastbrowser.spaceModels.v1', 'not-json');
    expect(loadSpaceModel('C:/work/a', storage)).toBeNull();
    expect(() => saveSpaceModel('C:/work/a', 'smart-track', storage)).not.toThrow();
    expect(loadSpaceModel('C:/work/a', storage)).toBe('smart-track');
  });
});
