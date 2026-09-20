import { describe, expect, it } from 'vitest';
import {
  defaultSearchEngineId,
  loadSearchEngineId,
  normalizeNavigationInput,
  saveSearchEngineId,
  searchEngineById,
  searchEngines,
  searchUrlFor
} from '../src/renderer/tabs.js';

function fakeStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    dump: () => Object.fromEntries(store)
  };
}

describe('searchUrlFor', () => {
  it('builds a Google URL by default', () => {
    expect(searchUrlFor('hello world')).toBe('https://www.google.com/search?q=hello%20world');
  });

  it('encodes special characters', () => {
    expect(searchUrlFor('a&b=c')).toContain('a%26b%3Dc');
  });

  it('uses the requested engine', () => {
    expect(searchUrlFor('test', 'duckduckgo')).toBe('https://duckduckgo.com/?q=test');
    expect(searchUrlFor('test', 'wikipedia')).toContain('wikipedia.org');
  });

  it('falls back to the first engine for an unknown id', () => {
    expect(searchUrlFor('x', 'nope')).toBe(searchUrlFor('x', defaultSearchEngineId));
  });
});

describe('searchEngineById', () => {
  it('finds a known engine', () => {
    expect(searchEngineById('brave').label).toBe('Brave Search');
  });

  it('falls back to the first engine', () => {
    expect(searchEngineById('missing').id).toBe(searchEngines[0].id);
  });

  it('offers a privacy-oriented set', () => {
    const ids = searchEngines.map((engine) => engine.id);
    expect(ids).toContain('duckduckgo');
    expect(ids).toContain('startpage');
    expect(ids).toContain('brave');
  });

  it('gives every engine a %s placeholder', () => {
    for (const engine of searchEngines) {
      expect(engine.template).toContain('%s');
    }
  });
});

describe('loadSearchEngineId / saveSearchEngineId', () => {
  it('returns the default when nothing is stored', () => {
    expect(loadSearchEngineId(fakeStorage())).toBe(defaultSearchEngineId);
  });

  it('round-trips a stored engine', () => {
    const storage = fakeStorage();
    saveSearchEngineId(storage, 'duckduckgo');
    expect(loadSearchEngineId(storage)).toBe('duckduckgo');
  });

  it('ignores a stored value that is not a known engine', () => {
    expect(loadSearchEngineId(fakeStorage({ 'lastbrowser.searchEngine.v1': 'bogus' }))).toBe(
      defaultSearchEngineId
    );
  });

  it('survives a throwing storage', () => {
    const hostile = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      }
    };
    expect(loadSearchEngineId(hostile)).toBe(defaultSearchEngineId);
    expect(() => saveSearchEngineId(hostile, 'bing')).not.toThrow();
  });
});

describe('normalizeNavigationInput with an engine', () => {
  it('treats a bare word as a search on the chosen engine', () => {
    expect(normalizeNavigationInput('cats', 'duckduckgo')).toBe('https://duckduckgo.com/?q=cats');
  });

  it('still treats a domain as a URL', () => {
    expect(normalizeNavigationInput('example.com', 'duckduckgo')).toBe('https://example.com');
  });

  it('still passes through an explicit scheme', () => {
    expect(normalizeNavigationInput('https://example.com/x', 'bing')).toBe('https://example.com/x');
  });

  it('defaults to Google when no engine is given', () => {
    expect(normalizeNavigationInput('cats')).toContain('google.com');
  });
});
