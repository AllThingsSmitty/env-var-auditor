import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import type { EnvAccess } from './types.js';

// Lazy + memoized — see the comment on the equivalent helper in audit.ts:
// reading this eagerly at module load time via `createRequire(import.meta.url)`
// breaks consumers that bundle this ESM module into CommonJS (e.g. the VS
// Code extension's esbuild bundle), since esbuild can't polyfill
// `import.meta.url` for CJS output.
let cachedVersion: string | undefined;
function getPackageVersion(): string {
  if (cachedVersion === undefined) {
    const require = createRequire(import.meta.url);
    cachedVersion = (require('../package.json') as { version: string }).version;
  }
  return cachedVersion;
}

export interface CacheEntry {
  mtimeMs: number;
  size: number;
  hash: string;
  accesses: EnvAccess[];
}

export interface CacheData {
  version: string;
  entries: Record<string, CacheEntry>;
}

export function getDefaultCachePath(dir: string): string {
  return path.join(dir, '.env-auditor-cache.json');
}

export function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
}

export function loadCache(cachePath: string): CacheData {
  if (!fs.existsSync(cachePath)) {
    return { version: getPackageVersion(), entries: {} };
  }

  try {
    const content = fs.readFileSync(cachePath, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;

    if (typeof parsed.version !== 'string' || parsed.version !== getPackageVersion()) {
      return { version: getPackageVersion(), entries: {} };
    }

    if (typeof parsed.entries !== 'object' || Array.isArray(parsed.entries)) {
      return { version: getPackageVersion(), entries: {} };
    }

    return {
      version: getPackageVersion(),
      entries: parsed.entries as Record<string, CacheEntry>,
    };
  } catch {
    return { version: getPackageVersion(), entries: {} };
  }
}

export function saveCache(cachePath: string, cache: CacheData): void {
  const dir = path.dirname(cachePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
}

/**
 * Normalizes a path for identity comparison only (never used as a stored or
 * returned path) so that Windows backslash-vs-forward-slash and drive-letter
 * casing differences between two sources of the "same" path don't cause a
 * false mismatch.
 */
function normalizePathForComparison(filePath: string): string {
  const withForwardSlashes = filePath.replace(/\\/g, '/');
  return /^[a-zA-Z]:\//.test(withForwardSlashes)
    ? withForwardSlashes[0].toLowerCase() + withForwardSlashes.slice(1)
    : withForwardSlashes;
}

export function resolveAccesses(
  sourceFiles: string[],
  cache: CacheData,
  parseCodeFiles: (files: Array<{ path: string; content: string }>) => EnvAccess[],
): { accesses: EnvAccess[]; entries: Record<string, CacheEntry> } {
  const accesses: EnvAccess[] = [];
  const entries: Record<string, CacheEntry> = {};
  const filesToParse: Array<{ path: string; content: string }> = [];
  const filesToParseIndices: number[] = [];

  for (let i = 0; i < sourceFiles.length; i++) {
    const filePath = sourceFiles[i];
    const cached = cache.entries[filePath];

    // Fast path: mtime+size match
    if (cached) {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs === cached.mtimeMs && stat.size === cached.size) {
        entries[filePath] = cached;
        accesses.push(...cached.accesses);
        continue;
      }
    }

    // Fallback: hash check
    const content = fs.readFileSync(filePath, 'utf-8');
    const stat = fs.statSync(filePath);
    const currentHash = hashContent(content);

    if (cached && cached.hash === currentHash) {
      // Hash match: reuse cached accesses, update mtime/size for next run
      entries[filePath] = {
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        hash: cached.hash,
        accesses: cached.accesses,
      };
      accesses.push(...cached.accesses);
      continue;
    }

    // Cache miss: need to parse
    filesToParse.push({ path: filePath, content });
    filesToParseIndices.push(i);
  }

  // Parse all cache misses in one batch
  if (filesToParse.length > 0) {
    const parsedAccesses = parseCodeFiles(filesToParse);

    // Group parsed accesses by their original file index. Matched by
    // normalized path rather than exact string equality: `access.file` comes
    // back from ts-morph's `sourceFile.getFilePath()`, which standardizes
    // slashes and lowercases the drive letter on Windows, while `f.path`
    // here is whatever casing/separator the caller's `sourceFiles` list used
    // (typically forward-slash from `glob`, but not guaranteed to agree on
    // drive-letter case) — an exact-string mismatch here previously caused
    // every parsed access to be silently dropped on Windows.
    const indexByNormalizedPath = new Map(
      filesToParse.map((f, index) => [normalizePathForComparison(f.path), index]),
    );
    const accessesByFile: Record<number, EnvAccess[]> = {};
    for (const access of parsedAccesses) {
      const fileIndex = indexByNormalizedPath.get(normalizePathForComparison(access.file));
      if (fileIndex !== undefined) {
        if (!accessesByFile[fileIndex]) {
          accessesByFile[fileIndex] = [];
        }
        accessesByFile[fileIndex].push(access);
      }
    }

    // Store newly parsed results in entries and accesses
    for (let j = 0; j < filesToParse.length; j++) {
      const filePath = filesToParse[j].path;
      const content = filesToParse[j].content;
      const stat = fs.statSync(filePath);
      const fileAccesses = accessesByFile[j] || [];

      entries[filePath] = {
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        hash: hashContent(content),
        accesses: fileAccesses,
      };
      accesses.push(...fileAccesses);
    }
  }

  return { accesses, entries };
}
