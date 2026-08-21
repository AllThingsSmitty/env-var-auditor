import { describe, it, expect } from 'vitest';
import { parseCodeFiles } from '../../src/parsers/code.js';

const parse = (content: string, path = '/fake/app.ts') =>
  parseCodeFiles([{ path, content }]);

describe('parseCodeFiles — access patterns', () => {
  it('detects member access: process.env.FOO', () => {
    const accesses = parse('const x = process.env.DATABASE_URL;');
    expect(accesses).toHaveLength(1);
    expect(accesses[0]).toMatchObject({ name: 'DATABASE_URL', accessType: 'member' });
  });

  it('detects bracket access with string literal: process.env["FOO"]', () => {
    const accesses = parse('const x = process.env["DATABASE_URL"];');
    expect(accesses[0]).toMatchObject({ name: 'DATABASE_URL', accessType: 'bracket' });
  });

  it('detects bracket access with single-quote string', () => {
    const accesses = parse("const x = process.env['MY_KEY'];");
    expect(accesses[0]).toMatchObject({ name: 'MY_KEY', accessType: 'bracket' });
  });

  it('detects destructuring: const { FOO } = process.env', () => {
    const accesses = parse('const { DATABASE_URL, JWT_SECRET } = process.env;');
    expect(accesses).toHaveLength(2);
    expect(accesses.map((a) => a.name)).toEqual(
      expect.arrayContaining(['DATABASE_URL', 'JWT_SECRET']),
    );
    expect(accesses[0].accessType).toBe('destructure');
  });

  it('detects renamed destructuring: const { FOO: localFoo } = process.env', () => {
    const accesses = parse('const { DATABASE_URL: db } = process.env;');
    expect(accesses[0]).toMatchObject({ name: 'DATABASE_URL', accessType: 'destructure' });
  });

  it('flags dynamic access as unauditable', () => {
    const accesses = parse('const key = "X"; const v = process.env[key];');
    const dynamic = accesses.filter((a) => a.accessType === 'dynamic');
    expect(dynamic).toHaveLength(1);
    expect(dynamic[0].name).toBeNull();
  });
});

describe('parseCodeFiles — client file detection', () => {
  it('marks files with "use client" directive as client files', () => {
    const accesses = parse(`'use client';\nconst x = process.env.FOO;`);
    expect(accesses[0].isClientFile).toBe(true);
  });

  it('marks files without directive as server files', () => {
    const accesses = parse(`const x = process.env.FOO;`);
    expect(accesses[0].isClientFile).toBe(false);
  });

  it('handles double-quoted use client directive', () => {
    const accesses = parse(`"use client";\nconst x = process.env.FOO;`);
    expect(accesses[0].isClientFile).toBe(true);
  });

  it('does not treat "use server" as a client directive', () => {
    const accesses = parse(`"use server";\nconst x = process.env.FOO;`);
    expect(accesses[0].isClientFile).toBe(false);
  });
});

describe('parseCodeFiles — multi-file', () => {
  it('processes multiple files independently', () => {
    const accesses = parseCodeFiles([
      { path: '/fake/a.ts', content: `const x = process.env.FOO;` },
      { path: '/fake/b.ts', content: `'use client';\nconst y = process.env.BAR;` },
    ]);
    const fooAccess = accesses.find((a) => a.name === 'FOO');
    const barAccess = accesses.find((a) => a.name === 'BAR');
    expect(fooAccess?.isClientFile).toBe(false);
    expect(barAccess?.isClientFile).toBe(true);
  });
});
