#!/usr/bin/env node
// Local, unsigned NSIS installer and portable executable packaging from an already-packaged preview.
// Uses local electron-builder offline cache and never publishes.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const desktop = path.join(root, 'apps', 'desktop');
const { build, Platform, Arch } = require(path.join(root, 'node_modules', 'electron-builder'));

const previewDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!previewDir || !fs.existsSync(previewDir)) {
  console.error('Usage: node scripts/package-dist-preview.cjs <path-to-preview-folder>');
  process.exit(1);
}

const prepackaged = path.join(previewDir, 'win-unpacked');
if (!fs.existsSync(path.join(prepackaged, 'Lastbrowser.exe'))) {
  console.error(`Error: prepackaged directory not found or missing Lastbrowser.exe: ${prepackaged}`);
  process.exit(1);
}

const previewName = path.basename(previewDir).replace(/^feature-preview-/, 'dist-preview-');
const output = path.join(root, 'output', previewName);
const manifest = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));
const variantMarkerPath = path.join(prepackaged, 'resources', 'lastbrowser-build-variant.json');
let variantMarker;
try {
  variantMarker = JSON.parse(fs.readFileSync(variantMarkerPath, 'utf8'));
} catch {
  throw new Error('Refusing to package an offline preview without its version-bound updater-disable marker. Rebuild the preview from the current package-feature-preview script.');
}
if (!variantMarker || variantMarker.schemaVersion !== 1 || variantMarker.variant !== 'offline-test' || variantMarker.appVersion !== manifest.version) {
  throw new Error(`Refusing to package an offline preview with a missing or mismatched updater-disable marker for version ${manifest.version}.`);
}
fs.mkdirSync(output, { recursive: true });

const config = {
  ...manifest.build,
  directories: { output },
  electronDist: path.join(root, 'node_modules', 'electron', 'dist'),
  npmRebuild: false,
  nodeGypRebuild: false,
  buildDependenciesFromSource: false,
  beforeBuild: null,
  beforePack: null,
  afterPack: null,
  afterSign: null,
  afterAllArtifactBuild: null,
  forceCodeSigning: false,
  publish: null,
  win: {
    ...manifest.build.win,
    target: ['nsis', 'portable'],
    signAndEditExecutable: false,
    signExts: ['!.exe', '!.dll', '!.pyd', '!.node'],
    signtoolOptions: null,
    azureSignOptions: null,
  },
};

console.log(`Packaging NSIS installer and Portable executable from ${prepackaged} -> ${output}`);
build({
  projectDir: desktop,
  prepackaged,
  targets: Platform.WINDOWS.createTarget(['nsis', 'portable'], Arch.x64),
  config,
  publish: 'never',
})
  .then(artifacts => {
    console.log('Dist build completed successfully! Artifacts:', artifacts);
  })
  .catch(err => {
    console.error('Dist build error:', err.message);
    process.exitCode = 1;
  });
