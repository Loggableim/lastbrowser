import { beforeEach, describe, expect, it, vi } from 'vitest';
import { verifyWindowsUpdateSignature } from '../src/main/windows-update-signature.js';

const { execFile } = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile }));

const installer = "C:\\Updates\\LastBrowser's setup.exe";
const publisher = 'CN=LastBrowser Test Publisher, O=LastBrowser Test Publisher, C=DE';

function authenticodeResult(values: Record<string, unknown>) {
  execFile.mockImplementation((_file, _args, _options, callback) => {
    callback(null, JSON.stringify({ path: installer, status: 'Valid', subject: publisher, ...values }), '');
  });
}

describe('Windows update signature verification', () => {
  beforeEach(() => { execFile.mockReset(); });

  it('accepts the expected file and full, trusted publisher', async () => {
    authenticodeResult({ path: installer.toUpperCase() });
    await expect(verifyWindowsUpdateSignature([publisher], installer)).resolves.toBeNull();
    const [executable, args, options] = execFile.mock.calls[0];
    expect(executable).toMatch(/System32\\WindowsPowerShell\\v1\.0\\powershell\.exe$/i);
    expect(args.at(-1)).toContain('Get-AuthenticodeSignature -LiteralPath $env:LASTBROWSER_UPDATE_FILE');
    expect(args.at(-1)).not.toContain(installer);
    expect(options).toMatchObject({ windowsHide: true, env: { LASTBROWSER_UPDATE_FILE: installer } });
    expect(options.shell).not.toBe(true);
  });

  it.each([
    { status: 'NotSigned' },
    { status: 'NotTrusted' },
    { subject: 'CN=LastBrowser Test Publisher, O=Unrelated Publisher, C=DE' },
    { path: 'C:\\Updates\\another.exe' },
    { path: null },
  ])('rejects changed, unsigned, untrusted or wrong-publisher results (%o)', async values => {
    authenticodeResult(values);
    await expect(verifyWindowsUpdateSignature([publisher], installer)).resolves.toEqual(expect.any(String));
  });

  it.each([
    [new Error('PowerShell could not execute'), ''],
    [null, 'unexpected output'],
  ])('rejects unavailable verification or unparseable output', async (error, stdout) => {
    execFile.mockImplementation((_file, _args, _options, callback) => callback(error, stdout, ''));
    await expect(verifyWindowsUpdateSignature([publisher], installer)).resolves.toEqual(expect.any(String));
  });

  it('does not accept an empty publisher configuration', async () => {
    await expect(verifyWindowsUpdateSignature([], installer)).resolves.toEqual(expect.any(String));
    expect(execFile).not.toHaveBeenCalled();
  });
});
