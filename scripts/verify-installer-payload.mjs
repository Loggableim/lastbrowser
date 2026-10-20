import { closeSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32 } from 'node:zlib';

const SIGNATURE = Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
const START_HEADER_SIZE = 32;
const CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_HEADER_CRC_BYTES = 16 * 1024 * 1024;

function collectExecutables(inputs) {
  const files = [];
  for (const input of inputs) {
    const resolved = path.resolve(input);
    if (statSync(resolved).isDirectory()) {
      const executables = readdirSync(resolved)
        .filter((name) => /\.exe$/i.test(name))
        .map((name) => path.join(resolved, name));
      if (executables.length === 0) {
        throw new Error(`No .exe files found in ${resolved}`);
      }
      files.push(...executables);
    } else {
      files.push(resolved);
    }
  }
  return files;
}

function findSignatureOffsets(fd, fileSize) {
  const offsets = [];
  const overlap = SIGNATURE.length - 1;
  let carry = Buffer.alloc(0);
  let position = 0;
  while (position < fileSize) {
    const length = Math.min(CHUNK_SIZE, fileSize - position);
    const chunk = Buffer.allocUnsafe(length);
    const read = readSync(fd, chunk, 0, length, position);
    if (read !== length) {
      throw new Error(`Short read at byte ${position}: expected ${length}, got ${read}`);
    }
    const combined = carry.length === 0 ? chunk : Buffer.concat([carry, chunk]);
    const base = position - carry.length;
    let index = combined.indexOf(SIGNATURE);
    while (index !== -1) {
      offsets.push(base + index);
      index = combined.indexOf(SIGNATURE, index + 1);
    }
    carry = combined.subarray(Math.max(0, combined.length - overlap));
    position += length;
  }
  return offsets;
}

function readExactly(fd, length, position) {
  const buffer = Buffer.alloc(length);
  const read = readSync(fd, buffer, 0, length, position);
  return read === length ? buffer : null;
}

function describeTruncation(filePath, headerOffset, nextHeaderOffset, archiveSize, fileSize) {
  const wrapped = archiveSize % 2 ** 32;
  return [
    `Truncated 7z archive in ${filePath}: start header at byte ${headerOffset} declares`,
    `NextHeaderOffset=${nextHeaderOffset} (archive size ${archiveSize} bytes), but the file is only ${fileSize} bytes.`,
    `This is the 4 GiB offset overflow pattern: ${archiveSize} mod 2^32 = ${wrapped}.`,
    'The NSIS payload was cut at the 32-bit file-size limit, so the archive has no readable end header.'
  ].join(' ');
}

/**
 * Validate every 7z start header inside a built installer.
 *
 * electron-builder embeds the app payload as $PLUGINSDIR/app-64.7z. Standard
 * NSIS truncates a payload that reaches 4 GiB and keeps a start header that
 * points past the end of the file. Verifying the stored StartHeaderCRC first
 * separates real headers from coincidental signature bytes, then bounds-checks
 * the declared NextHeaderOffset against the actual file size.
 */
export function verifyInstallerPayload(filePath) {
  const resolved = path.resolve(filePath);
  const fileSize = statSync(resolved).size;
  const fd = openSync(resolved, 'r');
  const archives = [];
  const problems = [];
  try {
    const candidates = findSignatureOffsets(fd, fileSize);
    for (const candidate of candidates) {
      if (candidate + START_HEADER_SIZE > fileSize) {
        continue;
      }
      const header = readExactly(fd, START_HEADER_SIZE, candidate);
      if (header === null) {
        continue;
      }
      const storedStartCrc = header.readUInt32LE(8);
      const actualStartCrc = crc32(header.subarray(12, START_HEADER_SIZE)) >>> 0;
      if (storedStartCrc !== actualStartCrc) {
        continue;
      }
      const nextHeaderOffset = header.readBigUInt64LE(12);
      const nextHeaderSize = header.readBigUInt64LE(20);
      const nextHeaderCrc = header.readUInt32LE(28);
      const archiveSize = BigInt(START_HEADER_SIZE) + nextHeaderOffset + nextHeaderSize;
      const nextHeaderPosition = BigInt(candidate) + BigInt(START_HEADER_SIZE) + nextHeaderOffset;
      const archiveEnd = nextHeaderPosition + nextHeaderSize;
      if (archiveEnd > BigInt(fileSize)) {
        problems.push(describeTruncation(
          resolved,
          candidate,
          nextHeaderOffset.toString(),
          archiveSize.toString(),
          fileSize
        ));
        continue;
      }
      if (nextHeaderSize > 0n && nextHeaderSize <= BigInt(MAX_HEADER_CRC_BYTES)) {
        const nextHeader = readExactly(fd, Number(nextHeaderSize), Number(nextHeaderPosition));
        const actualNextCrc = nextHeader === null ? null : crc32(nextHeader) >>> 0;
        if (actualNextCrc === null || actualNextCrc !== nextHeaderCrc) {
          problems.push(
            `Corrupt 7z next header in ${resolved} at byte ${nextHeaderPosition}: `
            + `CRC 0x${(actualNextCrc ?? 0).toString(16)} does not match stored 0x${nextHeaderCrc.toString(16)}.`
          );
          continue;
        }
      }
      archives.push({
        offset: candidate,
        archiveSize: Number(archiveSize),
        nextHeaderOffset: nextHeaderOffset.toString(),
        nextHeaderSize: nextHeaderSize.toString()
      });
    }
  } finally {
    closeSync(fd);
  }

  if (archives.length === 0 && problems.length === 0) {
    throw new Error(
      `No 7z start header with a valid StartHeaderCRC was found in ${resolved}. `
      + 'The embedded installer payload is missing or unreadable.'
    );
  }
  if (problems.length !== 0) {
    throw new Error(problems.join('\n'));
  }
  if (archives.length > 1) {
    throw new Error(`Expected one embedded 7z payload in ${resolved}, found ${archives.length}.`);
  }
  return { file: resolved, fileSize, archives };
}

function main(argv) {
  const inputs = argv.filter((argument) => !argument.startsWith('-'));
  if (inputs.length === 0) {
    console.error('Usage: node scripts/verify-installer-payload.mjs <installer.exe|release-dir> [...]');
    return 2;
  }
  try {
    const files = collectExecutables(inputs);
    for (const file of files) {
      const result = verifyInstallerPayload(file);
      const payload = result.archives[0];
      console.log(
        `[verify-installer-payload] ${path.basename(file)}: 7z payload OK `
        + `(start ${payload.offset}, ${payload.archiveSize} bytes, file ${result.fileSize} bytes)`
      );
    }
    return 0;
  } catch (error) {
    console.error(`[verify-installer-payload] ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)));
}
