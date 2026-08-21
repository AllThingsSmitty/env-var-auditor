import type {
  EnvDeclaration,
  EnvAccess,
  ClientExposedVar,
} from '../types.js';

const NEXT_PUBLIC_PREFIX = 'NEXT_PUBLIC_';

// Order matters: more-specific patterns must precede general ones because
// Array.find returns the first match (e.g. PRIVATE_KEY before PRIVATE).
const SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
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

interface AnalysisResult {
  declaredButUnread: EnvDeclaration[];
  readButUndeclared: EnvAccess[];
  clientExposed: ClientExposedVar[];
  unauditable: EnvAccess[];
}

export function analyze(
  declarations: EnvDeclaration[],
  accesses: EnvAccess[],
): AnalysisResult {
  const declaredNames = new Set(declarations.map((d) => d.name));

  // Named accesses only (excludes dynamic)
  const namedAccesses = accesses.filter(
    (a): a is EnvAccess & { name: string } => a.name !== null,
  );
  const readNames = new Set(namedAccesses.map((a) => a.name));

  // 1. Declared but never read in code
  const declaredButUnread = declarations.filter((d) => !readNames.has(d.name));

  // 2. Read in code but not declared in any env file
  // Deduplicate by name — record only the first occurrence of each missing var
  const undeclaredMap = new Map<string, EnvAccess>();
  for (const access of namedAccesses) {
    if (!declaredNames.has(access.name) && !undeclaredMap.has(access.name)) {
      undeclaredMap.set(access.name, access);
    }
  }
  const readButUndeclared = [...undeclaredMap.values()];

  // 3. Client-exposed — vars accessed from client-bundle code
  // Deduplicate by name: report each exposed var once (first occurrence)
  const clientExposedMap = new Map<string, ClientExposedVar>();
  for (const access of namedAccesses) {
    if (!access.isClientFile) continue;
    if (clientExposedMap.has(access.name)) continue;

    const hasPublicPrefix = access.name.startsWith(NEXT_PUBLIC_PREFIX);
    // Strip the public prefix before checking secret patterns so that
    // NEXT_PUBLIC_SK_LIVE_KEY is tested as SK_LIVE_KEY against /^sk_/i.
    const nameToCheck = hasPublicPrefix
      ? access.name.slice(NEXT_PUBLIC_PREFIX.length)
      : access.name;
    const secretMatch = SECRET_PATTERNS.find(({ pattern }) =>
      pattern.test(nameToCheck),
    );

    if (!hasPublicPrefix) {
      clientExposedMap.set(access.name, {
        name: access.name,
        file: access.file,
        line: access.line,
        reason: 'missing-prefix',
      });
    } else if (secretMatch) {
      clientExposedMap.set(access.name, {
        name: access.name,
        file: access.file,
        line: access.line,
        reason: 'secret-pattern',
        secretPattern: secretMatch.label,
      });
    }
  }
  const clientExposed = [...clientExposedMap.values()];

  // 4. Unauditable — dynamic key access
  const unauditable = accesses.filter((a) => a.accessType === 'dynamic');

  return { declaredButUnread, readButUndeclared, clientExposed, unauditable };
}
