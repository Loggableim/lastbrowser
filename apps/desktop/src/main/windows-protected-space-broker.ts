import { realpathSync } from 'node:fs';
import path from 'node:path';
import { createSpaceUnlock } from './space-emergency-unlock.js';
import { unwrapSpaceKey } from './space-key-envelope.js';
import { runProtectedSpaceProcess } from './protected-space-process.js';
import { mountWindowsSpaceVault } from './windows-space-vault.js';
import { createWindowsSpaceKeyProvider, createWindowsTpmNvSecretProvider, type TpmNvSlot } from './windows-space-key-provider.js';

type VaultSelection = {
  id: string;
  envelope: unknown;
  vaultDirectory: string;
};

type BrokerOptions = {
  primary: VaultSelection & { nvSlot: TpmNvSlot };
  decoy: VaultSelection & { wrappedPlatformSecret: string };
  helper: string;
  drive: string;
  executable: string;
  browserArgs: readonly string[];
  powershell: string;
  platformKeyHelper: string;
  nvKeyHelper: string;
  lockPrimary: () => Promise<void>;
  onMounted?: () => void;
};

/**
 * Compose unlock, authenticated volume mount and isolated browser startup.
 * The broker must outlive the browser and own the drive for the full session.
 */
export function createWindowsProtectedSpaceBroker(options: BrokerOptions) {
  const { primary, decoy, helper, drive, executable, browserArgs, powershell, platformKeyHelper, nvKeyHelper, lockPrimary } = options;
  if (process.platform !== 'win32') throw new Error('The protected browser broker requires Windows');
  const primaryVault = realpathSync(primary.vaultDirectory);
  const decoyVault = realpathSync(decoy.vaultDirectory);
  function isSeparate(relative: string) {
    return path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`);
  }
  if (!isSeparate(path.relative(primaryVault, decoyVault)) || !isSeparate(path.relative(decoyVault, primaryVault))) {
    throw new Error('The primary and decoy vaults must have separate backing directories');
  }
  const primaryProvider = createWindowsTpmNvSecretProvider(nvKeyHelper, primary.nvSlot);
  const decoyProvider = createWindowsSpaceKeyProvider(powershell, platformKeyHelper,
    new Map([[decoy.id, decoy.wrappedPlatformSecret]]));
  return createSpaceUnlock({
    primary,
    decoy,
    provider: {
      readSecret: (id, password) => id === primary.id ? primaryProvider.readSecret(password) : decoyProvider.readSecret(id),
      async revoke(id) {
        if (id !== primary.id) throw new Error('Only the primary vault can be revoked here');
        await primaryProvider.revoke();
      }
    },
    unwrapSpaceKey,
    lockPrimary,
    async openSpace(id, key) {
      const vaultDirectory = id === primary.id ? primaryVault : decoyVault;
      const exit = await runProtectedSpaceProcess(executable, browserArgs, async () => {
        try {
          return await mountWindowsSpaceVault({ helper, drive, vaultDirectory, vaultId: id, key });
        } finally {
          key.fill(0);
        }
      }, options.onMounted);
      if (exit !== 0) throw new Error('The protected browser stopped unexpectedly');
    }
  });
}
