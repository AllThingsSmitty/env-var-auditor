import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createRequire } from 'module';
import type { EnvAccess } from './types.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

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
    return { version, entries: {} };
  }

  try {
    const content = fs.readFileSync(cachePath, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, unknown>;

    if (typeof parsed.version !== 'string' || parsed.version !== version) {
      return { version, entries: {} };
    }

    if (typeof parsed.entries !== 'object' || Array.isArray(parsed.entries)) {
      return { version, entries: {} };
    }

    return {
      version,
      entries: parsed.entries as Record<string, CacheEntry>,
    };
  } catch {
    return { version, entries: {} };
  }
}

export function saveCache(cachePath: string, cache: CacheData): void {
  const dir = path.dirname(cachePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2) + '\n', 'utf-8');
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

    // Group parsed accesses by their original file index
    const accessesByFile: Record<number, EnvAccess[]> = {};
    for (const access of parsedAccesses) {
      const fileIndex = filesToParse.findIndex((f) => f.path === access.file);
      if (fileIndex >= 0) {
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
