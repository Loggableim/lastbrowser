'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

function preservePinnedLocalEngine(filePath) {
  const normalized = path.resolve(filePath).replace(/\\/g, '/');
  const marker = '/resources/apps/desktop/runtime/local-ai/';
  const position = normalized.toLowerCase().lastIndexOf(marker);
  if (position < 0) return false;
  const relative = normalized.slice(position + '/resources/'.length);
  const registryPath = path.resolve(__dirname, '../../../services/sidekick/runtime/local_ai/store-runtime-registry.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const matches = registry.engines.flatMap(engine => engine.manifest.files
    .filter(file => `${engine.manifest.packageRelativeDir}/${file.relativePath}`.toLowerCase() === relative.toLowerCase()));
  if (matches.length !== 1) {
    throw new Error(`Pinned local engine signing target is not uniquely allowlisted: ${filePath}`);
  }
  const pinned = matches[0];
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== pinned.bytes) {
    throw new Error(`Pinned local engine file size or type changed: ${filePath}`);
  }
  const digest = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  if (digest !== pinned.sha256) {
    throw new Error(`Pinned local engine file digest changed: ${filePath}`);
  }
  // Runtime verification and official archive recovery both require upstream
  // bytes. Authenticode injection would invalidate this pinned inventory.
  return true;
}

function inspectAuthenticode(filePath) {
  if (process.platform !== 'win32') {
    throw new Error('Windows Authenticode inspection is supported only on Windows.');
  }

  const result = spawnSync(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      '$ErrorActionPreference = \'Stop\'; $signature = Get-AuthenticodeSignature -LiteralPath $env:LASTBROWSER_AUTHENTICODE_TARGET; [pscustomobject]@{ status = [string]$signature.Status; timestampPresent = ($null -ne $signature.TimeStamperCertificate) } | ConvertTo-Json -Compress'
    ],
    {
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, LASTBROWSER_AUTHENTICODE_TARGET: filePath }
    }
  );

  if (result.error || result.status !== 0) {
    throw new Error(`Unable to inspect Authenticode status for ${filePath}: ${result.error?.message || result.stderr || `exit ${result.status}`}`);
  }

  let signature;
  try {
    signature = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error(`Unable to parse Authenticode status for ${filePath}.`);
  }
  if (!signature || typeof signature.status !== 'string' || typeof signature.timestampPresent !== 'boolean') {
    throw new Error(`Authenticode inspection returned an incomplete result for ${filePath}.`);
  }
  return signature;
}

async function delegateToInstalledBuilder(configuration, packager) {
  const cscInfo = configuration?.cscInfo;
  const hasCertificateFile = typeof cscInfo?.file === 'string' && cscInfo.file.length > 0;
  const hasCertificateStoreIdentity = typeof cscInfo?.thumbprint === 'string'
    && cscInfo.thumbprint.length > 0
    && typeof cscInfo.store === 'string'
    && cscInfo.store.length > 0
    && typeof cscInfo.isLocalMachineStore === 'boolean';
  if (!hasCertificateFile && !hasCertificateStoreIdentity) {
    throw new Error('Missing electron-builder Windows signing configuration (cscInfo); refusing to delegate an unsigned file.');
  }
  const manager = await packager?.signingManager?.value;
  if (!manager || typeof manager.doSign !== 'function') {
    throw new Error('electron-builder WindowsSignToolManager.doSign is unavailable; refusing to replace the configured signer.');
  }
  // This is the installed 26.8.1 manager's native operation: it resolves the
  // existing Certum/certificate configuration, computes the requested hash and
  // timestamp arguments, and sets resultOutputPath/isNest semantics as usual.
  return manager.doSign(configuration, packager);
}

function createWindowsSignaturePreserver(dependencies = {}) {
  const inspect = dependencies.inspectAuthenticode || inspectAuthenticode;
  const delegate = dependencies.delegateToBuilder || delegateToInstalledBuilder;
  const states = new Map();

  async function assertValidTimestamped(filePath, signature) {
    if (signature.status !== 'Valid' || signature.timestampPresent !== true) {
      throw new Error(`Previously signed Authenticode status ${signature.status} is no longer valid and timestamped: ${filePath}`);
    }
  }

  return async function preserveValidWindowsSignature(configuration, packager) {
    if (!configuration || typeof configuration.path !== 'string' || !configuration.path.trim()) {
      throw new Error('Custom Windows signer received no file path.');
    }
    if (configuration.hash !== 'sha1' && configuration.hash !== 'sha256') {
      throw new Error(`Unsupported electron-builder signing hash: ${configuration.hash}`);
    }

    const filePath = path.resolve(configuration.path);
    if (preservePinnedLocalEngine(filePath)) return;
    const key = process.platform === 'win32' ? filePath.toLowerCase() : filePath;
    let state = states.get(key);

    if (!state) {
      const signature = await inspect(filePath);
      if (signature.status === 'Valid') {
        if (signature.timestampPresent !== true) {
          throw new Error(`Existing Authenticode signature has no timestamp; refusing to rewrite ${filePath}.`);
        }
        state = { mode: 'preserve', hashes: new Set() };
        states.set(key, state);
        return;
      }

      if (signature.status !== 'NotSigned') {
        throw new Error(`Existing Authenticode status ${signature.status} is not safe to replace: ${filePath}`);
      }
      state = { mode: 'sign', hashes: new Set() };
      states.set(key, state);
    }

    if (state.mode === 'preserve') {
      await assertValidTimestamped(filePath, await inspect(filePath));
      return;
    }

    if (state.hashes.has(configuration.hash)) {
      await assertValidTimestamped(filePath, await inspect(filePath));
      return;
    }

    await delegate(configuration, packager);
    state.hashes.add(configuration.hash);
  };
}

const preserveValidWindowsSignature = createWindowsSignaturePreserver();
preserveValidWindowsSignature.createWindowsSignaturePreserver = createWindowsSignaturePreserver;
preserveValidWindowsSignature.inspectAuthenticode = inspectAuthenticode;

module.exports = preserveValidWindowsSignature;
