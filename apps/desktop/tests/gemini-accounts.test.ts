/**
 * Phase 12 – Google Accounts & Round-Robin Unit Tests
 *
 * Tests the multi-account OAuth management and round-robin token
 * distribution logic for Google Gemini CLI / Antigravity.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useGeminiAccountStore,
  nextRoundRobinIndex,
  accountUsageSummary,
  type GeminiOAuthAccount
} from '../src/renderer/stores/useGeminiAccountStore.js';

describe('nextRoundRobinIndex (pure helper)', () => {
  it('returns 0 when total is 0', () => {
    expect(nextRoundRobinIndex(0, 0)).toBe(0);
    expect(nextRoundRobinIndex(5, 0)).toBe(0);
  });

  it('cycles through indices for single account (total = 1)', () => {
    expect(nextRoundRobinIndex(0, 1)).toBe(0);
  });

  it('increments index sequentially and wraps around', () => {
    expect(nextRoundRobinIndex(0, 3)).toBe(1);
    expect(nextRoundRobinIndex(1, 3)).toBe(2);
    expect(nextRoundRobinIndex(2, 3)).toBe(0);
  });

  it('handles wrap-around for arbitrary numbers of accounts', () => {
    const total = 5;
    let idx = 0;
    const visited: number[] = [];
    for (let i = 0; i < 10; i++) {
      visited.push(idx);
      idx = nextRoundRobinIndex(idx, total);
    }
    expect(visited).toEqual([0, 1, 2, 3, 4, 0, 1, 2, 3, 4]);
  });
});

describe('accountUsageSummary (pure helper)', () => {
  const baseAccount: GeminiOAuthAccount = {
    id: 'test-1',
    label: 'Personal',
    email: 'user@gmail.com',
    flowId: 'flow-123',
    preferredModel: 'gemini-2.5-flash',
    addedAt: Date.now() - 86400000,
    totalSessionsUsed: 0
  };

  it('formats session count without timestamp when never used', () => {
    expect(accountUsageSummary({ ...baseAccount, totalSessionsUsed: 0 })).toBe('0 sessions');
    expect(accountUsageSummary({ ...baseAccount, totalSessionsUsed: 1 })).toBe('1 session');
    expect(accountUsageSummary({ ...baseAccount, totalSessionsUsed: 42 })).toBe('42 sessions');
  });

  it('formats relative time when lastUsedAt is set', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const justNow = accountUsageSummary({
      ...baseAccount,
      totalSessionsUsed: 5,
      lastUsedAt: now - 30_000 // 30s ago
    });
    expect(justNow).toBe('5 sessions · last used just now');

    const minutesAgo = accountUsageSummary({
      ...baseAccount,
      totalSessionsUsed: 1,
      lastUsedAt: now - 15 * 60_000 // 15m ago
    });
    expect(minutesAgo).toBe('1 session · last used 15m ago');

    const hoursAgo = accountUsageSummary({
      ...baseAccount,
      totalSessionsUsed: 10,
      lastUsedAt: now - 3 * 3_600_000 // 3h ago
    });
    expect(hoursAgo).toBe('10 sessions · last used 3h ago');

    const daysAgo = accountUsageSummary({
      ...baseAccount,
      totalSessionsUsed: 20,
      lastUsedAt: now - 4 * 86_400_000 // 4d ago
    });
    expect(daysAgo).toBe('20 sessions · last used 4d ago');

    vi.restoreAllMocks();
  });
});

describe('useGeminiAccountStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useGeminiAccountStore.setState({
      accounts: [],
      currentIndex: 0,
      roundRobinEnabled: true,
      rotatePerSession: true
    });
  });

  it('initializes with expected default values', () => {
    const state = useGeminiAccountStore.getState();
    expect(state.accounts).toEqual([]);
    expect(state.currentIndex).toBe(0);
    expect(state.roundRobinEnabled).toBe(true);
    expect(state.rotatePerSession).toBe(true);
  });

  it('adds an account with auto-generated ID, timestamp and zero usage', () => {
    const store = useGeminiAccountStore.getState();
    store.addAccount({
      label: 'Work Account',
      email: 'work@google.com',
      flowId: 'flow-abc',
      preferredModel: 'gemini-2.5-pro'
    });

    const accounts = useGeminiAccountStore.getState().accounts;
    expect(accounts).toHaveLength(1);
    expect(accounts[0].label).toBe('Work Account');
    expect(accounts[0].email).toBe('work@google.com');
    expect(accounts[0].flowId).toBe('flow-abc');
    expect(accounts[0].preferredModel).toBe('gemini-2.5-pro');
    expect(accounts[0].id).toBeTruthy();
    expect(accounts[0].addedAt).toBeGreaterThan(0);
    expect(accounts[0].totalSessionsUsed).toBe(0);
  });

  it('replaces metadata for the active OAuth slot while preserving other saved local metadata', () => {
    const store = useGeminiAccountStore.getState();
    store.addAccount({ label: 'Old active', email: 'old@gmail.com', flowId: 'old-flow', preferredModel: 'gemini-2.5-flash' });
    store.addAccount({ label: 'Saved metadata', email: 'saved@gmail.com', flowId: 'saved-flow', preferredModel: 'gemini-2.5-flash' });
    store.setActiveAccount(useGeminiAccountStore.getState().accounts[0].id);

    useGeminiAccountStore.getState().replaceActiveAccount({
      label: 'Current OAuth', email: 'current@gmail.com', flowId: 'new-flow', preferredModel: 'gemini-2.5-flash'
    });

    const accounts = useGeminiAccountStore.getState().accounts;
    expect(accounts).toHaveLength(2);
    expect(accounts[0].email).toBe('current@gmail.com');
    expect(accounts[1].email).toBe('saved@gmail.com');
    expect(useGeminiAccountStore.getState().currentIndex).toBe(0);
  });

  it('getNextAccount returns null when no accounts are configured', () => {
    const store = useGeminiAccountStore.getState();
    expect(store.getNextAccount()).toBeNull();
    expect(store.activeAccount()).toBeNull();
  });

  it('getNextAccount rotates sequentially through accounts (Round-Robin)', () => {
    const store = useGeminiAccountStore.getState();
    store.addAccount({ label: 'A1', email: 'a1@gmail.com', flowId: 'f1', preferredModel: 'gemini-2.5-flash' });
    store.addAccount({ label: 'A2', email: 'a2@gmail.com', flowId: 'f2', preferredModel: 'gemini-2.5-flash' });
    store.addAccount({ label: 'A3', email: 'a3@gmail.com', flowId: 'f3', preferredModel: 'gemini-2.5-flash' });

    const first = store.getNextAccount();
    expect(first?.label).toBe('A1');
    expect(useGeminiAccountStore.getState().currentIndex).toBe(1);

    const second = store.getNextAccount();
    expect(second?.label).toBe('A2');
    expect(useGeminiAccountStore.getState().currentIndex).toBe(2);

    const third = store.getNextAccount();
    expect(third?.label).toBe('A3');
    expect(useGeminiAccountStore.getState().currentIndex).toBe(0);

    // Wraps back to first account
    const fourth = store.getNextAccount();
    expect(fourth?.label).toBe('A1');
    expect(useGeminiAccountStore.getState().currentIndex).toBe(1);
  });

  it('activeAccount returns current account without advancing the index', () => {
    const store = useGeminiAccountStore.getState();
    store.addAccount({ label: 'Account 1', email: '1@gmail.com', flowId: 'f1', preferredModel: 'gemini-2.5-flash' });
    store.addAccount({ label: 'Account 2', email: '2@gmail.com', flowId: 'f2', preferredModel: 'gemini-2.5-flash' });

    expect(store.activeAccount()?.label).toBe('Account 1');
    expect(store.activeAccount()?.label).toBe('Account 1');
    expect(useGeminiAccountStore.getState().currentIndex).toBe(0);
  });

  it('does not advance round-robin pointer when roundRobinEnabled is false', () => {
    const store = useGeminiAccountStore.getState();
    store.addAccount({ label: 'A1', email: 'a1@gmail.com', flowId: 'f1', preferredModel: 'gemini-2.5-flash' });
    store.addAccount({ label: 'A2', email: 'a2@gmail.com', flowId: 'f2', preferredModel: 'gemini-2.5-flash' });
    store.setRoundRobinEnabled(false);

    expect(store.getNextAccount()?.label).toBe('A1');
    expect(store.getNextAccount()?.label).toBe('A1');
    expect(useGeminiAccountStore.getState().currentIndex).toBe(0);
  });

  it('records session usage correctly', () => {
    const store = useGeminiAccountStore.getState();
    store.addAccount({ label: 'Acc', email: 'acc@gmail.com', flowId: 'f', preferredModel: 'gemini-2.5-flash' });
    const id = useGeminiAccountStore.getState().accounts[0].id;

    store.recordUsage(id);
    store.recordUsage(id);

    const updated = useGeminiAccountStore.getState().accounts[0];
    expect(updated.totalSessionsUsed).toBe(2);
    expect(updated.lastUsedAt).toBeGreaterThan(0);
  });

  it('renames an account', () => {
    const store = useGeminiAccountStore.getState();
    store.addAccount({ label: 'Old Label', email: 'test@gmail.com', flowId: 'f', preferredModel: 'gemini-2.5-flash' });
    const id = useGeminiAccountStore.getState().accounts[0].id;

    store.renameAccount(id, 'New Label');
    expect(useGeminiAccountStore.getState().accounts[0].label).toBe('New Label');
  });

  it('removes an account and safely adjusts currentIndex', () => {
    const store = useGeminiAccountStore.getState();
    store.addAccount({ label: 'A1', email: '1@gmail.com', flowId: 'f1', preferredModel: 'gemini-2.5-flash' });
    store.addAccount({ label: 'A2', email: '2@gmail.com', flowId: 'f2', preferredModel: 'gemini-2.5-flash' });
    store.addAccount({ label: 'A3', email: '3@gmail.com', flowId: 'f3', preferredModel: 'gemini-2.5-flash' });

    // Set pointer to index 2 (A3)
    useGeminiAccountStore.setState({ currentIndex: 2 });

    const a1Id = useGeminiAccountStore.getState().accounts[0].id;
    // Remove A1 (before currentIndex)
    store.removeAccount(a1Id);

    const remaining = useGeminiAccountStore.getState().accounts;
    expect(remaining).toHaveLength(2);
    expect(remaining.map((a) => a.label)).toEqual(['A2', 'A3']);
    // currentIndex was 2, removal of index 0 shifted it to 1
    expect(useGeminiAccountStore.getState().currentIndex).toBe(1);

    // Remove remaining accounts
    store.removeAccount(remaining[0].id);
    store.removeAccount(remaining[1].id);
    expect(useGeminiAccountStore.getState().accounts).toHaveLength(0);
    expect(useGeminiAccountStore.getState().currentIndex).toBe(0);
  });

  it('manually sets active account by ID', () => {
    const store = useGeminiAccountStore.getState();
    store.addAccount({ label: 'A1', email: '1@gmail.com', flowId: 'f1', preferredModel: 'gemini-2.5-flash' });
    store.addAccount({ label: 'A2', email: '2@gmail.com', flowId: 'f2', preferredModel: 'gemini-2.5-flash' });

    const a2Id = useGeminiAccountStore.getState().accounts[1].id;
    store.setActiveAccount(a2Id);

    expect(useGeminiAccountStore.getState().currentIndex).toBe(1);
    expect(store.activeAccount()?.label).toBe('A2');
  });

  it('toggles rotatePerSession mode', () => {
    const store = useGeminiAccountStore.getState();
    expect(store.rotatePerSession).toBe(true);
    store.setRotatePerSession(false);
    expect(useGeminiAccountStore.getState().rotatePerSession).toBe(false);
  });
});
