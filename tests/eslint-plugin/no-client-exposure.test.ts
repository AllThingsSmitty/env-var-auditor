import { describe } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../../src/eslint-plugin/rules/no-client-exposure.js';

// RuleTester integrates with vitest globals (describe/it) internally — its
// own `.run()` call must not be nested inside an `it()` block, only inside
// `describe()` or at the top level.
const tester = new RuleTester();
const clientPrefix = `'use client';\n`;

describe('no-client-exposure', () => {
  tester.run('no-client-exposure', rule, {
    valid: [
      // Server files may access any env var
      { code: 'const x = process.env.DATABASE_URL;' },
      { code: 'const x = process.env.JWT_SECRET;' },
      { code: 'const x = process.env.STRIPE_SECRET_KEY;' },

      // Client files may access NEXT_PUBLIC_ vars without secret patterns
      { code: `${clientPrefix}const x = process.env.NEXT_PUBLIC_APP_URL;` },
      { code: `${clientPrefix}const x = process.env.NEXT_PUBLIC_POSTHOG_KEY;` },

      // Extra secretPatterns option doesn't false-positive on non-matching names
      {
        code: `${clientPrefix}const x = process.env.NEXT_PUBLIC_CUSTOM_KEY;`,
        options: [{ secretPatterns: ['INTERNAL'] }],
      },

      // Non-process.env accesses in client files are ignored
      { code: `${clientPrefix}const x = obj.env.SOMETHING;` },
      { code: `${clientPrefix}const x = process.config.SOMETHING;` },
    ],
    invalid: [
      // Client file accessing non-public var
      {
        code: `${clientPrefix}const x = process.env.DATABASE_URL;`,
        errors: [{ messageId: 'missingPrefix', data: { name: 'DATABASE_URL' } }],
      },
      {
        code: `${clientPrefix}const x = process.env.API_KEY;`,
        errors: [{ messageId: 'missingPrefix', data: { name: 'API_KEY' } }],
      },

      // Client file accessing secret-pattern var (even with NEXT_PUBLIC_)
      {
        // NEXT_PUBLIC_JWT_SECRET — has prefix but matches *SECRET* pattern
        code: `${clientPrefix}const x = process.env.NEXT_PUBLIC_JWT_SECRET;`,
        errors: [{ messageId: 'secretInClient' }],
      },
      {
        // NEXT_PUBLIC_SK_LIVE_KEY — matches sk_ pattern after stripping prefix
        code: `${clientPrefix}const x = process.env.NEXT_PUBLIC_SK_LIVE_KEY;`,
        errors: [{ messageId: 'secretInClient' }],
      },

      // Client file accessing server-only secret var (no prefix)
      {
        code: `${clientPrefix}const x = process.env.STRIPE_SECRET_KEY;`,
        errors: [{ messageId: 'secretInClient' }],
      },
      {
        code: `${clientPrefix}const x = process.env.DB_PASSWORD;`,
        errors: [{ messageId: 'secretInClient' }],
      },
      {
        code: `${clientPrefix}const x = process.env.AUTH_TOKEN;`,
        errors: [{ messageId: 'secretInClient' }],
      },

      // Extra secretPatterns option triggers on match
      {
        code: `${clientPrefix}const x = process.env.NEXT_PUBLIC_INTERNAL_API;`,
        options: [{ secretPatterns: ['INTERNAL'] }],
        errors: [{ messageId: 'secretInClient' }],
      },
    ],
  });
});
