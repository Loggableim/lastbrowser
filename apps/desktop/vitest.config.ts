import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
    // Avoid spawning one worker per reported CPU core on high-core Windows
    // hosts; the resulting resource contention can time out otherwise-fast
    // dynamic-import tests in the full suite.
    maxWorkers: 4
  }
});
