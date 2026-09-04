# Getting Started with env-var-auditor

Welcome! This guide walks you through running your first environment variable audit.

## Why this matters

Runtime tools like `t3-env` and `envalid` only check variables when your app starts. They can't tell you:

- **Dead config** — variables you declared but never actually use
- **Missing vars** — code that reads `process.env.X` but it's not in any `.env` file
- **Security breaches** — `process.env.SECRET_KEY` accidentally exposed to your browser bundle

This tool catches all three statically, before you deploy.

## 1. Install

### One-off scan (no installation needed)

```bash
npx env-var-auditor .
```

### Global install

```bash
npm install -g env-var-auditor
# or with pnpm:
pnpm add -g env-var-auditor

env-var-auditor .
```

### Project install (for CI/pre-commit)

```bash
npm install --save-dev env-var-auditor
npx env-var-auditor .
```

## 2. Run your first scan

Navigate to a Node.js or Next.js project and run:

```bash
env-var-auditor .
```

The tool will analyze your `.env*` files and source code, then report findings in a table.

## 3. Interpret the output

### Example: Next.js app with issues

Given `.env.example`:

```env
NEXT_PUBLIC_APP_URL=https://example.com
STRIPE_SECRET_KEY=sk_live_xxx
DATABASE_URL=postgresql://localhost/db
OLD_LEGACY_API_URL=https://old-api.example.com
```

And code in `app/page.tsx` (a Client Component):

```tsx
'use client';

export default function HomePage() {
  // ❌ PROBLEM: secret accessed in client component (browser bundle)
  const stripe = process.env.STRIPE_SECRET_KEY;
  
  // ❌ PROBLEM: even NEXT_PUBLIC_ vars can leak if they match secret patterns
  const pubKey = process.env.NEXT_PUBLIC_SK_LIVE_KEY;

  // ✅ OK: NEXT_PUBLIC_ prefix, safe to expose
  return <h1>App: {process.env.NEXT_PUBLIC_APP_URL}</h1>;
}
```

Running `env-var-auditor .` produces:

```
CLIENT-EXPOSED  2 findings
┌──────────────────────────────┬──────────────────────────────┬──────────────────────────┐
│ Variable                     │ Location                     │ Reason                   │
├──────────────────────────────┼──────────────────────────────┼──────────────────────────┤
│ STRIPE_SECRET_KEY            │ app/page.tsx:6               │ No NEXT_PUBLIC_ prefix   │
│ NEXT_PUBLIC_SK_LIVE_KEY      │ app/page.tsx:9               │ Secret pattern: sk_      │
└──────────────────────────────┴──────────────────────────────┴──────────────────────────┘

DECLARED BUT UNREAD  1 finding
┌──────────────────────────────┬──────────────────────────────┐
│ Variable                     │ Declared in                  │
├──────────────────────────────┼──────────────────────────────┤
│ OLD_LEGACY_API_URL           │ .env.example:4               │
└──────────────────────────────┴──────────────────────────────┘
```

### Three finding types

**CLIENT-EXPOSED** (exit code 1 — fail CI)
- Variables accessed from Client Components that either lack `NEXT_PUBLIC_` prefix or match secret patterns
- This is a **security risk** — secrets end up in the browser bundle

**READ BUT UNDECLARED** (exit code 2)
- Code reads `process.env.X` but it's not in any `.env*` file
- Will be `undefined` at runtime unless set externally (CI secrets, deploy config)

**DECLARED BUT UNREAD** (exit code 2)
- Variables in `.env*` files that your code never references
- Safe to remove — they're dead config

## 4. Fix the issues

### For CLIENT-EXPOSED

Move secret reads to **server-side code only** (Server Components, API routes):

```tsx
// ✅ Server Component (safe)
export default async function HomePage() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  // ...
}

// ✅ API Route (safe)
export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;
  // ...
}

// ❌ Never in Client Components
'use client';
const stripe = process.env.STRIPE_SECRET_KEY; // ❌ Don't do this
```

For public variables that need to be in the browser, prefix them with `NEXT_PUBLIC_` **and** don't store secrets in them:

```env
# ✅ OK for browser
NEXT_PUBLIC_APP_URL=https://example.com
NEXT_PUBLIC_ANALYTICS_ID=abc123

# ❌ Never expose secrets even with NEXT_PUBLIC_
NEXT_PUBLIC_DATABASE_URL=... # Don't do this
NEXT_PUBLIC_API_KEY=sk_live_... # Don't do this
```

### For READ BUT UNDECLARED

Add the variable to your `.env` or `.env.example`:

```env
# .env.example
STRIPE_SECRET_KEY=your-secret-key-here
```

### For DECLARED BUT UNREAD

Remove it from `.env*` files if it's truly unused.

## 5. Next steps

### Automate with pre-commit hooks

Run the audit on every commit so issues are caught before they're pushed:

```bash
# Using husky (npm projects)
npm install --save-dev husky env-var-auditor
npx husky install
npx husky add .husky/pre-commit "env-var-auditor ."
```

See [Pre-commit hooks](../README.md#pre-commit-hooks) for more options.

### Configure for your team

Create `.env-auditorrc.json` to codify standards:

```json
{
  "ignore": ["packages/legacy/**"],
  "secretPatterns": ["^MY_COMPANY_", "^INTERNAL_"],
  "format": "table"
}
```

See [Configuration](../README.md#configuration) for all options.

### Set up CI/CD

**GitHub Actions:**

Add to your GitHub Actions workflow:

```yaml
- run: npx env-var-auditor . --format json
```

For monorepos with pnpm workspaces:

```yaml
- run: npx env-var-auditor . --workspaces
```

See [`examples/github-actions/`](../examples/github-actions/) for ready-to-use workflows.

**GitLab CI/CD:**

Add to your `.gitlab-ci.yml`:

```yaml
audit:env-var:
  stage: audit
  image: node:20
  script:
    - npm install -g env-var-auditor
    - env-var-auditor .
```

See [`examples/gitlab-ci/`](../examples/gitlab-ci/) for ready-to-use pipelines and [GitLab CI/CD Integration](GITLAB_CI.md) for detailed setup.

## 6. Common questions

**Q: My code has dynamic env var access like `process.env[myVar]`. Why is it flagged?**

A: The tool can't determine what key is being accessed at static-analysis time. These are flagged as "unauditable" so you know they exist. Avoid dynamic access when possible.

**Q: Can I ignore certain variables?**

A: Yes. Use `--ignore` for glob patterns, or add to `.env-auditorrc.json`:

```bash
env-var-auditor . --ignore "packages/experimental/**"
```

**Q: Does it support TypeScript and JSX?**

A: Yes. It parses all `.ts`, `.tsx`, `.js`, `.jsx`, and `.mjs` files.

**Q: How does it handle monorepos?**

A: Use `--workspaces` to audit all packages:

```bash
env-var-auditor . --workspaces
```

Root-level `.env*` files are inherited by all packages. See [Usage](../README.md#usage).

**Q: Can I see the raw JSON output?**

A: Yes:

```bash
env-var-auditor . --format json
```

Useful for parsing in scripts or CI pipelines.

## Need more help?

- [Full README](../README.md) — reference docs for all flags and options
- [Configuration](../README.md#configuration) — customize behavior via `.env-auditorrc.json`
- [Exit codes](../README.md#exit-codes) — understand what each exit code means
