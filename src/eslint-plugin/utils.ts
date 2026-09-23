import fs from 'fs';
import path from 'path';
import { parseEnvFile } from '../parsers/env-file.js';

export const NEXT_PUBLIC_PREFIX = 'NEXT_PUBLIC_';

export const ENV_FILE_NAMES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.env.test',
];

export const SECRET_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /^sk_/i, label: 'sk_' },
  { pattern: /^rk_/i, label: 'rk_' },
  { pattern: /^whsec_/i, label: 'whsec_' },
  { pattern: /SECRET/i, label: '*SECRET*' },
  { pattern: /PRIVATE_KEY/i, label: '*PRIVATE_KEY*' },
  { pattern: /PRIVATE/i, label: '*PRIVATE*' },
  { pattern: /PASSWORD/i, label: '*PASSWORD*' },
  { pattern: /_TOKEN$/i, label: '*_TOKEN' },
  { pattern: /^TOKEN/i, label: 'TOKEN*' },
];

const cache = new Map<string, Set<string>>();

export function loadDeclaredNames(envDir: string, envFiles?: string[]): Set<string> {
  const key = envFiles ? envFiles.slice().sort().join('\0') : `dir:${envDir}`;
  if (cache.has(key)) return cache.get(key)!;

  const filePaths = envFiles
    ? envFiles.map((f) => path.resolve(f))
    : ENV_FILE_NAMES.map((f) => path.join(envDir, f));

  const names = new Set<string>();
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const decl of parseEnvFile(content, filePath)) {
      names.add(decl.name);
    }
  }

  cache.set(key, names);
  return names;
}

export function clearCache(): void {
  cache.clear();
}
