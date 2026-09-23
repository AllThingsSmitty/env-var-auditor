import path from 'path';
import type { AuditResult, WorkspaceAuditResult } from '../types.js';
import type { ProgressEntry } from '../progress.js';
import type { PackageProgressInfo } from './table.js';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function relPath(absPath: string, cwd: string): string {
  return path.relative(cwd, absPath).replace(/\\/g, '/');
}

// ── Page shell ──────────────────────────────────────────────────────────────

function pageTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  .viz-root {
    color-scheme: light;
    --page: #f9f9f7;
    --surface-1: #fcfcfb;
    --text-primary: #0b0b0b;
    --text-secondary: #52514e;
    --muted: #898781;
    --gridline: #e1e0d9;
    --baseline: #c3c2b7;
    --series-1: #2a78d6;
    --series-2: #eb6834;
    --series-3: #1baf7a;
    --good: #0ca30c;
    --warning: #fab219;
    --serious: #ec835a;
    --critical: #d03b3b;
    --border: rgba(11,11,11,0.10);
  }
  * { box-sizing: border-box; }
  body.viz-root {
    margin: 0;
    padding: 32px 16px;
    background: var(--page);
    color: var(--text-primary);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .container { max-width: 960px; margin: 0 auto; }
  .masthead { margin-bottom: 24px; }
  .masthead h1 { font-size: 20px; margin: 0 0 4px; }
  .masthead .meta { color: var(--text-secondary); font-size: 13px; }
  .card {
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px 24px;
    margin-bottom: 20px;
  }
  .card h2 { font-size: 15px; margin: 0 0 12px; }
  .stat-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
  .stat-tile {
    flex: 1 1 160px;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
  }
  .stat-tile .label { font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; }
  .stat-tile .value { font-size: 28px; font-weight: 600; }
  .stat-tile .icon { font-size: 13px; margin-right: 4px; }
  .tone-good .value { color: var(--good); }
  .tone-warning .value { color: var(--warning); }
  .tone-serious .value { color: var(--serious); }
  .tone-critical .value { color: var(--critical); }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td {
    text-align: left;
    padding: 6px 10px;
    border-bottom: 1px solid var(--gridline);
    font-variant-numeric: tabular-nums;
  }
  th { color: var(--text-secondary); font-weight: 600; font-size: 12px; }
  .findings-table td.name { font-variant-numeric: normal; }
  .badge-critical { color: var(--critical); font-weight: 600; }
  .badge-serious { color: var(--serious); font-weight: 600; }
  .badge-muted { color: var(--muted); }
  .delta-good { color: var(--good); }
  .delta-bad { color: var(--critical); }
  .delta-flat { color: var(--muted); }
  .empty-state { color: var(--good); font-weight: 500; }
  .chart { margin-bottom: 12px; }
  .chart-svg { width: 100%; height: auto; display: block; }
  .gridline { stroke: var(--gridline); stroke-width: 1; }
  .baseline-axis { stroke: var(--baseline); stroke-width: 1; }
  .axis-label { fill: var(--muted); font-size: 11px; }
  .legend { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 8px; font-size: 13px; }
  .legend-item { display: inline-flex; align-items: center; gap: 6px; color: var(--text-secondary); }
  .legend-item strong { color: var(--text-primary); }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .pkg-nav { margin-bottom: 20px; font-size: 13px; }
  .pkg-nav a { color: var(--series-1); text-decoration: none; margin-right: 12px; }
  .pkg-nav a:hover { text-decoration: underline; }
  footer { color: var(--muted); font-size: 12px; margin-top: 24px; }
</style>
</head>
<body class="viz-root">
<div class="container">
${body}
</div>
</body>
</html>
`;
}

function statTile(label: string, value: number, tone: 'good' | 'warning' | 'serious' | 'critical'): string {
  const icon = tone === 'good' ? '✓' : '⚠';
  const effectiveTone = value === 0 ? 'good' : tone;
  return `<div class="stat-tile tone-${effectiveTone}">
    <div class="label">${escapeHtml(label)}</div>
    <div class="value"><span class="icon">${icon}</span>${value}</div>
  </div>`;
}

// ── Trend chart (SVG, no JS) ────────────────────────────────────────────────

function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const magnitude = Math.pow(10, exponent);
  const residual = value / magnitude;
  let niceResidual: number;
  if (residual <= 1) niceResidual = 1;
  else if (residual <= 2) niceResidual = 2;
  else if (residual <= 5) niceResidual = 5;
  else niceResidual = 10;
  return niceResidual * magnitude;
}

function computeYAxis(maxValue: number): { axisMax: number; ticks: number[] } {
  if (maxValue <= 0) return { axisMax: 4, ticks: [0, 1, 2, 3, 4] };
  const step = niceCeil(maxValue / 4);
  return { axisMax: step * 4, ticks: [0, step, step * 2, step * 3, step * 4] };
}

// A fixed integer step keeps labels evenly spaced; a proportional/rounded
// pick can round two adjacent indices to neighbors while skipping the one
// between them, producing a visually uneven double-gap in the middle.
function thinIndices(length: number, maxLabels: number): Set<number> {
  if (length <= maxLabels) return new Set(Array.from({ length }, (_, i) => i));
  const step = Math.ceil((length - 1) / (maxLabels - 1));
  const set = new Set<number>();
  for (let i = 0; i < length; i += step) {
    set.add(i);
  }
  set.add(length - 1);
  return set;
}

const TREND_SERIES = [
  { key: 'clientExposed' as const, label: 'Client-exposed', color: 'var(--series-1)' },
  { key: 'readButUndeclared' as const, label: 'Undeclared', color: 'var(--series-2)' },
  { key: 'declaredButUnread' as const, label: 'Unused', color: 'var(--series-3)' },
];

function buildTrendChart(history: ProgressEntry[]): string {
  if (history.length === 0) return '';

  const width = 680;
  const height = 280;
  const pad = { top: 16, right: 16, bottom: 32, left: 40 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxValue = Math.max(
    0,
    ...history.flatMap((h) => [
      h.findings.clientExposed,
      h.findings.readButUndeclared,
      h.findings.declaredButUnread,
    ]),
  );
  const { axisMax, ticks } = computeYAxis(maxValue);

  const xFor = (i: number) =>
    history.length > 1 ? pad.left + (i * plotW) / (history.length - 1) : pad.left + plotW / 2;
  const yFor = (value: number) => pad.top + plotH - (value / axisMax) * plotH;

  const gridlines = ticks
    .map((tick) => {
      const y = yFor(tick).toFixed(1);
      return (
        `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" class="gridline" />` +
        `<text x="${pad.left - 8}" y="${y}" class="axis-label" text-anchor="end" dominant-baseline="middle">${tick}</text>`
      );
    })
    .join('');

  const labelIndices = thinIndices(history.length, 6);
  const xLabels = history
    .map((entry, i) => {
      if (!labelIndices.has(i)) return '';
      const date = new Date(entry.timestamp).toISOString().split('T')[0];
      return `<text x="${xFor(i).toFixed(1)}" y="${height - pad.bottom + 20}" class="axis-label" text-anchor="middle">${date}</text>`;
    })
    .join('');

  const lines =
    history.length < 2
      ? ''
      : TREND_SERIES.map((s) => {
          const points = history
            .map((entry, i) => `${xFor(i).toFixed(1)},${yFor(entry.findings[s.key]).toFixed(1)}`)
            .join(' ');
          return `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`;
        }).join('');

  const dots = TREND_SERIES.flatMap((s) =>
    history.map((entry, i) => {
      const cx = xFor(i).toFixed(1);
      const cy = yFor(entry.findings[s.key]).toFixed(1);
      const date = new Date(entry.timestamp).toISOString().split('T')[0];
      const value = entry.findings[s.key];
      return (
        `<circle cx="${cx}" cy="${cy}" r="4" fill="${s.color}" stroke="var(--surface-1)" stroke-width="2">` +
        `<title>${escapeHtml(date)} — ${escapeHtml(s.label)}: ${value}</title>` +
        `</circle>`
      );
    }),
  ).join('');

  const baselineY = yFor(0).toFixed(1);

  const svg =
    `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Findings trend over time" class="chart-svg">` +
    gridlines +
    `<line x1="${pad.left}" y1="${baselineY}" x2="${width - pad.right}" y2="${baselineY}" class="baseline-axis" />` +
    lines +
    dots +
    xLabels +
    `</svg>`;

  const latest = history[history.length - 1];
  const legend =
    `<div class="legend">` +
    TREND_SERIES.map(
      (s) =>
        `<span class="legend-item"><span class="dot" style="background:${s.color}"></span>${escapeHtml(s.label)} <strong>${latest.findings[s.key]}</strong></span>`,
    ).join('') +
    `</div>`;

  return `<div class="chart">${svg}${legend}</div>`;
}

