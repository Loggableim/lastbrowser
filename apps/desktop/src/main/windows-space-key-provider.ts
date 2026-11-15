import { spawn } from 'node:child_process';
import { randomBytes, randomInt } from 'node:crypto';
import path from 'node:path';
import { deriveTpmNvReadAuthorization } from './space-key-envelope.js';

export type TpmNvSlot = { index: string; salt: string };

export function isTpmNvSlot(value: unknown): value is TpmNvSlot {
  if (!value || typeof value !== 'object') return false;
  const { index, salt } = value as Partial<TpmNvSlot>;
  return typeof index === 'string' && /^0150[0-9a-f]{4}$/.test(index)
    && typeof salt === 'string' && /^[A-Za-z0-9+/]{22}==$/.test(salt) && Object.keys(value).length === 2;
}

async function runKeyHelper(
  executable: string, args: string[], input: string | Buffer, expected: number, emptyResultCode?: number
): Promise<Buffer | null> {
  const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
  const response = Buffer.alloc(expected);
  let length = 0;
  let failed = false;
  let keepResponse = false;
  const deadline = setTimeout(() => { failed = true; child.kill(); }, 15_000);
  try {
    const done = new Promise<number | null>(resolve => {
      child.once('close', resolve);
      child.once('error', () => { failed = true; });
      child.stdin.once('error', () => { failed = true; });
      child.stdout.on('data', (chunk: Buffer) => {
        if (chunk.length > expected - length) {
          failed = true;
          child.kill();
        } else {
          chunk.copy(response, length);
          length += chunk.length;
        }
        chunk.fill(0);
      });
    });
    child.stdin.end(input);
    const code = await done;
    if (!failed && code !== null && code === emptyResultCode && length === 0) return null;
    if (failed || code !== 0 || length !== expected) throw new Error('The Windows platform key operation failed');
    keepResponse = true;
    return response;
  } finally {
    clearTimeout(deadline);
    if (!keepResponse) response.fill(0);
  }
}

export async function provisionWindowsTpmNvSlot(helper: string, password: Uint8Array): Promise<TpmNvSlot> {
  if (process.platform !== 'win32' || !path.isAbsolute(helper)) {
    throw new Error('The Windows TPM NV helper is unavailable');
  }
  const salt = randomBytes(16).toString('base64');
  const authorization = await deriveTpmNvReadAuthorization(password, salt);
  try {
    for (let attempt = 0; attempt < 16; attempt++) {
      const index = (0x01500000 + randomInt(0x10000)).toString(16).padStart(8, '0');
      const result = await runKeyHelper(helper, ['provision-password-bound', index], authorization, 0, 4);
      if (result) return { index, salt };
    }
    throw new Error('No free TPM NV slot was found');
  } finally {
    authorization.fill(0);
  }
}

/** Its executable may service only a provisioned Lastbrowser TPM slot. */
export function createWindowsTpmNvSecretProvider(helper: string, slot: TpmNvSlot) {
  if (process.platform !== 'win32' || !path.isAbsolute(helper) || !isTpmNvSlot(slot)) {
    throw new Error('The TPM NV helper or slot is unavailable');
  }
  return {
    async readSecret(password: Uint8Array) {
      const authorization = await deriveTpmNvReadAuthorization(password, slot.salt);
      try {
        return await runKeyHelper(helper, ['read-password-bound', slot.index], authorization, 32, 3);
      } finally { authorization.fill(0); }
    },
    async revoke(): Promise<void> {
      await runKeyHelper(helper, ['revoke-password-bound', slot.index], '', 0);
    }
  };
}

/** The packaged native helper invokes the Windows platform key provider. */
export function createWindowsSpaceKeyProvider(helper: string, wrappedSecrets: ReadonlyMap<string, string>) {
  if (process.platform !== 'win32' || !path.isAbsolute(helper)) {
    throw new Error('The Windows platform key helper is unavailable');
  }

  async function request(operation: 'create' | 'read' | 'revoke', id: string, expected: number, input: string | Buffer = '') {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) {
      throw new Error('Invalid protected vault identity');
    }
    try {
      return await runKeyHelper(helper, [`platform-${operation}`, id], input, expected, operation !== 'create' ? 3 : undefined);
    } finally { if (Buffer.isBuffer(input)) input.fill(0); }
  }

  return {
    async create(id: string): Promise<string> {
      const wrapped = await request('create', id, 256);
      if (!wrapped) throw new Error('The platform key was not provisioned');
      try { return wrapped.toString('base64'); }
      finally { wrapped.fill(0); }
    },
    readSecret(id: string): Promise<Buffer | null> {
      const wrapped = wrappedSecrets.get(id);
      if (!wrapped || !/^[A-Za-z0-9+/]{342}==$/.test(wrapped)) throw new Error('The wrapped platform secret is invalid');
      return request('read', id, 32, Buffer.from(wrapped, 'base64'));
    },
    async revoke(id: string): Promise<void> {
      await request('revoke', id, 0);
    }
  };
}
