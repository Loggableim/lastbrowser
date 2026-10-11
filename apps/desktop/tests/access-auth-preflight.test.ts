import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isAccessAuthPreflightCurrent,
  readAccessAuthStartupPolicy,
  type AccessAuthPreflightContext
} from '../src/main/access-auth-preflight.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('Main access-auth startup preflight', () => {
  it('reports disabled when the exact Sidekick state directory has no settings file', async () => {
    const stateDirectory = await createStateDirectory();

    await expect(readAccessAuthStartupPolicy({
      runtimeStateDirectory: stateDirectory,
      sidecarStateDirectory: stateDirectory,
      passwordEnvironmentConfigured: false
    })).resolves.toBe('disabled');
  });

  it('reports enabled when the authoritative settings file contains a password hash', async () => {
    const stateDirectory = await createStateDirectory();
    await writeFile(path.join(stateDirectory, 'settings.json'), JSON.stringify({ password_hash: 'do-not-return-this-hash' }));

    await expect(readAccessAuthStartupPolicy({
      runtimeStateDirectory: stateDirectory,
      sidecarStateDirectory: stateDirectory,
      passwordEnvironmentConfigured: false
    })).resolves.toBe('enabled');
  });

  it('reports enabled from Main-known environment configuration without reading settings', async () => {
    const stateDirectory = await createStateDirectory();
    const readSettings = vi.fn(async () => { throw new Error('settings must not be read'); });

    await expect(readAccessAuthStartupPolicy({
      runtimeStateDirectory: stateDirectory,
      sidecarStateDirectory: stateDirectory,
      passwordEnvironmentConfigured: true,
      readSettings
    })).resolves.toBe('enabled');
    expect(readSettings).not.toHaveBeenCalled();
  });

  it('fails closed when the configured Sidekick state path differs from the runtime profile path', async () => {
    const stateDirectory = await createStateDirectory();
    const readSettings = vi.fn(async () => '{}');

    await expect(readAccessAuthStartupPolicy({
      runtimeStateDirectory: stateDirectory,
      sidecarStateDirectory: path.join(stateDirectory, 'other-profile'),
      passwordEnvironmentConfigured: false,
      readSettings
    })).resolves.toBe('unknown');
    expect(readSettings).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed JSON', '{'],
    ['a non-object settings value', '[]'],
    ['a non-string password hash', '{"password_hash":{}}']
  ])('fails closed for %s', async (_caseName, contents) => {
    const stateDirectory = await createStateDirectory();
    await writeFile(path.join(stateDirectory, 'settings.json'), contents);

    await expect(readAccessAuthStartupPolicy({
      runtimeStateDirectory: stateDirectory,
      sidecarStateDirectory: stateDirectory,
      passwordEnvironmentConfigured: false
    })).resolves.toBe('unknown');
  });

  it('fails closed when the authoritative settings file cannot be read', async () => {
    const stateDirectory = await createStateDirectory();

    await expect(readAccessAuthStartupPolicy({
      runtimeStateDirectory: stateDirectory,
      sidecarStateDirectory: stateDirectory,
      passwordEnvironmentConfigured: false,
      readSettings: async () => { throw Object.assign(new Error('denied'), { code: 'EACCES' }); }
    })).resolves.toBe('unknown');
  });

  it.each([undefined, null, '', false, 0])('treats the backend’s absent/empty password hash as disabled (%s)', async (passwordHash) => {
    const stateDirectory = await createStateDirectory();
    await writeFile(path.join(stateDirectory, 'settings.json'), JSON.stringify({ password_hash: passwordHash }));

    await expect(readAccessAuthStartupPolicy({
      runtimeStateDirectory: stateDirectory,
      sidecarStateDirectory: stateDirectory,
      passwordEnvironmentConfigured: false
    })).resolves.toBe('disabled');
  });
});

describe('access-auth preflight response freshness', () => {
  const context = (requestId: number, scopeId: string): AccessAuthPreflightContext => ({ requestId, scopeId });

  it('accepts a result only for the latest request and same Main-owned runtime scope', () => {
    expect(isAccessAuthPreflightCurrent(context(3, 'scope-a'), context(3, 'scope-a'))).toBe(true);
    expect(isAccessAuthPreflightCurrent(context(2, 'scope-a'), context(3, 'scope-a'))).toBe(false);
    expect(isAccessAuthPreflightCurrent(context(3, 'scope-a'), context(3, 'scope-b'))).toBe(false);
  });

  it('rejects malformed or empty runtime-scope identifiers', () => {
    expect(isAccessAuthPreflightCurrent(context(3, ''), context(3, ''))).toBe(false);
    expect(isAccessAuthPreflightCurrent({ requestId: 3, scopeId: undefined } as unknown as AccessAuthPreflightContext, context(3, 'scope-a'))).toBe(false);
    expect(isAccessAuthPreflightCurrent(context(3, 'scope-a'), { requestId: 3, scopeId: null } as unknown as AccessAuthPreflightContext)).toBe(false);
  });
});

async function createStateDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lastbrowser-access-auth-'));
  temporaryDirectories.push(directory);
  await mkdir(directory, { recursive: true });
  return directory;
}
