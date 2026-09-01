# Environment Variable Auditor

Static analysis CLI that audits environment variable usage in Node.js and Next.js projects. Finds three categories of problems that runtime validators miss entirely.

## Why

Runtime tools like `t3-env` and `envalid` only validate values when the process boots. They cannot tell you:

- which vars you declared but never actually use (dead config)
- which vars your code reads that are missing from every env file (will silently be `undefined` in prod)
- which vars are leaking into your **client bundle** — the security risk nobody notices until it's too late

That third bucket is the differentiator. Next.js will happily inline `process.env.STRIPE_SECRET_KEY` into your browser bundle if you reference it in a Client Component. No warning. No error. Just your secret key shipped to every visitor.

## Before / after

**Before** — your checkout page ships your Stripe secret key to every browser:

```tsx
'use client';

export default function CheckoutPage() {
  // This key is now in your browser bundle. Every visitor can read it.
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  ...
}
```

**After running env-var-auditor:**

```
CLIENT-EXPOSED  2 findings
┌──────────────────────────────┬──────────────────────────────┬──────────────────────────┐
│ Variable                     │ Location                     │ Reason                   │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────┤
│ STRIPE_SECRET_KEY            │ app/checkout/page.tsx:5      │ No NEXT_PUBLIC_ prefix   │
│ NEXT_PUBLIC_SK_LIVE_KEY      │ app/page.tsx:8               │ Secret pattern: sk_      │
└──────────────────────────────┴──────────────────────────────┴──────────────────────────┘

READ BUT UNDECLARED  1 finding
┌──────────────────────────────┬──────────────────────────────┐
│ Variable                     │ First seen at                │
├──────────────────────────────┼──────────────────────────────┤
│ REDIS_URL                    │ lib/cache.ts:3               │
└──────────────────────────────┴──────────────────────────────┘

DECLARED BUT UNREAD  2 findings
┌──────────────────────────────┬──────────────────────────────┐
│ Variable                     │ Declared in                  │
├──────────────────────────────┼──────────────────────────────┤
│ OLD_LEGACY_API_URL           │ .env.example:18              │
│ DEPRECATED_FLAG              │ .env.example:19              │
└──────────────────────────────┴──────────────────────────────┘
```

## Installation

```bash
# one-off scan
npx env-var-auditor .

# global install
npm install -g env-var-auditor
pnpm add -g env-var-auditor
```

## Usage

```bash
# Scan current directory
env-var-auditor .

# Scan a specific project
env-var-auditor /path/to/project

# Scan all packages in a monorepo (reads pnpm-workspace.yaml)
env-var-auditor . --workspaces

# JSON output for CI pipelines
env-var-auditor . --format json

# Ignore additional paths
env-var-auditor . --ignore "packages/legacy/**"
```

## Configuration

Create a `.env-auditorrc.json` file in your project root to codify shared standards for your team:

```json
{
  "ignore": ["packages/legacy/**", "**/migrations/**"],
  "format": "table",
  "secretPatterns": ["^COMPANY_INTERNAL_", "^ACME_"]
}
```

### Config file schema

| Field            | Type                | Description                                                                                                                                 |
| ---------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ignore`         | `string[]`          | Additional glob patterns to exclude from scanning (unioned with built-in defaults like `node_modules`, `.next`, `dist`, etc.).              |
| `format`         | `'table' \| 'json'` | Default output format. CLI `--format` flag overrides this.                                                                                  |
| `secretPatterns` | `string[]`          | Custom regex patterns (case-insensitive) to detect secrets. Combined with built-in patterns (`sk_`, `whsec_`, `*SECRET*`, `*_TOKEN`, etc.). |

### CLI override

CLI flags take precedence over config file values:

```bash
# Use custom config file path
env-var-auditor . --config ./custom-config.json

# Union ignore patterns (both config and CLI patterns applied)
env-var-auditor . --ignore "**/__generated__/**"

# CLI format overrides config
env-var-auditor . --format json
```

## Exit codes

| Code | Meaning                                                   |
| ---- | --------------------------------------------------------- |
| `0`  | Clean — no findings                                       |
| `1`  | Client-exposed variables found (security risk — block CI) |
| `2`  | Other findings only (undeclared or unused vars)           |
| `3`  | Unexpected error                                          |

Use exit code `1` as a hard CI gate. Ready-to-use GitHub Actions workflows are in [`examples/github-actions/`](examples/github-actions/):

| File            | Use case                                                                          |
| --------------- | --------------------------------------------------------------------------------- |
| `basic.yml`     | Any finding fails the job                                                         |
| `workspace.yml` | Same, with `--workspaces` for monorepos                                           |
| `strict.yml`    | Exit 1 = hard fail, exit 2 = warning annotation, JSON report uploaded as artifact |

## What it detects

### Declared but unread

Variables present in `.env` / `.env.example` that are never referenced in source code. Safe to remove.

### Read but undeclared

Variables referenced in code (`process.env.X`) that are missing from every `.env*` file. Will be `undefined` at runtime unless set some other way (CI secrets, deploy config).

### Client-exposed

Variables accessed from Client Components (`'use client'`) that either:

- **Lack the `NEXT_PUBLIC_` prefix** — Next.js will include the raw access in the bundle (value is `undefined` in prod, but the pattern can still be exploited in dev)
- **Have `NEXT_PUBLIC_` but match a secret pattern** — `sk_`, `whsec_`, `*SECRET*`, `*_KEY`, etc. These will be inlined into the bundle and shipped to every browser

### Unauditable

Dynamic key access (`process.env[someVar]`) where the key cannot be determined statically. Flagged explicitly so you know they exist.

## Detection approach

AST-based parsing via the TypeScript compiler API (via `ts-morph`), not regex. Handles all four access patterns:

```ts
process.env.FOO; // member access
process.env["FOO"]; // bracket access with string literal
const { FOO } = process.env; // destructuring
process.env[someVar]; // dynamic — flagged as unauditable
```

## Supported env files

`.env`, `.env.local`, `.env.example`, `.env.production`, `.env.development`, `.env.test`, `.env.staging`, and their `.local` variants.

## Limitations

- Does not track aliased references: `const env = process.env; env.FOO` — only direct `process.env.*` access is detected
- Dynamic keys are flagged but not resolved
