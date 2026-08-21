import { describe, it, expect } from 'vitest';
import { analyze } from '../../src/analyzers/index.js';
import type { EnvDeclaration, EnvAccess } from '../../src/types.js';

const decl = (name: string): EnvDeclaration => ({
  name,
  value: 'val',
  source: '/project/.env.example',
  line: 1,
});

const access = (
  name: string,
  isClientFile = false,
): EnvAccess => ({
  name,
  accessType: 'member',
  file: '/project/app.ts',
  line: 5,
  column: 0,
  isClientFile,
});

const dynAccess = (): EnvAccess => ({
  name: null,
  accessType: 'dynamic',
  file: '/project/app.ts',
  line: 10,
  column: 0,
  isClientFile: false,
});

describe('analyze — declared but unread', () => {
  it('flags vars declared in env files but never accessed in code', () => {
    const result = analyze([decl('UNUSED_VAR'), decl('USED_VAR')], [access('USED_VAR')]);
    expect(result.declaredButUnread).toHaveLength(1);
    expect(result.declaredButUnread[0].name).toBe('UNUSED_VAR');
  });

  it('returns empty when all declared vars are read', () => {
    const result = analyze([decl('FOO')], [access('FOO')]);
    expect(result.declaredButUnread).toHaveLength(0);
  });
});

describe('analyze — read but undeclared', () => {
  it('flags vars read in code but missing from env files', () => {
    const result = analyze([decl('DECLARED')], [access('DECLARED'), access('MISSING')]);
    expect(result.readButUndeclared).toHaveLength(1);
    expect(result.readButUndeclared[0].name).toBe('MISSING');
  });

  it('deduplicates — same undeclared var read multiple times appears once', () => {
    const result = analyze([], [access('MISSING'), access('MISSING')]);
    expect(result.readButUndeclared).toHaveLength(1);
  });
});

describe('analyze — client-exposed', () => {
  it('flags server-only vars accessed in client files (missing prefix)', () => {
    const result = analyze(
      [decl('DATABASE_URL')],
      [{ ...access('DATABASE_URL', true) }],
    );
    expect(result.clientExposed).toHaveLength(1);
    expect(result.clientExposed[0]).toMatchObject({
      name: 'DATABASE_URL',
      reason: 'missing-prefix',
    });
  });

  it('does not flag NEXT_PUBLIC_ vars in client files (no secret pattern)', () => {
    const result = analyze(
      [decl('NEXT_PUBLIC_APP_URL')],
      [access('NEXT_PUBLIC_APP_URL', true)],
    );
    expect(result.clientExposed).toHaveLength(0);
  });

  it('does not flag NEXT_PUBLIC_POSTHOG_KEY — analytics keys are not secrets', () => {
    const result = analyze(
      [decl('NEXT_PUBLIC_POSTHOG_KEY')],
      [access('NEXT_PUBLIC_POSTHOG_KEY', true)],
    );
    expect(result.clientExposed).toHaveLength(0);
  });

  it('deduplicates clientExposed by name across multiple files', () => {
    const makeAccess = (file: string): EnvAccess => ({
      name: 'DATABASE_URL',
      accessType: 'member',
      file,
      line: 1,
      column: 0,
      isClientFile: true,
    });
    const result = analyze(
      [decl('DATABASE_URL')],
      [makeAccess('/a.tsx'), makeAccess('/b.tsx'), makeAccess('/c.tsx')],
    );
    expect(result.clientExposed).toHaveLength(1);
    expect(result.clientExposed[0].file).toBe('/a.tsx');
  });

  it('flags NEXT_PUBLIC_ vars matching a secret pattern', () => {
    const result = analyze(
      [decl('NEXT_PUBLIC_SK_LIVE_KEY')],
      [access('NEXT_PUBLIC_SK_LIVE_KEY', true)],
    );
    expect(result.clientExposed).toHaveLength(1);
    expect(result.clientExposed[0]).toMatchObject({
      reason: 'secret-pattern',
      secretPattern: 'sk_',
    });
  });

  it('does not flag server-only vars in server files', () => {
    const result = analyze(
      [decl('DATABASE_URL')],
      [access('DATABASE_URL', false)],
    );
    expect(result.clientExposed).toHaveLength(0);
  });
});

describe('analyze — unauditable', () => {
  it('collects dynamic accesses into unauditable bucket', () => {
    const result = analyze([], [dynAccess()]);
    expect(result.unauditable).toHaveLength(1);
    expect(result.unauditable[0].accessType).toBe('dynamic');
  });
});
