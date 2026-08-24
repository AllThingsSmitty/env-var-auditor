import type { AuditResult, WorkspaceAuditResult } from '../types.js';

export function formatJson(result: AuditResult): string {
  return JSON.stringify(
    {
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
    },
    null,
    2,
  );
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
