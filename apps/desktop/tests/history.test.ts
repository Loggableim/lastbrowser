import { describe, expect, it } from 'vitest';
import {
  groupVisitsByDay,
  removeVisit,
  searchVisits,
  startPageVisitLimit,
  type BrowserVisit
} from '../src/renderer/history.js';

function visit(url: string, title: string, lastVisited: number, count = 1): BrowserVisit {
  return { url, title, count, lastVisited };
}

const DAY = 86_400_000;
const now = Date.now();

describe('searchVisits', () => {
  const visits = [
    visit('https://example.com/docs', 'Example Docs', now),
    visit('https://github.com/electron', 'Electron', now - DAY),
    visit('https://news.ycombinator.com', 'Hacker News', now - 2 * DAY)
  ];

  it('returns everything for an empty query', () => {
    expect(searchVisits(visits, '')).toHaveLength(3);
    expect(searchVisits(visits, '   ')).toHaveLength(3);
  });

  it('matches the title case-insensitively', () => {
    expect(searchVisits(visits, 'electron')).toHaveLength(1);
    expect(searchVisits(visits, 'ELECTRON')).toHaveLength(1);
  });

  it('matches the url', () => {
    expect(searchVisits(visits, 'github')).toHaveLength(1);
    expect(searchVisits(visits, 'ycombinator')).toHaveLength(1);
  });

  it('matches partial words', () => {
    expect(searchVisits(visits, 'doc')).toHaveLength(1);
  });

  it('returns nothing when there is no match', () => {
    expect(searchVisits(visits, 'zzzz')).toHaveLength(0);
  });
});

describe('removeVisit', () => {
  it('removes the entry with the matching url', () => {
    const visits = [
      visit('https://example.com', 'Example', now),
      visit('https://github.com', 'GitHub', now)
    ];
    const next = removeVisit(visits, 'https://example.com');
    expect(next).toHaveLength(1);
    expect(next[0].url).toBe('https://github.com');
  });

  it('matches despite a trailing slash difference', () => {
    const visits = [visit('https://example.com', 'Example', now)];
    expect(removeVisit(visits, 'https://example.com/')).toHaveLength(0);
  });

  it('leaves the list untouched when nothing matches', () => {
    const visits = [visit('https://example.com', 'Example', now)];
    expect(removeVisit(visits, 'https://other.com')).toHaveLength(1);
  });
});

describe('groupVisitsByDay', () => {
  it('labels today and yesterday', () => {
    const groups = groupVisitsByDay([
      visit('https://a.com', 'A', now),
      visit('https://b.com', 'B', now - DAY)
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday']);
  });

  it('sorts days newest first', () => {
    const groups = groupVisitsByDay([
      visit('https://old.com', 'Old', now - 5 * DAY),
      visit('https://new.com', 'New', now)
    ]);
    expect(groups[0].label).toBe('Today');
    expect(groups[groups.length - 1].label).not.toBe('Today');
  });

  it('sorts entries inside a day newest first', () => {
    const groups = groupVisitsByDay([
      visit('https://first.com', 'First', now - 5000),
      visit('https://second.com', 'Second', now)
    ]);
    expect(groups[0].visits[0].url).toBe('https://second.com');
  });

  it('groups multiple visits on the same day together', () => {
    const groups = groupVisitsByDay([
      visit('https://a.com', 'A', now),
      visit('https://b.com', 'B', now - 1000),
      visit('https://c.com', 'C', now - 2 * DAY)
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].visits).toHaveLength(2);
  });

  it('returns an empty array for no visits', () => {
    expect(groupVisitsByDay([])).toEqual([]);
  });
});

describe('startPageVisitLimit', () => {
  it('is smaller than the history cap so the start page stays tidy', () => {
    expect(startPageVisitLimit).toBeLessThan(500);
    expect(startPageVisitLimit).toBeGreaterThan(0);
  });
});
