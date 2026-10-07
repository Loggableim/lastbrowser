import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import {
  PINNED_PUBLISHER,
  PINNED_CERT_SUBJECT,
  PINNED_THUMBPRINT,
  inspectAuthenticode,
  refreshUpdatePairMetadata
} from './update-pair-metadata.mjs';

const SCRIPT_PATH = new URL('./update-pair-metadata.mjs', import.meta.url);
const VALID_SIGNATURE = {
  status: 'Valid',
  subject: PINNED_CERT_SUBJECT,
  thumbprint: PINNED_THUMBPRINT,
  timestamped: true,
  timestampSubject: 'CN=Example Timestamp Authority'
};

function makeIo(overrides = {}) {
  return {
    lstat: (...args) => fs.lstat(...args),
    realpath: (...args) => fs.realpath(...args),
    readdir: (...args) => fs.readdir(...args),
    readFile: (...args) => fs.readFile(...args),
    stat: (...args) => fs.stat(...args),
    writeFile: (...args) => fs.writeFile(...args),
    rename: (...args) => fs.rename(...args),
    rm: (...args) => fs.rm(...args),
    createReadStream: (filePath) => createReadStream(filePath),
    ...overrides
  };
}

async function createStage({ role = 'target', version = role === 'baseline' ? '0.1.47' : '0.1.48', executables = [], latest = {} } = {}) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lb-update-pair-metadata-'));
  const allowedPairRoot = path.join(tempRoot, 'update-signed-pair-20261007-9f0be888');
  const stageRoot = path.join(allowedPairRoot, role);
  await fs.mkdir(stageRoot, { recursive: true });
  const setupName = `Lastbrowser-${version}-x64-setup.exe`;
  const setupPath = path.join(stageRoot, setupName);
  const setupBytes = Buffer.from(`timestamped-signed-fixture:${version}`);
  const blockmapPath = `${setupPath}.blockmap`;
  const initialBlockmapBytes = Buffer.from('nsis-builder-generated-old-blockmap');
  await fs.writeFile(setupPath, setupBytes);
  await fs.writeFile(blockmapPath, initialBlockmapBytes);
  for (const name of executables) await fs.writeFile(path.join(stageRoot, name), Buffer.from('extra executable fixture'));
  const latestPath = path.join(stageRoot, 'latest.yml');
  const staleMetadata = {
    version,
    path: setupName,
    sha512: 'stale-top-level-sha512',
    files: [{ url: setupName, sha512: 'stale-entry-sha512', size: 1, blockMapSize: 1 }],
    releaseDate: '2026-10-07T00:00:00.000Z',
    ...latest
  };
  await fs.writeFile(latestPath, yaml.dump(staleMetadata, { lineWidth: -1, noRefs: true }));
  return { tempRoot, allowedPairRoot, stageRoot, version, setupName, setupPath, setupBytes, latestPath, blockmapPath, initialBlockmapBytes, staleMetadata };
}

function makeOptions(stage, overrides = {}) {
  return {
    stageRoot: stage.stageRoot,
    allowedPairRoot: stage.allowedPairRoot,
    version: stage.version,
    expectedPublisher: PINNED_PUBLISHER,
    expectedSubject: PINNED_CERT_SUBJECT,
    expectedThumbprint: PINNED_THUMBPRINT,
    appBuilderPath: path.join(stage.tempRoot, 'installed-app-builder.exe'),
    ...overrides
  };
}

function makeDependencies(overrides = {}) {
  return {
    inspectSignature: async () => ({ ...VALID_SIGNATURE }),
    runBlockmap: async (_appBuilderPath, setupPath, outputPath) => {
      assert.ok(path.isAbsolute(setupPath));
      await fs.writeFile(outputPath, Buffer.from('synthetic-blockmap-v1'), { flag: 'wx' });
    },
    now: () => '2026-10-07T12:00:00.000Z',
    ...overrides
  };
}

async function removeFixture(stage) {
  await fs.rm(stage.tempRoot, { recursive: true, force: true });
}

async function listStage(stage) {
  return (await fs.readdir(stage.stageRoot)).sort();
}

