import path from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const browserIds = ['chrome', 'edge', 'firefox', 'zen', 'brave'] as const;
type BrowserId = typeof browserIds[number];
type Profile = { id: string; browser: BrowserId; name: string; directory: string; preferred: boolean };
export type BrowserImportDiscovery = {
  defaultBrowser: string | null;
  defaultBrowserId: BrowserId | null;
  profiles: Array<Omit<Profile, 'directory'>>;
};

async function registryValue(key: string, name = ''): Promise<string> {
  try {
    const { stdout } = await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe'),
      ['query', key, name ? '/v' : '/ve', ...(name ? [name] : [])], { windowsHide: true, timeout: 3000, maxBuffer: 16384 });
    return stdout.match(/REG_SZ\s+(.+)/)?.[1].trim() || '';
  } catch { return ''; }
}
async function detectDefault(): Promise<Pick<BrowserImportDiscovery, 'defaultBrowser' | 'defaultBrowserId'>> {
  if (process.platform !== 'win32') return { defaultBrowser: null, defaultBrowserId: null };
  const progId = await registryValue('HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice', 'ProgId');
  // Read the registered command as metadata only. Never execute a browser command from the registry.
  const command = progId ? await registryValue(`HKCR\\${progId}\\shell\\open\\command`) : '';
  const text = `${progId} ${command}`.toLowerCase();
  const id: BrowserId | null = /zen(?:\.exe|url|html|browser|[\\/])/.test(text) ? 'zen'
    : /firefox/.test(text) ? 'firefox' : /brave/.test(text) ? 'brave'
      : /msedge|microsoftedge|mseht|microsoft-edge/.test(text) ? 'edge' : /chrome/.test(text) ? 'chrome' : null;
  return { defaultBrowser: /lastbrowser/.test(text) ? 'LastBrowser' : id ? ({ chrome: 'Google Chrome', edge: 'Microsoft Edge', firefox: 'Mozilla Firefox', zen: 'Zen Browser', brave: 'Brave Browser' })[id] : (progId || null), defaultBrowserId: id };
}
function profile(browser: BrowserId, directory: string, name: string, preferred = false): Profile {
  return { id: createHash('sha256').update(browser + '\0' + directory).digest('hex').slice(0, 24), browser, name, directory, preferred };
}
async function readIni(file: string): Promise<Array<Record<string, string>>> {
  try {
    const text = await readFile(file, 'utf8');
    const sections: Array<Record<string, string>> = [];
    let section: Record<string, string> | undefined;
    for (const line of text.split(/\r?\n/)) {
      if (/^\s*\[/.test(line)) { section = {}; sections.push(section); }
      else { const m = /^([^=;#]+)=(.*)$/.exec(line); if (m && section) section[m[1].trim()] = m[2].trim(); }
    }
    return sections;
  } catch { return []; }
}
async function discoverProfiles(): Promise<Profile[]> {
  if (process.platform !== 'win32') return [];
  const roaming = process.env.APPDATA;
  const local = process.env.LOCALAPPDATA;
  const result: Profile[] = [];
  if (roaming) for (const browser of ['firefox', 'zen'] as const) {
    const root = path.join(roaming, ...(browser === 'zen' ? ['zen'] : ['Mozilla', 'Firefox']));
    const installs = await readIni(path.join(root, 'installs.ini'));
    const profiles = await readIni(path.join(root, 'profiles.ini'));
    const preferred = new Set([...installs, ...profiles].filter(s => s.Default && s.Path === undefined).map(s => path.resolve(root, s.Default)));
    for (const entry of profiles) if (entry.Path) {
      const directory = entry.IsRelative === '0' ? path.resolve(entry.Path) : path.resolve(root, entry.Path);
      if (existsSync(path.join(directory, 'places.sqlite'))) result.push(profile(browser, directory, entry.Name || path.basename(directory), entry.Default === '1' || preferred.has(directory)));
    }
    // Zen installations without an INI still use the documented Profiles directory.
    if (!result.some(p => p.browser === browser)) {
      const entries = await readdir(path.join(root, 'Profiles'), { withFileTypes: true }).catch(() => []);
      for (const entry of entries) if (entry.isDirectory() && existsSync(path.join(root, 'Profiles', entry.name, 'places.sqlite')))
        result.push(profile(browser, path.join(root, 'Profiles', entry.name), entry.name));
    }
  }
  if (local) for (const [browser, segments] of [
    ['chrome', ['Google', 'Chrome', 'User Data']], ['edge', ['Microsoft', 'Edge', 'User Data']], ['brave', ['BraveSoftware', 'Brave-Browser', 'User Data']]
  ] as Array<[BrowserId, string[]]>) {
    const root = path.join(local, ...segments);
    let info: Record<string, { name?: string }> = {};
    let lastUsed = 'Default';
    try { const state = JSON.parse(await readFile(path.join(root, 'Local State'), 'utf8')); info = state.profile?.info_cache || {}; lastUsed = state.profile?.last_used || 'Default'; } catch { /* directory metadata fallback */ }
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) if (entry.isDirectory() && /^(Default|Profile \d+)$/.test(entry.name)) {
      const directory = path.join(root, entry.name);
      if (existsSync(path.join(directory, 'Bookmarks')) || existsSync(path.join(directory, 'History')))
        result.push(profile(browser, directory, info[entry.name]?.name || entry.name, entry.name === lastUsed));
    }
  }
  return result.sort((a, b) => Number(b.preferred) - Number(a.preferred));
}
export async function discoverBrowserImport(): Promise<BrowserImportDiscovery> {
  const [defaults, profiles] = await Promise.all([detectDefault(), discoverProfiles()]);
  return { ...defaults, profiles: profiles.map(({ directory: _directory, ...metadata }) => metadata) };
}
const sqliteReader = String.raw`
import sys,json,sqlite3,pathlib
p=pathlib.Path(sys.argv[1]); family=sys.argv[2]; bookmarks=sys.argv[3]=='1'; history=sys.argv[4]=='1'
out={'bookmarks':[],'history':[]}
def read(db,query):
 c=sqlite3.connect(db.as_uri()+'?mode=ro',uri=True,timeout=2)
 try: return c.execute(query).fetchall()
 finally: c.close()
if family=='firefox':
 db=p/'places.sqlite'
 if bookmarks:
  out['bookmarks']=[{'url':u,'title':t or u,'createdAt':max(1,d//1000)} for u,t,d in read(db,'SELECT p.url,b.title,COALESCE(b.dateAdded,0) FROM moz_bookmarks b JOIN moz_places p ON p.id=b.fk WHERE b.type=1 ORDER BY b.dateAdded DESC LIMIT 5000')]
 if history:
  out['history']=[{'url':u,'title':t or u,'count':max(1,n),'lastVisited':d//1000} for u,t,n,d in read(db,'SELECT url,title,visit_count,last_visit_date FROM moz_places WHERE last_visit_date IS NOT NULL ORDER BY last_visit_date DESC LIMIT 500')]
else:
 if history:
  out['history']=[{'url':u,'title':t or u,'count':max(1,n),'lastVisited':max(1,(d-11644473600000000)//1000)} for u,t,n,d in read(p/'History','SELECT url,title,visit_count,last_visit_time FROM urls ORDER BY last_visit_time DESC LIMIT 500')]
print(json.dumps(out))
`;
export async function importBrowserData(value: unknown, pythonExe: string): Promise<{ bookmarks: Array<{ url: string; title: string; createdAt: number }>; history: Array<{ url: string; title: string; count: number; lastVisited: number }> }> {
  if (!value || typeof value !== 'object') throw new Error('Invalid import request.');
  const request = value as Record<string, unknown>;
  if (typeof request.profileId !== 'string' || typeof request.bookmarks !== 'boolean' || typeof request.history !== 'boolean' || (!request.bookmarks && !request.history)) throw new Error('Select data to import.');
  const source = (await discoverProfiles()).find(item => item.id === request.profileId);
  if (!source) throw new Error('Browser profile is no longer available.');
  const firefox = source.browser === 'firefox' || source.browser === 'zen';
  const result: Awaited<ReturnType<typeof importBrowserData>> = { bookmarks: [], history: [] };
  try {
    if (firefox || request.history) {
      const { stdout } = await run(pythonExe, ['-I', '-c', sqliteReader, source.directory, firefox ? 'firefox' : 'chromium', request.bookmarks ? '1' : '0', request.history ? '1' : '0'], { windowsHide: true, timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
      Object.assign(result, JSON.parse(stdout));
    }
    if (!firefox && request.bookmarks) {
      const file = path.join(source.directory, 'Bookmarks');
      if ((await stat(file)).size > 20 * 1024 * 1024) throw new Error('Bookmark file too large.');
      const roots = JSON.parse(await readFile(file, 'utf8')).roots;
      const walk = (node: any, depth = 0): void => {
        if (!node || depth > 30 || result.bookmarks.length >= 5000) return;
        if (node.type === 'url' && typeof node.url === 'string') result.bookmarks.push({ url: node.url, title: typeof node.name === 'string' ? node.name : node.url, createdAt: Math.max(1, (Number(node.date_added || 0) - 11644473600000000) / 1000) });
        if (Array.isArray(node.children)) for (const child of node.children) walk(child, depth + 1);
      };
      for (const root of Object.values(roots || {})) walk(root);
    }
    const safe = (item: { url: string }) => { try { return ['http:', 'https:'].includes(new URL(item.url).protocol); } catch { return false; } };
    result.bookmarks = result.bookmarks.filter(safe);
    result.history = result.history.filter(safe);
    return result;
  } catch { throw new Error('Browser data could not be read. Close the source browser and retry, or import an exported bookmark file.'); }
}
