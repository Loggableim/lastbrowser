import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdtemp, open, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { wrapSpaceKey } from './space-key-envelope.js';
import { resolveSpaceMigrationLayout } from './space-migration-layout.js';
import { createWindowsSpaceKeyProvider, createWindowsTpmNvSecretProvider, provisionWindowsTpmNvSlot, type TpmNvSlot } from './windows-space-key-provider.js';
import { stageWindowsSpacePair } from './windows-space-migration.js';
import { initializeWindowsSpaceVault } from './windows-space-vault-initializer.js';

type SetupOptions = Omit<Parameters<typeof stageWindowsSpacePair>[0], 'primary' | 'decoy'> & {
  protectedRoot: string;
  nvKeyHelper: string;
  primaryPassword: Uint8Array;
  emergencyPassword: Uint8Array;
};

/** Prepare both vaults while the trusted caller holds the offline migration lock. */
export async function prepareWindowsSpacePair(options: SetupOptions): Promise<string> {
  const { protectedRoot, nvKeyHelper, primaryPassword, emergencyPassword } = options;
  if (process.platform !== 'win32' || !path.isAbsolute(protectedRoot)) throw new Error('The Windows protected store is unavailable');
  if (![primaryPassword, emergencyPassword].every(password => password.length > 0 && password.length <= 4096)
    || (primaryPassword.length === emergencyPassword.length && timingSafeEqual(primaryPassword, emergencyPassword))) {
    throw new Error('The primary and emergency passwords must be distinct');
  }
  resolveSpaceMigrationLayout(options.legacyUserData, options.bindings, options.primarySpaceId, options.decoySpaceId);
  const wrapped = new Map<string, string>();
  const provider = createWindowsSpaceKeyProvider(nvKeyHelper, wrapped);
  const directory = await mkdtemp(path.join(await realpath(protectedRoot), 'space-pair-'));
  const keys = [randomBytes(32), randomBytes(32)];
  let primaryProvider: ReturnType<typeof createWindowsTpmNvSecretProvider> | undefined;

  async function prepareVault(key: Buffer, password: Uint8Array, primarySlot?: TpmNvSlot) {
    const id = randomUUID();
    const vaultDirectory = path.join(directory, id);
    let binding: { nvSlot: TpmNvSlot } | { wrappedPlatformSecret: string };
    let secret: Buffer | null;
    if (primarySlot) {
      binding = { nvSlot: primarySlot };
      primaryProvider = createWindowsTpmNvSecretProvider(options.nvKeyHelper, primarySlot);
      secret = await primaryProvider.readSecret(password);
    } else {
      const wrappedPlatformSecret = await provider.create(id);
      wrapped.set(id, wrappedPlatformSecret);
      binding = { wrappedPlatformSecret };
      secret = await provider.readSecret(id);
    }
    if (!secret) throw new Error('The newly created platform key could not be found');
    try {
      const envelope = await wrapSpaceKey(key, password, secret, id);
      await initializeWindowsSpaceVault({ ...options, vaultDirectory, vaultId: id, key });
      return { id, vaultDirectory, ...binding, envelope };
    } finally {
      secret.fill(0);
    }
  }

  try {
    const primarySlot = await provisionWindowsTpmNvSlot(options.nvKeyHelper, primaryPassword);
    const primary = await prepareVault(keys[0], primaryPassword, primarySlot);
    const decoy = await prepareVault(keys[1], emergencyPassword);
    await stageWindowsSpacePair({
      ...options,
      primary: { ...primary, vaultId: primary.id, key: keys[0] },
      decoy: { ...decoy, vaultId: decoy.id, key: keys[1] }
    });
    // A prepared pair still has legacy plaintext. It is not a login config.
    const receipt = path.join(directory, 'prepared-vaults.json');
    const pending = path.join(directory, '.prepared-vaults.tmp');
    const file = await open(pending, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify({
        version: 3, state: 'prepared',
        selection: [options.primarySpaceId, options.decoySpaceId],
        primary, decoy
      }));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(pending, receipt);
    return receipt;
  } catch (error) {
    const cleanup = [...wrapped.keys()].map(id => provider.revoke(id));
    if (primaryProvider) cleanup.push(primaryProvider.revoke());
    const statuses = await Promise.allSettled(cleanup);
    if (statuses.some(status => status.status === 'rejected')) {
      throw new Error('Space setup failed and a platform key needs cleanup', { cause: error });
    }
    await rm(directory, { recursive: true, force: true });
    throw error;
  } finally {
    keys.forEach(key => key.fill(0));
  }
}
