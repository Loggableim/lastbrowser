// ── Hermes Desktop Electron Builder Config ─────────────────────────────────
// Extended configuration referenced by package.json build section.
// See: https://www.electron.build/

const path = require('path');

/**
 * @type {import('electron-builder').Configuration}
 * @see https://www.electron.build/configuration/configuration
 */
const config = {
  appId: 'app.lastbrowser.desktop',
  productName: 'LastBrowser',
  copyright: 'Copyright © 2026 Pup Cid',

  directories: {
    output: 'dist',
    buildResources: 'assets',
  },

  files: [
    'main.js',
    'preload.js',
    'tray.js',
    'server-launcher.js',
    'sidebar.html',
    'sidebar.js',
    'sidebar.css',
    'assets/**/*',
    '!assets/*.svg',
  ],

  // ═════════════════════════════════════════════════════════════════════
  // Python WebUI bundling
  // The server.py + api/ + static/ are bundled as extraResources so
  // the Electron app can spawn the Python backend at runtime.
  // ═════════════════════════════════════════════════════════════════════
  extraResources: [
    {
      from: '../',
      to: 'webui',
      filter: [
        'server.py',
        'api/**/*',
        'static/**/*',
        'requirements.txt',
        'scripts/**/*',
        'docs/**/*',
        '*.md',
        '*.yml',
        '*.yaml',
      ],
    },
  ],

  // ═════════════════════════════════════════════════════════════════════
  // Windows packaging
  // ═════════════════════════════════════════════════════════════════════
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64'],
      },
    ],
    icon: 'assets/icon.ico',
    artifactName: 'LastBrowser-Setup-${version}.${ext}',
    // On Windows 10+, add a desktop shortcut via NSIS
    extraResources: [
      {
        from: 'assets/icon.ico',
        to: 'icon.ico',
      },
    ],
  },

  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'LastBrowser',
    installerIcon: 'assets/icon.ico',
    uninstallerIcon: 'assets/icon.ico',
    license: '../LICENSE',
  },

  // ═════════════════════════════════════════════════════════════════════
  // Portability
  // ═════════════════════════════════════════════════════════════════════
  portable: {
    artifactName: 'LastBrowser-Portable-${version}.${ext}',
    requestExecutionLevel: 'user',
  },

  // ═════════════════════════════════════════════════════════════════════
  // Auto-update via GitHub Releases
  // ═════════════════════════════════════════════════════════════════════
  publish: {
    provider: 'github',
    owner: 'Loggableim',
    repo: 'cids-hermes-webui',
    releaseType: 'release',
  },

  // ═════════════════════════════════════════════════════════════════════
  // Compression
  // ═════════════════════════════════════════════════════════════════════
  compression: 'maximum',
  removePackageScripts: true,
};

module.exports = config;
