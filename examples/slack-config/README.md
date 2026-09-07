# Slack Integration Example

This example shows how to configure and use Slack notifications with env-var-auditor.

## Setup

### Step 1: Create a Slack Webhook

Follow the instructions in [docs/SLACK.md](../../docs/SLACK.md) to create an Incoming Webhook in your Slack workspace.

### Step 2: Choose a Configuration Method

#### Option A: Config file (recommended for teams)

Copy the example config:

```bash
cp .env-auditorrc.json your-project/
```

Edit `your-project/.env-auditorrc.json` and add your webhook URL:

```json
{
  "slackWebhook": "https://hooks.slack.com/services/YOUR_WEBHOOK_URL"
}
```

Then run:

```bash
cd your-project
env-var-auditor .
```

#### Option B: Environment variable (CI/CD friendly)

```bash
export ENV_VAR_AUDITOR_SLACK_WEBHOOK=https://hooks.slack.com/services/YOUR_WEBHOOK_URL
env-var-auditor .
```

#### Option C: CLI flag (one-off)

```bash
env-var-auditor . --slack-webhook https://hooks.slack.com/services/YOUR_WEBHOOK_URL
```

## Testing

To test your webhook without running a full audit, use curl:

```bash
curl -X POST 'https://hooks.slack.com/services/YOUR_WEBHOOK_URL' \
  -H 'Content-Type: application/json' \
  -d '{
    "blocks": [
      {
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": "Test Message",
          "emoji": true
        }
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "If you see this, your webhook is working!"
        }
      }
    ]
  }'
```

## Integration with CI/CD

See [docs/SLACK.md](../../docs/SLACK.md) for examples with GitHub Actions, GitLab CI, and Husky pre-commit hooks.

## See also

- [Slack Integration Guide](../../docs/SLACK.md)
- [Getting Started](../../docs/GETTING_STARTED.md)
- [README](../../README.md)
