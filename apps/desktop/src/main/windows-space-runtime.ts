import { existsSync, lstatSync } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';

export function resolveWindowsSpaceRuntime(resources: string) {
  const base = path.join(resources, 'protected-spaces');
  const helper = path.join(base, 'cryptomator-cli', 'cryptomator-cli.exe');
  const nvKeyHelper = path.join(base, 'space-tpm-nv.exe');
  requireRuntimeFiles([helper, nvKeyHelper]);
  const drive = [...'ZYXWVUTSRQPONMLKJIHGFED'].map(letter => `${letter}:\\`).find(root => !existsSync(root));
  if (!drive) throw new Error('The protected Space needs an unused drive');
  return { helper, nvKeyHelper, drive };
}

export function resolveWindowsSpaceMigrationRuntime(resources: string) {
  const base = path.join(resources, 'protected-spaces');
  const java = path.join(base, 'jdk', 'bin', 'java.exe');
  const initializerSource = path.join(base, 'InitializeSpaceVault.java');
  const libraryDirectory = path.join(base, 'cryptomator-cli', 'app', 'mods');
  requireRuntimeFiles([java, initializerSource]);
  if (!lstatSync(libraryDirectory, { throwIfNoEntry: false })?.isDirectory()) throw new Error('The protected Space runtime is missing');
  return { ...resolveWindowsSpaceRuntime(resources), java, initializerSource, libraryDirectory };
}

export type SpaceMigrationPrerequisite = 'runtime' | 'winfsp' | 'tpm' | 'tpm-owner';

/** Read-only checks before the user supplies passwords or LastBrowser closes its writers. */
export async function spaceMigrationPrerequisite(resources: string): Promise<SpaceMigrationPrerequisite | null> {
  let helper: string;
  try {
    helper = resolveWindowsSpaceMigrationRuntime(resources).nvKeyHelper;
  } catch {
    return 'runtime';
  }
  return new Promise(resolve => {
    execFile(helper, ['probe-setup'], { windowsHide: true, timeout: 6000 }, error => {
      if (!error) resolve(null);
      else if (error.code === 5) resolve('winfsp');
      else if (error.code === 6) resolve('tpm');
      else if (error.code === 7) resolve('tpm-owner');
      else resolve('runtime');
    });
  });
}

function requireRuntimeFiles(files: string[]) {
  if (files.some(file => !path.isAbsolute(file) || !lstatSync(file, { throwIfNoEntry: false })?.isFile())) {
    throw new Error('The protected Space runtime is missing');
  }
}
