// Local, unsigned preview. Uses installed Electron and never publishes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const desktop = path.join(root, 'apps', 'desktop');
const output = path.join(root, 'output', `feature-preview-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`);
const electronDist = path.join(root, 'node_modules', 'electron', 'dist');
if (!fs.existsSync(path.join(electronDist, 'electron.exe'))) throw new Error('Installed Castlabs Electron is required.');
if (!fs.existsSync(path.join(desktop, 'dist', 'renderer', 'index.html'))) throw new Error('Build desktop first.');
fs.mkdirSync(output, { recursive: false });
const blocked = [];
for (const protocol of ['http', 'https']) {
  const transport = require(`node:${protocol}`);
  for (const method of ['request', 'get']) transport[method] = () => {
    blocked.push(`${protocol}:${method}`);
    throw new Error('Offline preview packaging refused network access.');
  };
}
for (const name of Object.keys(process.env)) {
  if (!['SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATH', 'PATHEXT', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMDATA'].includes(name.toUpperCase())) delete process.env[name];
}
Object.assign(process.env, { CSC_IDENTITY_AUTO_DISCOVERY: 'false', ELECTRON_BUILDER_OFFLINE: 'true', npm_config_offline: 'true', npm_config_ignore_scripts: 'true', HTTP_PROXY: 'http://127.0.0.1:1', HTTPS_PROXY: 'http://127.0.0.1:1' });
const { build, Platform, Arch } = require(path.join(root, 'node_modules', 'electron-builder'));
const manifest = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));
const config = {
  ...manifest.build,
  extraResources: [], // Copy serially below: Windows scanners can lock parallel copies.
  directories: { ...manifest.build.directories, output },
  electronDist, electronDownload: { mirror: 'http://127.0.0.1:1/refuse-download/' },
  npmRebuild: false, nodeGypRebuild: false, buildDependenciesFromSource: false,
  beforeBuild: null, beforePack: null, afterPack: null, afterSign: null, afterAllArtifactBuild: null,
  forceCodeSigning: false, publish: null,
  win: { ...manifest.build.win, target: ['dir'], signAndEditExecutable: false,
    signExts: ['!.exe', '!.dll', '!.pyd', '!.node'], signtoolOptions: null, azureSignOptions: null },
};
fs.writeFileSync(path.join(output, 'preview-config.json'), JSON.stringify(config, null, 2));
console.log(`Preview output: ${output}`);
async function copyResources() {
  const matcher = require('minimatch');
  const matches = (file, pattern) => (typeof matcher === 'function' ? matcher : matcher.minimatch)(file, pattern, { dot: true });
  const inventory = {};
  const resources = path.join(output, 'win-unpacked', 'resources');
  for (const entry of manifest.build.extraResources || []) {
    if (typeof entry !== 'object' || typeof entry.from !== 'string' || typeof entry.to !== 'string') throw new Error('Preview requires explicit resource entries.');
    const source = path.resolve(desktop, entry.from), destination = path.resolve(resources, entry.to);
    if (!destination.startsWith(resources + path.sep) || !source.startsWith(root + path.sep)) throw new Error('Resource path escaped workspace.');
    const filters = entry.filter || ['**/*'];
    const include = file => filters.some(pattern => !pattern.startsWith('!') && matches(file, pattern))
      && !filters.some(pattern => pattern.startsWith('!') && matches(file, pattern.slice(1)));
    async function walk(relative = '') {
      for (const item of fs.readdirSync(path.join(source, relative), { withFileTypes: true })) {
        const next = relative ? `${relative}/${item.name}` : item.name;
        if (item.isSymbolicLink()) throw new Error(`Linked resource denied: ${next}`);
        if (item.isDirectory()) {
          if (!filters.some(pattern => pattern.startsWith('!') && matches(`${next}/`, pattern.slice(1)))) await walk(next);
        } else if (item.isFile() && include(next)) {
          const target = path.join(destination, next), bytes = fs.readFileSync(path.join(source, next));
          fs.mkdirSync(path.dirname(target), { recursive: true });
          for (let attempt = 0; ; attempt++) {
            try {
              await fs.promises.writeFile(target, bytes);
              if (!fs.readFileSync(target).equals(bytes)) throw new Error(`Resource copy mismatch: ${next}`);
              break;
            } catch (error) {
              if (!['EBUSY', 'EPERM', 'EACCES'].includes(error.code) || attempt >= 7) throw error;
              await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
            }
          }
          inventory[`${entry.to}/${next}`] = crypto.createHash('sha256').update(bytes).digest('hex');
        }
      }
    }
    await walk();
  }
  fs.writeFileSync(path.join(output, 'resource-hashes.json'), JSON.stringify(inventory, null, 2));
  return Object.keys(inventory).length;
}
build({ projectDir: desktop, targets: Platform.WINDOWS.createTarget(['dir'], Arch.x64), config, publish: 'never' })
  .then(async artifacts => {
    const resourceFiles = await copyResources();
    // Preview packages intentionally omit electron-builder's app-update.yml.
    // Bind that offline behavior to this exact app version so the updater is
    // disabled instead of reporting a missing production update manifest.
    const variantMarker = { schemaVersion: 1, variant: 'offline-test', appVersion: manifest.version };
    fs.writeFileSync(path.join(output, 'win-unpacked', 'resources', 'lastbrowser-build-variant.json'), `${JSON.stringify(variantMarker)}\n`);
    fs.writeFileSync(path.join(output, 'preview-result.json'), JSON.stringify({ createdAt: new Date().toISOString(), artifacts, resourceFiles, blocked, unsigned: true, published: false, fullAcceptanceVerified: false }, null, 2));
    console.log(`Start: ${path.join(output, 'win-unpacked', 'Lastbrowser.exe')}`);
  })
  .catch(error => {
    fs.writeFileSync(path.join(output, 'preview-result.json'), JSON.stringify({ error: error.message, blocked }, null, 2));
    console.error(error.stack || error.message); process.exitCode = 1;
  });
