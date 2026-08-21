import type { AuditResult } from '../types.js';

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
