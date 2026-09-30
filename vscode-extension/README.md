# Env Var Auditor for VS Code

Inline diagnostics for environment-variable problems that runtime validators
miss:

- **Client-exposed** (Error): a secret-looking or unprefixed variable is read
  from a `'use client'` file (Next.js), so it will end up in the browser bundle.
- **Read but undeclared** (Warning): code reads `process.env.FOO`, but `FOO`
  is never declared in any `.env*` file, so it will be `undefined` at runtime.
- **Declared but unread** (Hint, shown dimmed): `FOO` is declared in a
  `.env*` file but never read anywhere in the codebase.

Diagnostics are computed with the same [`env-var-auditor`](https://github.com/AllThingsSmitty/env-var-auditor)
static-analysis engine used by the CLI and ESLint plugin, and update live as
you type. No build step or ESLint config required.

![All three diagnostic types shown in the editor and Problems panel](https://github.com/AllThingsSmitty/env-var-auditor/raw/main/.github/assets/env-var-auditor.png)

## Features

- Squiggles in the editor and entries in the Problems panel for all three
  finding types.
- Live re-analysis on edits to source files and `.env*` files, debounced to
  stay out of your way.
- Watches for out-of-editor file changes, including those from Git operations
  and Explorer file moves.
- Reads `.env-auditorrc.json` automatically; VS Code settings layer
  additively on top of it.
- Reads `web.config*` files automatically so that variables declared via
  `<environmentVariable name="..." />` (IIS / Azure App Service) are not
  flagged as read-but-undeclared.
- `Env Var Auditor: Rescan Workspace` command for an on-demand full rescan.

## Requirements

- VS Code 1.85 or later
- Node.js 18 or later
- A JavaScript or TypeScript project. The client-exposure finding applies
  specifically to Next.js projects that use `'use client'` files.

## Installation

Search **Env Var Auditor** in the Extensions sidebar, or run:

```
ext install AllThingsSmitty.env-var-auditor-vscode
```

## Quick Start

Open a JavaScript or TypeScript workspace and the extension activates
automatically. Diagnostics appear immediately in the editor and in the
**Problems** panel (`Ctrl+Shift+M` / `Cmd+Shift+M`). No configuration is
required to get started.

Use `Env Var Auditor: Rescan Workspace` from the Command Palette
(`Ctrl+Shift+P` / `Cmd+Shift+P`) any time you want a manual full rescan.

## Settings

| Setting                        | Type     | Default | Description                                                                         |
| ------------------------------ | -------- | ------- | ----------------------------------------------------------------------------------- |
| `envVarAuditor.enable`         | boolean  | `true`  | Enable or disable diagnostics.                                                      |
| `envVarAuditor.ignore`         | string[] | `[]`    | Extra glob patterns to ignore, merged with `.env-auditorrc.json`.                   |
| `envVarAuditor.secretPatterns` | string[] | `[]`    | Extra secret-name regex sources, merged with `.env-auditorrc.json`.                 |
| `envVarAuditor.configPath`     | string   | `""`    | Override path to `.env-auditorrc.json`. Empty auto-discovers at the workspace root. |
| `envVarAuditor.declaredVars`   | string[] | `[]`    | Variable names treated as externally declared (e.g. from `web.config` or CI/CD environment injection). Suppresses read-but-undeclared diagnostics for each listed name. |
| `envVarAuditor.debounceMs`     | number   | `300`   | Debounce window (ms) before re-analyzing an edited file.                            |

All settings can be scoped per-workspace via `.vscode/settings.json`.

Diagnostic severities are fixed in the current version (client-exposed =
Error, read-but-undeclared = Warning, declared-but-unread = Hint) and are not
user-configurable.

## Known Issues and Limitations

- Single-root workspaces only. With multiple folders open, only the first is
  audited. A warning is shown on activation if this applies to your workspace.
- No dashboard webview and no baseline-awareness. This extension is
  inline-diagnostics only. Use the CLI's `--baseline`/`--progress` flags for
  that.
- The `unauditable` finding (dynamic `process.env[x]` lookups) is not
  surfaced.
- No monorepo package-boundary awareness. The whole workspace root is treated
  as one package.

## Release Notes

See [CHANGELOG.md](https://github.com/AllThingsSmitty/env-var-auditor/blob/main/vscode-extension/CHANGELOG.md) for the full release history.

## Contributing

Contributions are welcome. See the [contribution guidelines](https://github.com/AllThingsSmitty/env-var-auditor/blob/main/CONTRIBUTING.md)
for setup instructions, including how to run the extension locally with F5 and
how to run the unit and integration test suites.