test('replaces the builder map and refreshes NSIS-only metadata from final signed bytes', async (t) => {
  const stage = await createStage();
  t.after(() => removeFixture(stage));
  const result = await refreshUpdatePairMetadata(makeOptions(stage), makeDependencies());
  const setupHash = createHash('sha512').update(stage.setupBytes).digest('base64');
  const metadata = yaml.load(await fs.readFile(stage.latestPath, 'utf8'));
  const receipt = JSON.parse(await fs.readFile(result.receiptPath, 'utf8'));
  assert.equal(metadata.version, stage.version);
  assert.equal(metadata.path, stage.setupName);
  assert.equal(metadata.sha512, setupHash);
  assert.deepEqual(metadata.files, [{
    ...stage.staleMetadata.files[0],
    url: stage.setupName,
    sha512: setupHash,
    size: stage.setupBytes.length,
    blockMapSize: Buffer.byteLength('synthetic-blockmap-v1')
  }]);
  assert.equal(metadata.releaseDate, stage.staleMetadata.releaseDate);
  assert.equal(receipt.status, 'NSIS_SIGNED_STAGE_METADATA_READY');
  assert.equal(receipt.publisher.name, PINNED_PUBLISHER);
  assert.equal(receipt.publisher.subject, PINNED_CERT_SUBJECT);
  assert.equal(receipt.files.length, 3);
  assert.equal(receipt.files[0].sha512, setupHash);
  assert.equal(receipt.files[0].sha256, createHash('sha256').update(stage.setupBytes).digest('hex'));
  assert.equal(receipt.files[1].sha256, createHash('sha256').update('synthetic-blockmap-v1').digest('hex'));
  assert.equal(receipt.files[2].sha256, createHash('sha256').update(await fs.readFile(stage.latestPath)).digest('hex'));
  assert.ok((await fs.stat(`${stage.setupPath}.blockmap`)).size > 0);
  assert.notDeepEqual(await fs.readFile(stage.blockmapPath), stage.initialBlockmapBytes);
  assert.deepEqual((await listStage(stage)).filter((name) => /\.tmp-|\.backup-/.test(name)), []);
});

