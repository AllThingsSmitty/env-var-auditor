import { glob } from 'glob';
import fs from 'fs';
import path from 'path';
import { parseEnvFile } from './parsers/env-file.js';
import { parseCodeFiles } from './parsers/code.js';
import { analyze } from './analyzers/index.js';
import type { AuditOptions, AuditResult, EnvDeclaration } from './types.js';

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

export async function audit(options: AuditOptions): Promise<AuditResult> {
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

  const allDeclarations: EnvDeclaration[] = [...filteredRootDeclarations, ...pkgDeclarations];
  const foundEnvFiles = [...rootEnvFiles, ...pkgEnvFiles];

  // 2. Find source files
  const sourceFiles = await glob(SOURCE_GLOBS, {
    cwd: dir,
    ignore: ignorePatterns,
    absolute: true,
  });

  // 3. Parse source files for process.env accesses
  const fileContents = sourceFiles.map((f) => ({
    path: f,
    content: fs.readFileSync(f, 'utf-8'),
  }));

  const allAccesses = parseCodeFiles(fileContents);

  // 4. Cross-reference
  const analysis = analyze(allDeclarations, allAccesses);

  // 5. Root-level declarations that go unread in this package are not a finding —
  //    they may be consumed by other packages in the workspace.
  //    A "root-level" declaration is one that lives under rootDir but NOT under dir.
  const declaredButUnread = rootDir
    ? analysis.declaredButUnread.filter((d) => {
        const inRoot = d.source.startsWith(rootDir + path.sep);
        const inPkg = d.source.startsWith(dir + path.sep);
        return !(inRoot && !inPkg);
      })
    : analysis.declaredButUnread;

  return {
    scannedFiles: sourceFiles.length,
    scannedEnvFiles: foundEnvFiles.length,
    ...analysis,
    declaredButUnread,
  };
}
