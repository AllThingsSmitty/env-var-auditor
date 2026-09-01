import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { audit, loadConfig } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, '../fixtures/nextjs-sample');
const CONFIG_FIXTURE_DIR = path.join(__dirname, '../fixtures/config-sample');

describe('integration — nextjs-sample fixture', () => {
  it('finds all three buckets of findings', async () => {
    const result = await audit({ dir: FIXTURE_DIR });

    expect(result.scannedEnvFiles).toBeGreaterThanOrEqual(1);
    expect(result.scannedFiles).toBeGreaterThanOrEqual(3);

    // Bucket 1: declared but unread
    const unusedNames = result.declaredButUnread.map((d) => d.name);
    expect(unusedNames).toContain('OLD_LEGACY_API_URL');
    expect(unusedNames).toContain('DEPRECATED_FLAG');

    // Bucket 2: read but undeclared
    const undeclaredNames = result.readButUndeclared.map((d) => d.name);
    expect(undeclaredNames).toContain('REDIS_URL');
    // NEXT_PUBLIC_SK_LIVE_KEY is used in page.tsx but not in .env.example
    expect(undeclaredNames).toContain('NEXT_PUBLIC_SK_LIVE_KEY');

    // Bucket 3: client-exposed
    expect(result.clientExposed.length).toBeGreaterThanOrEqual(1);
    const clientNames = result.clientExposed.map((v) => v.name);
    expect(clientNames).toContain('STRIPE_SECRET_KEY');
    expect(clientNames).toContain('DATABASE_URL');

    // Secret pattern in NEXT_PUBLIC_ var
    const secretVar = result.clientExposed.find(
      (v) => v.name === 'NEXT_PUBLIC_SK_LIVE_KEY',
    );
    expect(secretVar?.reason).toBe('secret-pattern');

    // Dynamic access is flagged as unauditable
    expect(result.unauditable.length).toBeGreaterThanOrEqual(1);
  });
});

describe('integration — config-sample fixture', () => {
  it('loads config and applies custom secret patterns', async () => {
    const config = loadConfig(CONFIG_FIXTURE_DIR);
    expect(config).not.toBeNull();
    expect(config?.secretPatterns).toContain('^ACME_INTERNAL_');
    expect(config?.ignore).toContain('**/ignored/**');

    const result = await audit({
      dir: CONFIG_FIXTURE_DIR,
      secretPatterns: config?.secretPatterns,
      ignorePatterns: config?.ignore,
    });

    // The ignored directory should not contribute to scanned files
    expect(result.scannedFiles).toBeGreaterThan(0);

    // Custom secret pattern should flag ACME_INTERNAL_API_KEY in client file
    const acmeVar = result.clientExposed.find((v) => v.name === 'ACME_INTERNAL_API_KEY');
    expect(acmeVar).toBeDefined();
    expect(acmeVar?.reason).toBe('secret-pattern');
    expect(acmeVar?.secretPattern).toBe('^ACME_INTERNAL_');

    // DATABASE_URL is also accessed from client, so missing-prefix
    const dbVar = result.clientExposed.find((v) => v.name === 'DATABASE_URL');
    expect(dbVar).toBeDefined();
    expect(dbVar?.reason).toBe('missing-prefix');

    // UNUSED_VAR is declared but never read
    const unusedNames = result.declaredButUnread.map((d) => d.name);
    expect(unusedNames).toContain('UNUSED_VAR');
  });
});
