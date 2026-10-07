import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream as openReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import yaml from 'js-yaml';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const REPOSITORY_ROOT = path.resolve(SCRIPT_DIR, '../..');
export const SIGNED_PAIR_ROOT = path.join(REPOSITORY_ROOT, 'output', 'update-signed-pair-20261007-9f0be888');
export const APP_BUILDER_PATH = path.join(REPOSITORY_ROOT, 'node_modules', 'app-builder-bin', 'win', 'x64', 'app-builder.exe');
export const PINNED_PUBLISHER = 'Open Source Developer, Dominik Rainer';
export const PINNED_CERT_SUBJECT = 'CN="Open Source Developer, Dominik Rainer", O=Open Source Developer, L=Innsbruck, S=Tyrol, C=AT';
export const PINNED_THUMBPRINT = '1AD3C19A7338BBC3FFE4D62853411AD73E139857';
export const ALLOWED_VERSIONS = Object.freeze({ baseline: '0.1.47', target: '0.1.48' });

const POWERSHELL_SIGNATURE_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '$signature = Get-AuthenticodeSignature -LiteralPath $env:LASTBROWSER_SIGNED_SETUP',
  '$signer = $signature.SignerCertificate',
  '$timestamp = $signature.TimeStamperCertificate',
  '[pscustomobject]@{ status = [string]$signature.Status; subject = if ($signer) { [string]$signer.Subject } else { $null }; thumbprint = if ($signer) { [string]$signer.Thumbprint } else { $null }; timestamped = ($null -ne $timestamp); timestampSubject = if ($timestamp) { [string]$timestamp.Subject } else { $null } } | ConvertTo-Json -Compress'
].join('; ');

const defaultIo = {
  lstat: (...args) => fs.lstat(...args),
  realpath: (...args) => fs.realpath(...args),
  readdir: (...args) => fs.readdir(...args),
  readFile: (...args) => fs.readFile(...args),
  stat: (...args) => fs.stat(...args),
  writeFile: (...args) => fs.writeFile(...args),
  rename: (...args) => fs.rename(...args),
  rm: (...args) => fs.rm(...args),
  createReadStream: (filePath) => openReadStream(filePath)
};

function isPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function normalizeThumbprint(value) {
  return String(value ?? '').replace(/\s/g, '').toUpperCase();
}

function assertExpectedIdentity(expectedPublisher, expectedSubject, expectedThumbprint) {
  if (expectedPublisher !== PINNED_PUBLISHER) {
    throw new Error('Expected publisher must exactly match the pinned signing-plan publisher.');
  }
  if (expectedSubject !== PINNED_CERT_SUBJECT) {
    throw new Error('Expected certificate subject must exactly match the pinned Authenticode subject.');
  }
  if (normalizeThumbprint(expectedThumbprint) !== PINNED_THUMBPRINT) {
    throw new Error('Expected thumbprint must exactly match the pinned signing-plan certificate.');
  }
}

function parseSignatureJson(stdout, setupPath) {
  let value;
  try {
    value = JSON.parse(String(stdout).trim());
  } catch {
    throw new Error(`PowerShell Authenticode output was not valid JSON for ${setupPath}.`);
  }
  if (!value || typeof value.status !== 'string' || typeof value.subject !== 'string'
    || typeof value.thumbprint !== 'string' || typeof value.timestamped !== 'boolean') {
    throw new Error(`PowerShell Authenticode output was incomplete for ${setupPath}.`);
  }
  return value;
}

function signatureProcessEnvironment(env, setupPath) {
  const safeEnvironment = {};
  for (const key of ['SystemRoot', 'WINDIR', 'SystemDrive', 'PATH', 'TEMP', 'TMP', 'USERPROFILE', 'PSModulePath']) {
    if (typeof env[key] === 'string') safeEnvironment[key] = env[key];
  }
  safeEnvironment.LASTBROWSER_SIGNED_SETUP = setupPath;
  return safeEnvironment;
}

