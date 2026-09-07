# Slack Notifications

Integrate `env-var-auditor` with Slack to notify your team immediately when environment variable issues are detected in your codebase.

## Setup

### 1. Create a Slack Incoming Webhook

1. Go to your Slack workspace settings: https://api.slack.com/apps
2. Click **Create New App** → **From scratch**
3. Name it "env-var-auditor" and choose your workspace
4. In the left menu, select **Incoming Webhooks**
5. Toggle **Activate Incoming Webhooks** to ON
6. Click **Add New Webhook to Workspace**
7. Choose the channel where audit results should post (e.g., `#security`, `#dev-alerts`)
8. Copy the webhook URL — it looks like: `https://hooks.slack.com/services/T123/B456/xyz`

### 2. Configure env-var-auditor

You have three options to provide the webhook URL:

#### Option A: Command-line flag (one-off)

```bash
env-var-auditor . --slack-webhook https://hooks.slack.com/services/T123/B456/xyz
```

#### Option B: Environment variable (persistent)

```bash
export ENV_VAR_AUDITOR_SLACK_WEBHOOK=https://hooks.slack.com/services/T123/B456/xyz
env-var-auditor .
```

Or in a `.env` file:
```
ENV_VAR_AUDITOR_SLACK_WEBHOOK=https://hooks.slack.com/services/T123/B456/xyz
```

Then run with dotenv or similar:
```bash
node -r dotenv/config $(npm bin)/env-var-auditor .
```

#### Option C: Config file (recommended for teams)

Create `.env-auditorrc.json`:
```json
{
  "ignore": ["**/__generated__/**"],
  "slackWebhook": "https://hooks.slack.com/services/T123/B456/xyz"
}
```

Then run normally:
```bash
env-var-auditor .
```

## Usage

Once configured, Slack notifications are sent automatically whenever findings are detected:

```bash
# Single project audit
env-var-auditor .

# Monorepo audit
env-var-auditor . --workspaces

# With baseline comparison
env-var-auditor . --baseline
```

**No notification is sent if the audit is clean** — only problematic results reach Slack, keeping your channel signal-to-noise ratio high.

## Message Format

### Single Project Audit

Messages include:
- **Header** with project name
- **Summary counts** — client-exposed, read but undeclared, declared but unread
- **Finding details** — top 5 items per category with file:line locations
- **Severity indicators** — 🚨 (client-exposed), ⚠️ (read but undeclared), 💤 (declared but unread)

Example:

```
🚨 CLIENT-EXPOSED (2)
  • STRIPE_SECRET_KEY — app/page.tsx:10 (No NEXT_PUBLIC_ prefix)
  • API_TOKEN — lib/api.ts:15 (Secret pattern: sk_)

⚠️  READ BUT UNDECLARED (1)
  • DATABASE_URL — src/db.ts:8

💤 DECLARED BUT UNREAD (1)
  • OLD_DEBUG_FLAG — .env.example:22
```

### Monorepo Audit

Messages include:
- **📦 Monorepo Audit Results** header
- **Workspace summary** — total findings across all packages
- **Per-package details** — findings broken down by package name

## CI/CD Integration

### GitHub Actions

Add to your workflow:

```yaml
- name: Audit environment variables
  run: env-var-auditor . --slack-webhook "${{ secrets.SLACK_WEBHOOK_URL }}"
```

Store the webhook URL as a secret: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

### GitLab CI

Add to `.gitlab-ci.yml`:

```yaml
audit:env-var:
  stage: audit
  image: node:20
  script:
    - npm install -g env-var-auditor
    - env-var-auditor . --slack-webhook "$SLACK_WEBHOOK_URL"
  only:
    - branches
```

Define `SLACK_WEBHOOK_URL` in **Settings** → **CI/CD** → **Variables**

### Pre-commit Hook

Include in `.pre-commit-config.yaml` (requires environment variable):

```yaml
repos:
  - repo: local
    hooks:
      - id: env-var-auditor-slack
        name: env-var-auditor with Slack
        entry: sh -c 'env-var-auditor . && echo "✓ Clean"'
        language: system
        stages: [commit]
        pass_filenames: false
```

Or with Husky:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

env-var-auditor . --slack-webhook "$ENV_VAR_AUDITOR_SLACK_WEBHOOK"
```

## Troubleshooting

### "Failed to send to Slack: 401 Unauthorized"

- **Check the webhook URL** — copy it again from Slack and ensure no typos
- **Verify the webhook is active** — it may have been revoked or deleted
- **Check the channel** — the webhook's channel may have been deleted or archived

### "Failed to send to Slack: 404 Not Found"

The webhook URL is malformed or no longer exists. Create a new one in Slack.

### Audit runs but no Slack message appears

- **No findings detected** — Slack only receives messages if issues are found. If your audit is clean, nothing is posted.
- **Webhook URL not configured** — verify it's set via CLI flag, env var, or config file

### Webhook URL in logs / CI output

**Never commit webhook URLs.** Always use:
- CI/CD secrets (`${{ secrets.* }}`, `$SLACK_WEBHOOK_URL`)
- Environment variables in `.env` (which should be `.gitignored`)
- Config files with `.env-auditorrc.json` in `.gitignore` (for local development)

## Privacy & Security

- **Messages stay in Slack** — your findings are only sent to the webhook URL you control
- **No external service** — notifications go directly to your Slack workspace
- **Sensitive data** — file paths and variable names are visible in Slack; use private channels for sensitive projects
- **Audit trail** — Slack message history provides a record of when issues were detected

## See also

- [Getting Started](GETTING_STARTED.md) — understand finding types
- [GitHub Actions integration](../examples/github-actions/) — CI/CD setup guide
- [GitLab CI integration](GITLAB_CI.md) — GitLab CI/CD examples
- [README](../README.md) — full reference
