import { glob } from 'glob';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { parseEnvFile } from './parsers/env-file.js';
import { parseCodeFiles } from './parsers/code.js';
import { analyze } from './analyzers/index.js';
import { loadCache, saveCache, resolveAccesses, getDefaultCachePath } from './cache.js';
import type { AuditOptions, AuditResult, EnvDeclaration } from './types.js';

// Lazy + memoized: `version` is only read for the on-disk cache file (see the
// `saveCache` call below, gated behind `options.useCache`). Reading it eagerly
// at module load time via `createRequire(import.meta.url)` breaks consumers
// that bundle this ESM module into CommonJS (e.g. the VS Code extension's
// esbuild bundle) — esbuild can't polyfill `import.meta.url` for CJS output,
// so the top-level call throws as soon as the module is imported, even for
// callers (like `collectAuditInputs` with `useCache: false`) that never touch
// the cache at all. Deferring the read until it's actually needed means it
// only ever runs under real ESM (the CLI), where `import.meta.url` is valid.
let cachedVersion: string | undefined;
function getPackageVersion(): string {
  if (cachedVersion === undefined) {
    const require = createRequire(import.meta.url);
    cachedVersion = (require('../package.json') as { version: string }).version;
  }
  return cachedVersion;
}

const ENV_FILE_NAMES = [
  '.env',
  '.env.local',
  '.env.example',
  '.env.production',
  '.env.development',
  '.env.test',
  '.env.staging',
  '.env.production.local',
  '.env.development.local',
  '.env.test.local',
];

const SOURCE_GLOBS = ['**/*.{ts,tsx,js,jsx,mjs,cjs}'];

const DEFAULT_IGNORE = [
  '**/node_modules/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/*.d.ts',
  '**/.turbo/**',
  '**/.cache/**',
  '**/*.test.{ts,tsx,js,jsx,mjs}',
  '**/*.spec.{ts,tsx,js,jsx,mjs}',
  '**/__tests__/**',
  '**/test/**',
  '**/tests/**',
];

function collectEnvDeclarations(searchDir: string): { declarations: EnvDeclaration[]; envFiles: string[] } {
  const declarations: EnvDeclaration[] = [];
  const envFiles: string[] = [];

  for (const name of ENV_FILE_NAMES) {
    const fullPath = path.join(searchDir, name);
    if (fs.existsSync(fullPath)) {
      envFiles.push(fullPath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      declarations.push(...parseEnvFile(content, fullPath));
    }
  }

  return { declarations, envFiles };
}

export interface AuditInputs {
  declarations: EnvDeclaration[];
  accesses: ReturnType<typeof parseCodeFiles>;
  envFiles: string[];
  sourceFiles: string[];
}

export async function collectAuditInputs(options: AuditOptions): Promise<AuditInputs> {
  const dir = path.resolve(options.dir);
  const rootDir = options.rootDir ? path.resolve(options.rootDir) : undefined;
  const ignorePatterns = [...DEFAULT_IGNORE, ...(options.ignorePatterns ?? [])];

  // 1. Collect declared env vars — root first (base), then package (overlay)
  const { declarations: rootDeclarations, envFiles: rootEnvFiles } =
    rootDir && rootDir !== dir ? collectEnvDeclarations(rootDir) : { declarations: [], envFiles: [] };

  const { declarations: pkgDeclarations, envFiles: pkgEnvFiles } = collectEnvDeclarations(dir);

  // Package-level names shadow root-level names so root dupes don't inflate counts
  const pkgNames = new Set(pkgDeclarations.map((d) => d.name));
  const filteredRootDeclarations = rootDeclarations.filter((d) => !pkgNames.has(d.name));

  const declarations: EnvDeclaration[] = [...filteredRootDeclarations, ...pkgDeclarations];
  const envFiles = [...rootEnvFiles, ...pkgEnvFiles];

  // 2. Find source files
  const sourceFiles = await glob(SOURCE_GLOBS, {
    cwd: dir,
    ignore: ignorePatterns,
    absolute: true,
  });

  // 3. Parse source files for process.env accesses
  let accesses;
  let cacheEntries;

  if (options.useCache) {
    const cachePath = getDefaultCachePath(dir);
    const cache = loadCache(cachePath);
    const result = resolveAccesses(sourceFiles, cache, parseCodeFiles);
    accesses = result.accesses;
    cacheEntries = result.entries;
  } else {
    const fileContents = sourceFiles.map((f) => ({
      path: f,
      content: fs.readFileSync(f, 'utf-8'),
    }));
    accesses = parseCodeFiles(fileContents);
  }

  // Save cache if it was used
  if (options.useCache && cacheEntries) {
    const cachePath = getDefaultCachePath(dir);
    saveCache(cachePath, { version: getPackageVersion(), entries: cacheEntries });
  }

  return { declarations, accesses, envFiles, sourceFiles };
}

export async function audit(options: AuditOptions): Promise<AuditResult> {
  const dir = path.resolve(options.dir);
  const rootDir = options.rootDir ? path.resolve(options.rootDir) : undefined;

  const { declarations, accesses, envFiles, sourceFiles } = await collectAuditInputs(options);

  // Cross-reference
  const analysis = analyze(declarations, accesses, {
    extraSecretPatterns: options.secretPatterns,
  });

  // Root-level declarations that go unread in this package are not a finding —
  // they may be consumed by other packages in the workspace.
  // A "root-level" declaration is one that lives under rootDir but NOT under dir.
  const declaredButUnread = rootDir
    ? analysis.declaredButUnread.filter((d) => {
        const inRoot = d.source.startsWith(rootDir + path.sep);
        const inPkg = d.source.startsWith(dir + path.sep);
        return !(inRoot && !inPkg);
      })
    : analysis.declaredButUnread;

  return {
    scannedFiles: sourceFiles.length,
    scannedEnvFiles: envFiles.length,
    ...analysis,
    declaredButUnread,
  };
}
