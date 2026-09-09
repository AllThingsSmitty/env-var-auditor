#!/usr/bin/env node
import { Command } from 'commander';
import { audit } from './audit.js';
import { auditWorkspace } from './workspace.js';
import {
  formatTable,
  formatWorkspaceTable,
  formatBaselineTable,
  formatWorkspaceBaselineTable,
  formatProgressTable,
  formatWorkspaceProgressTable,
  type PackageProgressInfo,
} from './output/table.js';
import {
  formatJson,
  formatWorkspaceJson,
  formatBaselineJson,
  formatWorkspaceBaselineJson,
  formatProgressJson,
  formatWorkspaceProgressJson,
} from './output/json.js';
import { formatSarifJson, formatWorkspaceSarifJson } from './output/sarif.js';
import { loadConfig } from './config.js';
import {
  createBaseline,
  saveBaseline,
  loadBaseline,
  validateBaselineVersion,
  compareFindings,
  resolveBaselinePath,
  saveWorkspaceBaselines,
  compareWorkspaceBaselines,
} from './baseline.js';
import {
  createProgressEntry,
  appendProgressEntry,
  loadProgressHistory,
  resolveProgressPath,
} from './progress.js';
import { sendAuditToSlack } from './slack.js';
import type { AuditResult, WorkspaceAuditResult } from './types.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('env-var-auditor')
  .description('Static audit for environment variables in Node.js/Next.js projects')
  .version(version)
  .argument('[dir]', 'Project directory to audit (or workspace root with --workspaces)', '.')
  .option('-f, --format <format>', 'Output format: table | json | sarif')
  .option('--ignore <pattern>', 'Additional glob patterns to ignore (repeatable)', collect, [])
  .option('--config <path>', 'Path to config file (defaults to .env-auditorrc.json)')
  .option('--workspaces', 'Audit all packages in a monorepo workspace')
  .option('--save-baseline', 'Save current findings as baseline')
  .option('--baseline [path]', 'Compare against baseline (auto-finds .env-auditor-baseline.json if no path given)')
  .option('--show-all', 'Show all findings (new + existing + fixed) when using --baseline')
  .option('--track-progress', 'Record a progress snapshot when used with --save-baseline')
  .option('--progress', 'Show progress history (trend across saved snapshots)')
  .option('--cache', 'Cache AST parsing results to speed up repeat audits (writes .env-auditor-cache.json)')
  .option('--slack-webhook <url>', 'Slack webhook URL to send audit results (env: ENV_VAR_AUDITOR_SLACK_WEBHOOK)')
  .action(
    async (
      dir: string,
      opts: {
        format?: string;
        ignore: string[];
        config?: string;
        workspaces?: boolean;
        saveBaseline?: boolean;
        baseline?: string | boolean;
        showAll?: boolean;
        trackProgress?: boolean;
        progress?: boolean;
        cache?: boolean;
        slackWebhook?: string;
      },
    ) => {
      try {
        const config = loadConfig(dir, opts.config);
        const mergedIgnorePatterns = [...(config?.ignore ?? []), ...opts.ignore];
        const format = opts.format ?? config?.format ?? 'table';
        const secretPatterns = config?.secretPatterns;
        const slackWebhook =
          opts.slackWebhook ?? config?.slackWebhook ?? process.env.ENV_VAR_AUDITOR_SLACK_WEBHOOK;

        if (opts.workspaces) {
          const workspace = await auditWorkspace({
            rootDir: dir,
            ignorePatterns: mergedIgnorePatterns,
            secretPatterns,
            useCache: opts.cache,
          });

          // Handle --workspaces --save-baseline
          if (opts.saveBaseline) {
            const baselinePathFn = (packageDir: string) =>
              resolveBaselinePath(packageDir, config?.baselinePath, true);
            const saved = saveWorkspaceBaselines(workspace, baselinePathFn);

            if (opts.trackProgress) {
              for (const item of saved) {
                const progressPath = resolveProgressPath(item.packageDir, config?.progressPath);
                appendProgressEntry(progressPath, createProgressEntry(item.baseline));
              }
              process.stdout.write(`✓ Progress snapshots recorded for ${saved.length} package(s)\n`);
            }

            process.stdout.write(`✓ Baselines saved for ${saved.length} package(s):\n`);
            let totalClientExposed = 0;
            let totalReadUndeclared = 0;
            let totalDeclaredUnread = 0;

            for (const item of saved) {
              process.stdout.write(
                `  • ${item.packageName}\n` +
                `    - Client-exposed: ${item.baseline.findings.clientExposed.length}\n` +
                `    - Read but undeclared: ${item.baseline.findings.readButUndeclared.length}\n` +
                `    - Declared but unread: ${item.baseline.findings.declaredButUnread.length}\n`,
              );
              totalClientExposed += item.baseline.findings.clientExposed.length;
              totalReadUndeclared += item.baseline.findings.readButUndeclared.length;
              totalDeclaredUnread += item.baseline.findings.declaredButUnread.length;
            }

            process.stdout.write(
              `\nWorkspace total:\n` +
              `  - Client-exposed: ${totalClientExposed}\n` +
              `  - Read but undeclared: ${totalReadUndeclared}\n` +
              `  - Declared but unread: ${totalDeclaredUnread}\n`,
            );
            process.exit(0);
          }

          // Handle --workspaces --progress
          if (opts.progress) {
            const packages: PackageProgressInfo[] = workspace.packages.map((pkg) => ({
              packageName: pkg.packageName,
              packageDir: pkg.packageDir,
              history: loadProgressHistory(resolveProgressPath(pkg.packageDir, config?.progressPath)),
            }));

            if (format === 'json') {
              process.stdout.write(formatWorkspaceProgressJson(packages) + '\n');
            } else {
              process.stdout.write(formatWorkspaceProgressTable(packages, process.cwd(), version) + '\n');
            }

            process.exit(0);
          }

          // Handle --workspaces --baseline
          if (opts.baseline) {
            if (typeof opts.baseline === 'string') {
              throw new Error(
                'Explicit baseline path not supported with --workspaces. ' +
                'Use config file "baselinePath" option or per-package .env-auditor-baseline.json files.',
              );
            }

            const baselinePathFn = (packageDir: string) =>
              resolveBaselinePath(packageDir, config?.baselinePath, false);
            const baselineResults = compareWorkspaceBaselines(workspace, baselinePathFn);

            for (const pkg of baselineResults) {
              if (pkg.baselineMissing) {
                process.stderr.write(
                  `⚠ ${pkg.packageName}: baseline not found, treating all findings as new\n`,
                );
              }
            }

            if (format === 'json') {
              process.stdout.write(formatWorkspaceBaselineJson(baselineResults, opts.showAll) + '\n');
            } else {
              process.stdout.write(formatWorkspaceBaselineTable(baselineResults, process.cwd(), version, opts.showAll) + '\n');
            }

            await sendToSlackIfConfigured(slackWebhook, workspace);

            const worstExitCode = baselineResults.reduce((code, pkg) => {
              if (pkg.comparison.newFindings.clientExposed.length > 0) return Math.max(code, 1);
              const other =
                pkg.comparison.newFindings.readButUndeclared.length +
                pkg.comparison.newFindings.declaredButUnread.length;
              if (other > 0) return Math.max(code, 2);
              return code;
            }, 0);

            process.exit(worstExitCode);
          }

          // Normal workspace mode (no baseline)
          if (format === 'sarif') {
            process.stdout.write(formatWorkspaceSarifJson(workspace) + '\n');
          } else if (format === 'json') {
            process.stdout.write(formatWorkspaceJson(workspace) + '\n');
          } else {
            process.stdout.write(formatWorkspaceTable(workspace, process.cwd(), version) + '\n');
          }

          await sendToSlackIfConfigured(slackWebhook, workspace);

          const worstExitCode = workspace.packages.reduce((code, pkg) => {
            if (pkg.result.clientExposed.length > 0) return Math.max(code, 1);
            const other = pkg.result.readButUndeclared.length + pkg.result.declaredButUnread.length;
            if (other > 0) return Math.max(code, 2);
            return code;
          }, 0);

          process.exit(worstExitCode);
        } else {
          const result = await audit({
            dir,
            ignorePatterns: mergedIgnorePatterns,
            secretPatterns,
            useCache: opts.cache,
          });

          // Handle --save-baseline
          if (opts.saveBaseline) {
            const baseline = createBaseline(result);
            const baselinePath = resolveBaselinePath(dir, config?.baselinePath, opts.saveBaseline);
            saveBaseline(baselinePath, baseline);

            if (opts.trackProgress) {
              const progressPath = resolveProgressPath(dir, config?.progressPath);
              const history = appendProgressEntry(progressPath, createProgressEntry(baseline));
              process.stdout.write(`✓ Progress snapshot recorded (${history.length} total)\n`);
            }

            process.stdout.write(
              `✓ Baseline saved to ${baselinePath}\n` +
              `  - Client-exposed: ${baseline.findings.clientExposed.length}\n` +
              `  - Read but undeclared: ${baseline.findings.readButUndeclared.length}\n` +
              `  - Declared but unread: ${baseline.findings.declaredButUnread.length}\n`,
            );
            process.exit(0);
          }

          // Handle --progress
          if (opts.progress) {
            const progressPath = resolveProgressPath(dir, config?.progressPath);
            const history = loadProgressHistory(progressPath);

            if (format === 'json') {
              process.stdout.write(formatProgressJson(history) + '\n');
            } else {
              process.stdout.write(formatProgressTable(history, version) + '\n');
            }

            process.exit(0);
          }

          // Handle --baseline (compare against baseline)
          if (opts.baseline) {
            const baselinePath = resolveBaselinePath(dir, config?.baselinePath, opts.baseline);
            const baseline = loadBaseline(baselinePath);
            validateBaselineVersion(baseline);

            const comparison = compareFindings(result, baseline);

            if (format === 'json') {
              process.stdout.write(formatBaselineJson(result, comparison, baseline, opts.showAll) + '\n');
            } else {
              process.stdout.write(
                formatBaselineTable(result, comparison, process.cwd(), version, baseline, opts.showAll) + '\n',
              );
            }

            await sendToSlackIfConfigured(slackWebhook, result, dir);

            // Exit based on NEW findings only
            if (comparison.newFindings.clientExposed.length > 0) {
              process.exit(1);
            }
            const newOtherFindings =
              comparison.newFindings.readButUndeclared.length +
              comparison.newFindings.declaredButUnread.length;
            if (newOtherFindings > 0) {
              process.exit(2);
            }
            process.exit(0);
          }

          // Normal mode (no baseline)
          if (format === 'sarif') {
            process.stdout.write(formatSarifJson(result) + '\n');
          } else if (format === 'json') {
            process.stdout.write(formatJson(result) + '\n');
          } else {
            process.stdout.write(formatTable(result, process.cwd(), version) + '\n');
          }

          await sendToSlackIfConfigured(slackWebhook, result, dir);

          if (result.clientExposed.length > 0) {
            process.exit(1);
          }
          const otherFindings =
            result.readButUndeclared.length + result.declaredButUnread.length;
          if (otherFindings > 0) {
            process.exit(2);
          }
          process.exit(0);
        }
      } catch (err) {
        process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(3);
      }
    },
  );

async function sendToSlackIfConfigured(
  slackWebhook: string | undefined,
  result: AuditResult | WorkspaceAuditResult,
  projectPath?: string,
): Promise<void> {
  if (!slackWebhook) {
    return;
  }

  try {
    await sendAuditToSlack(result, slackWebhook, projectPath);
  } catch (err) {
    process.stderr.write(
      `⚠ Failed to send to Slack: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat(value);
}

program.parse();
