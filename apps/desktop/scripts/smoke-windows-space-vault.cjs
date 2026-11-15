// Windows only. Arguments: <cli> <electron> <java> <Cryptomator jars> <python> <unused drive root>
const { spawnSync } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const { existsSync, realpathSync } = require('node:fs');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

function run(executable, args) {
  const result = spawnSync(executable, args, { timeout: 30_000, encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.signal) throw new Error('Synthetic test process was interrupted');
  return result;
}

async function main() {
  if (process.platform !== 'win32' || process.argv.length !== 8) {
    throw new Error('Supply Cryptomator CLI, Electron, Java, the library directory, Python and an unused drive root');
  }
  const [helper, electron, java, libraryDirectory, python] = process.argv.slice(2, 7).map(input => realpathSync(input));
  const drive = process.argv[7];
  if (!/^[D-Z]:\\$/i.test(drive) || existsSync(drive)) throw new Error('Supply an unused drive root');
  const { initializeWindowsSpaceVault } = await import('../src/main/windows-space-vault-initializer.ts');
  const { mountWindowsSpaceVault } = await import('../src/main/windows-space-vault.ts');
  const fixture = await mkdtemp(path.join(tmpdir(), 'lastbrowser-winfsp-smoke-'));
  const vaultDirectory = path.join(fixture, 'vault');
  const bootstrap = path.join(fixture, 'electron-bootstrap');
  const key = randomBytes(32);
  const vaultId = randomUUID();
  try {
    await initializeWindowsSpaceVault({
      java, libraryDirectory, initializerSource: path.join(__dirname, 'InitializeSpaceVault.java'),
      vaultDirectory, vaultId, key
    });
    const mounted = await mountWindowsSpaceVault({
      helper, vaultDirectory, drive, vaultId, key, preparingProfile: true
    });
    try {
      const probeRoot = path.join(mounted.root, 'profile');
      const probe = run(electron, [
        path.join(__dirname, 'probe-space-storage.cjs'),
        `--user-data-dir=${bootstrap}`, `--probe-root=${probeRoot}`
      ]);
      if (probe.status !== 1 || !probe.stdout.includes('"chatMarkerInWal":true')) {
        throw new Error('Electron did not complete the mounted SQLite and cookie test');
      }
      const sidekick = run(python, ['-I', '-B', path.join(__dirname, 'probe-space-sidekick.py'), probeRoot]);
      if (sidekick.status !== 0) throw new Error('Sidekick did not complete the mounted storage test');
      const verify = run(process.execPath, [
        path.join(__dirname, 'verify-space-storage-boundary.cjs'), probeRoot, vaultDirectory
      ]);
      if (verify.status !== 0) throw new Error('The synthetic storage boundary check failed');
      process.stdout.write(verify.stdout);
    } finally {
      await mounted.close();
    }
    const reopened = await mountWindowsSpaceVault({ helper, vaultDirectory, drive, vaultId, key });
    try {
      if (!existsSync(path.join(reopened.root, 'storage-probe.json'))) {
        throw new Error('The test profile did not survive locking and reopening');
      }
    } finally {
      await reopened.close();
    }
  } finally {
    key.fill(0);
    if (!existsSync(drive)) await rm(fixture, { recursive: true, force: true });
  }
  console.log('The synthetic profile survived reopening and the drive dismounted');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
