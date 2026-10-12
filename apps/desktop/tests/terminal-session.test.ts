import { describe, expect, it } from 'vitest';
import { reconcileStoredTerminal } from '../src/renderer/terminal-session.js';

describe('reconcileStoredTerminal', () => {
  it('keeps an id the main process still owns', () => {
    expect(reconcileStoredTerminal('term-live', ['term-live', 'term-other'])).toBe('term-live');
  });

  it('drops an id from a previous launch', () => {
    expect(reconcileStoredTerminal('term-stale', [])).toBe('');
    expect(reconcileStoredTerminal('term-stale', ['term-other'])).toBe('');
  });

  it('keeps an empty id empty', () => {
    expect(reconcileStoredTerminal('', ['term-live'])).toBe('');
  });
});
