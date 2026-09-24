// Runs first (see .vscode-test.mjs's explicit `files` order): establishes
// the baseline diagnostics that liveEditing.test.ts and config.test.ts each
// perturb and then restore.
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { diagnosticCodes, getActivatedExtension, waitFor, workspaceUri } from './helpers';

suite('Extension activation & baseline diagnostics', function () {
  this.timeout(30000);

  suiteSetup(async function () {
    await getActivatedExtension();
  });

  test('activates without throwing', async function () {
    const ext = await getActivatedExtension();
    assert.equal(ext.isActive, true);
  });

  test('publishes clientExposed + readButUndeclared diagnostics for app/page.tsx', async function () {
    const uri = workspaceUri('app', 'page.tsx');

    // page.tsx is a 'use client' file that reads: STRIPE_SECRET_KEY (declared
    // secret, no NEXT_PUBLIC_ prefix -> secret-pattern), NEXT_PUBLIC_SK_LIVE_KEY
    // (prefixed but strips to "SK_LIVE_KEY" which matches /^sk_/i, and it's
    // also undeclared), DATABASE_URL (declared, no prefix -> missing-prefix),
    // and NEXT_PUBLIC_APP_URL (declared + prefixed, no finding).
    await waitFor(() => diagnosticCodes(uri).includes('client-exposed-secret-pattern'), {
      message: 'client-exposed-secret-pattern diagnostic on app/page.tsx',
    });

    const codes = diagnosticCodes(uri);
    assert.ok(
      codes.includes('client-exposed-secret-pattern'),
      `expected a secret-pattern clientExposed finding, got codes: ${codes.join(', ')}`,
    );
    assert.ok(
      codes.includes('client-exposed-missing-prefix'),
      `expected a missing-prefix clientExposed finding (DATABASE_URL), got codes: ${codes.join(', ')}`,
    );
    assert.ok(
      codes.includes('read-but-undeclared'),
      `expected a read-but-undeclared finding (NEXT_PUBLIC_SK_LIVE_KEY), got codes: ${codes.join(', ')}`,
    );

    const diags = vscode.languages.getDiagnostics(uri);
    const errors = diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.ok(errors.length >= 3, `expected at least 3 Error diagnostics on page.tsx, got ${errors.length}`);
    assert.ok(errors.every((d) => d.source === 'env-var-auditor'));
  });

  test('publishes a read-but-undeclared warning for app/api/route.ts', async function () {
    const uri = workspaceUri('app', 'api', 'route.ts');

    // route.ts reads REDIS_URL, which is never declared in .env.example.
    await waitFor(() => diagnosticCodes(uri).includes('read-but-undeclared'), {
      message: 'read-but-undeclared diagnostic on app/api/route.ts (REDIS_URL)',
    });

    const diags = vscode.languages.getDiagnostics(uri);
    const warning = diags.find((d) => d.code === 'read-but-undeclared');
    assert.ok(warning, 'expected a read-but-undeclared diagnostic on route.ts');
    assert.equal(warning?.severity, vscode.DiagnosticSeverity.Warning);
    assert.match(String(warning?.message), /REDIS_URL/);
  });

  test('publishes declared-but-unread hints for .env.example', async function () {
    const uri = workspaceUri('.env.example');

    // OLD_LEGACY_API_URL and DEPRECATED_FLAG are declared but never read
    // anywhere in the fixture's source files.
    await waitFor(
      () => diagnosticCodes(uri).filter((code) => code === 'declared-but-unread').length >= 2,
      { message: 'declared-but-unread diagnostics on .env.example' },
    );

    const diags = vscode.languages.getDiagnostics(uri);
    const hints = diags.filter((d) => d.code === 'declared-but-unread');
    assert.equal(hints.length, 2, `expected exactly 2 declared-but-unread hints, got ${hints.length}`);
    assert.ok(hints.every((d) => d.severity === vscode.DiagnosticSeverity.Hint));
    assert.ok(hints.every((d) => d.tags?.includes(vscode.DiagnosticTag.Unnecessary)));

    const messages = hints.map((d) => String(d.message));
    assert.ok(messages.some((m) => m.includes('OLD_LEGACY_API_URL')));
    assert.ok(messages.some((m) => m.includes('DEPRECATED_FLAG')));
  });
});
