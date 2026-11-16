import { createHmac, randomUUID } from 'node:crypto';
import { lstat, open, readFile, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { unwrapSpaceKey } from './space-key-envelope.js';
import { retireMigratedSpaceStores } from './space-legacy-retirement.js';
import { resolveSpaceMigrationLayout } from './space-migration-layout.js';
import { createWindowsSpaceKeyProvider, createWindowsTpmNvSecretProvider, isTpmNvSlot, type TpmNvSlot } from './windows-space-key-provider.js';
import { stageWindowsSpacePair } from './windows-space-migration.js';
import { replaceLegacyRendererStore, stageLegacyRendererStore } from './legacy-renderer-db-replacement.js';
import { retireLegacySpaceAccounts, retireLegacySpaceBindings } from './space-binding-migration.js';
import { createRendererStoreWorker } from './renderer-store-worker-client.js';
import type { SpaceProtection } from './active-space-config.js';
import { createLocalSpaceKeyProvider } from './local-space-key-provider.js';

type PreparedVault = { id: string; envelope: unknown };
const vaultIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

/**
 * The offline migration owner calls this after exporting scoped renderer and
 * shared backend data. It must keep legacy writers stopped through adoption.
 */
export async function adoptWindowsSpacePair(options: Omit<Parameters<typeof stageWindowsSpacePair>[0],
  'primary' | 'decoy'> & {
    preparedDirectory: string;
    nvKeyHelper: string;
    primaryPassword: Uint8Array;
    emergencyPassword: Uint8Array;
    protection?: SpaceProtection;
    rendererStore: Pick<Parameters<typeof stageLegacyRendererStore>[0], 'expectedLegacyValues' | 'legacyUpdates'>;
    browserExecutable: string;
    browserArgs: readonly string[];
  }): Promise<string> {
  const { legacyUserData, bindings, primarySpaceId, decoySpaceId, preparedDirectory, protection = 'tpm' } = options;
  if (process.platform !== 'win32' || !path.isAbsolute(preparedDirectory)) {
    throw new Error('Protected Space adoption requires an absolute Windows setup directory');
  }
  const layout = resolveSpaceMigrationLayout(legacyUserData, bindings, primarySpaceId, decoySpaceId);
  const directory = await realpath(preparedDirectory);
  const receipt = path.join(directory, 'prepared-vaults.json');
  const stat = await lstat(receipt);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > 16 * 1024) throw new Error('Invalid prepared Space receipt');
  const prepared = JSON.parse(await readFile(receipt, 'utf8'));
  if (prepared?.version !== 3 || prepared.state !== 'prepared'
    || !Array.isArray(prepared.selection) || prepared.selection.length !== 2
    || prepared.selection[0] !== primarySpaceId || prepared.selection[1] !== decoySpaceId
    || ![prepared.primary, prepared.decoy].every(vault => vault && typeof vault.id === 'string'
      && vaultIdPattern.test(vault.id))
    || (prepared.protection ?? 'tpm') !== protection
    || (protection === 'tpm' && (!isTpmNvSlot(prepared.primary.nvSlot)
      || typeof prepared.decoy.wrappedPlatformSecret !== 'string'))
    || (protection === 'local' && (prepared.primary.nvSlot !== undefined || prepared.decoy.wrappedPlatformSecret !== undefined))
    || prepared.primary.id === prepared.decoy.id) throw new Error('Invalid prepared Space selection');

  const primary: PreparedVault = prepared.primary;
  const decoy: PreparedVault = prepared.decoy;
  const local = protection === 'local' ? createLocalSpaceKeyProvider(directory) : undefined;
  const primaryProvider = protection === 'tpm'
    ? createWindowsTpmNvSecretProvider(options.nvKeyHelper, prepared.primary.nvSlot as TpmNvSlot) : undefined;
  const decoyProvider = protection === 'tpm' ? createWindowsSpaceKeyProvider(options.nvKeyHelper, new Map([
    [decoy.id, prepared.decoy.wrappedPlatformSecret]
  ])) : undefined;
  async function openKey(vault: PreparedVault, password: Uint8Array) {
    const secret = await (local ? local.readSecret(vault.id) : vault.id === primary.id
      ? primaryProvider?.readSecret(password) : decoyProvider?.readSecret(vault.id));
    if (!secret) throw new Error('A prepared Space lost its device key');
    try {
      const key = await unwrapSpaceKey(vault.envelope, password, secret, vault.id);
      if (!key) throw new Error('A prepared Space password did not match');
      return key;
    } finally {
      secret.fill(0);
    }
  }
  const primaryKey = await openKey(primary, options.primaryPassword);
  let decoyKey: Buffer | undefined;
  let journalKey: Buffer | undefined;
  try {
    decoyKey = await openKey(decoy, options.emergencyPassword);
    journalKey = createHmac('sha256', primaryKey).update('Lastbrowser legacy retirement v1').update(decoyKey).digest();
    const primaryVault = { ...primary, vaultDirectory: path.join(directory, primary.id) };
    const decoyVault = { ...decoy, vaultDirectory: path.join(directory, decoy.id) };
    const decoyVolumeKey = decoyKey;
    const rendererWorker = createRendererStoreWorker(options.browserExecutable, options.browserArgs);
    const verifyLegacyRendererStore = await stageLegacyRendererStore({
      ...options.rendererStore, ...rendererWorker, root: legacyUserData, transactionId: primary.id, journalKey
    });
    await retireMigratedSpaceStores({
      root: legacyUserData,
      stores: [...Object.values(layout.primary), ...Object.values(layout.decoy)].map(store => store.source),
      transactionId: primary.id,
      journalKey,
      async verifyCopies() {
        await stageWindowsSpacePair({
          ...options,
          primary: { ...primaryVault, vaultId: primary.id, key: primaryKey },
          decoy: { ...decoyVault, vaultId: decoy.id, key: decoyVolumeKey }
        });
      }
    });
    await replaceLegacyRendererStore({
      root: legacyUserData,
      transactionId: primary.id,
      verify: verifyLegacyRendererStore
    });
    await retireLegacySpaceAccounts(legacyUserData, bindings, primarySpaceId, decoySpaceId);
    await retireLegacySpaceBindings(legacyUserData, bindings, primarySpaceId, decoySpaceId);
    const destination = path.join(directory, 'active-vaults.json');
    const pending = path.join(directory, `.adopting-${randomUUID()}`);
    try {
      const file = await open(pending, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify({ version: 3, state: 'active', protection, primary, decoy }));
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(pending, destination);
    } catch (error) {
      await unlink(pending).catch(() => {});
      throw error;
    }
    await unlink(receipt).catch(() => {});
    return destination;
  } finally {
    primaryKey.fill(0);
    decoyKey?.fill(0);
    journalKey?.fill(0);
  }
}
