# Env Var Auditor for VS Code

Inline diagnostics for environment-variable problems that runtime validators
miss:

- **Client-exposed** (Error) — a secret-looking or unprefixed variable is read
  from a `'use client'` file, so it will end up in the browser bundle.
- **Read but undeclared** (Warning) — code reads `process.env.FOO`, but `FOO`
  is never declared in any `.env*` file, so it will be `undefined` at runtime.
- **Declared but unread** (Hint, shown dimmed) — `FOO` is declared in a
  `.env*` file but never read anywhere in the codebase.

Diagnostics are computed with the same [`env-var-auditor`](https://github.com/AllThingsSmitty/env-var-auditor)
static-analysis engine used by the CLI and ESLint plugin, and update live as
you type — no build step or ESLint config required.

## Features

- Squiggles in the editor and entries in the Problems panel for all three
  finding types.
- Live re-analysis on edits to source files and `.env*` files, debounced to
  stay out of your way.
- Watches for out-of-editor changes too (branch switches, file creation and
  deletion, Explorer operations).
- Reads `.env-auditorrc.json` automatically; VS Code settings layer
  additively on top of it.
- `Env Var Auditor: Rescan Workspace` command for an on-demand full rescan.

## Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `envVarAuditor.enable` | boolean | `true` | Enable or disable diagnostics. |
| `envVarAuditor.ignore` | string[] | `[]` | Extra glob patterns to ignore, merged with `.env-auditorrc.json`. |
| `envVarAuditor.secretPatterns` | string[] | `[]` | Extra secret-name regex sources, merged with `.env-auditorrc.json`. |
| `envVarAuditor.configPath` | string | `""` | Override path to `.env-auditorrc.json`. Empty auto-discovers at the workspace root. |
| `envVarAuditor.debounceMs` | number | `300` | Debounce window (ms) before re-analyzing an edited file. |

Severities are fixed in v1 (client-exposed = Error, read-but-undeclared =
Warning, declared-but-unread = Hint) and are not user-configurable.

## v1 scope and limitations

- Single-root workspaces only; with multiple folders open, only the first is
  audited.
- No dashboard webview and no baseline-awareness — this extension is
  inline-diagnostics only. Use the CLI's `--baseline`/`--progress` flags for
  that.
- The `unauditable` (dynamic `process.env[x]`) finding bucket is not
  surfaced.
- No monorepo package-boundary awareness (`auditWorkspace`); the whole
  workspace root is treated as one package.

## Development

This extension depends on the core `env-var-auditor` package via
`workspace:*`, resolved to its compiled `dist/` output — not a `../src`
relative import. When developing against local core-library changes, run the
core package's watch build concurrently from the repo root:

```sh
pnpm dev            # from the repo root — tsc --watch for env-var-auditor
```

Then, from `vscode-extension/`:

```sh
pnpm dev            # esbuild --watch for the extension bundle
```

Press <kbd>F5</kbd> in this folder to launch an Extension Development Host
window with the bundle attached (wired to the esbuild watch task via
`.vscode/launch.json` / `.vscode/tasks.json`).

Run the unit test suite (no extension host required):

```sh
pnpm test
```

### Integration tests

A separate `@vscode/test-cli` + `@vscode/test-electron` suite drives a real
(but non-interactive) VS Code instance against the `fixtures/nextjs-sample`
fixture (one level up from this package), exercising activation, live-edit
diagnostics, the `FileSystemWatcher` disk-change path, and configuration
toggles end-to-end. These tests live under `test/suite/` (not `tests/`, to
stay distinct from the unit-test directory above) and run in a single shared
extension host, so they execute serially and each clean up after themselves.

```sh
pnpm test:integration
```

This compiles `test/suite/**/*.ts` to CommonJS in `out-test/` via
`tsconfig.test.json` (`@vscode/test-cli`'s runner loads compiled JS test
files, not TypeScript directly), rebuilds the extension bundle, then launches
`vscode-test` per `.vscode-test.mjs`. On Windows/macOS this opens a real (but
automated, no-interaction-required) VS Code window; on Linux CI it runs
headlessly under `xvfb-run`. The `compile-tests` script (`tsc -p
tsconfig.test.json`) is also available standalone if you just want to
typecheck/compile the integration tests without running them.
