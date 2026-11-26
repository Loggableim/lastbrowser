import { realpathSync } from 'node:fs';
import path from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { removeRevokedPrimaryVault, type SpaceKeyConfiguration } from './active-space-config.js';
import { createSpaceUnlock } from './space-emergency-unlock.js';
import { unwrapSpaceKey } from './space-key-envelope.js';
import { runProtectedSpaceProcess } from './protected-space-process.js';
import { mountWindowsSpaceVault, type WindowsVaultRuntime } from './windows-space-vault.js';
import { createWindowsSpaceKeyProvider, createWindowsTpmNvSecretProvider } from './windows-space-key-provider.js';
import { createLocalSpaceKeyProvider } from './local-space-key-provider.js';

type BrokerOptions = WindowsVaultRuntime & SpaceKeyConfiguration & {
  root: string;
  executable: string;
  browserArgs: readonly string[];
  nvKeyHelper: string;
  lockPrimary: () => Promise<void>;
  onMounted?: () => void;
  onBrowserStarted?: (input: Writable, acknowledgements: Readable) => void;
};

/**
 * Compose unlock, authenticated volume mount and isolated browser startup.
 * The broker must outlive the browser and own the drive for the full session.
 */
export function createWindowsProtectedSpaceBroker(options: BrokerOptions) {
  const { root, primary, decoy, executable, browserArgs, nvKeyHelper, lockPrimary } = options;
  if (process.platform !== 'win32') throw new Error('The protected browser broker requires Windows');
  const primaryVault = path.join(realpathSync(root), primary.id);
  const decoyVault = realpathSync(decoy.vaultDirectory);
  if (path.relative(primaryVault, primary.vaultDirectory) || path.relative(decoyVault, path.join(root, decoy.id))
    || !path.relative(primaryVault, decoyVault)) {
    throw new Error('The primary and decoy vaults must have separate backing directories');
  }
  const local = options.protection === 'local' ? createLocalSpaceKeyProvider(root) : undefined;
  const primaryProvider = options.protection === 'tpm' ? createWindowsTpmNvSecretProvider(nvKeyHelper, options.primary.nvSlot) : undefined;
  const decoyProvider = options.protection === 'tpm' ? createWindowsSpaceKeyProvider(nvKeyHelper,
    new Map([[decoy.id, options.decoy.wrappedPlatformSecret]])) : undefined;
  let primaryCleanup: Promise<void> | undefined;
  return createSpaceUnlock({
    primary,
    decoy,
    provider: {
      async readSecret(id, password) {
        if (local) return local.readSecret(id);
        return (id === primary.id ? primaryProvider?.readSecret(password) : decoyProvider?.readSecret(id)) ?? null;
      },
      async revoke(id) {
        if (id !== primary.id) throw new Error('Only the primary vault can be revoked here');
        if (local) await local.revoke(id);
        else if (primaryProvider) await primaryProvider.revoke();
        else throw new Error('The primary key provider is unavailable');
        // Retry residual file cleanup on later decoy logins.
        primaryCleanup = removeRevokedPrimaryVault(root, primary.id).catch(() => {});
      }
    },
    unwrapSpaceKey,
    lockPrimary,
    async openSpace(id, key) {
      const vaultDirectory = id === primary.id ? primaryVault : decoyVault;
      try {
        const exit = await runProtectedSpaceProcess(executable, browserArgs, async () => {
          try {
            return await mountWindowsSpaceVault({ ...options, vaultDirectory, vaultId: id, key });
          } finally {
            key.fill(0);
          }
        }, options.onMounted, options.onBrowserStarted);
        if (exit !== 0) throw new Error('The protected browser stopped unexpectedly');
      } finally {
        if (id === decoy.id) await primaryCleanup;
      }
    }
  });
}
