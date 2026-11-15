import { randomUUID } from 'node:crypto';
import { lstat, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { resolveSpaceMigrationLayout } from './space-migration-layout.js';

const fileName = 'independent-browser-bindings.json';
const accountFile = 'independent-browser-account-receipts.json';
const maxBytes = 4 * 1024 * 1024;
const validId = /^[a-z0-9][a-z0-9_.-]{0,127}$/i;

async function readBindingFile(file: string) {
  const stat = await lstat(file);
  if (!stat.isFile() || stat.nlink !== 1 || stat.size > maxBytes) throw new Error('Invalid browser binding file');
  return readFile(file, 'utf8');
}

async function readBindingRegistry(file: string) {
  const original = JSON.parse(await readBindingFile(file));
  if (original?.schemaVersion !== 1 || !Array.isArray(original.bindings) || original.bindings.some(
    (entry: unknown) => !entry || typeof entry !== 'object' || !('scope' in entry)
      || !entry.scope || typeof entry.scope !== 'object' || !('spaceId' in entry.scope)
      || typeof entry.scope.spaceId !== 'string'
  )) throw new Error('Unsupported browser binding registry');
  return original.bindings as Array<{ scope: { spaceId: string; browserProfileId: unknown; backendProfileId: unknown };
    schemaVersion?: unknown; partitionKey?: unknown; backendProfileName?: unknown; workspacePath?: unknown;
    spaceName?: unknown; bindingRevision?: unknown }>;
}

type BindingCatalog = Parameters<typeof resolveSpaceMigrationLayout>[1];

function splitRegistry(rows: Awaited<ReturnType<typeof readBindingRegistry>>, catalog: BindingCatalog,
  primaryId: string, decoyId: string) {
  if (primaryId === decoyId) throw new Error('The selected browser bindings must differ');

  function select(id: string) {
    const selected = rows.filter(row => row.scope.spaceId === id);
    const matches = catalog.filter(record => record.spaceId === id);
    if (selected.length !== 1 || matches.length !== 1) throw new Error('The selected browser binding is ambiguous');
    const [row] = selected;
    const [expected] = matches;
    if (row.scope.browserProfileId !== expected.browserProfileId || row.partitionKey !== expected.partitionKey
      || row.backendProfileName !== expected.backendProfileName
      || (expected.backendProfileId !== undefined && row.scope.backendProfileId !== expected.backendProfileId)) {
      throw new Error('The selected browser binding changed');
    }
    if (row.schemaVersion !== 1 || typeof row.scope.backendProfileId !== 'string' || !validId.test(row.scope.backendProfileId)
      || !(row.workspacePath === null || typeof row.workspacePath === 'string') || typeof row.spaceName !== 'string'
      || !Number.isSafeInteger(row.bindingRevision)) throw new Error('Invalid selected browser binding');
    const { scope, partitionKey, backendProfileName, workspacePath, spaceName, bindingRevision } = row;
    return {
      schemaVersion: 1, scope: { spaceId: id, browserProfileId: expected.browserProfileId, backendProfileId: scope.backendProfileId },
      partitionKey, backendProfileName, workspacePath, spaceName, bindingRevision
    };
  }

  const encode = (bindings: readonly unknown[]) => JSON.stringify({ schemaVersion: 1, bindings });
  return {
    primary: encode([select(primaryId)]),
    decoy: encode([select(decoyId)]),
    remainder: encode(rows.filter(row => row.scope.spaceId !== primaryId && row.scope.spaceId !== decoyId))
  };
}

/** Split the offline Main-owned registry using the selected storage bindings. */
export async function readSpaceBindingMigration(root: string, catalog: BindingCatalog, primaryId: string, decoyId: string) {
  return splitRegistry(await readBindingRegistry(path.join(root, fileName)), catalog, primaryId, decoyId);
}

async function writeBindingFile(file: string, body: string): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const pending = await open(temporary, 'wx', 0o600);
    try {
      await pending.writeFile(body, 'utf8');
      await pending.sync();
    } finally {
      await pending.close();
    }
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

/** Publish a single scoped registry inside an already authenticated profile. */
export async function stageProtectedSpaceBinding(profile: string, body: string): Promise<void> {
  await stageScopedRegistry(path.join(profile, fileName), body);
}

async function stageScopedRegistry(file: string, body: string): Promise<void> {
  try {
    if (await readBindingFile(file) !== body) throw new Error('The staged browser binding does not match the selected Space');
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await writeBindingFile(file, body);
}

/** Only call during adoption after both encrypted copies have been verified. */
export async function retireLegacySpaceBindings(root: string, catalog: BindingCatalog, primaryId: string, decoyId: string) {
  const file = path.join(root, fileName);
  const rows = await readBindingRegistry(file);
  if (rows.some(row => row.scope.spaceId === primaryId || row.scope.spaceId === decoyId)) {
    await writeBindingFile(file, splitRegistry(rows, catalog, primaryId, decoyId).remainder);
  }
  // Main may have been interrupted between writing and renaming its own temporary registry.
  await removePendingRegistryWrites(root, fileName);
}

async function removePendingRegistryWrites(root: string, name: string) {
  const suffix = /^[.][a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}[.]tmp$/i;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name.toLowerCase().startsWith(name) && suffix.test(entry.name.slice(name.length)) && entry.isFile()) {
      await unlink(path.join(root, entry.name));
    }
  }
}

