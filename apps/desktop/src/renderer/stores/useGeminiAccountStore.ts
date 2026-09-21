/**
 * Phase 12 – Multi-Account Gemini OAuth Manager (Round-Robin)
 *
 * Manages multiple Google OAuth accounts for the `google-gemini-cli` provider.
 * Implements round-robin rotation so token consumption is evenly distributed
 * across all connected accounts.
 *
 * Design notes:
 * - Credentials are stored in the Sidekick backend after OAuth completion.
 * - We store metadata (email, label, timestamp) safely in localStorage.
 * - The `currentIndex` persists across page reloads.
 */

import { create } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GeminiOAuthAccount = {
  /** Unique local ID (UUID). */
  id: string;
  /** User-chosen nickname, e.g. "Privat", "Arbeit". */
  label: string;
  /** Google account email returned after OAuth success. */
  email: string;
  /** The OAuth flow_id returned by the backend – used to re-activate. */
  flowId: string;
  /** Preferred model for this account. */
  preferredModel: string;
  /** ISO timestamp of when the account was added. */
  addedAt: number;
  /** Total number of chat sessions sent through this account. */
  totalSessionsUsed: number;
  /** ISO timestamp of last use. */
  lastUsedAt?: number;
};

export type GeminiAccountState = {
  /** All connected Google OAuth accounts. */
  accounts: GeminiOAuthAccount[];
  /** Round-robin pointer (0-based index into `accounts`). */
  currentIndex: number;
  /** Whether round-robin rotation is enabled. */
  roundRobinEnabled: boolean;
  /** Whether to rotate on every new session (true) or every new message (false). */
  rotatePerSession: boolean;

  // ─── Actions ─────────────────────────────────────────────────────────────

  /** Add a completed OAuth account to the list. */
  addAccount(account: Omit<GeminiOAuthAccount, 'id' | 'addedAt' | 'totalSessionsUsed'>): void;

  /** Remove an account by ID. Safely adjusts currentIndex. */
  removeAccount(id: string): void;

  /** Update the label for an account. */
  renameAccount(id: string, label: string): void;

  /**
   * Return the account to use for the next request, advance the pointer.
   * Returns null when no accounts are configured or round-robin is disabled.
   */
  getNextAccount(): GeminiOAuthAccount | null;

  /**
   * Return the currently active account without advancing the pointer.
   */
  activeAccount(): GeminiOAuthAccount | null;

  /** Record a session being sent through the given account. */
  recordUsage(id: string): void;

  /** Enable / disable round-robin rotation. */
  setRoundRobinEnabled(enabled: boolean): void;

  /** Switch per-session vs per-message rotation mode. */
  setRotatePerSession(perSession: boolean): void;

  /** Manually switch to a specific account by ID. */
  setActiveAccount(id: string): void;
};

// ─── Local Storage Persistence ────────────────────────────────────────────────

const STORAGE_KEY = 'lastbrowser.geminiAccounts.v1';

interface StoredData {
  accounts: GeminiOAuthAccount[];
  currentIndex: number;
  roundRobinEnabled: boolean;
  rotatePerSession: boolean;
}

function loadInitialData(): StoredData {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { accounts: [], currentIndex: 0, roundRobinEnabled: true, rotatePerSession: true };
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { accounts: [], currentIndex: 0, roundRobinEnabled: true, rotatePerSession: true };
    }
    const parsed = JSON.parse(raw);
    return {
      accounts: Array.isArray(parsed.accounts) ? parsed.accounts : [],
      currentIndex: typeof parsed.currentIndex === 'number' ? parsed.currentIndex : 0,
      roundRobinEnabled: typeof parsed.roundRobinEnabled === 'boolean' ? parsed.roundRobinEnabled : true,
      rotatePerSession: typeof parsed.rotatePerSession === 'boolean' ? parsed.rotatePerSession : true
    };
  } catch {
    return { accounts: [], currentIndex: 0, roundRobinEnabled: true, rotatePerSession: true };
  }
}

function saveToStorage(data: Partial<StoredData>): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const current = loadInitialData();
    const merged = { ...current, ...data };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Ignore storage write errors
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

const initial = loadInitialData();

