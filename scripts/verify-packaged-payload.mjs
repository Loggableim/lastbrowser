import { lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const NSIS_PAYLOAD_LIMIT_BYTES = 4 * 1024 ** 3;
export const FORBIDDEN_PAYLOAD_EXTENSIONS = ['.gguf', '.safetensors', '.onnx', '.partial'];

function walk(root, onFile, onDirectory) {
  const entries = readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      onDirectory?.(fullPath);
      walk(fullPath, onFile, onDirectory);
    } else if (entry.isFile()) {
      onFile(fullPath);
    }
  }
}

/**
 * Guard the unpacked electron-builder app directory before NSIS reads it.
 *
 * v0.1.58 shipped a broken installer because runtime/local-ai copied model
 * weights into extraResources. The app-64.7z grew past 4 GiB and standard
 * NSIS kept only the low 32 bits of the file size, truncating the archive.
 */
export function auditPackagedPayload(appOutDir, options = {}) {
  const root = path.resolve(appOutDir);
  const maxBytes = options.maxBytes ?? NSIS_PAYLOAD_LIMIT_BYTES;
  const forbiddenExtensions = options.forbiddenExtensions ?? FORBIDDEN_PAYLOAD_EXTENSIONS;
  const forbidden = [];
  let totalBytes = 0;
  let fileCount = 0;

  walk(root, (filePath) => {
    const info = lstatSync(filePath);
    totalBytes += info.size;
    fileCount += 1;
    const extension = path.extname(filePath).toLowerCase();
    if (forbiddenExtensions.includes(extension)) {
      forbidden.push(path.relative(root, filePath));
    }
  });

  if (forbidden.length !== 0) {
    const preview = forbidden.slice(0, 10).join(', ');
    const remainder = forbidden.length > 10 ? ` (+${forbidden.length - 10} more)` : '';
    throw new Error(
      `Refusing to package model weights or partial downloads in ${root}: ${preview}${remainder}. `
      + 'Local AI weights are downloaded at runtime and must never be bundled into the installer.'
    );
  }

  if (totalBytes >= maxBytes) {
    throw new Error(
      `Packaged payload ${root} is ${totalBytes} bytes across ${fileCount} files, at or above the `
      + `${maxBytes}-byte NSIS 32-bit limit. The app-64.7z archive would be truncated and the installer unreadable.`
    );
  }

  return { root, totalBytes, fileCount };
}

function main(argv) {
  const inputs = [];
  let maxBytes = NSIS_PAYLOAD_LIMIT_BYTES;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--max-bytes') {
      maxBytes = Number(argv[index + 1]);
      index += 1;
      if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
        console.error('--max-bytes expects a positive integer');
        return 2;
      }
    } else if (!argument.startsWith('-')) {
      inputs.push(argument);
    }
  }
  if (inputs.length === 0) {
    console.error('Usage: node scripts/verify-packaged-payload.mjs <app-out-dir> [--max-bytes N]');
    return 2;
  }
  try {
    for (const input of inputs) {
      const result = auditPackagedPayload(input, { maxBytes });
      console.log(
        `[verify-packaged-payload] ${path.basename(result.root)}: ${result.totalBytes} bytes across `
        + `${result.fileCount} files (limit ${maxBytes})`
      );
    }
    return 0;
  } catch (error) {
    console.error(`[verify-packaged-payload] ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)));
}
