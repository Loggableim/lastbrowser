// Engineering entry point for a built desktop tree and an offline legacy profile.
// Reads passwords and scoped renderer data through an inherited pipe.
const path = require('node:path');

async function main() {
  if (process.platform !== 'win32' || ![9, 10].includes(process.argv.length) || process.stdin.isTTY) {
    throw new Error('Expected offline profile, Electron, Java, libraries, Cryptomator CLI, TPM helper, drive and optional browser parent PID');
  }
  const [legacyUserData, browserExecutable, java, libraryDirectory, helper, nvKeyHelper, drive, parent] = process.argv.slice(2);
  if (![legacyUserData, browserExecutable, java, libraryDirectory, helper, nvKeyHelper].every(path.isAbsolute)
    || (parent !== undefined && !/^[1-9][0-9]*$/.test(parent))) throw new Error('Invalid Windows migration parameters');
  const { runOfflineWindowsSpaceMigration } = await import('../dist/main/windows-space-offline-migration.js');
  const receipt = await runOfflineWindowsSpaceMigration({
    legacyUserData, browserExecutable, java, libraryDirectory, helper, nvKeyHelper, drive,
    browserArgs: [path.join(__dirname, '..')], parentPid: parent === undefined ? undefined : Number(parent),
    initializerSource: path.join(__dirname, 'InitializeSpaceVault.java')
  });
  console.log(JSON.stringify({ receipt, state: 'active' }));
}

main().catch(() => {
  console.error('The protected Space pair migration did not finish');
  process.exitCode = 1;
});
