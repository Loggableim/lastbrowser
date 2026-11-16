import { existsSync } from 'node:fs';
import { lstat, mkdir, open, readFile, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { findWindowsProtectedPair, protectedSpaceStore } from './active-space-config.js';
import { computeAgentExecutionPartition } from './agent-execution-partition.js';
import { prepareWindowsSpacePair } from './windows-space-setup.js';
import { adoptWindowsSpacePair } from './windows-space-adoption.js';
import { readInheritedWindowsSpaceMigrationRequest, waitForPreviousBrowserExit } from './windows-space-migration-request.js';

export async function runOfflineWindowsSpaceMigration(options:
  Omit<Parameters<typeof prepareWindowsSpacePair>[0], 'bindings' | 'rendererSeeds' | 'protectedRoot' |
    'primarySpaceId' | 'decoySpaceId' | 'primaryPassword' | 'emergencyPassword'> & {
    browserExecutable: string; browserArgs: readonly string[]; parentPid?: number; onReserved?: () => Promise<void>;
  }) {
  const { parentPid, browserExecutable, drive } = options;
  if (process.platform !== 'win32' || !path.isAbsolute(browserExecutable)
    || (parentPid !== undefined && parentPid !== process.ppid)
    || !/^[D-Z]:\\$/i.test(drive) || existsSync(drive)) throw new Error('Invalid Windows migration parameters');
  const legacyUserData = await realpath(options.legacyUserData);
  const protectedRoot = protectedSpaceStore(legacyUserData);
  const lockPath = path.join(legacyUserData, '.protected-space-setup.lock');
  const request = await readInheritedWindowsSpaceMigrationRequest();
  let lock;
  try {
    if (await findWindowsProtectedPair(legacyUserData)) throw new Error('A protected Space pair is already installed');
    lock = await open(lockPath, 'wx', 0o600);
    await options.onReserved?.();
    if (parentPid !== undefined) await waitForPreviousBrowserExit(parentPid);
    const bindings = await readOfflineBindings(legacyUserData);
    await mkdir(protectedRoot, { recursive: true });
    if (!(await lstat(protectedRoot)).isDirectory() || path.relative(protectedRoot, await realpath(protectedRoot))) {
      throw new Error('The protected Space store is redirected');
    }
    const migration = {
      ...options, legacyUserData, protectedRoot, bindings, ...request.proposal,
      primaryPassword: request.primaryPassword, emergencyPassword: request.emergencyPassword
    };
    const prepared = await prepareWindowsSpacePair(migration);
    return await adoptWindowsSpacePair({ ...migration, preparedDirectory: path.dirname(prepared) });
  } finally {
    request.clearPasswords();
    if (lock) {
      await lock.close();
      await unlink(lockPath);
    }
  }
}

async function readOfflineBindings(profile: string) {
  const file = path.join(profile, 'independent-browser-bindings.json');
  const stat = await lstat(file);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > 4 * 1024 * 1024) throw new Error('Invalid legacy binding file');
  const document = JSON.parse(await readFile(file, 'utf8'));
  if (document?.schemaVersion !== 1 || !Array.isArray(document.bindings)) throw new Error('Invalid legacy Space bindings');
  return document.bindings.map((binding: {
    scope?: { spaceId?: unknown; browserProfileId?: unknown; backendProfileId?: unknown };
    backendProfileName?: unknown;
    partitionKey?: unknown;
  }) => {
    const { spaceId, browserProfileId, backendProfileId } = binding?.scope ?? {};
    const { backendProfileName, partitionKey } = binding ?? {};
    if (typeof spaceId !== 'string' || typeof browserProfileId !== 'string' || typeof backendProfileId !== 'string'
      || typeof backendProfileName !== 'string' || typeof partitionKey !== 'string') {
      throw new Error('Invalid legacy Space binding');
    }
    return {
      spaceId, browserProfileId, backendProfileId, backendProfileName, partitionKey,
      agentPartitionKey: computeAgentExecutionPartition({ spaceId, browserProfileId, backendProfileId })
    };
  });
}
