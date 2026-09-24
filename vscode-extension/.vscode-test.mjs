import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@vscode/test-cli';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Compiled by `tsc -p tsconfig.test.json` (CommonJS, per @vscode/test-cli's
// default runner) before this config is consumed by the `vscode-test` CLI.
// Explicit file order (rather than a single glob) keeps the shared-state
// tests deterministic: the baseline-diagnostics assertions in
// extension.test.ts run first, then live-editing/disk-watcher behavior, then
// config toggles — each file restores the state it changed before the next
// one runs.
export default defineConfig({
  label: 'integration',
  files: [
    'out-test/suite/extension.test.js',
    'out-test/suite/liveEditing.test.js',
    'out-test/suite/config.test.js',
  ],
  // Reuse the existing nextjs-sample fixture (fixtures/nextjs-sample, one
  // level up from vscode-extension/) as the audited workspace — it already
  // has public/secret/declared-unread vars, a 'use client' file with a
  // missing-prefix secret and a secret-pattern var, and a destructured
  // access, covering all three v1 finding types.
  workspaceFolder: path.resolve(__dirname, '..', 'fixtures', 'nextjs-sample'),
  mocha: {
    ui: 'tdd',
    timeout: 20000,
    color: true,
  },
});
