import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const desktop = path.dirname(scripts);
const repository = path.resolve(desktop, '../..');
const runtime = path.join(desktop, 'runtime');
const cache = path.resolve(process.env.LASTBROWSER_SPACE_RUNTIME_CACHE || path.join(runtime, 'space-runtime-cache'));
const output = path.join(runtime, 'protected-spaces');
const notices = path.join(repository, 'docs', 'legal', 'notices');
const archives = [
  {
    name: 'cryptomator-cli-0.6.2-win-x64.zip',
    url: 'https://github.com/cryptomator/cli/releases/download/0.6.2/cryptomator-cli-0.6.2-win-x64.zip',
    sha: '52498fe6c0a02f76216fa801a1a114de064b4364702e51548585355fdf8b0a66'
  },
  {
    name: 'microsoft-jdk-25.0.5.0.2-windows-x64.zip',
    url: 'https://aka.ms/download-jdk/microsoft-jdk-25.0.5.0.2-windows-x64.zip',
    sha: '5da7525c8268a10a66bd76a39f4e9af24d4ebc974d42800a609852c498a68460'
  },
  {
    name: 'microsoft.tss.2.1.1.nupkg',
    url: 'https://api.nuget.org/v3-flatcontainer/microsoft.tss/2.1.1/microsoft.tss.2.1.1.nupkg',
    sha: '5d9a18db2257a0f99dbe99d0010ed429a9dcc9fe0517f3401f8ca1c572a630c7'
  }
];

async function verify(file, expected) {
  const hash = createHash('sha256');
  for await (const part of createReadStream(file)) hash.update(part);
  if (hash.digest('hex') !== expected) throw new Error(`Checksum mismatch for ${path.basename(file)}`);
}

function run(command, args) {
  const result = spawnSync(command, args, { windowsHide: true, stdio: 'inherit', timeout: 120_000 });
  if (result.error || result.status !== 0) throw new Error(`Could not run ${path.basename(command)}`);
}

async function download(archive) {
  const target = path.join(cache, archive.name);
  if (await lstat(target).then(() => true, error => {
    if (error.code !== 'ENOENT') throw error;
    return false;
  })) {
    await verify(target, archive.sha);
    return;
  }
  const dir = await mkdtemp(path.join(cache, '.download-'));
  try {
    const temp = path.join(dir, archive.name);
    const response = await fetch(archive.url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok || !response.body) throw new Error(`Could not download ${archive.name}`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temp, { flags: 'wx' }));
    await verify(temp, archive.sha);
    await rename(temp, target);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

async function stage() {
  await Promise.all(archives.map(archive => verify(path.join(cache, archive.name), archive.sha)));
  await mkdir(runtime, { recursive: true });
  if (path.relative(runtime, await realpath(runtime))) throw new Error('The runtime staging directory is redirected');
  const stageRoot = await mkdtemp(path.join(runtime, '.protected-spaces-'));
  try {
    const system = process.env.SystemRoot;
    if (!system || !path.isAbsolute(system)) throw new Error('Windows SystemRoot is unavailable');
    const tar = path.join(system, 'System32', 'tar.exe');
    const staged = path.join(stageRoot, 'staged');
    await mkdir(staged);
    const [cliArchive, jdkArchive, tssArchive] = archives;
    // LastBrowser runs the Cryptomator modules with the separately pinned JDK.
    // Include the modules and their license, without the unused standalone launcher and JRE.
    run(tar, ['-xf', path.join(cache, cliArchive.name), '-C', staged,
      'cryptomator-cli/LICENSE.txt', 'cryptomator-cli/app/mods']);
    const jdk = path.join(staged, 'jdk');
    await mkdir(jdk);
    run(tar, ['-xf', path.join(cache, jdkArchive.name), '--strip-components', '1', '-C', jdk]);
    run(tar, ['-xf', path.join(cache, tssArchive.name), '-C', stageRoot, 'lib/net46/TSS.Net.dll']);
    const dll = path.join(staged, 'TSS.Net.dll');
    await copyFile(path.join(stageRoot, 'lib', 'net46', 'TSS.Net.dll'), dll);
    await Promise.all([
      copyFile(path.join(notices, 'microsoft-tss-2.1.1.txt'), path.join(staged, 'Microsoft.TSS-LICENSE.txt')),
      copyFile(path.join(notices, 'jfuse-0.7.3.txt'), path.join(staged, 'jFUSE-LICENSE.txt')),
      copyFile(path.join(repository, 'LICENSE'), path.join(staged, 'jFUSE-GPL-3.0.txt')),
      copyFile(path.join(notices, 'auth0-java-jwt-4.4.0.txt'), path.join(staged, 'Auth0-java-jwt-LICENSE.txt')),
      copyFile(path.join(notices, 'logback-1.5.18.txt'), path.join(staged, 'Logback-LICENSE-NOTICE.txt')),
      copyFile(path.join(notices, 'siv-mode-1.5.2.txt'), path.join(staged, 'SIV-Mode-LICENSE.txt')),
      copyFile(path.join(notices, 'bouncy-castle-1.78.html'), path.join(staged, 'Bouncy-Castle-LICENSE.html')),
      copyFile(path.join(notices, 'apache-2.0.txt'), path.join(staged, 'Apache-2.0-LICENSE.txt')),
      copyFile(path.join(notices, 'logback-epl-1.0.txt'), path.join(staged, 'Logback-EPL-1.0.txt')),
      copyFile(path.join(notices, 'logback-lgpl-2.1.txt'), path.join(staged, 'Logback-LGPL-2.1.txt')),
      copyFile(path.join(notices, 'gson-2.10.1-license.txt'), path.join(staged, 'Gson-2.10.1-LICENSE.txt')),
      copyFile(path.join(notices, 'jsr305-reference-bsd-3-clause.txt'), path.join(staged, 'JSR305-Reference-BSD-3-Clause.txt')),
      copyFile(path.join(notices, 'cc-by-2.5.txt'), path.join(staged, 'CC-BY-2.5.txt')),
      copyFile(path.join(notices, 'cryptomator-cli-0.6.2-jar-attributions.txt'), path.join(staged, 'Cryptomator-CLI-0.6.2-JAR-ATTRIBUTIONS.txt')),
      copyFile(path.join(notices, 'cryptomator-cli-0.6.2-java-apache.txt'), path.join(staged, 'Cryptomator-Java-Apache-NOTICE.txt'))
    ]);
    await copyFile(path.join(scripts, 'InitializeSpaceVault.java'), path.join(staged, 'InitializeSpaceVault.java'));
    run(path.join(system, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'), [
      '/nologo', '/target:exe', `/reference:${dll}`, `/out:${path.join(staged, 'space-tpm-nv.exe')}`,
      path.join(scripts, 'SpaceTpmNvSecret.cs'), path.join(scripts, 'SpacePlatformKey.cs')
    ]);
    if (path.relative(runtime, path.dirname(output)) || path.basename(output) !== 'protected-spaces') {
      throw new Error('Invalid runtime staging destination');
    }
    const current = await lstat(output).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (current && (!current.isDirectory() || path.relative(output, await realpath(output)))) {
      throw new Error('The protected Space runtime destination is redirected');
    }
    if (current) await rm(output, { recursive: true, force: true });
    await rename(staged, output);
    console.log('Staged the pinned Windows protected Space runtime.');
  } finally { await rm(stageRoot, { recursive: true, force: true }); }
}

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('The protected Space runtime requires Windows x64');
if (process.argv.includes('--download')) {
  await mkdir(cache, { recursive: true });
  for (const archive of archives) await download(archive);
} else {
  await stage();
}
