import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'release-pipeline.yml');
const signedWorkflowPath = path.join(repoRoot, '.github', 'workflows', 'release.yml');
const docPath = path.join(repoRoot, 'docs', 'release-pipeline.md');
const scriptPath = path.join(repoRoot, 'scripts', 'resolve-release-channel.mjs');

type ResolvedChannel = {
  tag: string;
  version: string;
  channel: string;
  prerelease: boolean;
  feed: string;
  releaseType: string;
  betaIndex: number | null;
};

type ChannelModule = {
  resolveReleaseChannel: (input: { tag?: string; version?: string }) => ResolvedChannel;
  parseReleaseVersion: (raw: string) => { version: string; channel: string; betaIndex: number | null };
};

let channelModule: ChannelModule;

function readJson(file: string): Record<string, any> {
  return JSON.parse(readFileSync(file, 'utf8'));
}

beforeAll(async () => {
  channelModule = (await import(
    pathToFileURL(scriptPath).href
  )) as unknown as ChannelModule;
});

describe('resolveReleaseChannel', () => {
  it('maps a plain version to the Stable channel and latest.yml', () => {
    expect(channelModule.resolveReleaseChannel({ version: '0.1.44' })).toEqual({
      tag: 'v0.1.44',
      version: '0.1.44',
      channel: 'stable',
      prerelease: false,
      feed: 'latest.yml',
      releaseType: 'release',
      betaIndex: null
    });
  });

  it('maps a beta version to the Beta channel and beta.yml', () => {
    const resolved = channelModule.resolveReleaseChannel({ version: '0.1.58-beta.1' });
    expect(resolved.channel).toBe('beta');
    expect(resolved.prerelease).toBe(true);
    expect(resolved.feed).toBe('beta.yml');
    expect(resolved.releaseType).toBe('prerelease');
    expect(resolved.tag).toBe('v0.1.58-beta.1');
    expect(resolved.betaIndex).toBe(1);
  });

  it('accepts a v-prefixed tag together with its version', () => {
    const resolved = channelModule.resolveReleaseChannel({ tag: 'v0.1.58-beta.2', version: '0.1.58-beta.2' });
    expect(resolved.version).toBe('0.1.58-beta.2');
    expect(resolved.betaIndex).toBe(2);
  });

  it('rejects a tag that does not match the version', () => {
    expect(() => channelModule.resolveReleaseChannel({ tag: 'v0.1.58-beta.1', version: '0.1.58' })).toThrow(
      /does not match version/
    );
  });

  it('rejects unsupported prerelease identifiers', () => {
    expect(() => channelModule.resolveReleaseChannel({ version: '0.1.44-alpha' })).toThrow(
      /Only beta\.N prereleases are supported/
    );
  });

  it('rejects non-positive beta counters and malformed versions', () => {
    expect(() => channelModule.resolveReleaseChannel({ version: '0.1.44-beta.0' })).toThrow(
      /positive integer/
    );
    expect(() => channelModule.resolveReleaseChannel({ version: 'not-a-version' })).toThrow(
      /Unsupported release version/
    );
  });

  it('requires a tag or a version', () => {
    expect(() => channelModule.resolveReleaseChannel({})).toThrow(/requires a tag and\/or a version/);
  });

  it('parses versions without a channel when only classifying', () => {
    expect(channelModule.parseReleaseVersion('v0.1.70')).toEqual({
      version: '0.1.70',
      major: 0,
      minor: 1,
      patch: 70,
      channel: 'stable',
      prerelease: false,
      betaIndex: null
    });
  });
});

describe('resolve-release-channel CLI', () => {
  it('prints the resolution as JSON', () => {
    const output = execFileSync(process.execPath, [scriptPath, '0.1.58-beta.1'], { encoding: 'utf8' });
    const resolved = JSON.parse(output) as ResolvedChannel;
    expect(resolved.channel).toBe('beta');
    expect(resolved.feed).toBe('beta.yml');
  });

  it('validates a tag against the expected version', () => {
    const output = execFileSync(process.execPath, [scriptPath, 'v0.1.44', '0.1.44'], { encoding: 'utf8' });
    expect((JSON.parse(output) as ResolvedChannel).channel).toBe('stable');
  });
});

