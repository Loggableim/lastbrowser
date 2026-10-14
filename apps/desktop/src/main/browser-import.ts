import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
export type BrowserId = 'chrome' | 'edge' | 'firefox' | 'zen' | 'brave' | 'opera' | 'opera-gx' | 'vivaldi' | 'chromium' | 'arc' | 'yandex' | 'waterfox' | 'librewolf' | 'floorp';
export type BrowserImportFamily = 'chromium' | 'gecko';
export type BrowserImportDataType = 'bookmarks' | 'history' | 'homepages' | 'openTabs' | 'passwords' | 'cookies' | 'extensions' | 'searchEngines' | 'autofill' | 'downloads';
export type BrowserImportCapability = { supported: boolean; available: boolean; method: 'native' | 'csv' | 'unsupported'; reason?: string };
export type BrowserImportCapabilities = Record<BrowserImportDataType, BrowserImportCapability>;
export type BrowserImportWarning = { type: 'skipped' | 'truncated' | 'unavailable' | 'unsupported'; dataType: BrowserImportDataType; message: string; count?: number };
export type BrowserImportRequest = { profileId: string } & Partial<Record<BrowserImportDataType, boolean>>;
export type BrowserImportResult = {
  bookmarks: Array<{ url: string; title: string; createdAt: number }>;
  history: Array<{ url: string; title: string; count: number; lastVisited: number }>;
  homepages: string[];
  openTabs: Array<{ url: string; title: string; pinned: boolean; source: 'sessionstore' }>;
  warnings: BrowserImportWarning[];
  counts: { bookmarks: number; history: number; homepages: number; openTabs: number };
  truncated: boolean;
};
type CatalogDefinition = { id: BrowserId; label: string; family: BrowserImportFamily; roots: ReadonlyArray<readonly ['local' | 'roaming', string]> };
// Vendor references: chromium.org/user-experience/user-data-directory/;
// help.vivaldi.com/desktop/privacy/preventing-vivaldi-profiles-from-being-uploaded-to-git-repositories/;
// yandex.ru/support/browser/ru/personalization/profile;
// support.mozilla.org/kb/profiles-where-firefox-stores-user-data;
// github.com/zen-browser/desktop/discussions/5978.
// Candidate paths count only when recognized source data files exist.
export const BROWSER_IMPORT_CATALOG: readonly CatalogDefinition[] = [
  { id: 'chrome', label: 'Google Chrome', family: 'chromium', roots: [['local', 'Google/Chrome/User Data']] },
  { id: 'edge', label: 'Microsoft Edge', family: 'chromium', roots: [['local', 'Microsoft/Edge/User Data']] },
  { id: 'firefox', label: 'Mozilla Firefox', family: 'gecko', roots: [['roaming', 'Mozilla/Firefox']] },
  { id: 'zen', label: 'Zen Browser', family: 'gecko', roots: [['roaming', 'zen']] },
  { id: 'brave', label: 'Brave', family: 'chromium', roots: [['local', 'BraveSoftware/Brave-Browser/User Data']] },
  { id: 'opera', label: 'Opera', family: 'chromium', roots: [['roaming', 'Opera Software/Opera Stable']] },
  { id: 'opera-gx', label: 'Opera GX', family: 'chromium', roots: [['roaming', 'Opera Software/Opera GX Stable']] },
  { id: 'vivaldi', label: 'Vivaldi', family: 'chromium', roots: [['local', 'Vivaldi/User Data']] },
  { id: 'chromium', label: 'Chromium', family: 'chromium', roots: [['local', 'Chromium/User Data']] },
  { id: 'arc', label: 'Arc', family: 'chromium', roots: [['local', 'Arc/User Data']] },
  { id: 'yandex', label: 'Yandex Browser', family: 'chromium', roots: [['local', 'Yandex/YandexBrowser/User Data']] },
  { id: 'waterfox', label: 'Waterfox', family: 'gecko', roots: [['roaming', 'Waterfox']] },
  { id: 'librewolf', label: 'LibreWolf', family: 'gecko', roots: [['roaming', 'librewolf']] },
  { id: 'floorp', label: 'Floorp', family: 'gecko', roots: [['roaming', 'Floorp']] },
];
export type BrowserImportProfile = { id: string; browser: BrowserId; name: string; preferred: boolean; family: BrowserImportFamily; capabilities: BrowserImportCapabilities };
type Profile = BrowserImportProfile & { directory: string };
export type BrowserImportDiscovery = {
  defaultBrowser: string | null; defaultBrowserId: BrowserId | null; profiles: BrowserImportProfile[];
  browsers: Array<{ id: BrowserId; label: string; family: BrowserImportFamily; installed: boolean; profileCount: number; capabilities: BrowserImportCapabilities }>;
};
const MAX_ROWS = 100_000, MAX_TABS = 5_000, MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const SESSION_NAMES = ['sessionstore.jsonlz4', 'sessionstore.json', 'sessionstore.js', 'sessionstore-backups/recovery.jsonlz4', 'sessionstore-backups/recovery.baklz4', 'sessionstore-backups/previous.jsonlz4', 'sessionstore-backups/recovery.json', 'sessionstore-backups/previous.json'];
function fileExists(directory: string, name: string): boolean { return existsSync(path.join(directory, ...name.split('/'))); }
function capabilities(family: BrowserImportFamily, directory?: string): BrowserImportCapabilities {
  const native = (available: boolean, reason?: string): BrowserImportCapability => ({ supported: true, available, method: 'native', ...(reason ? { reason } : {}) });
  const unsupported = (reason: string): BrowserImportCapability => ({ supported: false, available: false, method: 'unsupported', reason });
  const has = (name: string) => Boolean(directory && fileExists(directory, name));
  return {
    bookmarks: native(family === 'gecko' ? has('places.sqlite') : has('Bookmarks')),
    history: native(family === 'gecko' ? has('places.sqlite') : has('History')),
    homepages: native(family === 'gecko' ? has('prefs.js') : has('Preferences')),
    openTabs: family === 'gecko' ? native(SESSION_NAMES.some(has), 'Reads saved session windows; the live browser may have newer tabs.') : unsupported('Chromium SNSS/Arc session formats are not parsed. Startup pages are not open tabs.'),
    passwords: { supported: true, available: false, method: 'csv', reason: 'Export a password CSV in the source browser and use the separate encrypted password-vault importer.' },
    cookies: unsupported('Encrypted cookies and login sessions are not migrated.'),
    extensions: unsupported('Install extensions through the Extension & Skill Hub; extension state is not migrated.'),
    searchEngines: unsupported('No destination search-engine configuration importer yet.'),
    autofill: unsupported('Addresses, payment details and autofill credentials are not read or migrated.'),
    downloads: unsupported('Download records and downloaded files are not migrated.'),
  };
}
async function registryValue(key: string, name = ''): Promise<string> {
  try {
    const { stdout } = await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe'), ['query', key, name ? '/v' : '/ve', ...(name ? [name] : [])], { windowsHide: true, timeout: 3000, maxBuffer: 16384 });
    return stdout.match(/REG_(?:EXPAND_)?SZ\s+(.+)/)?.[1].trim() || '';
  } catch { return ''; }
}
async function detectDefault(): Promise<Pick<BrowserImportDiscovery, 'defaultBrowser' | 'defaultBrowserId'>> {
  if (process.platform !== 'win32') return { defaultBrowser: null, defaultBrowserId: null };
  const base = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations';
  const progId = await registryValue(`${base}\\https\\UserChoice`, 'ProgId') || await registryValue(`${base}\\http\\UserChoice`, 'ProgId');
  // Read commands as metadata only. Never execute registry-provided commands.
  const command = progId && /^[\w.\-]+$/.test(progId) ? await registryValue(`HKCR\\${progId}\\shell\\open\\command`) : '';
  const text = `${progId} ${command}`.toLowerCase();
  const patterns: Array<[BrowserId, RegExp]> = [
    ['opera-gx', /opera[ _-]?gx/], ['opera', /opera/], ['waterfox', /waterfox/], ['librewolf', /librewolf/], ['floorp', /floorp/],
    ['zen', /zen(?:\.exe|url|html|browser|[\\/])/], ['firefox', /firefox/], ['brave', /brave/], ['vivaldi', /vivaldi/],
    ['yandex', /yandex/], ['arc', /[\\/]arc\.exe|arcurl|archtml|thebrowsercompany/], ['edge', /msedge|microsoftedge|mseht|microsoft-edge/], ['chromium', /chromium/], ['chrome', /chrome/],
  ];
  const id = /lastbrowser/.test(text) ? null : patterns.find(([, pattern]) => pattern.test(text))?.[0] || null;
  return { defaultBrowser: /lastbrowser/.test(text) ? 'LastBrowser' : id ? BROWSER_IMPORT_CATALOG.find(browser => browser.id === id)!.label : progId || null, defaultBrowserId: id };
}
function profile(browser: CatalogDefinition, directory: string, name: string, preferred = false): Profile {
  const resolved = path.resolve(directory);
  return { id: createHash('sha256').update(browser.id + '\0' + resolved.toLowerCase()).digest('hex').slice(0, 24), browser: browser.id, family: browser.family, name, directory: resolved, preferred, capabilities: capabilities(browser.family, resolved) };
}
async function readBounded(file: string, maximum = MAX_SOURCE_BYTES): Promise<Buffer> {
  const handle = await open(file, 'r');
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > maximum) throw new Error('Source exceeds the safe import size limit.');
    const data = Buffer.alloc(Math.min(maximum, metadata.size) + 1); let used = 0;
    while (used < data.length) { const { bytesRead } = await handle.read(data, used, data.length - used, null); if (!bytesRead) break; used += bytesRead; }
    if (used > metadata.size || (await handle.stat()).size !== used) throw new Error('Source changed while importing; close the source browser and retry.');
    return data.subarray(0, used);
  } finally { await handle.close(); }
}
async function readIni(file: string): Promise<Array<Record<string, string>>> {
  try {
    const text = (await readBounded(file, 1024 * 1024)).toString('utf8');
    const sections: Array<Record<string, string>> = []; let section: Record<string, string> | undefined;
    for (const line of text.split(/\r?\n/)) {
      if (/^\s*\[/.test(line)) { section = {}; sections.push(section); }
      else { const match = /^([^=;#]+)=(.*)$/.exec(line); if (match && section) section[match[1].trim()] = match[2].trim(); }
    }
    return sections;
  } catch { return []; }
}
async function rootsFor(browser: CatalogDefinition): Promise<string[]> {
  const roots = browser.roots.flatMap(([location, relative]) => {
    const base = location === 'local' ? process.env.LOCALAPPDATA : process.env.APPDATA;
    return base ? [path.join(base, ...relative.split('/'))] : [];
  });
  if (browser.id === 'arc' && process.env.LOCALAPPDATA) {
    const packages = path.join(process.env.LOCALAPPDATA, 'Packages');
    for (const entry of await readdir(packages, { withFileTypes: true }).catch(() => [])) if (entry.isDirectory() && /^TheBrowserCompany\.Arc_/i.test(entry.name)) roots.push(path.join(packages, entry.name, 'LocalCache', 'Local', 'Arc', 'User Data'));
  }
  return roots;
}
async function discoverProfiles(): Promise<Profile[]> {
  if (process.platform !== 'win32') return [];
  const result: Profile[] = [];
  for (const browser of BROWSER_IMPORT_CATALOG) for (const root of await rootsFor(browser)) {
    const add = (directory: string, name: string, selected = false) => {
      // Auto-discovery must not contact UNC shares and trigger Windows credentials.
      if (path.resolve(directory).startsWith('\\\\')) return;
      const markers = browser.family === 'gecko' ? ['places.sqlite', 'prefs.js', ...SESSION_NAMES] : ['Bookmarks', 'History', 'Preferences'];
      if (markers.some(file => fileExists(directory, file))) result.push(profile(browser, directory, name, selected));
    };
    if (browser.family === 'gecko') {
      const installs = await readIni(path.join(root, 'installs.ini')); const entries = await readIni(path.join(root, 'profiles.ini'));
      const preferred = new Set([...installs, ...entries].filter(entry => entry.Default && entry.Path === undefined).map(entry => path.resolve(root, entry.Default).toLowerCase()));
      for (const entry of entries) if (entry.Path) {
        const directory = entry.IsRelative === '0' ? path.resolve(entry.Path) : path.resolve(root, entry.Path);
        add(directory, entry.Name || path.basename(directory), entry.Default === '1' || preferred.has(directory.toLowerCase()));
      }
      for (const entry of await readdir(path.join(root, 'Profiles'), { withFileTypes: true }).catch(() => [])) if (entry.isDirectory()) add(path.join(root, 'Profiles', entry.name), entry.name, preferred.has(path.join(root, 'Profiles', entry.name).toLowerCase()));
    } else {
      let info: Record<string, { name?: string }> = {}; let lastUsed = 'Default';
      try {
        const state = JSON.parse((await readBounded(path.join(root, 'Local State'), 16 * 1024 * 1024)).toString('utf8'));
        const cache = state.profile?.info_cache;
        if (cache && typeof cache === 'object' && !Array.isArray(cache)) info = cache;
        if (typeof state.profile?.last_used === 'string') lastUsed = state.profile.last_used;
      } catch { /* profile-directory fallback */ }
      add(root, browser.label, true); // Opera's historical direct-root layout.
      for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) if (entry.isDirectory() && (/^(Default|Profile \d+)$/.test(entry.name) || Object.hasOwn(info, entry.name))) add(path.join(root, entry.name), typeof info[entry.name]?.name === 'string' ? info[entry.name].name! : entry.name, entry.name === lastUsed);
      if (browser.id === 'opera-gx' || browser.id === 'opera') {
        const side = path.join(root, '_side_profiles');
        for (const entry of await readdir(side, { withFileTypes: true }).catch(() => [])) if (entry.isDirectory()) {
          add(path.join(side, entry.name), `Profile ${entry.name}`);
          add(path.join(side, entry.name, 'Default'), `Profile ${entry.name}`);
        }
      }
    }
  }
  // Preserve names/default flags from profiles.ini instead of fallback directory names.
  const unique = new Map<string, Profile>(); for (const item of result) if (!unique.has(item.id)) unique.set(item.id, item);
  return [...unique.values()].sort((a, b) => Number(b.preferred) - Number(a.preferred) || a.browser.localeCompare(b.browser) || a.name.localeCompare(b.name));
}
export async function discoverBrowserImport(): Promise<BrowserImportDiscovery> {
  const [defaults, profiles] = await Promise.all([detectDefault(), discoverProfiles()]);
  return { ...defaults, profiles: profiles.map(({ directory: _directory, ...metadata }) => metadata), browsers: BROWSER_IMPORT_CATALOG.map(browser => {
    const found = profiles.filter(profile => profile.browser === browser.id); const available = capabilities(browser.family);
    for (const type of Object.keys(available) as BrowserImportDataType[]) available[type].available = found.some(profile => profile.capabilities[type].available);
    // Detection describes existing browser data, not an executable health check.
    return { id: browser.id, label: browser.label, family: browser.family, installed: found.length > 0, profileCount: found.length, capabilities: available };
  }) };
}
const sqliteReader = String.raw`
import sys,json,sqlite3,pathlib
p=pathlib.Path(sys.argv[1]).resolve(); family=sys.argv[2]; bookmarks=sys.argv[3]=='1'; history=sys.argv[4]=='1'; limit=int(sys.argv[5])
out={'bookmarks':[],'history':[],'warnings':[]}
def read(kind,db,query,convert):
 try:
  c=sqlite3.connect(db.as_uri()+'?mode=ro',uri=True,timeout=4)
  try:
   c.execute('PRAGMA query_only=ON')
   total=c.execute('SELECT COUNT(*) FROM ('+query+')').fetchone()[0]
   rows=c.execute(query+' LIMIT ?', (limit,)).fetchall()
  finally: c.close()
  if total>limit: out['warnings'].append({'type':'truncated','dataType':kind,'message':'Source has more than the safe 100,000-row import limit.','count':total-limit})
  out[kind]=[convert(row) for row in rows]
 except (sqlite3.Error,OSError,ValueError,TypeError):
  out['warnings'].append({'type':'unavailable','dataType':kind,'message':'Source database is unavailable or locked. Close the source browser and retry this data type.'})
if family=='gecko':
 if bookmarks: read('bookmarks',p/'places.sqlite','SELECT p.url,b.title,COALESCE(b.dateAdded,0) FROM moz_bookmarks b JOIN moz_places p ON p.id=b.fk WHERE b.type=1 ORDER BY b.dateAdded DESC',lambda r:{'url':r[0],'title':r[1] or r[0],'createdAt':max(1,int(r[2] or 0)//1000)})
 if history: read('history',p/'places.sqlite','SELECT url,title,visit_count,last_visit_date FROM moz_places WHERE last_visit_date IS NOT NULL ORDER BY last_visit_date DESC',lambda r:{'url':r[0],'title':r[1] or r[0],'count':max(1,int(r[2] or 0)),'lastVisited':max(1,int(r[3] or 0)//1000)})
elif history:
 read('history',p/'History','SELECT url,title,visit_count,last_visit_time FROM urls ORDER BY last_visit_time DESC',lambda r:{'url':r[0],'title':r[1] or r[0],'count':max(1,int(r[2] or 0)),'lastVisited':max(1,(int(r[3] or 0)-11644473600000000)//1000)})
print(json.dumps(out,ensure_ascii=True))
`;
function webUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 32768) return false;
  try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
}
// Mozilla: magic mozLz40\0 + LE decoded size + one LZ4 block. Bounded decoder.
function decodeMozLz4(data: Buffer): Buffer {
  if (data.length < 12 || !data.subarray(0, 8).equals(Buffer.from('mozLz40\0'))) throw new Error('Unsupported session compression.');
  const length = data.readUInt32LE(8);
  if (length === 0 || length > MAX_SOURCE_BYTES) throw new Error('Session exceeds the safe decoded size limit.');
  const output = Buffer.alloc(length); let input = 12; let written = 0;
  const extended = (initial: number): number => {
    let value = initial;
    if (initial === 15) { let byte = 255; while (byte === 255) { if (input >= data.length) throw new Error('Truncated LZ4 length.'); byte = data[input++]; value += byte; if (value > MAX_SOURCE_BYTES) throw new Error('Invalid LZ4 length.'); } }
    return value;
  };
  while (input < data.length) {
    const token = data[input++]; const literal = extended(token >> 4);
    if (input + literal > data.length || written + literal > length) throw new Error('Invalid LZ4 literals.');
    data.copy(output, written, input, input + literal); input += literal; written += literal;
    if (input === data.length) break;
    if (input + 2 > data.length) throw new Error('Truncated LZ4 offset.');
    const offset = data.readUInt16LE(input); input += 2; const match = extended(token & 15) + 4;
    if (offset === 0 || offset > written || written + match > length) throw new Error('Invalid LZ4 match.');
    for (let index = 0; index < match; index++) { output[written] = output[written - offset]; written++; }
  }
  if (written !== length) throw new Error('Incomplete LZ4 session.');
  return output;
}
async function importSession(source: Profile, result: BrowserImportResult): Promise<void> {
  const candidates = await Promise.all(SESSION_NAMES.map(async name => { const file = path.join(source.directory, ...name.split('/')); try { return { file, time: (await stat(file)).mtimeMs }; } catch { return null; } }));
  const files = candidates.filter((item): item is { file: string; time: number } => Boolean(item)).sort((a, b) => b.time - a.time);
  for (const candidate of files) {
    try {
      const data = await readBounded(candidate.file); const json = data.subarray(0, 8).equals(Buffer.from('mozLz40\0')) ? decodeMozLz4(data) : data;
      const session = JSON.parse(json.toString('utf8')); if (!Array.isArray(session.windows)) throw new Error('No session windows.');
      const tabs: BrowserImportResult['openTabs'] = []; let skipped = 0; let total = 0;
      for (const window of session.windows) if (window && typeof window === 'object' && Array.isArray(window.tabs)) for (const tab of window.tabs) {
        total++;
        if (window.isPrivate || tab?.isPrivate || !Array.isArray(tab?.entries)) { skipped++; continue; }
        const entry = tab.entries[Math.max(0, Math.min(tab.entries.length - 1, (Number.isInteger(tab.index) ? tab.index : tab.entries.length) - 1))];
        if (!webUrl(entry?.url)) { skipped++; continue; }
        if (tabs.length < MAX_TABS) tabs.push({ url: entry.url, title: typeof entry.title === 'string' ? entry.title : entry.url, pinned: tab.pinned === true, source: 'sessionstore' });
      }
      result.openTabs = tabs;
      if (skipped) result.warnings.push({ type: 'skipped', dataType: 'openTabs', message: 'Private, invalid or non-web tabs were skipped.', count: skipped });
      if (total - skipped > MAX_TABS) result.warnings.push({ type: 'truncated', dataType: 'openTabs', message: 'Saved session exceeds the safe 5,000-tab import limit.', count: total - skipped - MAX_TABS });
      if (candidate !== files[0]) result.warnings.push({ type: 'skipped', dataType: 'openTabs', message: 'The newest session could not be read; an older saved session was used.' });
      return;
    } catch { /* try an intact previous session snapshot */ }
  }
  result.warnings.push({ type: 'unavailable', dataType: 'openTabs', message: 'No readable saved session was found. Close the source browser and retry.' });
}
export async function importBrowserData(value: unknown, pythonExe: string): Promise<BrowserImportResult> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid import request.');
  const request = value as Record<string, unknown>; const types = Object.keys(capabilities('gecko')) as BrowserImportDataType[];
  if (typeof request.profileId !== 'string' || types.some(type => request[type] !== undefined && typeof request[type] !== 'boolean') || !types.some(type => request[type] === true)) throw new Error('Select data to import.');
  const source = (await discoverProfiles()).find(item => item.id === request.profileId); if (!source) throw new Error('Browser profile is no longer available.');
  const result: BrowserImportResult = { bookmarks: [], history: [], homepages: [], openTabs: [], warnings: [], counts: { bookmarks: 0, history: 0, homepages: 0, openTabs: 0 }, truncated: false };
  const selected = (type: BrowserImportDataType) => request[type] === true && source.capabilities[type].available && source.capabilities[type].method === 'native';
  for (const type of types) if (request[type] === true && !selected(type)) result.warnings.push({ type: source.capabilities[type].method !== 'native' ? 'unsupported' : 'unavailable', dataType: type, message: source.capabilities[type].reason || 'The required source file was not found for this profile.' });
  if ((source.family === 'gecko' && selected('bookmarks')) || selected('history')) {
    try {
      const { stdout } = await run(pythonExe, ['-I', '-c', sqliteReader, source.directory, source.family, selected('bookmarks') ? '1' : '0', selected('history') ? '1' : '0', String(MAX_ROWS)], { windowsHide: true, timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
      const rows = JSON.parse(stdout); result.bookmarks = Array.isArray(rows.bookmarks) ? rows.bookmarks : []; result.history = Array.isArray(rows.history) ? rows.history : []; result.warnings.push(...(Array.isArray(rows.warnings) ? rows.warnings : []));
    } catch { for (const type of ['bookmarks', 'history'] as const) if (selected(type) && (source.family === 'gecko' || type === 'history')) result.warnings.push({ type: 'unavailable', dataType: type, message: 'The database reader could not complete. Close the source browser and retry; very large sources may exceed the safe time/output limit.' }); }
  }
  if (source.family === 'chromium' && selected('bookmarks')) {
    try {
      const roots = JSON.parse((await readBounded(path.join(source.directory, 'Bookmarks'))).toString('utf8')).roots; let omitted = 0;
      const walk = (node: any, depth = 0): void => {
        if (!node || typeof node !== 'object') return; if (depth > 100) { omitted++; return; }
        if (node.type === 'url' && typeof node.url === 'string') {
          if (result.bookmarks.length >= MAX_ROWS) omitted++;
          else {
            const timestamp = Math.floor((Number(node.date_added || 0) - 11644473600000000) / 1000);
            result.bookmarks.push({ url: node.url, title: typeof node.name === 'string' ? node.name : node.url, createdAt: Number.isFinite(timestamp) ? Math.max(1, timestamp) : 1 });
          }
        }
        if (Array.isArray(node.children)) for (const child of node.children) walk(child, depth + 1);
      };
      for (const root of Object.values(roots || {})) walk(root);
      if (omitted) result.warnings.push({ type: 'truncated', dataType: 'bookmarks', message: 'Bookmark count or nesting exceeds the safe import limit.', count: omitted });
    } catch { result.warnings.push({ type: 'unavailable', dataType: 'bookmarks', message: 'Bookmark file could not be read or exceeds the safe size limit.' }); }
  }
  if (selected('homepages')) {
    try {
      if (source.family === 'gecko') {
        const text = (await readBounded(path.join(source.directory, 'prefs.js'), 16 * 1024 * 1024)).toString('utf8');
        const matches = [...text.matchAll(/user_pref\(\s*"browser\.startup\.homepage"\s*,\s*("(?:\\.|[^"\\])*")\s*\)/g)];
        if (matches.length) result.homepages = JSON.parse(matches[matches.length - 1][1]).split('|');
      } else {
        const prefs = JSON.parse((await readBounded(path.join(source.directory, 'Preferences'), 32 * 1024 * 1024)).toString('utf8'));
        if (typeof prefs.homepage === 'string' && prefs.homepage_is_newtabpage !== true) result.homepages.push(prefs.homepage);
        if (prefs.session?.restore_on_startup === 4 && Array.isArray(prefs.session.startup_urls)) result.homepages.push(...prefs.session.startup_urls.filter((value: unknown) => typeof value === 'string'));
      }
    } catch { result.warnings.push({ type: 'unavailable', dataType: 'homepages', message: 'Homepage preferences could not be read. No preferences were executed.' }); }
  }
  if (selected('openTabs')) await importSession(source, result);
  const oldBookmarks = result.bookmarks.length, oldHistory = result.history.length;
  result.bookmarks = result.bookmarks.filter(item => webUrl(item.url)); result.history = result.history.filter(item => webUrl(item.url));
  for (const [type, before] of [['bookmarks', oldBookmarks], ['history', oldHistory]] as const) if (before > result[type].length) result.warnings.push({ type: 'skipped', dataType: type, message: 'Invalid or non-web URLs were skipped.', count: before - result[type].length });
  const validHomepages = result.homepages.filter(webUrl); const rejectedHomepages = result.homepages.length - validHomepages.length; result.homepages = [...new Set(validHomepages)];
  if (rejectedHomepages) result.warnings.push({ type: 'skipped', dataType: 'homepages', message: 'Internal, invalid or non-web homepage URLs were skipped.', count: rejectedHomepages });
  for (const type of ['bookmarks', 'history', 'homepages', 'openTabs'] as const) result.counts[type] = result[type].length;
  result.truncated = result.warnings.some(warning => warning.type === 'truncated'); return result;
}
