import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import type { AuditResult, WorkspaceAuditResult } from './types.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

export interface BaselineData {
  version: string;
  timestamp: string;
  findings: {
    clientExposed: string[];
    readButUndeclared: string[];
    declaredButUnread: string[];
  };
}

export interface BaselineComparison {
  newFindings: {
    clientExposed: string[];
    readButUndeclared: string[];
    declaredButUnread: string[];
  };
  baselineFindings: {
    clientExposed: string[];
    readButUndeclared: string[];
    declaredButUnread: string[];
  };
  fixedFindings: {
    clientExposed: string[];
    readButUndeclared: string[];
    declaredButUnread: string[];
  };
}

export function createBaseline(result: AuditResult): BaselineData {
  return {
    version,
    timestamp: new Date().toISOString(),
    findings: {
      clientExposed: result.clientExposed.map((f) => f.name),
      readButUndeclared: result.readButUndeclared.map((f) => f.name ?? ''),
      declaredButUnread: result.declaredButUnread.map((f) => f.name),
    },
  };
}

export function saveBaseline(baselinePath: string, baseline: BaselineData): void {
  const dir = path.dirname(baselinePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n', 'utf-8');
}

export function loadBaseline(baselinePath: string): BaselineData {
  if (!fs.existsSync(baselinePath)) {
    throw new Error(`Baseline file not found: ${baselinePath}`);
  }

  const content = fs.readFileSync(baselinePath, 'utf-8');
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(
      `Failed to parse baseline file ${baselinePath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const data = parsed as Record<string, unknown>;

  if (!data.version || typeof data.version !== 'string') {
    throw new Error('Baseline file missing or invalid version field');
  }

  if (!data.timestamp || typeof data.timestamp !== 'string') {
    throw new Error('Baseline file missing or invalid timestamp field');
  }

  if (!data.findings || typeof data.findings !== 'object' || Array.isArray(data.findings)) {
    throw new Error('Baseline file missing or invalid findings field');
  }

  const findings = data.findings as Record<string, unknown>;
  const validateFindingList = (list: unknown, field: string) => {
    if (!Array.isArray(list)) {
      throw new Error(`Baseline findings.${field} must be an array`);
    }
    if (!list.every((item) => typeof item === 'string')) {
      throw new Error(`Baseline findings.${field} must contain only strings`);
    }
  };

  validateFindingList(findings.clientExposed, 'clientExposed');
  validateFindingList(findings.readButUndeclared, 'readButUndeclared');
  validateFindingList(findings.declaredButUnread, 'declaredButUnread');

  return {
    version: data.version,
    timestamp: data.timestamp,
    findings: {
      clientExposed: findings.clientExposed as string[],
      readButUndeclared: findings.readButUndeclared as string[],
      declaredButUnread: findings.declaredButUnread as string[],
    },
  };
}

export function validateBaselineVersion(baseline: BaselineData): void {
  if (baseline.version !== version) {
    throw new Error(
      `Baseline version mismatch: baseline is from v${baseline.version} but tool is v${version}. ` +
        `Run 'env-var-auditor . --save-baseline' to regenerate.`,
    );
  }
}

export function compareFindings(current: AuditResult, baseline: BaselineData): BaselineComparison {
  const currentClientExposed = new Set(current.clientExposed.map((f) => f.name));
  const currentReadUndeclared = new Set(current.readButUndeclared.map((f) => f.name ?? ''));
  const currentDeclaredUnread = new Set(current.declaredButUnread.map((f) => f.name));

  const baselineClientExposed = new Set(baseline.findings.clientExposed);
  const baselineReadUndeclared = new Set(baseline.findings.readButUndeclared);
  const baselineDeclaredUnread = new Set(baseline.findings.declaredButUnread);

  return {
    newFindings: {
      clientExposed: Array.from(currentClientExposed).filter((v) => !baselineClientExposed.has(v)),
      readButUndeclared: Array.from(currentReadUndeclared).filter((v) => !baselineReadUndeclared.has(v)),
      declaredButUnread: Array.from(currentDeclaredUnread).filter((v) => !baselineDeclaredUnread.has(v)),
    },
    baselineFindings: {
      clientExposed: Array.from(currentClientExposed).filter((v) => baselineClientExposed.has(v)),
      readButUndeclared: Array.from(currentReadUndeclared).filter((v) => baselineReadUndeclared.has(v)),
      declaredButUnread: Array.from(currentDeclaredUnread).filter((v) => baselineDeclaredUnread.has(v)),
    },
    fixedFindings: {
      clientExposed: Array.from(baselineClientExposed).filter((v) => !currentClientExposed.has(v)),
      readButUndeclared: Array.from(baselineReadUndeclared).filter((v) => !currentReadUndeclared.has(v)),
      declaredButUnread: Array.from(baselineDeclaredUnread).filter((v) => !currentDeclaredUnread.has(v)),
    },
  };
}

export function getDefaultBaselinePath(dir: string): string {
  return path.join(dir, '.env-auditor-baseline.json');
}

export function resolveBaselinePath(
  dir: string,
  configPath: string | undefined,
  cliPath: string | boolean | undefined,
): string {
  if (typeof cliPath === 'string') {
    return cliPath;
  }
  if (configPath) {
    return path.resolve(dir, configPath);
  }
  return getDefaultBaselinePath(dir);
}

export interface PackageBaselineResult {
  packageName: string;
  packageDir: string;
  result: AuditResult;
  baseline: BaselineData;
  comparison: BaselineComparison;
  baselineMissing: boolean;
}

export function saveWorkspaceBaselines(
  workspace: WorkspaceAuditResult,
  resolvePath: (packageDir: string) => string,
): { packageName: string; packageDir: string; baseline: BaselineData }[] {
  const saved = [];

  for (const pkg of workspace.packages) {
    const baseline = createBaseline(pkg.result);
    const baselinePath = resolvePath(pkg.packageDir);
    saveBaseline(baselinePath, baseline);
    saved.push({
      packageName: pkg.packageName,
      packageDir: pkg.packageDir,
      baseline,
    });
  }

  return saved;
}

export function compareWorkspaceBaselines(
  workspace: WorkspaceAuditResult,
  resolvePath: (packageDir: string) => string,
): PackageBaselineResult[] {
  const results: PackageBaselineResult[] = [];

  for (const pkg of workspace.packages) {
    const baselinePath = resolvePath(pkg.packageDir);
    let baseline: BaselineData;
    let baselineMissing = false;

    if (!fs.existsSync(baselinePath)) {
      baselineMissing = true;
      baseline = {
        version,
        timestamp: new Date().toISOString(),
        findings: {
          clientExposed: [],
          readButUndeclared: [],
          declaredButUnread: [],
        },
      };
    } else {
      baseline = loadBaseline(baselinePath);
      validateBaselineVersion(baseline);
    }

    const comparison = compareFindings(pkg.result, baseline);

    results.push({
      packageName: pkg.packageName,
      packageDir: pkg.packageDir,
      result: pkg.result,
      baseline,
      comparison,
      baselineMissing,
    });
  }

  return results;
}
