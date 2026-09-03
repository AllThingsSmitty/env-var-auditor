import type { AuditResult, WorkspaceAuditResult } from '../types.js';
import type { BaselineComparison, BaselineData, PackageBaselineResult } from '../baseline.js';

export function formatJson(result: AuditResult, baselineMessage?: string): string {
  const output: Record<string, unknown> = {
    summary: {
      scannedFiles: result.scannedFiles,
      scannedEnvFiles: result.scannedEnvFiles,
      clientExposed: result.clientExposed.length,
      readButUndeclared: result.readButUndeclared.length,
      declaredButUnread: result.declaredButUnread.length,
      unauditable: result.unauditable.length,
    },
    clientExposed: result.clientExposed,
    readButUndeclared: result.readButUndeclared,
    declaredButUnread: result.declaredButUnread,
    unauditable: result.unauditable,
  };

  if (baselineMessage) {
    output.baseline = baselineMessage;
  }

  return JSON.stringify(output, null, 2);
}

export function formatWorkspaceJson(workspace: WorkspaceAuditResult): string {
  const packages = workspace.packages.map((pkg) => ({
    packageName: pkg.packageName,
    packageDir: pkg.packageDir,
    summary: {
      scannedFiles: pkg.result.scannedFiles,
      scannedEnvFiles: pkg.result.scannedEnvFiles,
      clientExposed: pkg.result.clientExposed.length,
      readButUndeclared: pkg.result.readButUndeclared.length,
      declaredButUnread: pkg.result.declaredButUnread.length,
      unauditable: pkg.result.unauditable.length,
    },
    clientExposed: pkg.result.clientExposed,
    readButUndeclared: pkg.result.readButUndeclared,
    declaredButUnread: pkg.result.declaredButUnread,
    unauditable: pkg.result.unauditable,
  }));

  return JSON.stringify({ packages }, null, 2);
}

export function formatBaselineJson(
  result: AuditResult,
  comparison: BaselineComparison,
  baseline: BaselineData,
): string {
  const newClientExposed = result.clientExposed.filter((f) =>
    comparison.newFindings.clientExposed.includes(f.name),
  );
  const newReadUndeclared = result.readButUndeclared.filter((f) =>
    comparison.newFindings.readButUndeclared.includes(f.name ?? ''),
  );
  const newDeclaredUnread = result.declaredButUnread.filter((f) =>
    comparison.newFindings.declaredButUnread.includes(f.name),
  );

  const existingClientExposed = result.clientExposed.filter((f) =>
    comparison.baselineFindings.clientExposed.includes(f.name),
  );
  const existingReadUndeclared = result.readButUndeclared.filter((f) =>
    comparison.baselineFindings.readButUndeclared.includes(f.name ?? ''),
  );
  const existingDeclaredUnread = result.declaredButUnread.filter((f) =>
    comparison.baselineFindings.declaredButUnread.includes(f.name),
  );

  const output: Record<string, unknown> = {
    baseline: {
      version: baseline.version,
      timestamp: baseline.timestamp,
    },
    summary: {
      new: {
        clientExposed: newClientExposed.length,
        readButUndeclared: newReadUndeclared.length,
        declaredButUnread: newDeclaredUnread.length,
      },
      existing: {
        clientExposed: existingClientExposed.length,
        readButUndeclared: existingReadUndeclared.length,
        declaredButUnread: existingDeclaredUnread.length,
      },
      fixed: {
        clientExposed: comparison.fixedFindings.clientExposed.length,
        readButUndeclared: comparison.fixedFindings.readButUndeclared.length,
        declaredButUnread: comparison.fixedFindings.declaredButUnread.length,
      },
    },
    new: {
      clientExposed: newClientExposed,
      readButUndeclared: newReadUndeclared,
      declaredButUnread: newDeclaredUnread,
    },
    existing: {
      clientExposed: existingClientExposed,
      readButUndeclared: existingReadUndeclared,
      declaredButUnread: existingDeclaredUnread,
    },
    fixed: {
      clientExposed: comparison.fixedFindings.clientExposed,
      readButUndeclared: comparison.fixedFindings.readButUndeclared,
      declaredButUnread: comparison.fixedFindings.declaredButUnread,
    },
  };

  return JSON.stringify(output, null, 2);
}

export function formatWorkspaceBaselineJson(packages: PackageBaselineResult[]): string {
  const formatted = packages.map((pkg) => {
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

    return {
      packageName: pkg.packageName,
      packageDir: pkg.packageDir,
      baselineMissing: pkg.baselineMissing,
      baseline: {
        version: pkg.baseline.version,
        timestamp: pkg.baseline.timestamp,
      },
      summary: {
        new: {
          clientExposed: newClientExposed.length,
          readButUndeclared: newReadUndeclared.length,
          declaredButUnread: newDeclaredUnread.length,
        },
        existing: {
          clientExposed: existingClientExposed.length,
          readButUndeclared: existingReadUndeclared.length,
          declaredButUnread: existingDeclaredUnread.length,
        },
        fixed: {
          clientExposed: pkg.comparison.fixedFindings.clientExposed.length,
          readButUndeclared: pkg.comparison.fixedFindings.readButUndeclared.length,
          declaredButUnread: pkg.comparison.fixedFindings.declaredButUnread.length,
        },
      },
      new: {
        clientExposed: newClientExposed,
        readButUndeclared: newReadUndeclared,
        declaredButUnread: newDeclaredUnread,
      },
      existing: {
        clientExposed: existingClientExposed,
        readButUndeclared: existingReadUndeclared,
        declaredButUnread: existingDeclaredUnread,
      },
      fixed: {
        clientExposed: pkg.comparison.fixedFindings.clientExposed,
        readButUndeclared: pkg.comparison.fixedFindings.readButUndeclared,
        declaredButUnread: pkg.comparison.fixedFindings.declaredButUnread,
      },
    };
  });

  return JSON.stringify({ packages: formatted }, null, 2);
}
