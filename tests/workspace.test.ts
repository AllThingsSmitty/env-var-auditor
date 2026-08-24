import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { audit } from '../src/audit.js';
import { auditWorkspace } from '../src/workspace.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONOREPO_DIR = path.join(__dirname, '../fixtures/monorepo-sample');
const API_DIR = path.join(MONOREPO_DIR, 'packages/api');
const WEB_DIR = path.join(MONOREPO_DIR, 'packages/web');

describe('rootDir env-file inheritance (audit)', () => {
  it('root-level vars count as declared in package scope', async () => {
    const result = await audit({ dir: API_DIR, rootDir: MONOREPO_DIR });

    // DATABASE_URL and REDIS_URL come from root .env — should NOT appear as readButUndeclared
    const undeclaredNames = result.readButUndeclared.map((d) => d.name);
    expect(undeclaredNames).not.toContain('DATABASE_URL');
    expect(undeclaredNames).not.toContain('REDIS_URL');

    // MISSING_API_VAR is not in root or package env — must appear as readButUndeclared
    expect(undeclaredNames).toContain('MISSING_API_VAR');
  });

  it('root-only unused vars are NOT flagged as declaredButUnread in a package', async () => {
    const result = await audit({ dir: API_DIR, rootDir: MONOREPO_DIR });

    // ROOT_ONLY_UNUSED is in root .env but not read by the api package
    // It should NOT appear as a finding (it may be consumed by another package)
    const unusedNames = result.declaredButUnread.map((d) => d.name);
    expect(unusedNames).not.toContain('ROOT_ONLY_UNUSED');
  });

  it('package-level unused vars ARE flagged as declaredButUnread', async () => {
    const result = await audit({ dir: API_DIR, rootDir: MONOREPO_DIR });

    // UNUSED_API_VAR is declared in packages/api/.env but never read
    const unusedNames = result.declaredButUnread.map((d) => d.name);
    expect(unusedNames).toContain('UNUSED_API_VAR');
  });
});

describe('auditWorkspace', () => {
  it('discovers both packages from pnpm-workspace.yaml', async () => {
    const workspace = await auditWorkspace({ rootDir: MONOREPO_DIR });

    const names = workspace.packages.map((p) => p.packageName);
    expect(names).toContain('@monorepo-sample/api');
    expect(names).toContain('@monorepo-sample/web');
  });

  it('returns correct packageDir for each package', async () => {
    const workspace = await auditWorkspace({ rootDir: MONOREPO_DIR });

    const api = workspace.packages.find((p) => p.packageName === '@monorepo-sample/api');
    const web = workspace.packages.find((p) => p.packageName === '@monorepo-sample/web');

    expect(api?.packageDir).toBe(path.resolve(API_DIR));
    expect(web?.packageDir).toBe(path.resolve(WEB_DIR));
  });

  it('api package — MISSING_API_VAR is readButUndeclared, root-level vars are not', async () => {
    const workspace = await auditWorkspace({ rootDir: MONOREPO_DIR });

    const api = workspace.packages.find((p) => p.packageName === '@monorepo-sample/api')!;
    const undeclaredNames = api.result.readButUndeclared.map((d) => d.name);

    expect(undeclaredNames).toContain('MISSING_API_VAR');
    expect(undeclaredNames).not.toContain('DATABASE_URL');
    expect(undeclaredNames).not.toContain('REDIS_URL');
    expect(undeclaredNames).not.toContain('API_SECRET');
  });

  it('web package — DATABASE_URL in a client file is client-exposed', async () => {
    const workspace = await auditWorkspace({ rootDir: MONOREPO_DIR });

    const web = workspace.packages.find((p) => p.packageName === '@monorepo-sample/web')!;
    const clientNames = web.result.clientExposed.map((v) => v.name);

    expect(clientNames).toContain('DATABASE_URL');
    const finding = web.result.clientExposed.find((v) => v.name === 'DATABASE_URL');
    expect(finding?.reason).toBe('missing-prefix');
  });

  it('throws when no packages are found', async () => {
    // Point at a dir that has no packages/ or apps/ subdirectory
    await expect(auditWorkspace({ rootDir: MONOREPO_DIR + '/packages/api' })).rejects.toThrow(
      /No packages found/,
    );
  });
});
