type ConfiguredSpace = { id: string; envelope: unknown };

type SpaceUnlockDependencies = {
  primary: ConfiguredSpace;
  decoy: ConfiguredSpace;
  provider: {
    // Returns a caller-owned copy. Null means the key cannot be read with this password.
    readSecret(id: string, password: Uint8Array): Promise<Buffer | null>;
    // Resolves only after the hardware acknowledges irrevocable deletion.
    revoke(id: string): Promise<void>;
  };
  unwrapSpaceKey(envelope: unknown, password: Uint8Array, secret: Buffer, id: string): Promise<Buffer | null>;
  lockPrimary(): Promise<void>;
  // Must finish using the buffer or copy it before resolving.
  openSpace(id: string, key: Buffer): Promise<void>;
};

/** Own exactly one instance per configured vault pair in the trusted broker. */
export function createSpaceUnlock({
  primary, decoy, provider, unwrapSpaceKey, lockPrimary, openSpace
}: SpaceUnlockDependencies): (password: Uint8Array) => Promise<boolean> {
  if (primary.id === decoy.id) throw new TypeError('The primary and decoy spaces must differ');
  let currentAttempt = false;

  async function unlock(space: ConfiguredSpace, password: Uint8Array): Promise<Buffer | null> {
    const secret = await provider.readSecret(space.id, password);
    if (!secret) return null;
    try {
      return await unwrapSpaceKey(space.envelope, password, secret, space.id);
    } finally {
      secret.fill(0);
    }
  }

  return async password => {
    if (currentAttempt || !password.length || password.length > 4096) return false;
    currentAttempt = true;
    let primaryKey: Buffer | null = null;
    let decoyKey: Buffer | null = null;
    try {
      decoyKey = await unlock(decoy, password);
      if (decoyKey) {
        await lockPrimary();
        // The hardware change is the commit point. Restoring an older app
        // envelope must never recreate the corresponding hardware secret.
        await provider.revoke(primary.id);
        await openSpace(decoy.id, decoyKey);
        return true;
      }
      primaryKey = await unlock(primary, password);
      if (!primaryKey) return false;
      await openSpace(primary.id, primaryKey);
      return true;
    } finally {
      primaryKey?.fill(0);
      decoyKey?.fill(0);
      currentAttempt = false;
    }
  };
}
