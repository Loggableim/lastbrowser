'use strict';
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

module.exports = async function verifyPackagedDependencies(context) {
  const resources = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  const archive = path.join(resources, 'app.asar');
  const entries = new Set(asar.listPackage(archive).map(name => name.replaceAll('\\', '/').replace(/^\//, '')));
  const read = file => JSON.parse(asar.extractFile(archive, file.replaceAll('/', path.sep)).toString());
  const visited = new Set();
  function locate(name, parent) {
    let directory = parent;
    for (;;) {
      const file = path.posix.join(directory, 'node_modules', name, 'package.json');
      if (entries.has(file)) return file;
      if (!directory || directory === '.') return null;
      directory = path.posix.dirname(directory);
      if (directory === '.') directory = '';
    }
  }
  function verify(manifestPath) {
    if (visited.has(manifestPath)) return;
    visited.add(manifestPath);
    const pkg = read(manifestPath);
    const directory = path.posix.dirname(manifestPath);
    if (pkg.main) {
      const main = path.posix.join(directory, pkg.main);
      if (![main, main + '.js', main + '.json', main + '.node', main + '/index.js'].some(file => entries.has(file))) throw new Error(`Packaged entry missing: ${pkg.name}: ${pkg.main}`);
    }
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      const dependency = locate(name, directory === '.' ? '' : directory);
      if (!dependency && !pkg.optionalDependencies?.[name]) throw new Error(`Production package missing in app.asar: ${name} required by ${pkg.name}`);
      if (dependency) verify(dependency);
    }
  }
  if (!fs.existsSync(archive)) throw new Error('Packaged app.asar is missing.');
  verify('package.json');
  console.log(`[PACKAGE-DEPENDENCIES] Verified ${visited.size - 1} production package manifests and entry files.`);
};
