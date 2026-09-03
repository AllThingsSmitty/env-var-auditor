# Husky Integration

Use [husky](https://typicode.github.io/husky/) to run env-var-auditor as a pre-commit hook in your project.

## Setup

1. Install husky and env-var-auditor:

```bash
npm install --save-dev husky env-var-auditor
# or with pnpm:
pnpm add -D husky env-var-auditor
```

2. Initialize husky:

```bash
npx husky install
```

3. Add a pre-commit hook:

```bash
npx husky add .husky/pre-commit "env-var-auditor ."
```

## Configuration

The hook will run `env-var-auditor .` on every commit. To customize:

- Add flags: `env-var-auditor . --format json`
- Use config file: Create `.env-auditorrc.json` in your project root (see main README)
- Fail only on client-exposed: `env-var-auditor . || exit 0` (exit code 2 won't block commit)

## Example hook

See [`.husky/pre-commit`](.husky/pre-commit) for a sample hook that fails on any findings.

## Monorepo

For monorepos with pnpm workspaces, use `--workspaces`:

```bash
npx husky add .husky/pre-commit "env-var-auditor . --workspaces"
```