describe('unsigned release pipeline workflow', () => {
  it('documents and implements an unsigned Beta and Stable pipeline', () => {
    expect(existsSync(workflowPath)).toBe(true);
    const workflow = readFileSync(workflowPath, 'utf8').replace(/\r\n/g, '\n');

    // Zero secrets and no write access: artifacts are uploaded, never released.
    expect(workflow).not.toContain('secrets.');
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).not.toContain('contents: write');
    expect(workflow).not.toContain('softprops/action-gh-release');
    expect(workflow).not.toContain('tag_name');
    expect(workflow).toContain('persist-credentials: false');

    // Triggers: manual run plus the daily Tagesbeta schedule.
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("cron: '0 18 * * *'");
    expect(workflow).toContain('version:');
    expect(workflow).not.toMatch(/^  push:/m);

    // Channel resolution is shared with the tests, not hardcoded.
    expect(workflow).toContain('node scripts/resolve-release-channel.mjs');
    expect(workflow).toContain('steps.channel.outputs.feed');
    const resolver = readFileSync(scriptPath, 'utf8');
    expect(resolver).toContain('beta.yml');
    expect(resolver).toContain('latest.yml');

    // Unsigned packaging: signing is explicitly disabled and stays local.
    expect(workflow).toContain('CSC_IDENTITY_AUTO_DISCOVERY');
    expect(workflow).toContain('WIN_CSC_LINK');
    expect(workflow).toContain('--publish never');
    expect(workflow).toContain('signAndEditExecutable=false');
    expect(workflow).toContain('verifyUpdateCodeSignature=false');
    expect(workflow).not.toContain('AZURE_');
    expect(workflow).not.toContain('EVS_');

    // Gates run before packaging, then artifacts are uploaded.
    const testIndex = workflow.indexOf('Test Sidekick backend');
    const releaseTestIndex = workflow.indexOf('Test release workflow gates');
    const storeIndex = workflow.indexOf('Verify Microsoft Store release readiness');
    const buildIndex = workflow.indexOf('Build desktop application');
    const packageIndex = workflow.indexOf('Package unsigned Windows installers');
    const collectIndex = workflow.indexOf('Collect unsigned installers and channel feed');
    const uploadIndex = workflow.indexOf('actions/upload-artifact@v4');
    expect(testIndex).toBeGreaterThan(-1);
    expect(releaseTestIndex).toBeGreaterThan(testIndex);
    expect(storeIndex).toBeGreaterThan(releaseTestIndex);
    expect(buildIndex).toBeGreaterThan(storeIndex);
    expect(packageIndex).toBeGreaterThan(buildIndex);
    expect(collectIndex).toBeGreaterThan(packageIndex);
    expect(uploadIndex).toBeGreaterThan(collectIndex);
    expect(workflow).toContain('if-no-files-found: error');
  });

  it('keeps the signed tag workflow untouched as the Stable release path', () => {
    const signedWorkflow = readFileSync(signedWorkflowPath, 'utf8');
    expect(signedWorkflow).toContain("tags: ['v*']");
    expect(signedWorkflow).not.toContain('workflow_dispatch:');
    expect(signedWorkflow).toContain('Azure/trusted-signing-action@v0.5.1');
  });
});

describe('unsigned release pipeline documentation', () => {
  it('documents channels, the version scheme, and the local signing handoff', () => {
    expect(existsSync(docPath)).toBe(true);
    const doc = readFileSync(docPath, 'utf8');

    expect(doc).toContain('unsigned');
    expect(doc).toContain('beta.yml');
    expect(doc).toContain('latest.yml');
    expect(doc).toContain('release.md');
    expect(doc).toContain('resolve-release-channel.mjs');
    expect(doc).toContain('Tagesbeta');
    expect(doc).toContain('Signing must stay local');
  });

  it('pins root and desktop package versions to the same value', () => {
    expect(readJson(path.join(repoRoot, 'package.json')).version).toBe(
      readJson(path.join(repoRoot, 'apps', 'desktop', 'package.json')).version
    );
  });
});
