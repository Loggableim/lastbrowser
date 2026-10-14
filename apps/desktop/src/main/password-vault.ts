import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { safeStorage } from 'electron';
export type PasswordMetadata = { id: string; origin: string; username: string; createdAt: number };
type PasswordEntry = PasswordMetadata & { password: string };
export type PasswordImportResult = { imported: number; duplicates: number; conflicts: number; invalid: number; cancelled?: boolean };
const maxFile = 10 * 1024 * 1024;
function profileId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value)) throw new Error('Invalid browser profile.');
  return value;
}
function origin(value: string): string | null {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.origin : null; } catch { return null; }
}
/** RFC 4180, including quoted commas/newlines, doubled quotes and UTF-8 BOM. */
export function parsePasswordCsv(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '');
  if (text.includes('\0')) throw new Error('Unsupported CSV encoding. Export a UTF-8 CSV file.');
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  const fieldEnd = () => { row.push(field); field = ''; closed = false; if (row.length > 40) throw new Error('Too many CSV columns.'); };
  const rowEnd = () => { fieldEnd(); if (row.some(value => value.length)) rows.push(row); row = []; if (rows.length > 10001) throw new Error('CSV contains more than 10000 passwords.'); };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } } else field += c; }
    else if (c === ',') fieldEnd();
    else if (c === '\r' || c === '\n') { if (c === '\r' && text[i + 1] === '\n') i++; rowEnd(); }
    else if (c === '"' && !field && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error('Malformed CSV quoting.'); field += c; }
    if (field.length > 32768) throw new Error('CSV field is too large.');
  }
  if (quoted) throw new Error('Unterminated CSV field.');
  if (field || row.length || closed) rowEnd();
  return rows;
}
async function readPasswordExport(file: string): Promise<string> {
  try {
    const handle = await open(file, 'r');
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > maxFile) throw new Error('CSV file limit');
      const buffer = Buffer.alloc(maxFile + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
        if (!bytesRead) break;
        length += bytesRead;
      }
      if (length > maxFile) throw new Error('CSV file limit');
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
    } finally { await handle.close(); }
  } catch { throw new Error('CSV could not be read. Choose a readable UTF-8 CSV export up to 10 MB.'); }
}
export class PasswordVault {
  private queues = new Map<string, Promise<unknown>>();
  constructor(private readonly userData: () => string) {}
  available(): boolean { return process.platform === 'win32' && safeStorage.isEncryptionAvailable(); }
  private requireEncryption(): void { if (!this.available()) throw new Error('Windows password encryption is unavailable. Nothing was imported.'); }
  private file(profile: string): string { return path.join(this.userData(), 'password-vault', `${createHash('sha256').update(profileId(profile)).digest('hex')}.json`); }
  private async read(profile: string): Promise<PasswordEntry[]> {
    this.requireEncryption();
    const file = this.file(profile);
    try {
      if ((await stat(file)).size > 32 * 1024 * 1024) throw new Error('Vault size limit exceeded.');
      const envelope = JSON.parse(await readFile(file, 'utf8'));
      if (envelope.version !== 1 || typeof envelope.ciphertext !== 'string') throw new Error('Invalid vault.');
      const payload = JSON.parse(safeStorage.decryptString(Buffer.from(envelope.ciphertext, 'base64')));
      if (payload.profile !== profile || !Array.isArray(payload.entries) || payload.entries.length > 20000) throw new Error('Invalid vault profile.');
      for (const item of payload.entries) if (!item || typeof item.id !== 'string' || !/^[a-f0-9-]{36}$/.test(item.id)
        || typeof item.origin !== 'string' || origin(item.origin) !== item.origin || typeof item.username !== 'string' || item.username.length > 512
        || typeof item.password !== 'string' || !item.password.length || item.password.length > 16384 || !Number.isFinite(item.createdAt)) throw new Error('Invalid vault entry.');
      return payload.entries;
    } catch (error: any) { if (error?.code === 'ENOENT') return []; throw new Error('The encrypted password vault could not be opened. Existing data was preserved.'); }
  }
  private async write(profile: string, entries: PasswordEntry[]): Promise<void> {
    this.requireEncryption();
    const plaintext = JSON.stringify({ profile, entries });
    if (Buffer.byteLength(plaintext, 'utf8') > 16 * 1024 * 1024) throw new Error('Password vault capacity exceeded. Existing data was preserved.');
    const encrypted = safeStorage.encryptString(plaintext);
    const envelope = JSON.stringify({ version: 1, ciphertext: encrypted.toString('base64') });
    if (Buffer.byteLength(envelope, 'utf8') > 32 * 1024 * 1024) throw new Error('Password vault capacity exceeded. Existing data was preserved.');
    const file = this.file(profile), temporary = `${file}.${randomUUID()}.tmp`;
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    try { await writeFile(temporary, envelope, { mode: 0o600, flag: 'wx' }); await rename(temporary, file); }
    catch { await unlink(temporary).catch(() => {}); throw new Error('Passwords could not be saved securely.'); }
  }
  private exclusive<T>(profile: string, action: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(profile) || Promise.resolve();
    const result = previous.catch(() => {}).then(action);
    this.queues.set(profile, result);
    void result.finally(() => { if (this.queues.get(profile) === result) this.queues.delete(profile); }).catch(() => {});
    return result;
  }
  async list(profile: string): Promise<{ available: boolean; entries: PasswordMetadata[] }> {
    profileId(profile);
    if (!this.available()) return { available: false, entries: [] };
    return { available: true, entries: (await this.read(profile)).map(({ password: _password, ...metadata }) => metadata) };
  }
  async importFile(profile: string, file: string, recheck: () => void): Promise<PasswordImportResult> {
    profileId(profile); this.requireEncryption();
    const rows = parsePasswordCsv(await readPasswordExport(file));
    recheck();
    const headers = (rows.shift() || []).map(value => value.trim().toLowerCase());
    const find = (names: string[]) => headers.findIndex(value => names.includes(value));
    const urlColumn = find(['url', 'website', 'login_uri', 'hostname']);
    const userColumn = find(['username', 'user_name', 'login_username']);
    const passwordColumn = find(['password', 'login_password']);
    if (urlColumn < 0 || userColumn < 0 || passwordColumn < 0) throw new Error('CSV needs url, username and password columns.');
    return this.exclusive(profile, async () => {
      recheck();
      const entries = await this.read(profile), existing = new Map(entries.map(item => [`${item.origin}\0${item.username}`, item]));
      const result: PasswordImportResult = { imported: 0, duplicates: 0, conflicts: 0, invalid: 0 };
      for (const row of rows) {
        const target = origin(row[urlColumn] || ''), username = row[userColumn], password = row[passwordColumn];
        if (!target || typeof username !== 'string' || username.length > 512 || /[\x00-\x1f]/.test(username)
          || typeof password !== 'string' || !password || password.length > 16384) { result.invalid++; continue; }
        const identity = `${target}\0${username}`, prior = existing.get(identity);
        if (prior) { if (prior.password === password) result.duplicates++; else result.conflicts++; continue; }
        if (entries.length >= 20000) { result.invalid++; continue; }
        const entry = { id: randomUUID(), origin: target, username, password, createdAt: Date.now() };
        entries.push(entry); existing.set(identity, entry); result.imported++;
      }
      recheck(); if (result.imported) await this.write(profile, entries); recheck();
      return result;
    });
  }
  async remove(profile: string, id: string, recheck: () => void): Promise<boolean> {
    profileId(profile); if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid password entry.');
    return this.exclusive(profile, async () => { const entries = await this.read(profile); recheck(); const next = entries.filter(item => item.id !== id); if (next.length === entries.length) return false; await this.write(profile, next); recheck(); return true; });
  }
  async fillCredential(profile: string, id: string, targetOrigin: string, use: (credential: { username: string; password: string }) => Promise<void>): Promise<void> {
    if (!targetOrigin.startsWith('https://') || origin(targetOrigin) !== targetOrigin) throw new Error('Password filling is available only on the exact HTTPS site.');
    const item = (await this.read(profile)).find(entry => entry.id === id && entry.origin === targetOrigin);
    if (!item) throw new Error('Password is no longer available for this site.');
    await use({ username: item.username, password: item.password });
  }
}
