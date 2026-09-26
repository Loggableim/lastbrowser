import { describe, expect, it, vi } from 'vitest';
import { clearDeletedProfilePartitions, profileSpacePartitions } from '../src/main/profile-partition-cleanup.js';
import { computeSpacePartition } from '../src/renderer/tab-sessions.js';

describe('deleted profile session cleanup', () => {
  it('clears only the deleted profile home and per-Space partitions', async () => {
    const sessions = new Map<string, { clearStorageData: ReturnType<typeof vi.fn>; clearCache: ReturnType<typeof vi.fn>; clearAuthCache: ReturnType<typeof vi.fn> }>();
    const fromPartition = vi.fn((partition: string) => {
      const mock = {
        clearStorageData: vi.fn(async () => undefined),
        clearCache: vi.fn(async () => undefined),
        clearAuthCache: vi.fn(async () => undefined)
      };
      sessions.set(partition, mock);
      return mock;
    });

    const result = await clearDeletedProfilePartitions('profile-work', ['work', 'personal', 'work'], fromPartition);

    expect(result).toEqual({ ok: true, cleared: 3 });
    expect([...sessions.keys()]).toEqual([
      'persist:space_work_profile-work',
      'persist:space_personal_profile-work',
      'persist:space_home_profile-work'
    ]);
    expect(fromPartition.mock.calls.every(([partition]) => partition.endsWith('_profile-work'))).toBe(true);
    for (const target of sessions.values()) {
      expect(target.clearStorageData).toHaveBeenCalledOnce();
      expect(target.clearCache).toHaveBeenCalledOnce();
      expect(target.clearAuthCache).toHaveBeenCalledOnce();
    }
  });

  it('matches renderer partition naming for colliding and unicode Space paths', () => {
    const paths = ['Team/One', 'Team:One', '東京'];
    const generated = profileSpacePartitions('profile-42', paths);
    const rendererExpected = [...new Set([...paths, 'home'].map((path) => computeSpacePartition('profile-42', path, false, [...paths, 'home'])))];
    expect(generated).toEqual(rendererExpected);
  });

  it('refuses to clear the default profile before opening any session', async () => {
    const fromPartition = vi.fn();
    const result = await clearDeletedProfilePartitions('default', ['home'], fromPartition);
    expect(result.ok).toBe(false);
    expect(result.cleared).toBe(0);
    expect(fromPartition).not.toHaveBeenCalled();
  });

  it('continues clearing remaining own partitions after one session fails', async () => {
    const touched: string[] = [];
    const result = await clearDeletedProfilePartitions('work', ['home', 'other'], (partition) => {
      touched.push(partition);
      if (partition.includes('_other_')) throw new Error('test failure');
      return {
        clearStorageData: vi.fn(async () => undefined),
        clearCache: vi.fn(async () => undefined),
        clearAuthCache: vi.fn(async () => undefined)
      };
    });

    expect(touched).toHaveLength(2);
    expect(touched.every((partition) => partition.endsWith('_work'))).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.cleared).toBe(1);
    expect(result.error).toContain('1 profile partition');
  });
});
