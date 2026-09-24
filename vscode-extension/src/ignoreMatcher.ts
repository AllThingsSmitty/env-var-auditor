// Plain TypeScript, no `vscode` import.
//
// The core library's `collectAuditInputs` takes ignore patterns and globs the
// filesystem itself. The extension instead needs to test whether an
// already-known file path (an open document, an FS-watcher event) should be
// treated as ignored, without re-globbing the whole workspace — hence a
// small standalone matcher here rather than reusing `glob` directly.
import { minimatch } from 'minimatch';

/** Normalizes Windows backslashes so patterns like `**\/node_modules/**` match. */
function normalize(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

export function isIgnored(filePath: string, patterns: readonly string[]): boolean {
  if (patterns.length === 0) return false;
  const normalized = normalize(filePath);
  return patterns.some((pattern) => minimatch(normalized, pattern, { dot: true }));
}

/**
 * Additive merge of ignore-like pattern lists (used for both `ignore` and
 * `secretPatterns`), matching the CLI's precedence: config-file entries first,
 * then extension-only/CLI-flag entries, de-duplicated, order preserved.
 */
export function mergePatternLists(...lists: Array<readonly string[] | undefined>): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const pattern of list ?? []) {
      if (!seen.has(pattern)) {
        seen.add(pattern);
        merged.push(pattern);
      }
    }
  }
  return merged;
}
