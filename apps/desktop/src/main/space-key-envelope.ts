import * as crypto from 'node:crypto';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

type SpaceKeyEnvelope = {
  version: 1;
  salt: string;
  nonce: string;
  ciphertext: string;
  tag: string;
};

const keySize = 32;
const saltSize = 16;
const nonceSize = 12;
const tagSize = 16;

// The repository types target Node 22. Only runtimes exposing native Argon2
// can open these envelopes. Older runtimes must fail closed.
type Argon2 = (
  algorithm: 'argon2id',
  options: {
    message: Uint8Array;
    secret: Uint8Array;
    nonce: Buffer;
    memory: number;
    passes: number;
    parallelism: number;
    tagLength: number;
  },
  callback: (error: Error | null, key: Buffer) => void
) => void;

function deriveWrappingKey(password: Uint8Array, deviceSecret: Uint8Array, salt: Buffer): Promise<Buffer> {
  if (!password.length || password.length > 4096 || deviceSecret.length !== keySize) {
    throw new TypeError('Invalid space unlock material');
  }
  const { argon2 } = crypto as typeof crypto & { argon2?: Argon2 };
  if (typeof argon2 !== 'function') throw new Error('Native Argon2id is unavailable');
  return new Promise((resolve, reject) => {
    argon2('argon2id', {
      message: password,
      secret: deviceSecret,
      nonce: salt,
      memory: 64 * 1024,
      passes: 3,
      parallelism: 4,
      tagLength: keySize
    }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function context(spaceId: string): Buffer {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(spaceId)) throw new TypeError('Invalid space ID');
  return Buffer.from(`Lastbrowser space key envelope v1\0${spaceId}`);
}

function decode(value: unknown, size: number): Buffer | null {
  if (typeof value !== 'string' || value.length !== Math.ceil(size / 3) * 4) return null;
  const bytes = Buffer.from(value, 'base64');
  return bytes.length === size && bytes.toString('base64') === value ? bytes : null;
}

export function deriveTpmNvReadAuthorization(password: Uint8Array, publicSalt: string): Promise<Buffer> {
  const salt = decode(publicSalt, saltSize);
  if (!salt) throw new TypeError('Invalid TPM authorization salt');
  // Separate this password-derived value from the device-bound envelope key.
  const domain = createHash('sha256').update('Lastbrowser TPM NV read authorization v1').digest();
  return deriveWrappingKey(password, domain, salt);
}

export async function wrapSpaceKey(
  key: Uint8Array, password: Uint8Array, deviceSecret: Uint8Array, spaceId: string
): Promise<SpaceKeyEnvelope> {
  if (key.length !== keySize) throw new TypeError('Invalid space key');
  const aad = context(spaceId);
  const salt = randomBytes(saltSize);
  const nonce = randomBytes(nonceSize);
  const wrappingKey = await deriveWrappingKey(password, deviceSecret, salt);
  try {
    const cipher = createCipheriv('aes-256-gcm', wrappingKey, nonce, { authTagLength: tagSize });
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(key), cipher.final()]);
    return {
      version: 1,
      salt: salt.toString('base64'),
      nonce: nonce.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      tag: cipher.getAuthTag().toString('base64')
    };
  } finally {
    wrappingKey.fill(0);
  }
}

export async function unwrapSpaceKey(
  envelope: unknown, password: Uint8Array, deviceSecret: Uint8Array, spaceId: string
): Promise<Buffer | null> {
  if (!envelope || typeof envelope !== 'object') return null;
  const fields = envelope as Partial<SpaceKeyEnvelope>;
  if (fields.version !== 1) return null;
  const salt = decode(fields.salt, saltSize);
  const nonce = decode(fields.nonce, nonceSize);
  const ciphertext = decode(fields.ciphertext, keySize);
  const tag = decode(fields.tag, tagSize);
  if (!salt || !nonce || !ciphertext || !tag) return null;
  const aad = context(spaceId);
  const wrappingKey = await deriveWrappingKey(password, deviceSecret, salt);
  try {
    const decipher = createDecipheriv('aes-256-gcm', wrappingKey, nonce, { authTagLength: tagSize });
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    const key = decipher.update(ciphertext);
    try {
      decipher.final();
      return key;
    } catch {
      key.fill(0);
      return null;
    }
  } finally {
    wrappingKey.fill(0);
  }
}
