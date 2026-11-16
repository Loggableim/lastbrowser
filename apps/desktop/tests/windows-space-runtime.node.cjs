const { test } = require('node:test');
const assert = require('node:assert/strict');

test('portable setup stops before inspecting or starting the protected Space runtime', async t => {
  const { resolveWindowsSpaceMigrationRuntime, spaceMigrationPrerequisite } =
    await import('../src/main/windows-space-runtime.ts');
  const previous = process.env.PORTABLE_EXECUTABLE_FILE;
  t.after(() => {
    if (previous === undefined) delete process.env.PORTABLE_EXECUTABLE_FILE;
    else process.env.PORTABLE_EXECUTABLE_FILE = previous;
  });
  process.env.PORTABLE_EXECUTABLE_FILE = 'portable-test-launcher.exe';
  assert.equal(await spaceMigrationPrerequisite('missing-resource-fixture'), 'portable');
  assert.throws(() => resolveWindowsSpaceMigrationRuntime('missing-resource-fixture'), /Portable/);
});
