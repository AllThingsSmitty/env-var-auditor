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
];

export async function audit(options: AuditOptions): Promise<AuditResult> {
  const dir = path.resolve(options.dir);
  const ignorePatterns = [...DEFAULT_IGNORE, ...(options.ignorePatterns ?? [])];

  // 1. Collect declared env vars from all .env* files
  const allDeclarations: EnvDeclaration[] = [];
  const foundEnvFiles: string[] = [];

  for (const name of ENV_FILE_NAMES) {
    const fullPath = path.join(dir, name);
    if (fs.existsSync(fullPath)) {
      foundEnvFiles.push(fullPath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      allDeclarations.push(...parseEnvFile(content, fullPath));
    }
  }

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

  return {
    scannedFiles: sourceFiles.length,
    scannedEnvFiles: foundEnvFiles.length,
    ...analysis,
  };
}
