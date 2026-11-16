const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { tmpdir } = require('node:os');

const userData = path.join(tmpdir(), 'synthetic-user-data');
const primary = { spaceId: 'one', browserProfileId: 'profile-one', backendProfileName: 'sidekick-one',
  partitionKey: 'persist:space_first_profile-one',
  agentPartitionKey: `persist:independent_agent_v1_${'a'.repeat(64)}` };
const decoy = { spaceId: 'two', browserProfileId: 'profile-two', backendProfileName: 'sidekick-two',
  partitionKey: 'persist:space_second_profile-two' };

test('space migration identifies the existing guest partition and named Sidekick profile', async () => {
  const { resolveSpaceMigrationLayout } = await import('../src/main/space-migration-layout.ts');
  const layout = resolveSpaceMigrationLayout(userData, [primary, decoy], 'one', 'two');
  assert.deepEqual(layout.primary.partition, {
    source: path.join(userData, 'Partitions', 'space_first_profile-one'),
    target: path.join('chromium', 'Partitions', 'space_first_profile-one')
  });
  assert.deepEqual(layout.decoy.backend, {
    source: path.join(userData, 'runtime', 'profiles', 'sidekick-two'),
    target: path.join('runtime', 'profiles', 'sidekick-two')
  });
  const agent = primary.agentPartitionKey.slice('persist:'.length);
  assert.deepEqual(layout.primary.agent, {
    source: path.join(userData, 'Partitions', agent), target: path.join('chromium', 'Partitions', agent), optional: true
  });
});

test('migration refuses stale selection, shared stores and path-like bindings', async () => {
  const { resolveSpaceMigrationLayout } = await import('../src/main/space-migration-layout.ts');
  assert.throws(() => resolveSpaceMigrationLayout(userData, [primary, decoy], 'one', 'missing'), /selection/);
  assert.throws(() => resolveSpaceMigrationLayout(userData, [primary,
    { ...decoy, backendProfileName: primary.backendProfileName }], 'one', 'two'), /shared/i);
  assert.throws(() => resolveSpaceMigrationLayout(userData, [primary,
    { ...decoy, partitionKey: 'persist:space_../outside_profile-two' }], 'one', 'two'), /invalid/i);
  assert.throws(() => resolveSpaceMigrationLayout(userData, [primary,
    { ...decoy, agentPartitionKey: primary.agentPartitionKey }], 'one', 'two'), /shared/i);
});
