# Changelog

All notable changes to the "Env Var Auditor" extension are documented here.

## 0.1.0

- Initial release: inline diagnostics for client-exposed, read-but-undeclared,
  and declared-but-unread environment variables, powered by the
  `env-var-auditor` core library.
- Live diagnostics update as you type in source and `.env*` files.
- Picks up `.env-auditorrc.json` automatically, with `envVarAuditor.*`
  settings layered on top.
- `Env Var Auditor: Rescan Workspace` command for manual full re-scans.