export async function inspectAuthenticode(setupPath, options = {}) {
  const io = options.io ?? defaultIo;
  const env = options.env ?? process.env;
  const spawn = options.spawnSync ?? spawnSync;
  if (process.platform !== 'win32') {
    throw new Error('Authenticode verification requires Windows PowerShell; refusing to continue.');
  }

  const systemRoot = env.SystemRoot;
  const windowsDir = env.WINDIR;
  if (typeof systemRoot !== 'string' || !path.win32.isAbsolute(systemRoot)
    || (typeof windowsDir === 'string' && path.win32.resolve(windowsDir).toLowerCase() !== path.win32.resolve(systemRoot).toLowerCase())) {
    throw new Error('A consistent absolute SystemRoot/WINDIR is required for safe PowerShell resolution.');
  }
  const powershell = path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const powerShellInfo = await io.lstat(powershell);
  if (!powerShellInfo.isFile() || powerShellInfo.isSymbolicLink()) {
    throw new Error('The SystemRoot PowerShell executable is not a regular non-symlink file.');
  }
  const canonicalPowerShell = await io.realpath(powershell);
  if (path.win32.resolve(canonicalPowerShell).toLowerCase() !== path.win32.resolve(powershell).toLowerCase()) {
    throw new Error('PowerShell resolved outside its expected SystemRoot path.');
  }

  const result = spawn(powershell, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', POWERSHELL_SIGNATURE_SCRIPT
  ], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20_000,
    maxBuffer: 1024 * 1024,
    env: signatureProcessEnvironment(env, setupPath)
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Get-AuthenticodeSignature failed: ${result.error?.message || result.stderr || `exit ${result.status}`}`);
  }
  return parseSignatureJson(result.stdout, setupPath);
}

function assertAuthenticode(signature, expectedSubject, expectedThumbprint, setupPath) {
  if (signature.status !== 'Valid') {
    throw new Error(`Setup Authenticode status is ${signature.status}, not Valid: ${setupPath}`);
  }
  if (signature.timestamped !== true) {
    throw new Error(`Setup Authenticode signature is not timestamped: ${setupPath}`);
  }
  if (signature.subject !== expectedSubject) {
    throw new Error(`Setup signer subject does not match the pinned publisher: ${setupPath}`);
  }
  if (normalizeThumbprint(signature.thumbprint) !== normalizeThumbprint(expectedThumbprint)) {
    throw new Error(`Setup signer thumbprint does not match the pinned certificate: ${setupPath}`);
  }
}

function runBlockmap(appBuilderPath, setupPath, outputPath, spawn = spawnSync) {
  const result = spawn(appBuilderPath, [
    'blockmap', '--input', setupPath, '--output', outputPath
  ], { encoding: 'utf8', windowsHide: true, timeout: 120_000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`app-builder blockmap failed: ${result.error?.message || result.stderr || `exit ${result.status}`}`);
  }
}

async function hashFile(filePath, algorithm, io) {
  const hash = createHash(algorithm);
  for await (const chunk of io.createReadStream(filePath)) hash.update(chunk);
  return hash.digest(algorithm === 'sha512' ? 'base64' : 'hex');
}

async function fingerprint(filePath, io) {
  const [sha256, sha512, info] = await Promise.all([
    hashFile(filePath, 'sha256', io),
    hashFile(filePath, 'sha512', io),
    io.stat(filePath)
  ]);
  return { sha256, sha512, size: info.size, mtimeMs: info.mtimeMs };
}

async function exists(filePath, io) {
  try {
    await io.lstat(filePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function parseLatestYaml(source, filePath) {
  let metadata;
  try {
    metadata = yaml.load(source);
  } catch (error) {
    throw new Error(`Cannot parse ${filePath}: ${error.message}`);
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error(`Invalid electron-updater metadata object: ${filePath}`);
  }
  return metadata;
}

function assertInputMetadata(metadata, version, setupName, latestPath) {
  if (metadata.version !== version || metadata.path !== setupName
    || !Array.isArray(metadata.files) || metadata.files.length !== 1
    || metadata.files[0]?.url !== setupName) {
    throw new Error(`latest.yml must contain only ${setupName}, exact version ${version}, and its exact update path: ${latestPath}`);
  }
}

function assertOutputMetadata(metadata, version, setupName, setupInfo, latestPath, blockmapSize) {
  if (metadata.version !== version || metadata.path !== setupName || metadata.sha512 !== setupInfo.sha512
    || !Array.isArray(metadata.files) || metadata.files.length !== 1) {
    throw new Error(`Regenerated latest.yml has incorrect version, path, hash, or file count: ${latestPath}`);
  }
  const [entry] = metadata.files;
  if (entry?.url !== setupName || entry.sha512 !== setupInfo.sha512 || entry.size !== setupInfo.size) {
    throw new Error(`Regenerated latest.yml setup entry does not match final bytes: ${latestPath}`);
  }
  if (Object.hasOwn(entry, 'blockMapSize') && entry.blockMapSize !== blockmapSize) {
    throw new Error(`Regenerated latest.yml blockMapSize does not match final blockmap bytes: ${latestPath}`);
  }
}

async function assertRegularFile(filePath, io, description) {
  const info = await io.lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${description} must be a regular non-symlink file: ${filePath}`);
  return info;
}

