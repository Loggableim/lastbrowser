import { describe, expect, it } from 'vitest';
import { loadVisitedSites, recordVisit, saveVisitedSites } from '../src/renderer/history.js';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('browser visit history', () => {
  it('records visits without double-counting title updates', () => {
    const first = recordVisit([], 'https://example.com/docs', 'Example Docs');
    const second = recordVisit(first, 'https://example.com/docs', 'Example Docs updated', { increment: false });

    expect(first[0].count).toBe(1);
    expect(second[0].count).toBe(1);
    expect(second[0].title).toBe('Example Docs');
  });

  it('saves and loads the most visited list', () => {
    const storage = new MemoryStorage();
    const visits = recordVisit([], 'https://example.com', 'Example Domain');
    saveVisitedSites(storage, visits);

    expect(loadVisitedSites(storage)[0]).toMatchObject({
      url: 'https://example.com',
      title: 'Example Domain',
      count: 1
    });
  });
});
