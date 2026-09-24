// Plain TypeScript, no `vscode` import — this is what makes live re-analysis
// unit-testable without an extension host.
import { analyze } from 'env-var-auditor';
import type { AnalysisResult, AnalyzeOptions, EnvAccess, EnvDeclaration } from 'env-var-auditor';

function pushInto<T>(map: Map<string, T[]>, key: string, item: T): void {
  const list = map.get(key);
  if (list) list.push(item);
  else map.set(key, [item]);
}

/**
 * In-memory session state for the extension: per-file declaration/access
 * arrays so a single file's slice can be swapped in O(1) instead of
 * filter+concat over the whole project, plus the set of files that currently
 * carry published diagnostics (so files that lose all findings can have
 * their squiggles explicitly cleared).
 */
export class ProjectState {
  private declarationsByFile = new Map<string, EnvDeclaration[]>();
  private accessesByFile = new Map<string, EnvAccess[]>();
  private declarationVersions = new Map<string, number>();
  private accessVersions = new Map<string, number>();
  private lastPublishedFiles = new Set<string>();

  /** Bulk-loads a full rescan's results, replacing all prior state. */
  seedAll(declarations: EnvDeclaration[], accesses: EnvAccess[]): void {
    this.declarationsByFile.clear();
    this.accessesByFile.clear();
    this.declarationVersions.clear();
    this.accessVersions.clear();

    for (const decl of declarations) pushInto(this.declarationsByFile, decl.source, decl);
    for (const access of accesses) pushInto(this.accessesByFile, access.file, access);
  }

  /**
   * Replaces one file's declarations. If `version` is given, a write whose
   * version is older than the last-seen version for that file is discarded
   * (a newer edit's debounce timer already superseded it) — returns `false`
   * in that case, `true` otherwise.
   */
  updateDeclarations(file: string, declarations: EnvDeclaration[], version?: number): boolean {
    if (version !== undefined) {
      const current = this.declarationVersions.get(file);
      if (current !== undefined && version < current) return false;
      this.declarationVersions.set(file, version);
    }
    this.declarationsByFile.set(file, declarations);
    return true;
  }

  /** Same contract as {@link updateDeclarations}, for a file's parsed accesses. */
  updateAccesses(file: string, accesses: EnvAccess[], version?: number): boolean {
    if (version !== undefined) {
      const current = this.accessVersions.get(file);
      if (current !== undefined && version < current) return false;
      this.accessVersions.set(file, version);
    }
    this.accessesByFile.set(file, accesses);
    return true;
  }

  /** Drops all tracked state for a file (deleted/renamed-away file). */
  removeFile(file: string): void {
    this.declarationsByFile.delete(file);
    this.accessesByFile.delete(file);
    this.declarationVersions.delete(file);
    this.accessVersions.delete(file);
  }

  hasFile(file: string): boolean {
    return this.declarationsByFile.has(file) || this.accessesByFile.has(file);
  }

  getAllDeclarations(): EnvDeclaration[] {
    return [...this.declarationsByFile.values()].flat();
  }

  getAllAccesses(): EnvAccess[] {
    return [...this.accessesByFile.values()].flat();
  }

  /** Re-runs `analyze()` against the flattened union of both per-file maps. */
  analyze(options?: AnalyzeOptions): AnalysisResult {
    return analyze(this.getAllDeclarations(), this.getAllAccesses(), options);
  }

  getLastPublishedFiles(): Set<string> {
    return new Set(this.lastPublishedFiles);
  }

  setLastPublishedFiles(files: Iterable<string>): void {
    this.lastPublishedFiles = new Set(files);
  }

  /**
   * Files that need their diagnostics republished this round: the union of
   * files with current findings and files that had findings last round.
   * Findings are deduplicated by name in `analyze()` (first occurrence
   * wins), so editing one file can shift a finding to a different file, or
   * drop it entirely from an unrelated file — every republish must consider
   * both sets, never just the just-edited file.
   */
  filesToRepublish(currentFindingFiles: Iterable<string>): Set<string> {
    return computeFilesToRepublish(currentFindingFiles, this.lastPublishedFiles);
  }

  clear(): void {
    this.declarationsByFile.clear();
    this.accessesByFile.clear();
    this.declarationVersions.clear();
    this.accessVersions.clear();
    this.lastPublishedFiles.clear();
  }
}

/** Pure union helper, shared with `diagnosticsPublisher.ts`. */
export function computeFilesToRepublish(
  currentFiles: Iterable<string>,
  previousFiles: Iterable<string>,
): Set<string> {
  return new Set([...currentFiles, ...previousFiles]);
}
