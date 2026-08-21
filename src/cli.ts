#!/usr/bin/env node
import { Command } from 'commander';
import { audit } from './audit.js';
import { formatTable } from './output/table.js';
import { formatJson } from './output/json.js';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

const program = new Command();

program
  .name('env-var-auditor')
  .description('Static audit for environment variables in Node.js/Next.js projects')
  .version(version)
  .argument('[dir]', 'Project directory to audit', '.')
  .option('-f, --format <format>', 'Output format: table | json', 'table')
  .option('--ignore <pattern>', 'Additional glob patterns to ignore (repeatable)', collect, [])
  .action(async (dir: string, opts: { format: string; ignore: string[] }) => {
    try {
      const result = await audit({ dir, ignorePatterns: opts.ignore });

      if (opts.format === 'json') {
        process.stdout.write(formatJson(result) + '\n');
      } else {
        process.stdout.write(formatTable(result, process.cwd(), version) + '\n');
      }

      // Exit codes: 1 = client-exposed (security), 2 = other findings only
      if (result.clientExposed.length > 0) {
        process.exit(1);
      }
      const otherFindings =
        result.readButUndeclared.length + result.declaredButUnread.length;
      if (otherFindings > 0) {
        process.exit(2);
      }
      process.exit(0);
    } catch (err) {
      process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(3);
    }
  });

function collect(value: string, previous: string[]): string[] {
  return previous.concat(value);
}

program.parse();