async function validateStage(input, io) {
  const { stageRoot, version, allowedPairRoot } = input;
  if (!['0.1.47', '0.1.48'].includes(version)) throw new Error('Version must be exactly 0.1.47 or 0.1.48.');
  const role = path.basename(path.resolve(stageRoot));
  const pairRoot = path.resolve(allowedPairRoot);
  const resolvedStage = path.resolve(stageRoot);
  if (path.dirname(resolvedStage) !== pairRoot || !['baseline', 'target'].includes(role)) {
    throw new Error(`Refusing any stage except a direct baseline/target child of the new signed-pair root: ${resolvedStage}`);
  }
  if (ALLOWED_VERSIONS[role] !== version) throw new Error('Stage role and requested version do not match the pinned update pair.');
  const pairInfo = await io.lstat(pairRoot);
  const stageInfo = await io.lstat(resolvedStage);
  if (!pairInfo.isDirectory() || pairInfo.isSymbolicLink() || !stageInfo.isDirectory() || stageInfo.isSymbolicLink()) {
    throw new Error('Signed-pair root and stage must be existing regular directories, not symlinks.');
  }
  const realPair = await io.realpath(pairRoot);
  const realStage = await io.realpath(resolvedStage);
  if (!isPathInside(realPair, realStage) || path.dirname(realStage) !== realPair) {
    throw new Error('Resolved signed stage escaped the pinned signed-pair root.');
  }
  const setupName = `Lastbrowser-${version}-x64-setup.exe`;
  const names = await io.readdir(realStage);
  const executables = names.filter((name) => /\.exe$/i.test(name)).sort();
  if (executables.length !== 1 || executables[0] !== setupName) {
    throw new Error(`Expected exactly ${setupName} and no Portable/unrelated EXE; found ${executables.join(', ') || 'none'}.`);
  }
  const setupPath = path.join(realStage, setupName);
  const latestPath = path.join(realStage, 'latest.yml');
  const blockmapPath = `${setupPath}.blockmap`;
  const receiptPath = path.join(realStage, 'update-pair-metadata-receipt.json');
  await assertRegularFile(setupPath, io, 'Signed setup');
  await assertRegularFile(latestPath, io, 'latest.yml');
  await assertRegularFile(blockmapPath, io, 'Builder-generated setup blockmap');
  const blockmapInfo = await fingerprint(blockmapPath, io);
  if (blockmapInfo.size <= 0) throw new Error(`Builder-generated setup blockmap is empty: ${blockmapPath}`);
  if (await exists(receiptPath, io)) throw new Error(`Refusing pre-existing metadata receipt: ${receiptPath}`);
  if (names.some((name) => /\.(?:tmp|backup)-[0-9a-f-]+$/i.test(name))) {
    throw new Error('Refusing a signed stage containing stale temporary/backup residue.');
  }
  return { role, stageRoot: realStage, setupName, setupPath, latestPath, blockmapPath, receiptPath, initialBlockmap: blockmapInfo };
}

