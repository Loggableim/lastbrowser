import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

// Extracted from the official Windows x64 baseline v2.4.2 archive whose
// release SHA-256 was independently verified. Update only with provenance.
export const windowsOpenCodeSha256 = 'b4b4cbf6270d5bfaac54c08933a3a7c6068f9288bdc20cbe435f7621d7d0eda6';

export async function verifyOpenCodeBinary(file, expected = windowsOpenCodeSha256) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest('hex') !== expected.toLowerCase()) {
    throw new Error('OpenCode binary SHA-256 does not match the verified Windows release.');
  }
}

export async function verifyOptionalOpenCodeBinary(file, expected = windowsOpenCodeSha256) {
  try {
    await verifyOpenCodeBinary(file, expected);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}
