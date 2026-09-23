import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../../src/eslint-plugin/rules/no-client-exposure.js';

const tester = new RuleTester();

const clientPrefix = `'use client';\n`;

describe('no-client-exposure', () => {
  it('valid: server files may access any env var', () => {
    tester.run('no-client-exposure', rule, {
      valid: [
        { code: 'const x = process.env.DATABASE_URL;' },
        { code: 'const x = process.env.JWT_SECRET;' },
        { code: 'const x = process.env.STRIPE_SECRET_KEY;' },
      ],
      invalid: [],
    });
  });

  it('valid: client files may access NEXT_PUBLIC_ vars without secret patterns', () => {
    tester.run('no-client-exposure', rule, {
      valid: [
        { code: `${clientPrefix}const x = process.env.NEXT_PUBLIC_APP_URL;` },
        { code: `${clientPrefix}const x = process.env.NEXT_PUBLIC_POSTHOG_KEY;` },
      ],
      invalid: [],
    });
  });

  it('invalid: client file accessing non-public var', () => {
    tester.run('no-client-exposure', rule, {
      valid: [],
      invalid: [
        {
          code: `${clientPrefix}const x = process.env.DATABASE_URL;`,
          errors: [{ messageId: 'missingPrefix', data: { name: 'DATABASE_URL' } }],
        },
        {
          code: `${clientPrefix}const x = process.env.API_KEY;`,
          errors: [{ messageId: 'missingPrefix', data: { name: 'API_KEY' } }],
        },
      ],
    });
  });

  it('invalid: client file accessing secret-pattern var (even with NEXT_PUBLIC_)', () => {
    tester.run('no-client-exposure', rule, {
      valid: [],
      invalid: [
        {
          // NEXT_PUBLIC_JWT_SECRET — has prefix but matches *SECRET* pattern
          code: `${clientPrefix}const x = process.env.NEXT_PUBLIC_JWT_SECRET;`,
          errors: [{ messageId: 'secretInClient' }],
        },
        {
          // NEXT_PUBLIC_STRIPE_SK — matches sk_ pattern after stripping prefix
          code: `${clientPrefix}const x = process.env.NEXT_PUBLIC_SK_LIVE_KEY;`,
          errors: [{ messageId: 'secretInClient' }],
        },
      ],
    });
  });

  it('invalid: client file accessing server-only secret var (no prefix)', () => {
    tester.run('no-client-exposure', rule, {
      valid: [],
      invalid: [
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
      ],
    });
  });

  it('valid: extra secretPatterns option accepted', () => {
    tester.run('no-client-exposure', rule, {
      valid: [
        // CUSTOM_KEY doesn't match any built-in or extra pattern, has NEXT_PUBLIC_
        {
          code: `${clientPrefix}const x = process.env.NEXT_PUBLIC_CUSTOM_KEY;`,
          options: [{ secretPatterns: ['INTERNAL'] }],
        },
      ],
      invalid: [],
    });
  });

  it('invalid: extra secretPatterns option triggers on match', () => {
    tester.run('no-client-exposure', rule, {
      valid: [],
      invalid: [
        {
          code: `${clientPrefix}const x = process.env.NEXT_PUBLIC_INTERNAL_API;`,
          options: [{ secretPatterns: ['INTERNAL'] }],
          errors: [{ messageId: 'secretInClient' }],
        },
      ],
    });
  });

  it('valid: non-process.env accesses in client files are ignored', () => {
    tester.run('no-client-exposure', rule, {
      valid: [
        { code: `${clientPrefix}const x = obj.env.SOMETHING;` },
        { code: `${clientPrefix}const x = process.config.SOMETHING;` },
      ],
      invalid: [],
    });
  });
});