function assertNoStaleOutputs(stage, io) {
  return Promise.all([
    (async () => {
      if (await exists(stage.receiptPath, io)) throw new Error(`Refusing newly appeared receipt: ${stage.receiptPath}`);
    })(),
    (async () => {
      await assertRegularFile(stage.blockmapPath, io, 'Builder-generated setup blockmap');
      const current = await fingerprint(stage.blockmapPath, io);
      if (JSON.stringify(current) !== JSON.stringify(stage.initialBlockmap)) {
        throw new Error('Existing builder-generated blockmap changed during metadata preparation.');
      }
    })()
  ]);
}

async function removeIfPresent(filePath, io) {
  if (await exists(filePath, io)) await io.rm(filePath, { force: true });
}

export async function refreshUpdatePairMetadata(options, dependencies = {}) {
  const io = dependencies.io ?? defaultIo;
  const signatureInspector = dependencies.inspectSignature ?? ((filePath) => inspectAuthenticode(filePath, { io }));
  const blockmapRunner = dependencies.runBlockmap ?? ((appBuilderPath, setupPath, outputPath) => runBlockmap(appBuilderPath, setupPath, outputPath));
  const now = dependencies.now ?? (() => new Date().toISOString());
  const expectedPublisher = options.expectedPublisher;
  const expectedSubject = options.expectedSubject;
  const expectedThumbprint = options.expectedThumbprint;
  assertExpectedIdentity(expectedPublisher, expectedSubject, expectedThumbprint);
  if (typeof options.appBuilderPath !== 'string' || !path.isAbsolute(options.appBuilderPath)) {
    throw new Error('An absolute installed app-builder executable path is required.');
  }

  const stage = await validateStage({ ...options, allowedPairRoot: options.allowedPairRoot ?? SIGNED_PAIR_ROOT }, io);
  const suffix = `.tmp-${process.pid}-${randomUUID()}`;
  const temporary = {
    blockmap: `${stage.blockmapPath}${suffix}`,
    latest: `${stage.latestPath}${suffix}`,
    receipt: `${stage.receiptPath}${suffix}`,
    latestBackup: `${stage.latestPath}.backup-${process.pid}-${randomUUID()}`,
    blockmapBackup: `${stage.blockmapPath}.backup-${process.pid}-${randomUUID()}`
  };
  const setupBefore = await fingerprint(stage.setupPath, io);
  const originalLatest = await io.readFile(stage.latestPath);
  const inputMetadata = parseLatestYaml(originalLatest.toString('utf8'), stage.latestPath);
  assertInputMetadata(inputMetadata, options.version, stage.setupName, stage.latestPath);
  let latestCommitted = false;
  let blockmapCommitted = false;
  let receiptCommitted = false;
  let transactionCommitted = false;

  try {
    assertAuthenticode(await signatureInspector(stage.setupPath), expectedSubject, expectedThumbprint, stage.setupPath);
    const setupAfterSignature = await fingerprint(stage.setupPath, io);
    if (JSON.stringify(setupAfterSignature) !== JSON.stringify(setupBefore)) {
      throw new Error('Signed setup bytes changed during Authenticode verification.');
    }

    await blockmapRunner(options.appBuilderPath, stage.setupPath, temporary.blockmap);
    await assertRegularFile(temporary.blockmap, io, 'Generated blockmap');
    if ((await io.stat(temporary.blockmap)).size <= 0) throw new Error('Generated differential blockmap is empty.');

    const setupInfo = await fingerprint(stage.setupPath, io);
    if (JSON.stringify(setupInfo) !== JSON.stringify(setupBefore)) throw new Error('Signed setup changed while the blockmap was generated.');
    const blockmapInfo = await fingerprint(temporary.blockmap, io);
    const metadata = { ...inputMetadata };
    const entry = { ...inputMetadata.files[0], url: stage.setupName, sha512: setupInfo.sha512, size: setupInfo.size };
    if (Object.hasOwn(entry, 'blockMapSize')) entry.blockMapSize = blockmapInfo.size;
    metadata.version = options.version;
    metadata.path = stage.setupName;
    metadata.sha512 = setupInfo.sha512;
    metadata.files = [entry];
    const latestBytes = Buffer.from(yaml.dump(metadata, { lineWidth: -1, noRefs: true }), 'utf8');
    const outputMetadata = parseLatestYaml(latestBytes.toString('utf8'), temporary.latest);
    assertOutputMetadata(outputMetadata, options.version, stage.setupName, setupInfo, temporary.latest, blockmapInfo.size);
    await io.writeFile(temporary.latest, latestBytes, { flag: 'wx' });
    await assertRegularFile(temporary.latest, io, 'Prepared latest.yml');

    const receipt = {
      schemaVersion: 1,
      status: 'NSIS_SIGNED_STAGE_METADATA_READY',
      createdUtc: now(),
      version: options.version,
      stageRole: stage.role,
      publisher: { name: expectedPublisher, subject: expectedSubject, thumbprint: normalizeThumbprint(expectedThumbprint), timestamped: true },
      files: [
        { name: stage.setupName, size: setupInfo.size, sha512: setupInfo.sha512, sha256: setupInfo.sha256 },
        { name: path.basename(stage.blockmapPath), size: blockmapInfo.size, sha256: blockmapInfo.sha256 },
        { name: 'latest.yml', size: latestBytes.length, sha256: createHash('sha256').update(latestBytes).digest('hex') }
      ]
    };
    const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
    await io.writeFile(temporary.receipt, receiptBytes, { flag: 'wx' });
    JSON.parse((await io.readFile(temporary.receipt, 'utf8')).toString());

    const currentLatest = await io.readFile(stage.latestPath);
    if (!currentLatest.equals(originalLatest)) throw new Error('latest.yml changed during metadata preparation; refusing stale overwrite.');
    assertAuthenticode(await signatureInspector(stage.setupPath), expectedSubject, expectedThumbprint, stage.setupPath);
    const setupBeforeCommit = await fingerprint(stage.setupPath, io);
    if (JSON.stringify(setupBeforeCommit) !== JSON.stringify(setupBefore)) throw new Error('Signed setup changed before metadata commit.');
    await assertNoStaleOutputs(stage, io);

    await io.rename(stage.latestPath, temporary.latestBackup);
    await io.rename(stage.blockmapPath, temporary.blockmapBackup);
    await io.rename(temporary.latest, stage.latestPath);
    latestCommitted = true;
    await io.rename(temporary.blockmap, stage.blockmapPath);
    blockmapCommitted = true;
    await io.rename(temporary.receipt, stage.receiptPath);
    receiptCommitted = true;

    const committedLatestBytes = await io.readFile(stage.latestPath);
    const committedLatest = parseLatestYaml(committedLatestBytes.toString('utf8'), stage.latestPath);
    assertOutputMetadata(committedLatest, options.version, stage.setupName, setupInfo, stage.latestPath, blockmapInfo.size);
    const committedSetup = await fingerprint(stage.setupPath, io);
    const committedBlockmap = await fingerprint(stage.blockmapPath, io);
    const committedLatestFingerprint = await fingerprint(stage.latestPath, io);
    if (JSON.stringify(committedSetup) !== JSON.stringify(setupBefore)
      || committedBlockmap.size !== blockmapInfo.size || committedBlockmap.sha256 !== blockmapInfo.sha256
      || !committedLatestBytes.equals(latestBytes)
      || committedLatestFingerprint.sha256 !== createHash('sha256').update(latestBytes).digest('hex')) {
      throw new Error('Final signed setup/blockmap/latest.yml readback does not match the prepared bytes.');
    }
    const committedReceipt = JSON.parse((await io.readFile(stage.receiptPath, 'utf8')).toString());
    const receiptByName = new Map((committedReceipt.files ?? []).map((file) => [file.name, file]));
    const committedSetupReceipt = receiptByName.get(stage.setupName);
    const committedBlockmapReceipt = receiptByName.get(path.basename(stage.blockmapPath));
    const committedLatestReceipt = receiptByName.get('latest.yml');
    if (committedReceipt.status !== receipt.status || receiptByName.size !== 3
      || committedSetupReceipt?.sha256 !== committedSetup.sha256
      || committedSetupReceipt?.sha512 !== committedSetup.sha512
      || committedSetupReceipt?.size !== committedSetup.size
      || committedBlockmapReceipt?.sha256 !== committedBlockmap.sha256
      || committedBlockmapReceipt?.size !== committedBlockmap.size
      || committedLatestReceipt?.sha256 !== committedLatestFingerprint.sha256
      || committedLatestReceipt?.size !== committedLatestFingerprint.size) {
      throw new Error('Final update metadata receipt readback failed.');
    }
    transactionCommitted = true;
    await io.rm(temporary.blockmapBackup, { force: true });
    await io.rm(temporary.latestBackup, { force: true });
    return { stageRoot: stage.stageRoot, setupName: stage.setupName, receiptPath: stage.receiptPath, receipt };
  } catch (error) {
    if (transactionCommitted) {
      throw new Error(`Metadata outputs and receipt were committed and verified, but backup cleanup failed; inspect stage residue before retrying: ${error.message}`, { cause: error });
    }
    const rollbackErrors = [];
    try {
      if (receiptCommitted) await removeIfPresent(stage.receiptPath, io);
      if (blockmapCommitted) await removeIfPresent(stage.blockmapPath, io);
      if (latestCommitted) await removeIfPresent(stage.latestPath, io);
      if (await exists(temporary.blockmapBackup, io)) await io.rename(temporary.blockmapBackup, stage.blockmapPath);
      if (await exists(temporary.latestBackup, io)) await io.rename(temporary.latestBackup, stage.latestPath);
    } catch (rollbackError) {
      rollbackErrors.push(rollbackError);
    }
    for (const filePath of Object.values(temporary)) {
      try { await removeIfPresent(filePath, io); } catch (cleanupError) { rollbackErrors.push(cleanupError); }
    }
    if (rollbackErrors.length) {
      throw new AggregateError([error, ...rollbackErrors], 'Metadata preparation failed and rollback/cleanup was incomplete.');
    }
    throw error;
  }
}

