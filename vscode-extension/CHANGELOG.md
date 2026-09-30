# Changelog

All notable changes to the "Env Var Auditor" extension are documented here.

## 0.1.3

- Added `envVarAuditor.declaredVars` setting: an array of variable names treated
  as externally declared (e.g. from `web.config` or CI/CD environment injection).
  Listed names are excluded from read-but-undeclared diagnostics.

## 0.1.2

- Fixed false-positive "read-but-undeclared" diagnostics for variables declared
  in `.env*` files located in subdirectories. The extension now searches
  recursively for env files instead of only checking the workspace root.

## 0.1.1

- Added extension icon (icon.png / icon.svg) and icon generation script.
- Updated `.vscodeignore` to trim the packaged VSIX size.

## 0.1.0

- Initial release: inline diagnostics for client-exposed, read-but-undeclared,
  and declared-but-unread environment variables, powered by the
  `env-var-auditor` core library.
- Live diagnostics update as you type in source and `.env*` files.
- Picks up `.env-auditorrc.json` automatically, with `envVarAuditor.*`
  settings layered on top.
- `Env Var Auditor: Rescan Workspace` command for manual full re-scans.
- Fixed a crash on activation caused by an ESM/CJS interop bug in the
  `env-var-auditor` core library (an eager `createRequire(import.meta.url)`
  call broke when esbuild bundled it into this extension's CJS output).
- Manually verified end to end in an Extension Development Host: all three
  diagnostic types, live reparse on source and `.env*` edits, and the
  FileSystemWatcher path for files changed outside the editor.
- Ships as part of `env-var-auditor` v0.9.0.