test('PowerShell signature inspection resolves from SystemRoot and passes the target only through the environment', async (t) => {
  if (process.platform !== 'win32') return t.skip('Windows PowerShell path contract is Windows-only.');
  const setupPath = String.raw`C:\signed stage\file'; Write-Output injected.exe`;
  const env = {
    SystemRoot: String.raw`C:\Windows`,
    WINDIR: String.raw`C:\Windows`,
    PATH: String.raw`C:\Windows\System32`,
    LASTBROWSER_SECRET_TEST: 'must-not-be-forwarded'
  };
  const expectedPowerShell = String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`;
  const io = makeIo({
    lstat: async (filePath) => {
      assert.equal(filePath.toLowerCase(), expectedPowerShell.toLowerCase());
      return { isFile: () => true, isSymbolicLink: () => false };
    },
    realpath: async (filePath) => filePath
  });
  let call;
  const result = await inspectAuthenticode(setupPath, {
    io,
    env,
    spawnSync: (executable, args, options) => {
      call = { executable, args, options };
      return { error: null, status: 0, stdout: JSON.stringify(VALID_SIGNATURE), stderr: '' };
    }
  });
  assert.equal(call.executable.toLowerCase(), expectedPowerShell.toLowerCase());
  assert.ok(call.args.includes('-NoProfile'));
  assert.ok(call.args.includes('-NonInteractive'));
  assert.ok(!call.args.join(' ').includes(setupPath));
  assert.equal(call.options.env.LASTBROWSER_SIGNED_SETUP, setupPath);
  assert.equal(call.options.env.LASTBROWSER_SECRET_TEST, undefined);
  assert.equal(result.subject, PINNED_CERT_SUBJECT);
  assert.equal(result.timestamped, true);
});

test('fails closed on unsigned, untimestamped, wrong-subject, and wrong-thumbprint signatures', async (t) => {
  const failures = [
    [{ ...VALID_SIGNATURE, status: 'NotSigned' }, /not Valid/],
    [{ ...VALID_SIGNATURE, timestamped: false }, /not timestamped/],
    [{ ...VALID_SIGNATURE, subject: 'CN=Untrusted' }, /subject/],
    [{ ...VALID_SIGNATURE, subject: 'CN="Open Source Developer, Dominik Rainer"' }, /subject/],
    [{ ...VALID_SIGNATURE, subject: 'CN="Open Source Developer, Dominik Rainer", O=Wrong, L=Innsbruck, S=Tyrol, C=AT' }, /subject/],
    [{ ...VALID_SIGNATURE, thumbprint: '0'.repeat(40) }, /thumbprint/]
  ];
  for (const [signature, expectedError] of failures) {
    const stage = await createStage();
    t.after(() => removeFixture(stage));
    let blockmapCalled = false;
    const originalLatest = await fs.readFile(stage.latestPath);
    await assert.rejects(
      refreshUpdatePairMetadata(makeOptions(stage), makeDependencies({
        inspectSignature: async () => signature,
        runBlockmap: async () => { blockmapCalled = true; }
      })),
      expectedError
    );
    assert.equal(blockmapCalled, false);
    assert.deepEqual(await fs.readFile(stage.latestPath), originalLatest);
    assert.deepEqual((await listStage(stage)).filter((name) => /\.tmp-|\.backup-/.test(name)), []);
  }
});

test('rejects unsigned/original stage paths and mismatched stage version', async (t) => {
  const stage = await createStage();
  t.after(() => removeFixture(stage));
  const outside = path.join(stage.tempRoot, 'unsigned-input');
  await fs.mkdir(outside);
  let signatureCalled = false;
  await assert.rejects(refreshUpdatePairMetadata(makeOptions(stage, { stageRoot: outside }), makeDependencies({
    inspectSignature: async () => { signatureCalled = true; return VALID_SIGNATURE; }
  })), /Refusing any stage/);
  await assert.rejects(refreshUpdatePairMetadata(makeOptions(stage, { version: '0.1.47' }), makeDependencies()), /do not match/);
  assert.equal(signatureCalled, false);
});

test('rejects portable or unrelated executable artifacts before signature inspection', async (t) => {
  const stage = await createStage({ executables: ['Lastbrowser-0.1.48-x64-portable.exe'] });
  t.after(() => removeFixture(stage));
  let signatureCalled = false;
  await assert.rejects(refreshUpdatePairMetadata(makeOptions(stage), makeDependencies({
    inspectSignature: async () => { signatureCalled = true; return VALID_SIGNATURE; }
  })), /no Portable\/unrelated EXE/);
  assert.equal(signatureCalled, false);
});

test('rejects latest.yml with wrong URL, path, version, or multiple executable entries', async (t) => {
  const badMetadata = [
    { files: [{ url: 'other.exe', sha512: 'old', size: 1 }] },
    { path: 'other.exe' },
    { version: '0.1.47' },
    { files: [
      { url: 'Lastbrowser-0.1.48-x64-setup.exe', sha512: 'old', size: 1 },
      { url: 'Lastbrowser-0.1.48-x64-portable.exe', sha512: 'old', size: 1 }
    ] }
  ];
  for (const latest of badMetadata) {
    const stage = await createStage({ latest });
    t.after(() => removeFixture(stage));
    let blockmapCalled = false;
    await assert.rejects(refreshUpdatePairMetadata(makeOptions(stage), makeDependencies({
      runBlockmap: async () => { blockmapCalled = true; }
    })), /latest.yml must contain only/);
    assert.equal(blockmapCalled, false);
  }
});

test('refuses previous receipts and temporary stage residue without overwriting them', async (t) => {
  const stage = await createStage();
  t.after(() => removeFixture(stage));
  const receiptPath = path.join(stage.stageRoot, 'update-pair-metadata-receipt.json');
  await fs.writeFile(receiptPath, 'pre-existing receipt');
  await assert.rejects(refreshUpdatePairMetadata(makeOptions(stage), makeDependencies()), /pre-existing metadata receipt/);
  assert.equal(await fs.readFile(receiptPath, 'utf8'), 'pre-existing receipt');
  await fs.rm(receiptPath);
  await fs.writeFile(path.join(stage.stageRoot, 'latest.yml.tmp-1-deadbeef'), 'leftover');
  await assert.rejects(refreshUpdatePairMetadata(makeOptions(stage), makeDependencies()), /temporary\/backup residue/);
});

test('fails closed if setup bytes change during signature verification', async (t) => {
  const stage = await createStage();
  t.after(() => removeFixture(stage));
  const originalLatest = await fs.readFile(stage.latestPath);
  let blockmapCalled = false;
  await assert.rejects(refreshUpdatePairMetadata(makeOptions(stage), makeDependencies({
    inspectSignature: async () => {
      await fs.writeFile(stage.setupPath, 'mutated during signature read');
      return VALID_SIGNATURE;
    },
    runBlockmap: async () => { blockmapCalled = true; }
  })), /bytes changed during Authenticode verification/);
  assert.equal(blockmapCalled, false);
  assert.deepEqual(await fs.readFile(stage.latestPath), originalLatest);
  assert.equal((await listStage(stage)).includes('update-pair-metadata-receipt.json'), false);
});

test('blockmap tool failure removes generated residue and preserves original metadata', async (t) => {
  const stage = await createStage();
  t.after(() => removeFixture(stage));
  const originalLatest = await fs.readFile(stage.latestPath);
  const originalBlockmap = await fs.readFile(stage.blockmapPath);
  await assert.rejects(refreshUpdatePairMetadata(makeOptions(stage), makeDependencies({
    runBlockmap: async (_builder, _setup, outputPath) => {
      await fs.writeFile(outputPath, 'partial failed blockmap', { flag: 'wx' });
      throw new Error('synthetic app-builder failure');
    }
  })), /synthetic app-builder failure/);
  assert.deepEqual(await fs.readFile(stage.latestPath), originalLatest);
  assert.deepEqual(await fs.readFile(stage.blockmapPath), originalBlockmap);
  assert.equal(await fs.access(path.join(stage.stageRoot, 'update-pair-metadata-receipt.json')).then(() => true, () => false), false);
  assert.deepEqual((await listStage(stage)).filter((name) => /\.tmp-|\.backup-/.test(name)), []);
});

test('restores both builder map and latest.yml if either atomic output rename fails', async (t) => {
  const stage = await createStage();
  t.after(() => removeFixture(stage));
  const originalLatest = await fs.readFile(stage.latestPath);
  const originalBlockmap = await fs.readFile(stage.blockmapPath);
  for (const failureTarget of [stage.latestPath, stage.blockmapPath]) {
    let failedOnce = false;
    const io = makeIo({
      rename: async (from, to) => {
        if (!failedOnce && to === failureTarget && from.includes('.tmp-')) {
          failedOnce = true;
          throw new Error(`synthetic atomic rename failure: ${path.basename(to)}`);
        }
        return fs.rename(from, to);
      }
    });
    await assert.rejects(refreshUpdatePairMetadata(makeOptions(stage), makeDependencies({ io })), /synthetic atomic rename failure/);
    assert.deepEqual(await fs.readFile(stage.latestPath), originalLatest);
    assert.deepEqual(await fs.readFile(stage.blockmapPath), originalBlockmap);
    assert.equal(await fs.access(path.join(stage.stageRoot, 'update-pair-metadata-receipt.json')).then(() => true, () => false), false);
    assert.deepEqual((await listStage(stage)).filter((name) => /\.tmp-|\.backup-/.test(name)), []);
  }
});

test('CLI requires explicit pinned arguments and cannot bypass signature verification', async (t) => {
  const stage = await createStage();
  t.after(() => removeFixture(stage));
  const baseArgs = [
    process.execPath,
    fileURLToPath(SCRIPT_PATH),
    '--stage', stage.stageRoot,
    '--version', stage.version,
    '--publisher', PINNED_PUBLISHER,
    '--subject', PINNED_CERT_SUBJECT,
    '--thumbprint', PINNED_THUMBPRINT,
    '--app-builder', path.resolve('node_modules/app-builder-bin/win/x64/app-builder.exe')
  ];
  const bypass = spawnSync(baseArgs[0], [...baseArgs.slice(1), '--skip-signature', 'true'], {
    cwd: process.cwd(), encoding: 'utf8', windowsHide: true
  });
  assert.notEqual(bypass.status, 0);
  assert.match(bypass.stderr, /Unknown or duplicate CLI argument/);
  const missing = spawnSync(baseArgs[0], [baseArgs[1], '--stage', stage.stageRoot], {
    cwd: process.cwd(), encoding: 'utf8', windowsHide: true
  });
  assert.notEqual(missing.status, 0);
  assert.match(missing.stderr, /Required argument missing/);
  assert.deepEqual((await listStage(stage)).filter((name) => /\.tmp-|\.backup-|receipt\.json$/.test(name)), []);
  assert.deepEqual(await fs.readFile(stage.blockmapPath), stage.initialBlockmapBytes);
});
