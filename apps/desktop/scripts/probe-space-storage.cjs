// Run with Electron against an explicitly supplied, empty test directory.
const { app, session } = require('electron');
const { randomUUID } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const argument = process.argv.find(value => value.startsWith('--probe-root='));
if (!argument) throw new Error('Supply --probe-root=<new synthetic test directory>');
const root = resolve(argument.slice('--probe-root='.length));
if (existsSync(root)) throw new Error('The synthetic test directory must not exist');
mkdirSync(root);
app.setPath('userData', root);
app.setPath('sessionData', root);

app.whenReady().then(async () => {
  const cookieMarker = randomUUID();
  const chatMarker = randomUUID();
  const cacheMarker = randomUUID();
  const space = session.fromPartition('persist:space_synthetic_default');
  await space.cookies.set({
    url: 'https://storage-probe.invalid',
    name: 'synthetic',
    value: cookieMarker,
    expirationDate: Date.now() / 1000 + 3600
  });
  await space.cookies.flushStore();

  // Store a stand-in for cache data even if Chromium in this build has cache
  // disabled. Run the boundary probe separately from the HTTP cache tests.
  const cacheDir = join(space.storagePath, 'cache-probe');
  mkdirSync(cacheDir);
  writeFileSync(join(cacheDir, 'response-body'), cacheMarker);

  const sqlite = new DatabaseSync(join(root, 'synthetic-chat.sqlite'));
  try {
    sqlite.exec('PRAGMA journal_mode = WAL; CREATE TABLE messages (body TEXT)');
    sqlite.prepare('INSERT INTO messages (body) VALUES (?)').run(chatMarker);
    const result = {
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      chatMarkerInWal: readFileSync(join(root, 'synthetic-chat.sqlite-wal')).includes(chatMarker)
    };
    // Chromium holds the cookie database exclusively on Windows. The caller
    // can open it after Electron exits and compare against the synthetic hash.
    const { createHash } = require('node:crypto');
    const hash = value => createHash('sha256').update(value).digest('hex');
    writeFileSync(join(root, 'storage-probe.json'), JSON.stringify({
      cookie: hash(cookieMarker),
      chat: hash(chatMarker),
      cache: hash(cacheMarker)
    }));
    console.log(JSON.stringify(result));
    process.exitCode = result.chatMarkerInWal ? 1 : 0;
  } finally {
    sqlite.close();
  }
  app.exit(process.exitCode);
}).catch(error => {
  console.error('Storage probe failed before completing its checks', error?.code ?? error?.name);
  app.exit(2);
});
