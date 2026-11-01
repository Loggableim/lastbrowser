/**
 * Password vault platform gating: Linux keyring backends and macOS must enable
 * the vault; Linux basic_text / unknown backends must stay disabled.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const safeStorage = vi.hoisted(() => ({
  isEncryptionAvailable: vi.fn(() => true),
  getSelectedStorageBackend: vi.fn(() => 'gnome_libsecret'),
  encryptString: vi.fn((value: string) => Buffer.from(value, 'utf8')),
  decryptString: vi.fn((value: Buffer) => value.toString('utf8')),
}));

const app = vi.hoisted(() => ({ isReady: vi.fn(() => true) }));

vi.mock('electron', () => ({ app, safeStorage }));

import { PasswordVault, osEncryptionBackendAllowed } from '../src/main/password-vault';

const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

function setPlatform(value: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

describe('osEncryptionBackendAllowed', () => {
  beforeEach(() => {
    safeStorage.getSelectedStorageBackend.mockReturnValue('gnome_libsecret');
  });

  it('allows Windows and macOS', () => {
    expect(osEncryptionBackendAllowed('win32')).toBe(true);
    expect(osEncryptionBackendAllowed('darwin')).toBe(true);
  });

  it.each(['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'])('allows Linux keyring backend %s', backend => {
    safeStorage.getSelectedStorageBackend.mockReturnValue(backend);
    expect(osEncryptionBackendAllowed('linux')).toBe(true);
  });

  it.each(['basic_text', 'unknown'])('refuses Linux backend %s', backend => {
    safeStorage.getSelectedStorageBackend.mockReturnValue(backend);
    expect(osEncryptionBackendAllowed('linux')).toBe(false);
  });

  it('returns false when getSelectedStorageBackend throws', () => {
    safeStorage.getSelectedStorageBackend.mockImplementationOnce(() => { throw new Error('dbus: keyring locked'); });
    expect(osEncryptionBackendAllowed('linux')).toBe(false);
  });

  it('returns false when getSelectedStorageBackend is missing', () => {
    const original = safeStorage.getSelectedStorageBackend;
    (safeStorage as any).getSelectedStorageBackend = undefined;
    try { expect(osEncryptionBackendAllowed('linux')).toBe(false); }
    finally { safeStorage.getSelectedStorageBackend = original; }
  });

  it('does not query the Linux backend API on win32/darwin', () => {
    safeStorage.getSelectedStorageBackend.mockClear();
    osEncryptionBackendAllowed('win32');
    osEncryptionBackendAllowed('darwin');
    expect(safeStorage.getSelectedStorageBackend).not.toHaveBeenCalled();
  });

  it('refuses other platforms', () => {
    expect(osEncryptionBackendAllowed('freebsd')).toBe(false);
  });
});

describe('PasswordVault.available on Linux', () => {
  beforeEach(() => {
    setPlatform('linux');
    safeStorage.isEncryptionAvailable.mockReturnValue(true);
    safeStorage.getSelectedStorageBackend.mockReturnValue('gnome_libsecret');
  });

  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
  });

  it('is available with a keyring backend', () => {
    expect(new PasswordVault(() => '/tmp/unused').available()).toBe(true);
  });

  it('is unavailable with basic_text and list() reports it without reading the vault', async () => {
    safeStorage.getSelectedStorageBackend.mockReturnValue('basic_text');
    const vault = new PasswordVault(() => '/tmp/unused');
    expect(vault.available()).toBe(false);
    await expect(vault.list('default')).resolves.toEqual({ available: false, entries: [] });
  });

  it('is unavailable when Electron reports no encryption', () => {
    safeStorage.isEncryptionAvailable.mockReturnValue(false);
    expect(new PasswordVault(() => '/tmp/unused').available()).toBe(false);
  });
});

describe('PasswordVault.available on win32/darwin', () => {
  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
    app.isReady.mockReturnValue(true);
  });

  it.each(['win32', 'darwin'] as const)('is available on %s without consulting the Linux backend API', platform => {
    setPlatform(platform);
    safeStorage.isEncryptionAvailable.mockReturnValue(true);
    safeStorage.getSelectedStorageBackend.mockClear();
    expect(new PasswordVault(() => '/tmp/unused').available()).toBe(true);
    expect(safeStorage.getSelectedStorageBackend).not.toHaveBeenCalled();
  });

  it.each(['win32', 'darwin'] as const)('is unavailable on %s when Electron reports no encryption', platform => {
    setPlatform(platform);
    safeStorage.isEncryptionAvailable.mockReturnValue(false);
    expect(new PasswordVault(() => '/tmp/unused').available()).toBe(false);
  });

  it('is unavailable before app ready', () => {
    setPlatform('linux');
    safeStorage.isEncryptionAvailable.mockReturnValue(true);
    app.isReady.mockReturnValue(false);
    expect(new PasswordVault(() => '/tmp/unused').available()).toBe(false);
  });
});
