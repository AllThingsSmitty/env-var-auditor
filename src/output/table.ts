import chalk from 'chalk';
import Table from 'cli-table3';
import path from 'path';
import type { AuditResult, WorkspaceAuditResult } from '../types.js';

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

/** Renders finding sections and summary — no tool header. Used by both formatters. */
function formatFindings(result: AuditResult, cwd: string): string {
  const lines: string[] = [];

  const total =
    result.clientExposed.length +
    result.readButUndeclared.length +
    result.declaredButUnread.length;

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
      chalk.dim(
        `UNAUDITABLE  ${result.unauditable.length} dynamic access${result.unauditable.length === 1 ? '' : 'es'} (cannot determine variable names)`,
      ),
    );
    for (const v of result.unauditable) {
      lines.push(chalk.dim(`  ${loc(v.file, v.line, cwd)}  →  process.env[dynamic]`));
    }
    lines.push('');
  }

  // ── SUMMARY ─────────────────────────────────────────────────────────────────
  if (total === 0 && result.unauditable.length === 0) {
    lines.push(chalk.green('No findings — all env vars accounted for.'));
  } else if (total > 0) {
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

export function formatTable(result: AuditResult, cwd: string, version: string): string {
  const header =
    chalk.bold(`env-var-auditor`) +
    `  v${version}  ·  ` +
    chalk.dim(`${result.scannedFiles} files  ·  ${result.scannedEnvFiles} env files`);

  return [header, '', formatFindings(result, cwd)].join('\n');
}

export function formatWorkspaceTable(
  workspace: WorkspaceAuditResult,
  cwd: string,
  version: string,
): string {
  const lines: string[] = [];

  const totalFiles = workspace.packages.reduce((n, p) => n + p.result.scannedFiles, 0);
  const totalEnvFiles = workspace.packages.reduce((n, p) => n + p.result.scannedEnvFiles, 0);

  lines.push(
    chalk.bold(`env-var-auditor`) +
      `  v${version}  ·  workspace  ·  ` +
      chalk.dim(
        `${workspace.packages.length} packages  ·  ${totalFiles} files  ·  ${totalEnvFiles} env files`,
      ),
  );
  lines.push('');

  for (const pkg of workspace.packages) {
    const { result } = pkg;
    const pkgFindings =
      result.clientExposed.length +
      result.readButUndeclared.length +
      result.declaredButUnread.length;

    lines.push(
      chalk.bold(`▸ ${pkg.packageName}`) +
        chalk.dim(`  ${relPath(pkg.packageDir, cwd)}`),
    );

    if (pkgFindings === 0 && result.unauditable.length === 0) {
      lines.push(chalk.green('  No findings'));
    } else {
      lines.push(formatFindings(result, cwd));
    }

    lines.push('');
  }

  // Workspace-level summary
  const allClientExposed = workspace.packages.reduce(
    (n, p) => n + p.result.clientExposed.length,
    0,
  );
  const allOther = workspace.packages.reduce(
    (n, p) => n + p.result.readButUndeclared.length + p.result.declaredButUnread.length,
    0,
  );

  if (allClientExposed === 0 && allOther === 0) {
    lines.push(chalk.green('Workspace clean — no findings across all packages.'));
  } else {
    const parts: string[] = [];
    if (allClientExposed > 0) parts.push(chalk.red(`${allClientExposed} client-exposed`));
    if (allOther > 0) parts.push(chalk.yellow(`${allOther} other findings`));
    lines.push(`Workspace total: ${parts.join(', ')}`);
  }

  return lines.join('\n');
}
