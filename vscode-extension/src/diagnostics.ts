// Thin `vscode`-aware adapter over the pure `mapping.ts` range math.
import * as vscode from 'vscode';
import * as fs from 'fs';
import type { AnalysisResult } from 'env-var-auditor';
import { findingToRange } from './mapping.js';

const SOURCE = 'env-var-auditor';

export type LineTextLookup = (file: string, line: number) => string | undefined;

/**
 * Canonicalizes a file path to VS Code's own `Uri.file(...).fsPath` form
 * (e.g. lowercased drive letter on Windows). File-identity strings reaching
 * this module come from two different sources that disagree on casing: the
 * core library's full-rescan path (via `glob`, which yields whatever casing
 * the OS/Node reports — typically an uppercase drive letter on Windows) and
 * live-edit reparses (via `document.uri.fsPath`, which VS Code always
 * lowercases). Without normalizing, the *same* file can show up as two
 * distinct map keys across rounds — e.g. `C:/.../page.tsx` from one round's
 * `analyze()` output and `c:/.../page.tsx` from `getLastPublishedFiles()` —
 * so `computeFilesToRepublish`'s union treats them as two different files and
 * a stale `collection.set(uri, [])` for the "extra" casing can clobber the
 * real diagnostics set moments earlier for the differently-cased URI that VS
 * Code resolves to the identical resource. Normalizing every file-identity
 * string through this function before it's used as a map key or diagnostic
 * target keeps a single canonical key per real file.
 */
export function normalizeFileKey(file: string): string {
  return vscode.Uri.file(file).fsPath;
}

/**
 * Builds a line-text lookup that prefers an already-open editor buffer (live,
 * possibly-unsaved content) and falls back to reading the file from disk.
 */
export function createLineTextLookup(): LineTextLookup {
  return (file: string, line: number): string | undefined => {
    const normalized = normalizeFileKey(file);
    const openDoc = vscode.workspace.textDocuments.find((doc) => doc.uri.fsPath === normalized);
    if (openDoc) {
      if (line < 1 || line > openDoc.lineCount) return undefined;
      return openDoc.lineAt(line - 1).text;
    }
    try {
      const content = fs.readFileSync(normalized, 'utf-8');
      const lines = content.split(/\r\n|\r|\n/);
      return lines[line - 1];
    } catch {
      return undefined;
    }
  };
}

function toVscodeRange(range: ReturnType<typeof findingToRange>): vscode.Range {
  return new vscode.Range(range.startLine, range.startCol, range.endLine, range.endCol);
}

/**
 * Builds per-file diagnostics for the three v1 finding types. `unauditable`
 * is intentionally omitted — deferred to a later version per the plan.
 */
export function buildDiagnosticsByFile(
  analysis: AnalysisResult,
  lineTextLookup: LineTextLookup,
): Map<string, vscode.Diagnostic[]> {
  const byFile = new Map<string, vscode.Diagnostic[]>();

  const push = (file: string, diagnostic: vscode.Diagnostic): void => {
    const key = normalizeFileKey(file);
    const list = byFile.get(key);
    if (list) list.push(diagnostic);
    else byFile.set(key, [diagnostic]);
  };

  for (const access of analysis.readButUndeclared) {
    const range = findingToRange('readButUndeclared', access, lineTextLookup(access.file, access.line));
    const diagnostic = new vscode.Diagnostic(
      toVscodeRange(range),
      `"${access.name}" is read from process.env but is not declared in any .env file.`,
      vscode.DiagnosticSeverity.Warning,
    );
    diagnostic.source = SOURCE;
    diagnostic.code = 'read-but-undeclared';
    push(access.file, diagnostic);
  }

  for (const exposed of analysis.clientExposed) {
    const range = findingToRange('clientExposed', exposed, lineTextLookup(exposed.file, exposed.line));
    const reason =
      exposed.reason === 'secret-pattern'
        ? `matches secret pattern "${exposed.secretPattern}"`
        : 'is missing the required "NEXT_PUBLIC_" prefix';
    const diagnostic = new vscode.Diagnostic(
      toVscodeRange(range),
      `"${exposed.name}" is exposed to the client bundle and ${reason}.`,
      vscode.DiagnosticSeverity.Error,
    );
    diagnostic.source = SOURCE;
    diagnostic.code =
      exposed.reason === 'secret-pattern' ? 'client-exposed-secret-pattern' : 'client-exposed-missing-prefix';
    push(exposed.file, diagnostic);
  }

  for (const decl of analysis.declaredButUnread) {
    const range = findingToRange('declaredButUnread', decl, lineTextLookup(decl.source, decl.line));
    const diagnostic = new vscode.Diagnostic(
      toVscodeRange(range),
      `"${decl.name}" is declared but never read in code.`,
      vscode.DiagnosticSeverity.Hint,
    );
    diagnostic.source = SOURCE;
    diagnostic.code = 'declared-but-unread';
    diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];
    push(decl.source, diagnostic);
  }

  return byFile;
}
