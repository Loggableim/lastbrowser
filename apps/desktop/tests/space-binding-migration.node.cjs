const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdir, mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const path = require('node:path');

test('migration stages each immutable browser binding in only its own protected profile', async t => {
  const { readSpaceBindingMigration, retireLegacySpaceBindings, stageProtectedSpaceBinding } = await import('../src/main/space-binding-migration.ts');
  const root = await mkdtemp(path.join(tmpdir(), 'lastbrowser-space-bindings-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bindingFile = 'independent-browser-bindings.json';
  const row = (id, browserProfileId = id) => ({
    schemaVersion: 1,
    scope: { spaceId: id, browserProfileId, backendProfileId: `backend-${id}` },
    partitionKey: `persist:space_${id}_${browserProfileId}`,
    backendProfileName: id,
    workspacePath: `workspace-${id}`,
    spaceName: `Fixture ${id}`,
    bindingRevision: 7
  });
  const document = bindings => JSON.stringify({ schemaVersion: 1, bindings });
  const rows = ['primary', 'decoy', 'other'].map(id => row(id));
  const original = document(rows);
  const catalog = rows.map(record => ({
    ...record.scope, partitionKey: record.partitionKey, backendProfileName: record.backendProfileName
  }));
  const source = path.join(root, bindingFile);
  await writeFile(source, original);
  const plan = await readSpaceBindingMigration(root, catalog, 'primary', 'decoy');
  const destination = path.join(root, 'vault-profile');
  await mkdir(destination);
  await stageProtectedSpaceBinding(destination, plan.primary);
  await stageProtectedSpaceBinding(destination, plan.primary);
  const staged = JSON.parse(await readFile(path.join(destination, bindingFile), 'utf8'));
  assert.deepEqual(staged, JSON.parse(document([rows[0]])));
  assert.deepEqual(JSON.parse(plan.decoy), JSON.parse(document([rows[1]])));
  assert.deepEqual(JSON.parse(plan.remainder), JSON.parse(document([rows[2]])));
  assert.equal(await readFile(source, 'utf8'), original);
  await assert.rejects(stageProtectedSpaceBinding(destination, plan.decoy), /does not match/);
  const stale = [{ ...catalog[0], partitionKey: 'persist:space_other_primary' }, ...catalog.slice(1)];
  await assert.rejects(readSpaceBindingMigration(root, stale, 'primary', 'decoy'), /changed/);
  await writeFile(source, document([...rows, row('primary', 'another-profile')]));
  await assert.rejects(readSpaceBindingMigration(root, catalog, 'primary', 'decoy'), /ambiguous|changed/);
  await assert.rejects(retireLegacySpaceBindings(root, catalog, 'primary', 'decoy'), /ambiguous|changed/);
  await writeFile(source, original);
  const oldWrite = `${source}.50073f77-8265-4715-afb6-5376ea218cfb.tmp`;
  await writeFile(oldWrite, original);
  const unrelatedFile = `${source}.backup`;
  await writeFile(unrelatedFile, 'unmanaged');
  await retireLegacySpaceBindings(root, catalog, 'primary', 'decoy');
  await retireLegacySpaceBindings(root, catalog, 'primary', 'decoy');
  assert.deepEqual(JSON.parse(await readFile(source, 'utf8')), JSON.parse(document([rows[2]])));
  await assert.rejects(readFile(oldWrite), { code: 'ENOENT' });
  assert.equal(await readFile(unrelatedFile, 'utf8'), 'unmanaged');
});

test('account authority is retained only in its own vault and unrelated receipts stay available', async t => {
  const { readSpaceAccountMigration, stageProtectedSpaceAccounts, retireLegacySpaceAccounts } =
    await import('../src/main/space-binding-migration.ts');
  const root = await mkdtemp(path.join(tmpdir(), 'lastbrowser-space-accounts-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const filename = 'independent-browser-account-receipts.json';
  const live = path.join(root, filename);
  const scopes = ['primary', 'decoy', 'other'].map(id => ({
    spaceId: id, browserProfileId: `browser-${id}`, backendProfileId: `backend-${id}`
  }));
  const rows = scopes.map(scope => ({ scope, backendProfileName: scope.spaceId, origin: `https://${scope.spaceId}.invalid` }));
  const catalog = scopes.map(scope => ({ ...scope, backendProfileName: scope.spaceId, partitionKey: 'synthetic' }));
  const registry = (receipts, sensitiveScopes) => ({ schemaVersion: 1, receipts, sensitiveScopes });
  await writeFile(live, JSON.stringify(registry(rows, scopes)));
  const plan = await readSpaceAccountMigration(root, catalog, 'primary', 'decoy');
  const vault = path.join(root, 'vault');
  await mkdir(vault);
  await stageProtectedSpaceAccounts(vault, plan.primary);
  assert.deepEqual(JSON.parse(await readFile(path.join(vault, filename), 'utf8')), registry([rows[0]], [scopes[0]]));
  assert.deepEqual(JSON.parse(plan.decoy), registry([rows[1]], [scopes[1]]));
  await assert.rejects(readSpaceAccountMigration(root, [{ ...catalog[0], backendProfileId: 'stale' }, ...catalog.slice(1)],
    'primary', 'decoy'), /scope changed/);
  await retireLegacySpaceAccounts(root, catalog, 'primary', 'decoy');
  await retireLegacySpaceAccounts(root, catalog, 'primary', 'decoy');
  assert.deepEqual(JSON.parse(await readFile(live, 'utf8')), registry([rows[2]], [scopes[2]]));
});
