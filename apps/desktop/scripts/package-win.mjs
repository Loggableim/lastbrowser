import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(desktopDir, '../..');
const requireFromDesktop = createRequire(path.join(desktopDir, 'package.json'));
const expectedBuilderVersion = '26.8.1';

function packageRoot(packageName) {
  const packageJson = requireFromDesktop.resolve(`${packageName}/package.json`);
  const metadata = JSON.parse(readFileSync(packageJson, 'utf8'));
  if (metadata.version !== expectedBuilderVersion) {
    throw new Error(
      `Windows packaging expects ${packageName} ${expectedBuilderVersion}; found ${metadata.version}. Review the checked-in NSIS patch before upgrading electron-builder.`,
    );
  }
  return path.dirname(packageJson);
}

const electronBuilderRoot = packageRoot('electron-builder');
const appBuilderLibRoot = packageRoot('app-builder-lib');
const toolRoot = path.resolve(repoRoot, '.test-tmp/installer-builder');
const toolNodeModules = path.join(toolRoot, 'node_modules');
const installRoot = realpathSync(repoRoot).toLocaleLowerCase();
if (!toolRoot.toLocaleLowerCase().startsWith(`${installRoot}${path.sep.toLocaleLowerCase()}`)) {
  throw new Error(`Refusing to prepare installer tools outside the repository: ${toolRoot}`);
}

// Keep the NSIS template patch isolated from shared or junction-backed node_modules.
rmSync(toolRoot, { recursive: true, force: true });
mkdirSync(toolNodeModules, { recursive: true });
cpSync(electronBuilderRoot, path.join(toolNodeModules, 'electron-builder'), {
  recursive: true,
  dereference: true,
});
cpSync(appBuilderLibRoot, path.join(toolNodeModules, 'app-builder-lib'), {
  recursive: true,
  dereference: true,
});

const patchPath = path.join(desktopDir, 'patches', `app-builder-lib+${expectedBuilderVersion}.patch`);
const packageRelativePath = path.relative(repoRoot, path.join(toolNodeModules, 'app-builder-lib')).replaceAll('\\', '/');
const patchArgs = ['--unsafe-paths', '--ignore-space-change', `--directory=${packageRelativePath}`, patchPath];
execFileSync('git', ['apply', '--check', ...patchArgs], { cwd: repoRoot, stdio: 'inherit' });
execFileSync('git', ['apply', ...patchArgs], { cwd: repoRoot, stdio: 'inherit' });

const localBuilder = path.join(toolNodeModules, 'electron-builder', 'cli.js');
const args = ['--win', 'nsis', 'portable', ...process.argv.slice(2)];
console.log('Building Windows packages with visible NSIS installation details.');
const result = spawnSync(process.execPath, [localBuilder, ...args], {
  cwd: desktopDir,
  env: process.env,
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
