const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * electron-builder afterSign hook for Castlabs EVS (Electron VMP Signing).
 * Signs the packaged and Authenticode-signed Windows executable with Google Widevine VMP.
 * Run VMP signing after the final changes to the Windows executable.
 * Authenticode certificate injection after VMP signing can invalidate the VMP signature.
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
    const failOnVmpError = deps.env.EVS_REQUIRED === '1';
    const failOrWarn = (message) => {
      const diagnostic = `[EVS/VMP] ${message}`;
      if (failOnVmpError) {
        throw new Error(diagnostic);
      }
      deps.warn(`${diagnostic} Continuing only as a local test build without a verified VMP signature; do not release this artifact.`);
    };

    deps.log(`\n[EVS/VMP] Widevine VMP signing for ${appOutDir}`);

    const explicitCredentials = Boolean(deps.env.EVS_ACCOUNT_NAME?.trim() && deps.env.EVS_PASSWD?.trim());
    const requireExplicitCredentials = deps.env.EVS_REQUIRE_EXPLICIT_CREDENTIALS === '1';
    if (requireExplicitCredentials && !explicitCredentials) {
      throw new Error('[EVS/VMP] Required EVS account credentials are missing.');
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
    const options = { stdio: 'inherit', shell: false };

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

if (require.main === module) {
  exports.default({ electronPlatformName: 'win32', appOutDir: path.resolve(process.argv[2]) }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
