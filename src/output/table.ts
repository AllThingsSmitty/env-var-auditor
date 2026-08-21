import chalk from 'chalk';
import Table from 'cli-table3';
import path from 'path';
import type { AuditResult } from '../types.js';

function relPath(absPath: string, cwd: string): string {
  return path.relative(cwd, absPath).replace(/\\/g, '/');
}

function loc(absPath: string, line: number, cwd: string): string {
  return `${relPath(absPath, cwd)}:${line}`;
}

function makeTable(head: string[]): Table.Table {
  return new Table({
    head: head.map((h) => chalk.bold(h)),
    style: { head: [], border: ['dim'] },
  });
}

export function formatTable(result: AuditResult, cwd: string, version: string): string {
  const lines: string[] = [];

  const total =
    result.clientExposed.length +
    result.readButUndeclared.length +
    result.declaredButUnread.length;

  lines.push(
    chalk.bold(`env-var-auditor`) +
      `  v${version}  ·  ` +
      chalk.dim(`${result.scannedFiles} files  ·  ${result.scannedEnvFiles} env files`),
  );
  lines.push('');

  // ── CLIENT-EXPOSED ──────────────────────────────────────────────────────────
  if (result.clientExposed.length > 0) {
    lines.push(
      chalk.red.bold(`CLIENT-EXPOSED`) +
        chalk.red(`  ${result.clientExposed.length} finding${result.clientExposed.length === 1 ? '' : 's'}`),
    );
    const t = makeTable(['Variable', 'Location', 'Reason']);
    for (const v of result.clientExposed) {
      const reason =
        v.reason === 'missing-prefix'
          ? 'No NEXT_PUBLIC_ prefix'
          : `Secret pattern: ${v.secretPattern ?? ''}`;
      t.push([chalk.red(v.name), loc(v.file, v.line, cwd), reason]);
    }
    lines.push(t.toString());
    lines.push('');
  }

  // ── READ BUT UNDECLARED ─────────────────────────────────────────────────────
  if (result.readButUndeclared.length > 0) {
    lines.push(
      chalk.yellow.bold(`READ BUT UNDECLARED`) +
        chalk.yellow(`  ${result.readButUndeclared.length} finding${result.readButUndeclared.length === 1 ? '' : 's'}`),
    );
    const t = makeTable(['Variable', 'First seen at']);
    for (const v of result.readButUndeclared) {
      t.push([chalk.yellow(v.name!), loc(v.file, v.line, cwd)]);
    }
    lines.push(t.toString());
    lines.push('');
  }

  // ── DECLARED BUT UNREAD ─────────────────────────────────────────────────────
  if (result.declaredButUnread.length > 0) {
    lines.push(
      chalk.dim.bold(`DECLARED BUT UNREAD`) +
        chalk.dim(`  ${result.declaredButUnread.length} finding${result.declaredButUnread.length === 1 ? '' : 's'}`),
    );
    const t = makeTable(['Variable', 'Declared in']);
    for (const v of result.declaredButUnread) {
      t.push([chalk.dim(v.name), `${relPath(v.source, cwd)}:${v.line}`]);
    }
    lines.push(t.toString());
    lines.push('');
  }

  // ── UNAUDITABLE ─────────────────────────────────────────────────────────────
  if (result.unauditable.length > 0) {
    lines.push(
      chalk.dim(`UNAUDITABLE  ${result.unauditable.length} dynamic access${result.unauditable.length === 1 ? '' : 'es'} (cannot determine variable names)`),
    );
    for (const v of result.unauditable) {
      lines.push(chalk.dim(`  ${loc(v.file, v.line, cwd)}  →  process.env[dynamic]`));
    }
    lines.push('');
  }

  // ── SUMMARY ─────────────────────────────────────────────────────────────────
  if (total === 0) {
    lines.push(chalk.green('No findings — all env vars accounted for.'));
  } else {
    const parts: string[] = [];
    if (result.clientExposed.length > 0)
      parts.push(chalk.red(`${result.clientExposed.length} client-exposed`));
    if (result.readButUndeclared.length > 0)
      parts.push(chalk.yellow(`${result.readButUndeclared.length} undeclared`));
    if (result.declaredButUnread.length > 0)
      parts.push(chalk.dim(`${result.declaredButUnread.length} unused`));
    lines.push(`${total} finding${total === 1 ? '' : 's'}  (${parts.join(', ')})`);
  }

  return lines.join('\n');
}