// ── Progress (snapshot) table + summary ──────────────────────────────────────

function buildProgressTableHtml(history: ProgressEntry[]): string {
  if (history.length === 0) {
    return `<p class="empty-state" style="color:var(--muted)">No progress history yet. Run: <code>env-var-auditor . --save-baseline --track-progress</code></p>`;
  }

  const rows = history
    .map((entry, i) => {
      const total =
        entry.findings.clientExposed + entry.findings.readButUndeclared + entry.findings.declaredButUnread;
      const date = new Date(entry.timestamp).toISOString().split('T')[0];
      let delta = `<span class="delta-flat">—</span>`;

      if (i > 0) {
        const prev = history[i - 1];
        const prevTotal =
          prev.findings.clientExposed + prev.findings.readButUndeclared + prev.findings.declaredButUnread;
        const change = total - prevTotal;
        if (change > 0) delta = `<span class="delta-bad">+${change}</span>`;
        else if (change < 0) delta = `<span class="delta-good">${change}</span>`;
        else delta = `<span class="delta-flat">0</span>`;
      }

      return `<tr>
        <td>${escapeHtml(date)}</td>
        <td>${entry.findings.clientExposed}</td>
        <td>${entry.findings.readButUndeclared}</td>
        <td>${entry.findings.declaredButUnread}</td>
        <td>${total}</td>
        <td>${delta}</td>
      </tr>`;
    })
    .join('');

  const table = `<table>
    <thead><tr><th>Date</th><th>Client-exposed</th><th>Undeclared</th><th>Unused</th><th>Total</th><th>Δ</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  const firstTotal =
    history[0].findings.clientExposed + history[0].findings.readButUndeclared + history[0].findings.declaredButUnread;
  const lastTotal =
    history[history.length - 1].findings.clientExposed +
    history[history.length - 1].findings.readButUndeclared +
    history[history.length - 1].findings.declaredButUnread;

  let summary = '';
  if (history.length > 1 && firstTotal > 0) {
    const change = lastTotal - firstTotal;
    const percent = Math.abs((change / firstTotal) * 100).toFixed(1);
    if (change < 0) {
      summary = `<p class="delta-good">${Math.abs(change)} fewer findings (${percent}% improvement)</p>`;
    } else if (change > 0) {
      summary = `<p class="delta-bad">${change} more findings (${percent}% increase)</p>`;
    } else {
      summary = `<p class="delta-flat">No change in total findings</p>`;
    }
  } else if (history.length > 1 && firstTotal === 0) {
    summary =
      lastTotal > 0
        ? `<p class="delta-bad">${lastTotal} findings introduced</p>`
        : `<p class="delta-good">Clean start, still clean</p>`;
  }

  return table + summary;
}

export function formatProgressHtml(history: ProgressEntry[], version: string): string {
  const body = `
    <div class="masthead">
      <h1>env-var-auditor <span style="font-weight:400">v${escapeHtml(version)}</span></h1>
      <div class="meta">${history.length} snapshot${history.length === 1 ? '' : 's'}</div>
    </div>
    <div class="card">
      <h2>Findings trend</h2>
      ${buildTrendChart(history)}
    </div>
    <div class="card">
      <h2>Snapshots</h2>
      ${buildProgressTableHtml(history)}
    </div>
  `;
  return pageTemplate('env-var-auditor — progress', body);
}

export function formatWorkspaceProgressHtml(
  packages: PackageProgressInfo[],
  cwd: string,
  version: string,
): string {
  const nav = `<div class="pkg-nav">${packages
    .map((pkg) => `<a href="#${slugify(pkg.packageName)}">${escapeHtml(pkg.packageName)}</a>`)
    .join('')}</div>`;

  const sections = packages
    .map((pkg) => {
      const heading = `<h2 id="${slugify(pkg.packageName)}">${escapeHtml(pkg.packageName)}</h2>
        <div class="meta" style="margin-bottom:12px">${escapeHtml(relPath(pkg.packageDir, cwd))}</div>`;

      if (pkg.history.length === 0) {
        return `<div class="card">${heading}<p style="color:var(--muted)">No progress history yet</p></div>`;
      }

      return `<div class="card">${heading}${buildTrendChart(pkg.history)}${buildProgressTableHtml(pkg.history)}</div>`;
    })
    .join('');

  const body = `
    <div class="masthead">
      <h1>env-var-auditor <span style="font-weight:400">v${escapeHtml(version)}</span> · workspace</h1>
      <div class="meta">${packages.length} package${packages.length === 1 ? '' : 's'}</div>
    </div>
    ${nav}
    ${sections}
  `;
  return pageTemplate('env-var-auditor — workspace progress', body);
}

function slugify(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
}

// ── Plain audit report ───────────────────────────────────────────────────────

function buildFindingsHtml(result: AuditResult, cwd: string): string {
  const total =
    result.clientExposed.length + result.readButUndeclared.length + result.declaredButUnread.length;

  const sections: string[] = [];

  if (result.clientExposed.length > 0) {
    const rows = result.clientExposed
      .map((v) => {
        const reason =
          v.reason === 'missing-prefix' ? 'No NEXT_PUBLIC_ prefix' : `Secret pattern: ${escapeHtml(v.secretPattern ?? '')}`;
        return `<tr><td class="name badge-critical">${escapeHtml(v.name)}</td><td>${escapeHtml(relPath(v.file, cwd))}:${v.line}</td><td>${reason}</td></tr>`;
      })
      .join('');
    sections.push(`<h2 class="badge-critical">Client-exposed <span style="color:var(--text-secondary);font-weight:400">${result.clientExposed.length} finding${result.clientExposed.length === 1 ? '' : 's'}</span></h2>
      <table class="findings-table"><thead><tr><th>Variable</th><th>Location</th><th>Reason</th></tr></thead><tbody>${rows}</tbody></table>`);
  }

  if (result.readButUndeclared.length > 0) {
    const rows = result.readButUndeclared
      .map(
        (v) =>
          `<tr><td class="name badge-serious">${escapeHtml(v.name!)}</td><td>${escapeHtml(relPath(v.file, cwd))}:${v.line}</td></tr>`,
      )
      .join('');
    sections.push(`<h2 class="badge-serious">Read but undeclared <span style="color:var(--text-secondary);font-weight:400">${result.readButUndeclared.length} finding${result.readButUndeclared.length === 1 ? '' : 's'}</span></h2>
      <table class="findings-table"><thead><tr><th>Variable</th><th>First seen at</th></tr></thead><tbody>${rows}</tbody></table>`);
  }

  if (result.declaredButUnread.length > 0) {
    const rows = result.declaredButUnread
      .map(
        (v) =>
          `<tr><td class="name badge-muted">${escapeHtml(v.name)}</td><td>${escapeHtml(relPath(v.source, cwd))}:${v.line}</td></tr>`,
      )
      .join('');
    sections.push(`<h2 class="badge-muted">Declared but unread <span style="color:var(--text-secondary);font-weight:400">${result.declaredButUnread.length} finding${result.declaredButUnread.length === 1 ? '' : 's'}</span></h2>
      <table class="findings-table"><thead><tr><th>Variable</th><th>Declared in</th></tr></thead><tbody>${rows}</tbody></table>`);
  }

  if (result.unauditable.length > 0) {
    const items = result.unauditable
      .map((v) => `<li>${escapeHtml(relPath(v.file, cwd))}:${v.line} → process.env[dynamic]</li>`)
      .join('');
    sections.push(`<p style="color:var(--muted)">${result.unauditable.length} dynamic access${result.unauditable.length === 1 ? '' : 'es'} (cannot determine variable names)</p><ul style="color:var(--muted);font-size:13px">${items}</ul>`);
  }

  if (total === 0 && result.unauditable.length === 0) {
    sections.push(`<p class="empty-state">No findings — all env vars accounted for.</p>`);
  }

  return sections.join('\n');
}

export function formatHtml(result: AuditResult, cwd: string, version: string): string {
  const stats = `<div class="stat-row">
    ${statTile('Client-exposed', result.clientExposed.length, 'critical')}
    ${statTile('Undeclared', result.readButUndeclared.length, 'serious')}
    ${statTile('Unused', result.declaredButUnread.length, 'warning')}
  </div>`;

  const body = `
    <div class="masthead">
      <h1>env-var-auditor <span style="font-weight:400">v${escapeHtml(version)}</span></h1>
      <div class="meta">${result.scannedFiles} files · ${result.scannedEnvFiles} env files</div>
    </div>
    ${stats}
    <div class="card">${buildFindingsHtml(result, cwd)}</div>
  `;
  return pageTemplate('env-var-auditor — audit report', body);
}

export function formatWorkspaceHtml(workspace: WorkspaceAuditResult, cwd: string, version: string): string {
  const totalFiles = workspace.packages.reduce((n, p) => n + p.result.scannedFiles, 0);
  const totalEnvFiles = workspace.packages.reduce((n, p) => n + p.result.scannedEnvFiles, 0);

  const totalClientExposed = workspace.packages.reduce((n, p) => n + p.result.clientExposed.length, 0);
  const totalUndeclared = workspace.packages.reduce((n, p) => n + p.result.readButUndeclared.length, 0);
  const totalUnused = workspace.packages.reduce((n, p) => n + p.result.declaredButUnread.length, 0);

  const stats = `<div class="stat-row">
    ${statTile('Client-exposed', totalClientExposed, 'critical')}
    ${statTile('Undeclared', totalUndeclared, 'serious')}
    ${statTile('Unused', totalUnused, 'warning')}
  </div>`;

  const nav = `<div class="pkg-nav">${workspace.packages
    .map((pkg) => `<a href="#${slugify(pkg.packageName)}">${escapeHtml(pkg.packageName)}</a>`)
    .join('')}</div>`;

  const sections = workspace.packages
    .map((pkg) => {
      const heading = `<h2 id="${slugify(pkg.packageName)}">${escapeHtml(pkg.packageName)}</h2>
        <div class="meta" style="margin-bottom:12px">${escapeHtml(relPath(pkg.packageDir, cwd))}</div>`;
      return `<div class="card">${heading}${buildFindingsHtml(pkg.result, cwd)}</div>`;
    })
    .join('');

  const body = `
    <div class="masthead">
      <h1>env-var-auditor <span style="font-weight:400">v${escapeHtml(version)}</span> · workspace</h1>
      <div class="meta">${workspace.packages.length} packages · ${totalFiles} files · ${totalEnvFiles} env files</div>
    </div>
    ${stats}
    ${nav}
    ${sections}
  `;
  return pageTemplate('env-var-auditor — workspace audit report', body);
}
