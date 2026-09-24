import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    // Scope to this package's own tests — without an explicit include,
    // vitest's default glob also sweeps up vscode-extension/tests/ since
    // it's a sibling workspace package, not a node_modules dependency.
    include: ['tests/**/*.test.ts'],
  },
});
