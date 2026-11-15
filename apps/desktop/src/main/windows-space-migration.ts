import { timingSafeEqual } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { stageSpaceProfile } from './space-directory-migration.js';
import { resolveSpaceMigrationLayout } from './space-migration-layout.js';
import { mountWindowsSpaceVault } from './windows-space-vault.js';
import { loadProtectedRendererSeed, writeProtectedRendererSeed } from './protected-renderer-seed.js';
import { readSpaceAccountMigration, readSpaceBindingMigration, stageProtectedSpaceAccounts, stageProtectedSpaceBinding } from './space-binding-migration.js';
import { readWindowsChromiumKeys, stageWindowsChromiumKeys } from './windows-space-chromium-keys.js';

type MigrationVault = { vaultId: string; vaultDirectory: string; key: Buffer };

/**
 * Stage both existing Spaces on their already provisioned volumes while the
 * caller holds the migration lock and all writers are stopped.
 */
export async function stageWindowsSpacePair(options: {
  legacyUserData: string;
  bindings: Parameters<typeof resolveSpaceMigrationLayout>[1];
  primarySpaceId: string;
  decoySpaceId: string;
  primary: MigrationVault;
  decoy: MigrationVault;
  helper: string;
  drive: string;
  rendererSeeds: { primary: Readonly<Record<string, string>>; decoy: Readonly<Record<string, string>> };
}): Promise<void> {
  const { legacyUserData, bindings, primarySpaceId, decoySpaceId, primary, decoy, helper, drive } = options;
  const layout = resolveSpaceMigrationLayout(legacyUserData, bindings, primarySpaceId, decoySpaceId);
  if (primary.vaultId === decoy.vaultId || primary.key.length !== 32 || decoy.key.length !== 32
    || timingSafeEqual(primary.key, decoy.key)) {
    throw new Error('The primary and decoy require different vault identities and keys');
  }

  const [primaryDir, decoyDir] = await Promise.all([realpath(primary.vaultDirectory), realpath(decoy.vaultDirectory)]);
  function overlaps(a: string, b: string) {
    const relative = path.relative(a, b);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  }
  if (overlaps(primaryDir, decoyDir) || overlaps(decoyDir, primaryDir)) {
    throw new Error('The migration vaults must have separate backing directories');
  }
  const scopedBindings = await readSpaceBindingMigration(legacyUserData, bindings, primarySpaceId, decoySpaceId);
  const accounts = await readSpaceAccountMigration(legacyUserData, bindings, primarySpaceId, decoySpaceId);
  const chromiumKeys = await readWindowsChromiumKeys(legacyUserData);

  for (const [vault, vaultDirectory, stores, seed, binding, account] of [
    [primary, primaryDir, layout.primary, options.rendererSeeds.primary, scopedBindings.primary, accounts?.primary],
    [decoy, decoyDir, layout.decoy, options.rendererSeeds.decoy, scopedBindings.decoy, accounts?.decoy]
  ] as const) {
    const mounted = await mountWindowsSpaceVault({
      ...vault, vaultDirectory, helper, drive, preparingProfile: true
    });
    try {
      const profile = await stageSpaceProfile(legacyUserData, mounted.root, Object.values(stores));
      await stageProtectedSpaceBinding(profile, binding);
      await stageProtectedSpaceAccounts(profile, account);
      await stageWindowsChromiumKeys(profile, chromiumKeys);
      const previous = await loadProtectedRendererSeed(profile);
      if (!previous) {
        await writeProtectedRendererSeed(profile, seed);
      } else if (Object.keys(previous).length !== Object.keys(seed).length
        || Object.entries(previous).some(([key, value]) => seed[key] !== value)) {
        throw new Error('The protected renderer export changed after staging');
      }
    } finally {
      await mounted.close();
    }
  }
}
