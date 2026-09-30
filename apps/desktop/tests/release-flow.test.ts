import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const desktopPackagePath = path.join(repoRoot, 'apps', 'desktop', 'package.json');
const rootPackagePath = path.join(repoRoot, 'package.json');
const releaseWorkflowPath = path.join(repoRoot, '.github', 'workflows', 'release.yml');
const releaseDocPath = path.join(repoRoot, 'docs', 'release.md');

function readJson(file: string): Record<string, any> {
  return JSON.parse(readFileSync(file, 'utf8'));
}

describe('GitHub release auto-update flow', () => {
  it('configures electron-builder GitHub publishing for Lastbrowser releases', () => {
    const pkg = readJson(desktopPackagePath);

    expect(pkg.dependencies['electron-updater']).toBeTruthy();
    // GitHub Actions signs the final installer files, then uploads them with
    // action-gh-release. electron-builder must not publish unsigned artifacts.
    expect(pkg.scripts['package:win:publish']).toContain('--publish never');
    expect(pkg.build.afterSign).toBe('scripts/evs-sign.cjs');
    expect(pkg.build.publish).toEqual([
      {
        provider: 'github',
        owner: 'Loggableim',
        repo: 'lastbrowser',
        releaseType: 'release'
      }
    ]);
  });

  it('exposes a root release command for the Windows GitHub release build', () => {
    const pkg = readJson(rootPackagePath);

    expect(pkg.scripts['release:win']).toBe('npm --workspace apps/desktop run package:win:publish');
  });

  it('builds and publishes Windows updater artifacts from version tags', () => {
    expect(existsSync(releaseWorkflowPath)).toBe(true);
    const workflow = readFileSync(releaseWorkflowPath, 'utf8');

    expect(workflow).toContain("tags: ['v*']");
    expect(workflow).not.toContain('workflow_dispatch:');
    expect(workflow).toContain('contents: write');
    expect(workflow).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(workflow).toContain('npm --workspace apps/desktop run package:win:publish');
    expect(workflow).toContain('apps/desktop/release/*.blockmap');
  });

  it('fails before build and publication when Trusted Signing secrets are missing', () => {
    const workflow = readFileSync(releaseWorkflowPath, 'utf8');
    const tagValidationIndex = workflow.indexOf('Require a version-matched release tag');
    const validationIndex = workflow.indexOf('Require signing credentials before release setup');
    const pythonDependencyIndex = workflow.indexOf('Install Sidekick backend test dependencies');
    const pythonSyntaxIndex = workflow.indexOf('Check Sidekick Python syntax');
    const backendTestIndex = workflow.indexOf('Test Sidekick backend');
    const buildIndex = workflow.indexOf('Build Windows Installer');
    const signingIndex = workflow.indexOf('Sign binaries with Azure Trusted Signing');
    const metadataIndex = workflow.indexOf('Refresh signed installer checksum and differential blockmap');
    const verificationIndex = workflow.indexOf('Verify Authenticode Signature');
    const vmpVerificationIndex = workflow.indexOf('Verify packaged Widevine VMP signature');
    const inventoryIndex = workflow.indexOf('Require exactly the expected Windows executables');
    const publishIndex = workflow.indexOf('Publish GitHub Release');

    expect(tagValidationIndex).toBeGreaterThan(-1);
    expect(tagValidationIndex).toBeLessThan(validationIndex);
    expect(validationIndex).toBeLessThan(pythonDependencyIndex);
    expect(pythonDependencyIndex).toBeGreaterThan(tagValidationIndex);
    expect(pythonSyntaxIndex).toBeGreaterThan(pythonDependencyIndex);
    expect(backendTestIndex).toBeGreaterThan(pythonSyntaxIndex);
    expect(backendTestIndex).toBeLessThan(buildIndex);
    expect(backendTestIndex).toBeLessThan(signingIndex);
    expect(backendTestIndex).toBeLessThan(publishIndex);
    expect(workflow).toContain('python-version: \'3.12\'');
    expect(workflow).toContain('python -m pip install --disable-pip-version-check -e ".[web,all,dev]"');
    expect(workflow).toContain('python -m compileall -q services/sidekick');
    expect(workflow).toContain('python -m pytest');
    expect(workflow).toContain("'^refs/tags/v(\\d+)\\.(\\d+)\\.(\\d+)$'");
    expect(workflow).toContain('does not match desktop package version');
    expect(validationIndex).toBeGreaterThan(-1);
    expect(validationIndex).toBeLessThan(buildIndex);
    expect(buildIndex).toBeLessThan(inventoryIndex);
    expect(inventoryIndex).toBeLessThan(signingIndex);
    expect(buildIndex).toBeLessThan(signingIndex);
    expect(signingIndex).toBeLessThan(metadataIndex);
    expect(metadataIndex).toBeLessThan(verificationIndex);
    expect(verificationIndex).toBeLessThan(vmpVerificationIndex);
    expect(vmpVerificationIndex).toBeLessThan(publishIndex);
    for (const secret of [
      'AZURE_CLIENT_ID',
      'AZURE_CLIENT_SECRET',
      'AZURE_TENANT_ID',
      'AZURE_TRUSTED_SIGNING_ACCOUNT',
      'AZURE_CERTIFICATE_PROFILE',
      'EVS_ACCOUNT_NAME',
      'EVS_PASSWD'
    ]) {
      expect(workflow).toContain(`'${secret}'`);
    }
    expect(workflow).toContain('Cannot publish without Azure Authenticode and Castlabs VMP signing');
    expect(workflow).toContain('Expected exactly these release executables:');
    expect(workflow).toContain('Expected exactly these signed release executables:');
    expect(workflow).toContain('Lastbrowser-$version-x64-setup.exe');
    expect(workflow).toContain('Lastbrowser-$version-x64-portable.exe');
    expect(workflow).toContain('if ($LASTEXITCODE -ne 0)');
    expect(workflow).toContain('Authenticode verification failed for $($executable.Name)');
    expect(workflow).toContain("if: success() && startsWith(github.ref, 'refs/tags/v')");
    expect(workflow).toContain("EVS_REQUIRED: '1'");
    expect(workflow).toContain("EVS_NO_ASK: '1'");
    expect(workflow).toContain('python -m castlabs_evs.vmp -n verify-pkg $packageDir');
    expect(workflow).toContain('Castlabs VMP package verification failed');
    expect(workflow).toContain('node scripts/refresh-signed-release-metadata.mjs');
    const refreshScript = readFileSync(path.join(repoRoot, 'scripts', 'refresh-signed-release-metadata.mjs'), 'utf8');
    expect(refreshScript).toContain('expectedNames.some((name) => !executables.includes(name))');
    expect(refreshScript).toContain("initialUrls.filter((url) => url === setupName).length !== 1");
    expect(refreshScript).toContain("initialUrls.filter((url) => url === portableName).length > 1");
    expect(refreshScript).toContain('metadata.files = [setupEntry, portableEntry]');
    expect(refreshScript).toContain('Signed setup/portable checksum, size, and update-path metadata verification failed');
    for (const secret of [
      'AZURE_CLIENT_ID',
      'AZURE_CLIENT_SECRET',
      'AZURE_TENANT_ID',
      'AZURE_TRUSTED_SIGNING_ACCOUNT',
      'AZURE_CERTIFICATE_PROFILE',
      'EVS_ACCOUNT_NAME',
      'EVS_PASSWD'
    ]) {
      expect(workflow).toContain(`${secret}: \${{ secrets.${secret} }}`);
    }
  });

  it('documents the tag-based GitHub Releases flow and required update metadata', () => {
    expect(existsSync(releaseDocPath)).toBe(true);
    const docs = readFileSync(releaseDocPath, 'utf8');

    expect(docs).toContain('latest.yml');
    expect(docs).toContain('exactly one version-matched setup executable and one portable executable');
    expect(docs).toContain('records both artifacts');
    expect(docs).toContain('v0.1.4');
    expect(docs).toContain('GitHub Releases');
  });
});
