import type { EnvDeclaration } from 'env-var-auditor';

// Matches <environmentVariable name="FOO" ... /> in any attribute order.
const ENV_VAR_RE = /<environmentVariable\s[^>]*\bname="([^"]+)"/g;

export function parseWebConfigFile(content: string, filePath: string): EnvDeclaration[] {
  const results: EnvDeclaration[] = [];
  ENV_VAR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ENV_VAR_RE.exec(content)) !== null) {
    results.push({ name: m[1], value: undefined, source: filePath, line: 0 });
  }
  return results;
}
