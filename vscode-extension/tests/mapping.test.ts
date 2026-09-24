import { describe, it, expect } from 'vitest';
import { findingToRange } from '../src/mapping.js';
import type { EnvAccess, ClientExposedVar, EnvDeclaration } from 'env-var-auditor';

describe('findingToRange — readButUndeclared (EnvAccess)', () => {
  it('converts the 1-based line and uses the exact 0-based column and name length', () => {
    const access: EnvAccess = {
      name: 'API_KEY',
      accessType: 'member',
      file: '/repo/src/index.ts',
      line: 10, // 1-based
      column: 4, // 0-based char offset
      isClientFile: false,
    };
    const range = findingToRange('readButUndeclared', access, 'const x = process.env.API_KEY;');
    expect(range).toEqual({ startLine: 9, startCol: 4, endLine: 9, endCol: 11 });
  });

  it('ignores lineText entirely — range comes straight from line/column/name.length', () => {
    const access: EnvAccess = {
      name: 'FOO',
      accessType: 'bracket',
      file: '/repo/src/index.ts',
      line: 1,
      column: 0,
      isClientFile: false,
    };
    const range = findingToRange('readButUndeclared', access, undefined);
    expect(range).toEqual({ startLine: 0, startCol: 0, endLine: 0, endCol: 3 });
  });
});

describe('findingToRange — clientExposed (ClientExposedVar)', () => {
  it('derives the column via indexOf(name) on the line text', () => {
    const exposed: ClientExposedVar = {
      name: 'NEXT_PUBLIC_SK_LIVE',
      file: '/repo/app/page.tsx',
      line: 3,
      reason: 'secret-pattern',
      secretPattern: 'sk_',
    };
    const lineText = '  const key = process.env.NEXT_PUBLIC_SK_LIVE;';
    const range = findingToRange('clientExposed', exposed, lineText);
    const idx = lineText.indexOf('NEXT_PUBLIC_SK_LIVE');
    expect(range).toEqual({ startLine: 2, startCol: idx, endLine: 2, endCol: idx + 'NEXT_PUBLIC_SK_LIVE'.length });
  });

  it('falls back to the whole line when the name is not found on it', () => {
    const exposed: ClientExposedVar = {
      name: 'SECRET_TOKEN',
      file: '/repo/app/page.tsx',
      line: 5,
      reason: 'missing-prefix',
    };
    const lineText = '  // stale line, var was renamed';
    const range = findingToRange('clientExposed', exposed, lineText);
    expect(range).toEqual({ startLine: 4, startCol: 0, endLine: 4, endCol: lineText.length });
  });

  it('falls back to a zero-width range when no line text is available at all', () => {
    const exposed: ClientExposedVar = {
      name: 'SECRET_TOKEN',
      file: '/repo/app/page.tsx',
      line: 5,
      reason: 'missing-prefix',
    };
    const range = findingToRange('clientExposed', exposed, undefined);
    expect(range).toEqual({ startLine: 4, startCol: 0, endLine: 4, endCol: 0 });
  });
});

describe('findingToRange — declaredButUnread (EnvDeclaration)', () => {
  it('derives the column via indexOf(name) on the line text', () => {
    const decl: EnvDeclaration = {
      name: 'UNUSED_VAR',
      value: '1',
      source: '/repo/.env',
      line: 7,
    };
    const lineText = 'UNUSED_VAR=1';
    const range = findingToRange('declaredButUnread', decl, lineText);
    expect(range).toEqual({ startLine: 6, startCol: 0, endLine: 6, endCol: 'UNUSED_VAR'.length });
  });

  it('falls back to the whole line when the name is not found on it', () => {
    const decl: EnvDeclaration = {
      name: 'UNUSED_VAR',
      value: '1',
      source: '/repo/.env',
      line: 2,
    };
    const lineText = '# a comment line that does not contain the name';
    const range = findingToRange('declaredButUnread', decl, lineText);
    expect(range).toEqual({ startLine: 1, startCol: 0, endLine: 1, endCol: lineText.length });
  });
});
