const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * electron-builder afterSign hook for Castlabs EVS (Electron VMP Signing).
 * Signs the packaged and Authenticode-signed Windows executable with Google Widevine VMP.
 * Note: On Windows, VMP signing MUST run in afterSign (after signtool) so that
 * Authenticode certificate injection does not alter the PE header and invalidate the VMP signature.
 */
function createEvsSigningHook(overrides = {}) {
  const deps = {
    spawnSync,
    existsSync: fs.existsSync,
    env: process.env,
    log: console.log,
    warn: console.warn,
    ...overrides
  };

  return async function (context) {
    if (context.electronPlatformName !== 'win32') {
      return;
    }

    const appOutDir = context.appOutDir;
    const required = deps.env.EVS_REQUIRED === '1';
    const failOrWarn = (message) => {
      const diagnostic = `[EVS/VMP] ${message}`;
      if (required) {
        throw new Error(diagnostic);
      }
      deps.warn(`${diagnostic} Continuing only as a local test build without a verified VMP signature; do not release this artifact.`);
    };

    deps.log(`\n[EVS/VMP] Executing afterSign hook: Widevine VMP signing for ${appOutDir}`);

    const explicitCredentials = Boolean(deps.env.EVS_ACCOUNT_NAME?.trim() && deps.env.EVS_PASSWD?.trim());
    if (required && !explicitCredentials) {
      failOrWarn('Required EVS account credentials are missing.');
      return;
    }

    if (!explicitCredentials) {
      deps.log('[EVS/VMP] No explicit credentials supplied; trying the locally cached Castlabs account session.');
    }

    const targetExe = path.join(appOutDir, 'Lastbrowser.exe');
    if (!deps.existsSync(targetExe)) {
      failOrWarn(`Required package executable not found: ${targetExe}`);
      return;
    }

    const pythonCmd = deps.env.PYTHON || 'python';
    const vmpArgs = ['-m', 'castlabs_evs.vmp', '-n'];
    const options = { stdio: 'inherit', shell: true };

    try {
      const signResult = deps.spawnSync(pythonCmd, [...vmpArgs, 'sign-pkg', appOutDir], options);
      if (signResult.error || signResult.status !== 0) {
        const details = signResult.error?.message || `exit code ${signResult.status}`;
        failOrWarn(`VMP signing failed (${details}).`);
        return;
      }

      const verifyResult = deps.spawnSync(pythonCmd, [...vmpArgs, 'verify-pkg', appOutDir], options);
      if (verifyResult.error || verifyResult.status !== 0) {
        const details = verifyResult.error?.message || `exit code ${verifyResult.status}`;
        failOrWarn(`VMP package verification failed (${details}).`);
        return;
      }

      deps.log('[EVS/VMP] Widevine VMP package signing and verification succeeded.');
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('[EVS/VMP]')) {
        throw err;
      }
      const details = err instanceof Error ? err.message : String(err);
      failOrWarn(`VMP signing step failed (${details}).`);
    }
  };
}

exports.createEvsSigningHook = createEvsSigningHook;
exports.default = createEvsSigningHook();
