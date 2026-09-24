import { describe, it, expect } from 'vitest';
import { ProjectState, computeFilesToRepublish } from '../src/projectState.js';
import type { EnvAccess, EnvDeclaration } from 'env-var-auditor';

function decl(name: string, source: string, line = 1): EnvDeclaration {
  return { name, value: 'x', source, line };
}

function access(name: string, file: string, line = 1, isClientFile = false): EnvAccess {
  return { name, accessType: 'member', file, line, column: 0, isClientFile };
}

describe('ProjectState — updateDeclarations / updateAccesses / removeFile', () => {
  it('stores and retrieves per-file declarations and accesses', () => {
    const state = new ProjectState();
    state.updateDeclarations('/repo/.env', [decl('FOO', '/repo/.env')]);
    state.updateAccesses('/repo/src/a.ts', [access('FOO', '/repo/src/a.ts')]);

    expect(state.getAllDeclarations()).toHaveLength(1);
    expect(state.getAllAccesses()).toHaveLength(1);
    expect(state.hasFile('/repo/.env')).toBe(true);
    expect(state.hasFile('/repo/src/a.ts')).toBe(true);
    expect(state.hasFile('/repo/src/b.ts')).toBe(false);
  });

  it('replacing a file only replaces that file\'s slice, not the whole project', () => {
    const state = new ProjectState();
    state.updateAccesses('/repo/src/a.ts', [access('FOO', '/repo/src/a.ts')]);
    state.updateAccesses('/repo/src/b.ts', [access('BAR', '/repo/src/b.ts')]);

    state.updateAccesses('/repo/src/a.ts', [access('FOO', '/repo/src/a.ts'), access('BAZ', '/repo/src/a.ts')]);

    const names = state.getAllAccesses().map((a) => a.name).sort();
    expect(names).toEqual(['BAR', 'BAZ', 'FOO']);
  });

  it('removeFile drops a file from both maps', () => {
    const state = new ProjectState();
    state.updateDeclarations('/repo/.env', [decl('FOO', '/repo/.env')]);
    state.updateAccesses('/repo/.env', []); // no-op, but exercise both maps independently
    state.updateAccesses('/repo/src/a.ts', [access('FOO', '/repo/src/a.ts')]);

    state.removeFile('/repo/.env');

    expect(state.hasFile('/repo/.env')).toBe(false);
    expect(state.getAllDeclarations()).toHaveLength(0);
    expect(state.getAllAccesses()).toHaveLength(1);
  });

  it('discards a stale-version write (older version than already recorded)', () => {
    const state = new ProjectState();
    expect(state.updateAccesses('/repo/src/a.ts', [access('FOO', '/repo/src/a.ts')], 5)).toBe(true);
    // A slower/older debounce timer fires after a newer one already landed.
    const accepted = state.updateAccesses('/repo/src/a.ts', [access('STALE', '/repo/src/a.ts')], 3);
    expect(accepted).toBe(false);
    expect(state.getAllAccesses().map((a) => a.name)).toEqual(['FOO']);
  });

  it('accepts a newer-version write over an older one', () => {
    const state = new ProjectState();
    state.updateDeclarations('/repo/.env', [decl('OLD', '/repo/.env')], 1);
    const accepted = state.updateDeclarations('/repo/.env', [decl('NEW', '/repo/.env')], 2);
    expect(accepted).toBe(true);
    expect(state.getAllDeclarations().map((d) => d.name)).toEqual(['NEW']);
  });

  it('writes without a version are always accepted (disk-change path)', () => {
    const state = new ProjectState();
    state.updateAccesses('/repo/src/a.ts', [access('FOO', '/repo/src/a.ts')], 10);
    const accepted = state.updateAccesses('/repo/src/a.ts', [access('BAR', '/repo/src/a.ts')]);
    expect(accepted).toBe(true);
    expect(state.getAllAccesses().map((a) => a.name)).toEqual(['BAR']);
  });
});

describe('ProjectState — analyze()', () => {
  it('re-analyzes against the flattened union of declarations and accesses', () => {
    const state = new ProjectState();
    state.updateDeclarations('/repo/.env', [decl('DECLARED_UNREAD', '/repo/.env')]);
    state.updateAccesses('/repo/src/a.ts', [access('READ_UNDECLARED', '/repo/src/a.ts')]);

    const result = state.analyze();
    expect(result.declaredButUnread.map((d) => d.name)).toEqual(['DECLARED_UNREAD']);
    expect(result.readButUndeclared.map((a) => a.name)).toEqual(['READ_UNDECLARED']);
  });

  it('seedAll replaces all prior state in one bulk load', () => {
    const state = new ProjectState();
    state.updateDeclarations('/repo/.env', [decl('OLD', '/repo/.env')]);
    state.seedAll([decl('NEW', '/repo/.env.local')], [access('FOO', '/repo/src/a.ts')]);

    expect(state.getAllDeclarations().map((d) => d.name)).toEqual(['NEW']);
    expect(state.getAllAccesses().map((a) => a.name)).toEqual(['FOO']);
  });
});

describe('ProjectState — filesToRepublish() union correctness', () => {
  it('is the union of current finding files and last-published files', () => {
    const state = new ProjectState();
    state.setLastPublishedFiles(['/repo/a.ts', '/repo/b.ts']);
    const result = state.filesToRepublish(['/repo/b.ts', '/repo/c.ts']);
    expect([...result].sort()).toEqual(['/repo/a.ts', '/repo/b.ts', '/repo/c.ts']);
  });

  it('includes a file that had findings last round but has none now (needs clearing)', () => {
    const state = new ProjectState();
    state.setLastPublishedFiles(['/repo/a.ts']);
    const result = state.filesToRepublish([]);
    expect([...result]).toEqual(['/repo/a.ts']);
  });

  it('returns an empty set when nothing is published and nothing is current', () => {
    const state = new ProjectState();
    expect(state.filesToRepublish([]).size).toBe(0);
  });
});

describe('computeFilesToRepublish (standalone helper)', () => {
  it('matches ProjectState.filesToRepublish for the same inputs', () => {
    expect([...computeFilesToRepublish(['x', 'y'], ['y', 'z'])].sort()).toEqual(['x', 'y', 'z']);
  });
});