function parseCliArgs(argv) {
  const allowed = new Set(['--stage', '--version', '--publisher', '--subject', '--thumbprint', '--app-builder']);
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!allowed.has(flag) || values[flag]) throw new Error(`Unknown or duplicate CLI argument: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    values[flag] = value;
    index += 1;
  }
  for (const flag of allowed) if (!values[flag]) throw new Error(`Required argument missing: ${flag}`);
  return {
    stageRoot: values['--stage'],
    version: values['--version'],
    expectedPublisher: values['--publisher'],
    expectedSubject: values['--subject'],
    expectedThumbprint: values['--thumbprint'],
    appBuilderPath: values['--app-builder']
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliArgs(argv);
  assertExpectedIdentity(options.expectedPublisher, options.expectedSubject, options.expectedThumbprint);
  if (path.resolve(options.appBuilderPath) !== path.resolve(APP_BUILDER_PATH)) {
    throw new Error('CLI app-builder must be the installed repository executable; custom executables are refused.');
  }
  await assertRegularFile(options.appBuilderPath, defaultIo, 'Installed app-builder');
  const result = await refreshUpdatePairMetadata({ ...options, allowedPairRoot: SIGNED_PAIR_ROOT });
  process.stdout.write(`Prepared signed-stage metadata for ${result.setupName}; receipt ${result.receiptPath}\n`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
