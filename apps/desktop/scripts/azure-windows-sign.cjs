'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { createWindowsSignaturePreserver } = require('./preserve-valid-windows-signatures.cjs');

const requiredInputs = [
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
  'AZURE_TENANT_ID',
  'AZURE_TRUSTED_SIGNING_ACCOUNT',
  'AZURE_CERTIFICATE_PROFILE',
  'AZURE_TRUSTED_SIGNING_ENDPOINT',
  'WINDOWS_SIGNING_PUBLISHER_SUBJECT'
];

function createAzureWindowsSigner({ env = process.env, spawn = spawnSync, inspect } = {}) {
  return createWindowsSignaturePreserver({
    inspectAuthenticode: inspect,
    delegateToBuilder(configuration) {
      const missing = requiredInputs.filter(name => !env[name]?.trim());
      if (missing.length) {
        throw new Error('Missing Windows signing inputs: ' + missing.join(', '));
      }
      if (configuration.hash !== 'sha256' || configuration.isNest) {
        throw new Error('Azure signing requires one SHA-256 signature per file.');
      }
      const target = path.resolve(configuration.path);
      if (target.includes(',')) {
        throw new Error('Azure signing file paths cannot contain commas.');
      }

      const childEnv = { ...env, LASTBROWSER_SIGNING_TARGET: target };
      delete childEnv.EVS_ACCOUNT_NAME;
      delete childEnv.EVS_PASSWD;
      const result = spawn('pwsh.exe', [
        '-NoLogo', '-NoProfile', '-NonInteractive', '-File',
        path.join(__dirname, 'azure-windows-sign.ps1')
      ], { env: childEnv, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore'] });
      if (result.error || result.status !== 0) {
        const status = result.status === null || result.status === undefined ? 'could not run' : 'exit ' + result.status;
        throw new Error(`Azure signing failed for ${path.basename(target)} (${status}).`);
      }
    }
  });
}

module.exports = createAzureWindowsSigner();
module.exports.createAzureWindowsSigner = createAzureWindowsSigner;