/** Partition the shared account authority cache along the same immutable Space identities. */
export async function readSpaceAccountMigration(root: string, catalog: BindingCatalog, primaryId: string, decoyId: string) {
  let document;
  try {
    document = JSON.parse(await readBindingFile(path.join(root, accountFile)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  if (document?.schemaVersion !== 1 || !Array.isArray(document.receipts)
    || !Array.isArray(document.sensitiveScopes ?? [])) throw new Error('Invalid browser account registry');
  const members = new Map(catalog.filter(row => row.spaceId === primaryId || row.spaceId === decoyId)
    .map(row => [row.spaceId, row]));
  const scopes = document.sensitiveScopes ?? [];
  function owner(scope: unknown, backendProfileName?: unknown): string {
    if (!scope || typeof scope !== 'object' || !('spaceId' in scope) || typeof scope.spaceId !== 'string'
      || !('browserProfileId' in scope) || typeof scope.browserProfileId !== 'string'
      || !('backendProfileId' in scope) || typeof scope.backendProfileId !== 'string') {
      throw new Error('Invalid browser account Space scope');
    }
    const binding = members.get(scope.spaceId);
    if (binding && (scope.browserProfileId !== binding.browserProfileId
      || (binding.backendProfileId !== undefined && scope.backendProfileId !== binding.backendProfileId)
      || (backendProfileName !== undefined && backendProfileName !== binding.backendProfileName))) {
      throw new Error('The selected browser account scope changed');
    }
    return scope.spaceId;
  }
  const receipts = document.receipts.map((row: { scope?: unknown; backendProfileName?: unknown }) => {
    if (typeof row?.backendProfileName !== 'string') throw new Error('Invalid browser account receipt');
    return { owner: owner(row.scope, row.backendProfileName), row };
  });
  const sensitive = scopes.map((scope: unknown) => ({ owner: owner(scope), scope }));
  const encode = (include: (id: string) => boolean) => JSON.stringify({
    schemaVersion: 1, receipts: receipts.filter((entry: { owner: string }) => include(entry.owner)).map((entry: { row: unknown }) => entry.row),
    sensitiveScopes: sensitive.filter((entry: { owner: string }) => include(entry.owner)).map((entry: { scope: unknown }) => entry.scope)
  });
  return {
    primary: encode(id => id === primaryId), decoy: encode(id => id === decoyId),
    remainder: encode(id => id !== primaryId && id !== decoyId),
    changed: [...receipts, ...sensitive].some(entry => members.has(entry.owner))
  };
}

export async function stageProtectedSpaceAccounts(profile: string, body: string | undefined) {
  if (body !== undefined) await stageScopedRegistry(path.join(profile, accountFile), body);
}

export async function retireLegacySpaceAccounts(root: string, catalog: BindingCatalog, primaryId: string, decoyId: string) {
  const accounts = await readSpaceAccountMigration(root, catalog, primaryId, decoyId);
  if (accounts?.changed) await writeBindingFile(path.join(root, accountFile), accounts.remainder);
  await removePendingRegistryWrites(root, accountFile);
}
