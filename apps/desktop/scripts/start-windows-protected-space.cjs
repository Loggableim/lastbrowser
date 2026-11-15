// Engineering entry point against a built desktop tree. The trusted caller
// must supply installed helpers and send the UTF-8 password through a pipe.
const { existsSync } = require('node:fs');
const { open, unlink } = require('node:fs/promises');
const path = require('node:path');

async function main() {
  if (process.platform !== 'win32' || process.argv.length !== 8 || process.stdin.isTTY) {
    throw new Error('Supply the active pair, Electron, Cryptomator CLI, PowerShell, the NV helper and an unused drive root');
  }
  const [pair, executable, helper, powershell, nvKeyHelper, drive] = process.argv.slice(2);
  if (![pair, executable, helper, powershell, nvKeyHelper].every(path.isAbsolute)
    || !/^[D-Z]:\\$/i.test(drive) || existsSync(drive)) throw new Error('Invalid protected launch parameters');
  const { loadActiveSpaceConfiguration } = await import('../dist/main/active-space-config.js');
  const { createWindowsProtectedSpaceBroker } = await import('../dist/main/windows-protected-space-broker.js');
  const configuration = await loadActiveSpaceConfiguration(pair);
  const lockPath = path.join(configuration.root, 'broker.lock');
  const lock = await open(lockPath, 'wx', 0o600);
  const password = Buffer.alloc(4096);
  try {
    const unlock = createWindowsProtectedSpaceBroker({
      ...configuration,
      executable,
      browserArgs: [path.join(__dirname, '..')],
      helper, drive, powershell, nvKeyHelper,
      platformKeyHelper: path.join(__dirname, 'space-platform-key.ps1'),
      async lockPrimary() {
        if (existsSync(drive)) throw new Error('A protected drive is still mounted');
      }
    });
    let length = 0;
    for await (const chunk of process.stdin) {
      try {
        if (chunk.length > password.length - length) throw new Error('The password exceeds the input limit');
        chunk.copy(password, length);
        length += chunk.length;
      } finally {
        chunk.fill(0);
      }
    }
    if (password[length - 1] === 10) length--;
    if (password[length - 1] === 13) length--;
    if (!await unlock(password.subarray(0, length))) {
      console.error('The protected Space could not be unlocked');
      process.exitCode = 1;
    }
  } finally {
    password.fill(0);
    await lock.close();
    await unlink(lockPath);
  }
}

main().catch(() => {
  console.error('The protected Space could not be started');
  process.exitCode = 1;
});
