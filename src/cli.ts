#!/usr/bin/env node
import { Command } from 'commander';
import { audit } from './audit.js';
import { auditWorkspace } from './workspace.js';
import { formatTable, formatWorkspaceTable } from './output/table.js';
import { formatJson, formatWorkspaceJson } from './output/json.js';
import { loadConfig } from './config.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('env-var-auditor')
  .description('Static audit for environment variables in Node.js/Next.js projects')
  .version(version)
  .argument('[dir]', 'Project directory to audit (or workspace root with --workspaces)', '.')
  .option('-f, --format <format>', 'Output format: table | json')
  .option('--ignore <pattern>', 'Additional glob patterns to ignore (repeatable)', collect, [])
  .option('--config <path>', 'Path to config file (defaults to .env-auditorrc.json)')
  .option('--workspaces', 'Audit all packages in a monorepo workspace')
  .action(
    async (dir: string, opts: { format?: string; ignore: string[]; config?: string; workspaces?: boolean }) => {
      try {
        const config = loadConfig(dir, opts.config);
        const mergedIgnorePatterns = [...(config?.ignore ?? []), ...opts.ignore];
        const format = opts.format ?? config?.format ?? 'table';
        const secretPatterns = config?.secretPatterns;

        if (opts.workspaces) {
          const workspace = await auditWorkspace({
            rootDir: dir,
            ignorePatterns: mergedIgnorePatterns,
            secretPatterns,
          });

          if (format === 'json') {
            process.stdout.write(formatWorkspaceJson(workspace) + '\n');
          } else {
            process.stdout.write(formatWorkspaceTable(workspace, process.cwd(), version) + '\n');
          }

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
          });

          if (format === 'json') {
            process.stdout.write(formatJson(result) + '\n');
          } else {
            process.stdout.write(formatTable(result, process.cwd(), version) + '\n');
          }

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

function collect(value: string, previous: string[]): string[] {
  return previous.concat(value);
}

program.parse();
