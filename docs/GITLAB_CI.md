# GitLab CI/CD Integration

Integrate `env-var-auditor` into your GitLab CI/CD pipeline to catch environment variable issues before they reach production.

## Quick start

Copy one of the ready-to-use examples from [`examples/gitlab-ci/`](../examples/gitlab-ci/) into your project:

```bash
# For a single project
cp examples/gitlab-ci/basic.yml .gitlab-ci.yml

# For a monorepo with pnpm workspaces
cp examples/gitlab-ci/workspace.yml .gitlab-ci.yml

# For strict mode with differentiated exit codes
cp examples/gitlab-ci/strict.yml .gitlab-ci.yml
```

Then commit and push to trigger the pipeline.

## Why this matters

GitLab CI/CD runs after code is pushed, but `env-var-auditor` is fast enough to run on every commit. It catches:

- **Client-exposed secrets** — variables shipped to the browser that shouldn't be (exit code 1 — fails CI)
- **Missing vars** — code that reads `process.env.X` but it's not in any `.env` file (exit code 2)
- **Dead config** — variables declared but never used (exit code 2)

See [Getting Started](GETTING_STARTED.md) for details on each finding type.

## Exit codes

The tool returns:

| Code | Meaning                                           | Handling      |
| ---- | ------------------------------------------------- | ------------- |
| `0`  | Clean — no findings                               | ✅ Pass       |
| `1`  | Client-exposed variables found (security risk)    | ❌ Hard fail  |
| `2`  | Undeclared or unused vars found                   | ⚠️  Varies     |
| `3`  | Unexpected error                                  | ❌ Hard fail  |

## Examples

### Basic (single project)

Use this for a single Next.js or Node.js project:

```yaml
stages:
  - audit

audit:env-var:
  stage: audit
  image: node:20
  script:
    - npm install -g env-var-auditor@0.4.0
    - env-var-auditor .
  allow_failure: false
  only:
    - branches
```

This fails the pipeline on any finding. Customize the target directory by replacing `.` with a subdirectory like `./packages/app`.

### Workspace (monorepo with pnpm)

Use this for a pnpm monorepo with multiple packages:

```yaml
stages:
  - audit

audit:env-var:workspace:
  stage: audit
  image: node:20
  before_script:
    - npm install -g pnpm
  script:
    - npm install -g env-var-auditor@0.4.0
    - env-var-auditor . --workspaces
  allow_failure: false
  only:
    - branches
```

The `--workspaces` flag auto-discovers all packages in `pnpm-workspace.yaml` and audits them together. Root-level `.env*` files are inherited by all packages.

### Strict (differentiated exit codes)

Use this for tighter control over what blocks the pipeline:

```yaml
stages:
  - audit

audit:env-var:strict:
  stage: audit
  image: node:20
  script:
    - npm install -g env-var-auditor@0.4.0
    - set +e
    - env-var-auditor . --format json > audit-results.json
    - EXIT_CODE=$?
    - set -e

    # Hard fail on client-exposed secrets (exit 1)
    - |
      if [ "$EXIT_CODE" -eq 1 ]; then
        echo "❌ ERROR: Client-exposed secrets detected."
        cat audit-results.json
        exit 1
      fi

    # Soft warn on undeclared/unused vars (exit 2) — job succeeds
    - |
      if [ "$EXIT_CODE" -eq 2 ]; then
        echo "⚠️  WARNING: Undeclared or unused env vars detected."
        cat audit-results.json
        exit 0
      fi

    # Hard fail on tool error (exit 3)
    - |
      if [ "$EXIT_CODE" -eq 3 ]; then
        echo "❌ ERROR: env-var-auditor failed."
        exit 3
      fi

  artifacts:
    paths:
      - audit-results.json
    expire_in: 7 days
    when: always
  allow_failure: false
  only:
    - branches
```

**Behavior:**
- Exit 1 (secrets) → ❌ job fails, blocks the pipeline
- Exit 2 (undeclared/unused) → ⚠️ job succeeds, but logs a warning (visible in the pipeline UI)
- Exit 3 (tool error) → ❌ job fails, blocks the pipeline

The JSON report is saved as a job artifact, visible on the pipeline detail page.

## Customization

### Target specific paths

Audit a subdirectory instead of the root:

```yaml
script:
  - npm install -g env-var-auditor@0.4.0
  - env-var-auditor ./packages/api  # audit packages/api instead of .
```

### Ignore additional paths

Add ignore patterns via CLI:

```yaml
script:
  - npm install -g env-var-auditor@0.4.0
  - env-var-auditor . --ignore "**/__generated__/**" --ignore "**/migrations/**"
```

Or use a `.env-auditorrc.json` config file (recommended for team standards):

```json
{
  "ignore": ["packages/legacy/**", "**/migrations/**"],
  "secretPatterns": ["^INTERNAL_", "^COMPANY_"]
}
```

Then in your `.gitlab-ci.yml`:

```yaml
script:
  - npm install -g env-var-auditor@0.4.0
  - env-var-auditor .
```

### Use a specific version

Update the version to keep CI reproducible:

```yaml
script:
  - npm install -g env-var-auditor@0.4.0  # Pin to a specific release
  - env-var-auditor .
```

Check [npmjs.com/package/env-var-auditor](https://www.npmjs.com/package/env-var-auditor) for available versions.

### JSON output for parsing

Capture structured output for custom downstream processing:

```yaml
script:
  - npm install -g env-var-auditor@0.4.0
  - env-var-auditor . --format json > results.json
  - cat results.json  # Use in downstream jobs or notifications
```

## Integrated with existing CI

If you already have a `.gitlab-ci.yml`, you can include the audit job alongside other stages:

```yaml
include:
  - local: examples/gitlab-ci/basic.yml

stages:
  - test
  - audit
  - build

test:unit:
  stage: test
  script:
    - npm test

# includes audit:env-var from examples/gitlab-ci/basic.yml

build:
  stage: build
  script:
    - npm run build
```

## Pre-commit alternative

For faster feedback, run env-var-auditor locally before pushing:

```bash
# Install globally
npm install -g env-var-auditor

# Run before commit
npx husky add .husky/pre-commit "env-var-auditor . && git add ."
```

This catches issues before they reach GitLab.

## Troubleshooting

### The job fails with "command not found: env-var-auditor"

Make sure to install it before running:

```yaml
script:
  - npm install -g env-var-auditor@0.4.0  # Don't skip this
  - env-var-auditor .
```

### Exit code 2 is blocking my pipeline

If undeclared or unused vars are expected, use the **strict** example and let exit 2 succeed:

```yaml
if [ "$EXIT_CODE" -eq 2 ]; then
  echo "⚠️  WARNING: Review the output above."
  exit 0  # Don't fail on exit code 2
fi
```

Or configure ignore patterns in `.env-auditorrc.json`.

### The monorepo audit isn't finding all packages

Make sure you're running from the root and have `pnpm-workspace.yaml`:

```yaml
script:
  - npm install -g pnpm
  - npm install -g env-var-auditor@0.4.0
  - env-var-auditor . --workspaces  # Run from root with --workspaces flag
```

## See also

- [Getting Started](GETTING_STARTED.md) — detailed walkthrough of findings and fixes
- [README](../README.md) — full reference and configuration options
- [GitHub Actions](../examples/github-actions/) — equivalent examples for GitHub
