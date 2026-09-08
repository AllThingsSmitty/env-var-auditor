import chalk from 'chalk';
import Table from 'cli-table3';
import path from 'path';
import type { AuditResult, WorkspaceAuditResult } from '../types.js';
import type { BaselineComparison, PackageBaselineResult } from '../baseline.js';
import type { ProgressEntry } from '../progress.js';

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

export function formatTable(
  result: AuditResult,
  cwd: string,
  version: string,
  baselineMessage?: string,
): string {
  let header =
    chalk.bold(`env-var-auditor`) +
    `  v${version}  ·  ` +
    chalk.dim(`${result.scannedFiles} files  ·  ${result.scannedEnvFiles} env files`);

  if (baselineMessage) {
    header += `\n${chalk.dim(baselineMessage)}`;
  }

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

export function formatBaselineTable(
  result: AuditResult,
  comparison: BaselineComparison,
  cwd: string,
  version: string,
  baseline: { timestamp: string },
  showAll?: boolean,
): string {
  const fixedCount = comparison.fixedFindings.clientExposed.length +
    comparison.fixedFindings.readButUndeclared.length +
    comparison.fixedFindings.declaredButUnread.length;

  let displayResult: AuditResult;

  if (showAll) {
    const existingClientExposed = result.clientExposed.filter((f) =>
      comparison.baselineFindings.clientExposed.includes(f.name),
    );
    const existingReadUndeclared = result.readButUndeclared.filter((f) =>
      comparison.baselineFindings.readButUndeclared.includes(f.name ?? ''),
    );
    const existingDeclaredUnread = result.declaredButUnread.filter((f) =>
      comparison.baselineFindings.declaredButUnread.includes(f.name),
    );

    const newClientExposed = result.clientExposed.filter((f) =>
      comparison.newFindings.clientExposed.includes(f.name),
    );
    const newReadUndeclared = result.readButUndeclared.filter((f) =>
      comparison.newFindings.readButUndeclared.includes(f.name ?? ''),
    );
    const newDeclaredUnread = result.declaredButUnread.filter((f) =>
      comparison.newFindings.declaredButUnread.includes(f.name),
    );

    displayResult = {
      ...result,
      clientExposed: [...newClientExposed, ...existingClientExposed],
      readButUndeclared: [...newReadUndeclared, ...existingReadUndeclared],
      declaredButUnread: [...newDeclaredUnread, ...existingDeclaredUnread],
    };
  } else {
    displayResult = {
      ...result,
      clientExposed: result.clientExposed.filter((f) =>
        comparison.newFindings.clientExposed.includes(f.name),
      ),
      readButUndeclared: result.readButUndeclared.filter((f) =>
        comparison.newFindings.readButUndeclared.includes(f.name ?? ''),
      ),
      declaredButUnread: result.declaredButUnread.filter((f) =>
        comparison.newFindings.declaredButUnread.includes(f.name),
      ),
    };
  }

  let header =
    chalk.bold(`env-var-auditor`) +
    `  v${version}  ·  ` +
    chalk.dim(`${result.scannedFiles} files  ·  ${result.scannedEnvFiles} env files`);

  const baselineMsg = `Baseline from ${baseline.timestamp}${fixedCount > 0 ? ` · ${fixedCount} fixed` : ''}`;
  header += `\n${chalk.dim(baselineMsg)}`;
  if (showAll) {
    header += ` ${chalk.dim('(showing all findings)')}`;
  }

  return [header, '', formatFindings(displayResult, cwd)].join('\n');
}

export function formatWorkspaceBaselineTable(
  packages: PackageBaselineResult[],
  cwd: string,
  version: string,
  showAll?: boolean,
): string {
  const lines: string[] = [];

  const totalFiles = packages.reduce((n, p) => n + p.result.scannedFiles, 0);
  const totalEnvFiles = packages.reduce((n, p) => n + p.result.scannedEnvFiles, 0);

  lines.push(
    chalk.bold(`env-var-auditor`) +
      `  v${version}  ·  workspace  ·  ` +
      chalk.dim(
        `${packages.length} packages  ·  ${totalFiles} files  ·  ${totalEnvFiles} env files`,
      ),
  );
  lines.push('');

  for (const pkg of packages) {
    const newClientExposed = pkg.result.clientExposed.filter((f) =>
      pkg.comparison.newFindings.clientExposed.includes(f.name),
    );
    const newReadUndeclared = pkg.result.readButUndeclared.filter((f) =>
      pkg.comparison.newFindings.readButUndeclared.includes(f.name ?? ''),
    );
    const newDeclaredUnread = pkg.result.declaredButUnread.filter((f) =>
      pkg.comparison.newFindings.declaredButUnread.includes(f.name),
    );

    const existingClientExposed = pkg.result.clientExposed.filter((f) =>
      pkg.comparison.baselineFindings.clientExposed.includes(f.name),
    );
    const existingReadUndeclared = pkg.result.readButUndeclared.filter((f) =>
      pkg.comparison.baselineFindings.readButUndeclared.includes(f.name ?? ''),
    );
    const existingDeclaredUnread = pkg.result.declaredButUnread.filter((f) =>
      pkg.comparison.baselineFindings.declaredButUnread.includes(f.name),
    );

    let allClientExposed = newClientExposed;
    let allReadUndeclared = newReadUndeclared;
    let allDeclaredUnread = newDeclaredUnread;

    if (showAll) {
      allClientExposed = [...newClientExposed, ...existingClientExposed];
      allReadUndeclared = [...newReadUndeclared, ...existingReadUndeclared];
      allDeclaredUnread = [...newDeclaredUnread, ...existingDeclaredUnread];
    }

    const filteredResult: AuditResult = {
      ...pkg.result,
      clientExposed: allClientExposed,
      readButUndeclared: allReadUndeclared,
      declaredButUnread: allDeclaredUnread,
    };

    const fixedCount = pkg.comparison.fixedFindings.clientExposed.length +
      pkg.comparison.fixedFindings.readButUndeclared.length +
      pkg.comparison.fixedFindings.declaredButUnread.length;

    let headerLine =
      chalk.bold(`▸ ${pkg.packageName}`) +
      chalk.dim(`  ${relPath(pkg.packageDir, cwd)}`);

    if (pkg.baselineMissing) {
      headerLine += `  ${chalk.yellow('⚠ no baseline found')}`;
    }
    if (fixedCount > 0) {
      headerLine += chalk.dim(`  · ${fixedCount} fixed`);
    }

    lines.push(headerLine);

    const pkgFindings =
      filteredResult.clientExposed.length +
      filteredResult.readButUndeclared.length +
      filteredResult.declaredButUnread.length;

    if (pkgFindings === 0 && filteredResult.unauditable.length === 0) {
      if (pkg.baselineMissing) {
        lines.push(chalk.dim('  (no findings yet)'));
      } else if (showAll) {
        lines.push(chalk.green('  No findings'));
      } else {
        lines.push(chalk.green('  No new findings'));
      }
    } else {
      lines.push(formatFindings(filteredResult, cwd));
    }

    lines.push('');
  }

  // Workspace-level summary
  const allNewClientExposed = packages.reduce((n, p) => {
    return n + p.comparison.newFindings.clientExposed.length;
  }, 0);
  const allNewOther = packages.reduce((n, p) => {
    return n + p.comparison.newFindings.readButUndeclared.length +
      p.comparison.newFindings.declaredButUnread.length;
  }, 0);
  const allExistingClientExposed = showAll ? packages.reduce((n, p) => {
    return n + p.comparison.baselineFindings.clientExposed.length;
  }, 0) : 0;
  const allExistingOther = showAll ? packages.reduce((n, p) => {
    return n + p.comparison.baselineFindings.readButUndeclared.length +
      p.comparison.baselineFindings.declaredButUnread.length;
  }, 0) : 0;
  const allFixedTotal = packages.reduce((n, p) => {
    return n + p.comparison.fixedFindings.clientExposed.length +
      p.comparison.fixedFindings.readButUndeclared.length +
      p.comparison.fixedFindings.declaredButUnread.length;
  }, 0);

  if (!showAll) {
    if (allNewClientExposed === 0 && allNewOther === 0) {
      lines.push(chalk.green('Workspace clean — no new findings across all packages.'));
    } else {
      const parts: string[] = [];
      if (allNewClientExposed > 0) parts.push(chalk.red(`${allNewClientExposed} new client-exposed`));
      if (allNewOther > 0) parts.push(chalk.yellow(`${allNewOther} new other findings`));
      lines.push(`Workspace total: ${parts.join(', ')}`);
    }
  } else {
    const totalClientExposed = allNewClientExposed + allExistingClientExposed;
    const totalOther = allNewOther + allExistingOther;

    if (totalClientExposed === 0 && totalOther === 0) {
      lines.push(chalk.green('Workspace clean — no findings across all packages.'));
    } else {
      const parts: string[] = [];
      if (totalClientExposed > 0) parts.push(chalk.red(`${totalClientExposed} client-exposed`));
      if (totalOther > 0) parts.push(chalk.yellow(`${totalOther} other findings`));
      lines.push(`Workspace total: ${parts.join(', ')}`);
      if (allNewClientExposed > 0 || allNewOther > 0) {
        lines.push(chalk.dim(`  · ${allNewClientExposed + allNewOther} new since last baseline`));
      }
    }
  }

  if (allFixedTotal > 0) {
    lines.push(chalk.green(`  · ${allFixedTotal} fixed since baseline`));
  }

  return lines.join('\n');
}

function formatProgressTableBody(history: ProgressEntry[]): string {
  const lines: string[] = [];

  if (history.length === 0) {
    return chalk.dim('No progress history yet. Run: env-var-auditor . --save-baseline --track-progress');
  }

  const t = makeTable(['Date', 'Client-exposed', 'Undeclared', 'Unused', 'Total', 'Δ']);

  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    const total =
      entry.findings.clientExposed +
      entry.findings.readButUndeclared +
      entry.findings.declaredButUnread;

    const date = new Date(entry.timestamp).toISOString().split('T')[0];
    let delta = '—';

    if (i > 0) {
      const prevEntry = history[i - 1];
      const prevTotal =
        prevEntry.findings.clientExposed +
        prevEntry.findings.readButUndeclared +
        prevEntry.findings.declaredButUnread;
      const change = total - prevTotal;

      if (change > 0) {
        delta = chalk.red(`+${change}`);
      } else if (change < 0) {
        delta = chalk.green(`${change}`);
      } else {
        delta = chalk.dim('0');
      }
    }

    t.push([
      date,
      String(entry.findings.clientExposed),
      String(entry.findings.readButUndeclared),
      String(entry.findings.declaredButUnread),
      String(total),
      delta,
    ]);
  }

  lines.push(t.toString());

  // Summary line
  const firstTotal =
    history[0].findings.clientExposed +
    history[0].findings.readButUndeclared +
    history[0].findings.declaredButUnread;
  const lastTotal =
    history[history.length - 1].findings.clientExposed +
    history[history.length - 1].findings.readButUndeclared +
    history[history.length - 1].findings.declaredButUnread;

  if (history.length > 1 && firstTotal > 0) {
    const change = lastTotal - firstTotal;
    const percentChange = ((change / firstTotal) * 100).toFixed(1);
    const absChange = Math.abs(change);
    const absPercent = Math.abs(parseFloat(percentChange));

    if (change < 0) {
      lines.push(chalk.green(`${absChange} fewer findings (${absPercent}% improvement)`));
    } else if (change > 0) {
      lines.push(chalk.red(`${change} more findings (${percentChange}% increase)`));
    } else {
      lines.push(chalk.dim('No change in total findings'));
    }
  } else if (history.length > 1 && firstTotal === 0) {
    const lastHasFindings = lastTotal > 0;
    if (lastHasFindings) {
      lines.push(chalk.red(`${lastTotal} findings introduced`));
    } else {
      lines.push(chalk.green('Clean start, still clean'));
    }
  }

  return lines.join('\n');
}

export function formatProgressTable(history: ProgressEntry[], version: string): string {
  const header =
    chalk.bold(`env-var-auditor`) +
    `  v${version}  ·  ` +
    chalk.dim(`${history.length} snapshot${history.length === 1 ? '' : 's'}`);

  return [header, '', formatProgressTableBody(history)].join('\n');
}

export interface PackageProgressInfo {
  packageName: string;
  packageDir: string;
  history: ProgressEntry[];
}

export function formatWorkspaceProgressTable(
  packages: PackageProgressInfo[],
  cwd: string,
  version: string,
): string {
  const lines: string[] = [];

  lines.push(
    chalk.bold(`env-var-auditor`) +
      `  v${version}  ·  workspace  ·  ` +
      chalk.dim(`${packages.length} packages`),
  );
  lines.push('');

  for (const pkg of packages) {
    lines.push(chalk.bold(`▸ ${pkg.packageName}`) + chalk.dim(`  ${relPath(pkg.packageDir, cwd)}`));

    if (pkg.history.length === 0) {
      lines.push(chalk.dim('  No progress history yet'));
    } else {
      const body = formatProgressTableBody(pkg.history);
      lines.push(
        body
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n'),
      );
    }

    lines.push('');
  }

  return lines.join('\n');
}
