// Plain TypeScript, no `vscode` import. `diagnostics.ts` wraps this module's
// plain numbers into real `vscode.Range`/`vscode.Diagnostic` objects.
import type { EnvAccess, ClientExposedVar, EnvDeclaration } from 'env-var-auditor';

/** 0-based line/column range, independent of any editor API. */
export interface PlainRange {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export type FindingKind = 'readButUndeclared' | 'clientExposed' | 'declaredButUnread';

/**
 * Computes a 0-based range for a finding.
 *
 * - `readButUndeclared` (`EnvAccess`) has an exact 1-based `line` and
 *   0-based `column` from ts-morph, so the range is exact and `name.length`
 *   wide.
 * - `clientExposed` (`ClientExposedVar`) and `declaredButUnread`
 *   (`EnvDeclaration`) only carry a 1-based `line`, no column, so the column
 *   is derived via `indexOf(name)` against the line's text. When the line
 *   text isn't available, or the name can't be found on it (stale buffer,
 *   renamed var, etc.), the whole line is used as a fallback range.
 */
export function findingToRange(
  kind: FindingKind,
  finding: EnvAccess | ClientExposedVar | EnvDeclaration,
  lineText: string | undefined,
): PlainRange {
  const startLine = finding.line - 1;

  if (kind === 'readButUndeclared') {
    const access = finding as EnvAccess;
    const name = access.name ?? '';
    const startCol = access.column;
    return { startLine, startCol, endLine: startLine, endCol: startCol + name.length };
  }

  const name = (finding as ClientExposedVar | EnvDeclaration).name;

  if (lineText !== undefined) {
    const idx = lineText.indexOf(name);
    if (idx !== -1) {
      return { startLine, startCol: idx, endLine: startLine, endCol: idx + name.length };
    }
    // Name not found on the line (stale buffer, etc.) — fall back to the whole line.
    return { startLine, startCol: 0, endLine: startLine, endCol: lineText.length };
  }

  // No line text at all (file unreadable) — zero-width range at the line start.
  return { startLine, startCol: 0, endLine: startLine, endCol: 0 };
}
