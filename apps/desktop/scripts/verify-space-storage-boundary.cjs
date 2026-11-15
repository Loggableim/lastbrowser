// Run after probe-space-storage.cjs exits, while the synthetic vault is mounted.
// node verify-space-storage-boundary.cjs <mounted probe root> <synthetic backing root>
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { createReadStream, existsSync, readFileSync, realpathSync } = require('node:fs');
const { readdir } = require('node:fs/promises');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function readFixture(root) {
  const receipt = JSON.parse(readFileSync(path.join(root, 'storage-probe.json'), 'utf8'));
  const partition = path.join(root, 'Partitions', 'space_synthetic_default');
  const cookieDatabase = ['Network/Cookies', 'Cookies']
    .map(relative => path.join(partition, relative)).find(existsSync);
  const cookies = new DatabaseSync(cookieDatabase, { readOnly: true });
  const chat = new DatabaseSync(path.join(root, 'synthetic-chat.sqlite'), { readOnly: true });
  try {
    const entries = {
      cookie: cookies.prepare('SELECT value FROM cookies WHERE name = ?').get('synthetic')?.value,
      chat: chat.prepare('SELECT body FROM messages').get()?.body,
      cache: readFileSync(path.join(partition, 'cache-probe', 'response-body'), 'utf8')
    };
    if (receipt.sidekick) {
      const sidekick = new DatabaseSync(path.join(root, 'runtime', 'profiles', 'synthetic', 'state.db'), { readOnly: true });
      try {
        entries.sidekick = sidekick.prepare('SELECT content FROM messages WHERE session_id = ?')
          .get('synthetic-smoke')?.content;
      } finally {
        sidekick.close();
      }
    }
    for (const [name, value] of Object.entries(entries)) {
      assert.match(value, /^[0-9a-f-]{36}$/, `Missing synthetic ${name} marker`);
      assert.equal(createHash('sha256').update(value).digest('hex'), receipt[name],
        `Wrong synthetic ${name} marker`);
    }
    return Object.values(entries).map(value => Buffer.from(value));
  } finally {
    cookies.close();
    chat.close();
  }
}

async function scanBacking(directory, markers) {
  let count = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      count += await scanBacking(file, markers);
    } else {
      if (!entry.isFile()) throw new Error('Unexpected entry in synthetic backing storage');
      let tail = Buffer.alloc(0);
      for await (const chunk of createReadStream(file)) {
        const bytes = Buffer.concat([tail, chunk]);
        if (markers.some(marker => bytes.includes(marker))) {
          throw new Error('Synthetic plaintext found in backing storage');
        }
        tail = bytes.subarray(-35);
      }
      count++;
    }
  }
  return count;
}

async function main() {
  if (process.argv.length !== 4) throw new Error('Provide both synthetic storage roots');
  const mounted = realpathSync(process.argv[2]);
  const backing = realpathSync(process.argv[3]);
  if (mounted === backing) throw new Error('Use distinct mounted and backing roots');
  const markers = readFixture(mounted);
  const files = await scanBacking(backing, markers);
  if (!files) throw new Error('No backing files were available to inspect');
  console.log(JSON.stringify({ checkedBackingFiles: files, syntheticPlaintextFound: false }));
}

main().catch(error => {
  // Assertion details can include a fixture value. Print only the check name.
  console.error(error.name === 'AssertionError' ? 'Synthetic fixture verification failed' : error.message);
  process.exitCode = 1;
});
