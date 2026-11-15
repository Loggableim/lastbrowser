import { createReadStream } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const headerSize = 12;
const maxPassword = 4096;
const maxProposal = 20 * 1024 * 1024;
const maxFrame = headerSize + maxPassword * 2 + maxProposal;
const spaceId = /^[a-z0-9][a-z0-9_.-]{0,127}$/i;
export const migrationWorkerSwitch = 'lastbrowser-space-migration-worker';

function invalidRequest(): Error {
  return new Error('Invalid protected Space migration request');
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function seed(value: unknown): value is Record<string, string> {
  return record(value) && Object.values(value).every(entry => typeof entry === 'string');
}

function storeChanges(value: unknown): value is Record<string, string | null> {
  return record(value) && Object.values(value).every(entry => entry === null || typeof entry === 'string');
}

function readProposal(data: Buffer) {
  let value: unknown;
  try {
    value = JSON.parse(data.toString('utf8'));
  } catch {
    throw invalidRequest();
  }
  if (!record(value) || Object.keys(value).length !== 4) throw invalidRequest();
  const { primarySpaceId, decoySpaceId, rendererSeeds, rendererStore } = value;
  if (typeof primarySpaceId !== 'string' || !spaceId.test(primarySpaceId)
    || typeof decoySpaceId !== 'string' || !spaceId.test(decoySpaceId) || primarySpaceId === decoySpaceId
    || !record(rendererSeeds) || Object.keys(rendererSeeds).length !== 2
    || !seed(rendererSeeds.primary) || !seed(rendererSeeds.decoy)
    || !record(rendererStore) || Object.keys(rendererStore).length !== 2
    || !storeChanges(rendererStore.expectedLegacyValues) || !storeChanges(rendererStore.legacyUpdates)) throw invalidRequest();
  const { expectedLegacyValues, legacyUpdates } = rendererStore;
  const changeKeys = Object.keys(legacyUpdates);
  if (Object.keys(expectedLegacyValues).length !== changeKeys.length
    || changeKeys.some(key => !Object.hasOwn(expectedLegacyValues, key))) throw invalidRequest();
  return {
    primarySpaceId, decoySpaceId, rendererSeeds: { primary: rendererSeeds.primary, decoy: rendererSeeds.decoy },
    rendererStore: { expectedLegacyValues, legacyUpdates }
  };
}

export function encodeWindowsSpaceMigrationRequest(proposal: unknown, primary: Uint8Array, emergency: Uint8Array): Buffer {
  if (!primary.length || primary.length > maxPassword || !emergency.length || emergency.length > maxPassword
    || (primary.length === emergency.length && timingSafeEqual(primary, emergency))) throw invalidRequest();
  const payload = Buffer.from(JSON.stringify(proposal) ?? '', 'utf8');
  try {
    if (!payload.length || payload.length > maxProposal) throw invalidRequest();
    readProposal(payload);
    const frame = Buffer.alloc(headerSize + primary.length + emergency.length + payload.length);
    frame.writeUInt32BE(primary.length, 0);
    frame.writeUInt32BE(emergency.length, 4);
    frame.writeUInt32BE(payload.length, 8);
    frame.set(primary, headerSize);
    frame.set(emergency, headerSize + primary.length);
    frame.set(payload, headerSize + primary.length + emergency.length);
    return frame;
  } finally { payload.fill(0); }
}

/** Consume the inherited stream and erase its buffers, including on malformed input. */
export async function readWindowsSpaceMigrationRequest(input: AsyncIterable<Buffer>) {
  const chunks: Buffer[] = [];
  let length = 0;
  let frame: Buffer | undefined;
  try {
    for await (const chunk of input) {
      chunks.push(chunk);
      length += chunk.length;
      if (length > maxFrame) throw invalidRequest();
    }
    if (length < headerSize) throw invalidRequest();
    frame = Buffer.concat(chunks, length);
    const primaryLength = frame.readUInt32BE(0);
    const emergencyLength = frame.readUInt32BE(4);
    const proposalLength = frame.readUInt32BE(8);
    const emergencyOffset = headerSize + primaryLength;
    const proposalOffset = emergencyOffset + emergencyLength;
    if (!primaryLength || primaryLength > maxPassword || !emergencyLength || emergencyLength > maxPassword
      || !proposalLength || proposalLength > maxProposal || proposalOffset + proposalLength !== length) throw invalidRequest();
    const proposal = readProposal(frame.subarray(proposalOffset));
    const primaryPassword = Buffer.from(frame.subarray(headerSize, emergencyOffset));
    const emergencyPassword = Buffer.from(frame.subarray(emergencyOffset, proposalOffset));
    return {
      proposal, primaryPassword, emergencyPassword,
      clearPasswords() {
        primaryPassword.fill(0);
        emergencyPassword.fill(0);
      }
    };
  } finally {
    frame?.fill(0);
    for (const chunk of chunks) chunk.fill(0);
  }
}

/** Windows Electron uses an empty process.stdin for GUI processes. */
export function readInheritedWindowsSpaceMigrationRequest() {
  // The path is ignored when an open file descriptor is supplied.
  return readWindowsSpaceMigrationRequest(createReadStream('', { fd: 0, autoClose: false }));
}

/** A pipe can close before Electron finishes flushing its profile on exit. */
export async function waitForPreviousBrowserExit(pid: number, timeoutMs = 20_000): Promise<void> {
  if (!Number.isSafeInteger(pid) || pid < 1 || pid > 0x7fffffff) throw invalidRequest();
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
      throw new Error('The previous browser process could not be verified');
    }
    if (performance.now() >= deadline) throw new Error('The previous browser process is still running');
    await delay(100);
  }
}
