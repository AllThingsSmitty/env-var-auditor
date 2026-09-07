import type { AuditResult, WorkspaceAuditResult } from './types.js';

interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

interface SlackPayload {
  blocks: SlackBlock[];
  text: string;
}

function getTotalFindings(result: AuditResult): number {
  return (
    result.clientExposed.length +
    result.readButUndeclared.length +
    result.declaredButUnread.length
  );
}

function createAuditBlocks(result: AuditResult, projectPath?: string): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  const totalFindings = getTotalFindings(result);
  if (totalFindings === 0) {
    return blocks;
  }

  const headerText = projectPath ? `Audit results for ${projectPath}` : 'Environment Variable Audit Results';
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: headerText,
      emoji: true,
    },
  });

  // Summary counts
  blocks.push({
    type: 'section',
    fields: [
      {
        type: 'mrkdwn',
        text: `*Client-Exposed:* ${result.clientExposed.length}`,
      },
      {
        type: 'mrkdwn',
        text: `*Read But Undeclared:* ${result.readButUndeclared.length}`,
      },
      {
        type: 'mrkdwn',
        text: `*Declared But Unread:* ${result.declaredButUnread.length}`,
      },
      {
        type: 'mrkdwn',
        text: `*Scanned:* ${result.scannedFiles} files`,
      },
    ],
  });

  // Client-exposed (high severity)
  if (result.clientExposed.length > 0) {
    const items = result.clientExposed.slice(0, 5).map((v) => {
      const reason =
        v.reason === 'missing-prefix'
          ? 'No NEXT_PUBLIC_ prefix'
          : `Secret pattern: ${v.secretPattern}`;
      return `• *${v.name}* — ${v.file}:${v.line} (${reason})`;
    });

    if (result.clientExposed.length > 5) {
      items.push(`• … and ${result.clientExposed.length - 5} more`);
    }

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🚨 *CLIENT-EXPOSED* (${result.clientExposed.length})\n${items.join('\n')}`,
      },
    });
  }

  // Read but undeclared (medium severity)
  if (result.readButUndeclared.length > 0) {
    const items = result.readButUndeclared.slice(0, 5).map((v) => {
      return `• *${v.name ?? '(dynamic)'}* — ${v.file}:${v.line}`;
    });

    if (result.readButUndeclared.length > 5) {
      items.push(`• … and ${result.readButUndeclared.length - 5} more`);
    }

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⚠️  *READ BUT UNDECLARED* (${result.readButUndeclared.length})\n${items.join('\n')}`,
      },
    });
  }

  // Declared but unread (low severity)
  if (result.declaredButUnread.length > 0) {
    const items = result.declaredButUnread.slice(0, 5).map((d) => {
      return `• *${d.name}* — ${d.source}`;
    });

    if (result.declaredButUnread.length > 5) {
      items.push(`• … and ${result.declaredButUnread.length - 5} more`);
    }

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `💤 *DECLARED BUT UNREAD* (${result.declaredButUnread.length})\n${items.join('\n')}`,
      },
    });
  }

  blocks.push({ type: 'divider' });

  return blocks;
}

export async function sendAuditToSlack(
  result: AuditResult | WorkspaceAuditResult,
  webhook: string,
  projectPath?: string,
): Promise<void> {
  const blocks: SlackBlock[] = [];
  let text = 'Environment Variable Audit Results';

  if ('packages' in result) {
    // Workspace audit result
    const workspaceResult = result as WorkspaceAuditResult;

    // Check if there are any findings at all
    const totalFindings = workspaceResult.packages.reduce((sum, pkg) => {
      return sum + getTotalFindings(pkg.result);
    }, 0);

    if (totalFindings === 0) {
      return;
    }

    blocks.push({
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📦 Monorepo Audit Results',
        emoji: true,
      },
    });

    // Summary across all packages
    let totalClientExposed = 0;
    let totalReadUndeclared = 0;
    let totalDeclaredUnread = 0;

    for (const pkg of workspaceResult.packages) {
      totalClientExposed += pkg.result.clientExposed.length;
      totalReadUndeclared += pkg.result.readButUndeclared.length;
      totalDeclaredUnread += pkg.result.declaredButUnread.length;
    }

    blocks.push({
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Client-Exposed:* ${totalClientExposed}`,
        },
        {
          type: 'mrkdwn',
          text: `*Read But Undeclared:* ${totalReadUndeclared}`,
        },
        {
          type: 'mrkdwn',
          text: `*Declared But Unread:* ${totalDeclaredUnread}`,
        },
        {
          type: 'mrkdwn',
          text: `*Packages:* ${workspaceResult.packages.length}`,
        },
      ],
    });

    // Add per-package details
    for (const pkg of workspaceResult.packages) {
      const pkgFindings = getTotalFindings(pkg.result);
      if (pkgFindings > 0) {
        blocks.push(...createAuditBlocks(pkg.result, pkg.packageName));
      }
    }

    text = '📦 Monorepo Audit Results';
  } else {
    // Single project audit result
    const auditResult = result as AuditResult;

    if (getTotalFindings(auditResult) === 0) {
      return;
    }

    blocks.push(...createAuditBlocks(auditResult, projectPath));
    text = 'Environment Variable Audit Results';
  }

  if (blocks.length === 0) {
    return;
  }

  const payload: SlackPayload = {
    blocks,
    text,
  };

  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Slack webhook failed: ${response.status} ${response.statusText}`,
    );
  }
}
