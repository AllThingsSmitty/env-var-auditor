import type { EnvDeclaration } from '../types.js';

export function parseEnvFile(content: string, filePath: string): EnvDeclaration[] {
  const declarations: EnvDeclaration[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    // Strip optional `export ` prefix
    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;

    const eqIdx = withoutExport.indexOf('=');
    if (eqIdx === -1) continue;

    const name = withoutExport.slice(0, eqIdx).trim();
    if (!name || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;

    let value: string | undefined = withoutExport.slice(eqIdx + 1);

    // Strip inline comments (outside of quotes)
    value = stripInlineComment(value).trim();

    // Unwrap surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    declarations.push({ name, value: value || undefined, source: filePath, line: i + 1 });
  }

  return declarations;
}

function stripInlineComment(raw: string): string {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) {
      return raw.slice(0, i);
    }
  }
  return raw;
}