export const useGeminiAccountStore = create<GeminiAccountState>((set, get) => ({
  accounts: initial.accounts,
  currentIndex: initial.currentIndex,
  roundRobinEnabled: initial.roundRobinEnabled,
  rotatePerSession: initial.rotatePerSession,

  addAccount(account) {
    const newAccount: GeminiOAuthAccount = {
      ...account,
      id: crypto.randomUUID(),
      addedAt: Date.now(),
      totalSessionsUsed: 0
    };
    set((state) => {
      const next = [...state.accounts, newAccount];
      saveToStorage({ accounts: next });
      return { accounts: next };
    });
  },

  removeAccount(id) {
    set((state) => {
      const idx = state.accounts.findIndex((a) => a.id === id);
      if (idx === -1) return state;
      const next = state.accounts.filter((a) => a.id !== id);
      let nextIndex = state.currentIndex;
      if (state.currentIndex > idx) {
        nextIndex -= 1;
      }
      if (next.length === 0 || nextIndex >= next.length) {
        nextIndex = 0;
      }
      saveToStorage({ accounts: next, currentIndex: nextIndex });
      return { accounts: next, currentIndex: nextIndex };
    });
  },

  renameAccount(id, label) {
    set((state) => {
      const next = state.accounts.map((a) => a.id === id ? { ...a, label } : a);
      saveToStorage({ accounts: next });
      return { accounts: next };
    });
  },

  getNextAccount() {
    const { accounts, currentIndex, roundRobinEnabled } = get();
    if (accounts.length === 0) return null;
    if (!roundRobinEnabled) return accounts[currentIndex] ?? accounts[0] ?? null;
    const account = accounts[currentIndex % accounts.length];
    if (!account) return null;
    const nextIdx = (currentIndex + 1) % accounts.length;
    set({ currentIndex: nextIdx });
    saveToStorage({ currentIndex: nextIdx });
    return account;
  },

  activeAccount() {
    const { accounts, currentIndex } = get();
    if (accounts.length === 0) return null;
    return accounts[currentIndex % accounts.length] ?? null;
  },

  recordUsage(id) {
    set((state) => {
      const next = state.accounts.map((a) =>
        a.id === id
          ? { ...a, totalSessionsUsed: a.totalSessionsUsed + 1, lastUsedAt: Date.now() }
          : a
      );
      saveToStorage({ accounts: next });
      return { accounts: next };
    });
  },

  setRoundRobinEnabled(enabled) {
    set({ roundRobinEnabled: enabled });
    saveToStorage({ roundRobinEnabled: enabled });
  },

  setRotatePerSession(perSession) {
    set({ rotatePerSession: perSession });
    saveToStorage({ rotatePerSession: perSession });
  },

  setActiveAccount(id) {
    const { accounts } = get();
    const idx = accounts.findIndex((a) => a.id === id);
    if (idx !== -1) {
      set({ currentIndex: idx });
      saveToStorage({ currentIndex: idx });
    }
  }
}));

// ─── Pure helpers (testable without Zustand) ──────────────────────────────────

/**
 * Compute the next round-robin index.
 * Pure function; useful in tests without the Zustand store.
 */
export function nextRoundRobinIndex(current: number, total: number): number {
  if (total === 0) return 0;
  return (current + 1) % total;
}

/**
 * Summarise usage as a compact label.
 * e.g. "42 sessions · last used 3h ago"
 */
export function accountUsageSummary(account: GeminiOAuthAccount): string {
  const sessions = account.totalSessionsUsed;
  const sessionsLabel = sessions === 1 ? '1 session' : `${sessions} sessions`;
  if (!account.lastUsedAt) return sessionsLabel;
  const ageMs = Date.now() - account.lastUsedAt;
  const ageMin = Math.round(ageMs / 60_000);
  const ageHours = Math.round(ageMs / 3_600_000);
  const ageDays = Math.round(ageMs / 86_400_000);
  let ago: string;
  if (ageMin < 2) ago = 'just now';
  else if (ageMin < 60) ago = `${ageMin}m ago`;
  else if (ageHours < 24) ago = `${ageHours}h ago`;
  else ago = `${ageDays}d ago`;
  return `${sessionsLabel} · last used ${ago}`;
}
