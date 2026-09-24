const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * electron-builder afterPack hook for Castlabs EVS (Electron VMP Signing).
 * Signs the packaged Windows executable with Google Widevine VMP.
 */
exports.default = async function (context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const appOutDir = context.appOutDir;
  console.log(`\n[EVS/VMP] Executing afterPack hook: Widevine VMP signing for ${appOutDir}`);

  const targetExe = path.join(appOutDir, 'Lastbrowser.exe');
  if (!fs.existsSync(targetExe)) {
    console.warn(`[EVS/VMP] Target executable not found: ${targetExe}`);
    return;
  }

  const pythonCmd = process.env.PYTHON || 'python';
  const args = [
    '-m', 'castlabs_evs.vmp',
    '-n', 'sign-pkg',
    appOutDir
  ];

  try {
    const res = spawnSync(pythonCmd, args, { stdio: 'inherit', shell: true });
    if (res.status === 0) {
      console.log('[EVS/VMP] Widevine VMP signing succeeded! Executable is verified for DRM streaming.');
    } else {
      console.warn(`\n[EVS/VMP] Notice: VMP signing exited with status ${res.status}.`);
      console.warn('[EVS/VMP] Widevine DRM streaming (e.g. Netflix) requires a verified EVS account.');
      console.warn('[EVS/VMP] To register or log in, run:');
      console.warn('[EVS/VMP]   python -m castlabs_evs.account signup\n');

      if (process.env.EVS_REQUIRED === '1') {
        throw new Error(`Castlabs VMP signing required but failed with code ${res.status}`);
      }
    }
  } catch (err) {
    if (process.env.EVS_REQUIRED === '1') {
      throw err;
    }
    console.warn('[EVS/VMP] VMP signing step warning:', err.message);
  }
};
