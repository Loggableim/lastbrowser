import { randomBytes } from 'node:crypto';
import { lstat, open, unlink } from 'node:fs/promises';
import path from 'node:path';

/** Local key files are intentionally inside the backup boundary. */
export function createLocalSpaceKeyProvider(root: string) {
  if (!path.isAbsolute(root)) throw new Error('Invalid local Space key root');
  function keyFile(id: string) {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)) throw new Error('Invalid protected vault identity');
    return path.join(root, `space-key-${id}.bin`);
  }
  async function check(file: string) {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.nlink !== 1 || stat.size !== 32) throw new Error('Invalid local Space key file');
  }
  return {
    async create(id: string) {
      const file = await open(keyFile(id), 'wx', 0o600);
      const key = randomBytes(32);
      try {
        await file.writeFile(key);
        await file.sync();
        return Buffer.from(key);
      } finally {
        key.fill(0);
        await file.close();
      }
    },
    async readSecret(id: string) {
      const file = keyFile(id);
      let secret: Buffer | undefined;
      try {
        await check(file);
        const handle = await open(file, 'r');
        try {
          const stat = await handle.stat();
          if (!stat.isFile() || stat.nlink !== 1 || stat.size !== 32) throw new Error('Invalid local Space key file');
          secret = Buffer.alloc(33);
          const { bytesRead } = await handle.read(secret, 0, secret.length, 0);
          if (bytesRead !== 32) throw new Error('Invalid local Space key file');
          return Buffer.from(secret.subarray(0, 32));
        } finally {
          await handle.close();
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      } finally {
        secret?.fill(0);
      }
    },
    async revoke(id: string) {
      const file = keyFile(id);
      try {
        await check(file);
        await unlink(file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  };
}
