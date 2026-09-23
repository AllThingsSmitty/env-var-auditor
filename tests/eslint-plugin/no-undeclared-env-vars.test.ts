import { describe, it, beforeEach } from 'vitest';
import { RuleTester } from 'eslint';
import path from 'path';
import { fileURLToPath } from 'url';
import rule from '../../src/eslint-plugin/rules/no-undeclared-env-vars.js';
import { clearCache } from '../../src/eslint-plugin/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureEnv = path.resolve(__dirname, '../../fixtures/eslint-plugin/.env');

// RuleTester integrates with vitest globals (describe/it) when globals: true
const tester = new RuleTester();

const opts = [{ envFiles: [fixtureEnv] }];

describe('no-undeclared-env-vars', () => {
  beforeEach(() => clearCache());

  it('valid: declared member access', () => {
    tester.run('no-undeclared-env-vars', rule, {
      valid: [
        { code: 'const x = process.env.DATABASE_URL;', options: opts },
        { code: 'const x = process.env.API_KEY;', options: opts },
        { code: 'const x = process.env.NEXT_PUBLIC_APP_URL;', options: opts },
        { code: "const x = process.env['JWT_SECRET'];", options: opts },
      ],
      invalid: [],
    });
  });

  it('invalid: undeclared member access is reported', () => {
    tester.run('no-undeclared-env-vars', rule, {
      valid: [],
      invalid: [
        {
          code: 'const x = process.env.MISSING_VAR;',
          options: opts,
          errors: [{ messageId: 'undeclared', data: { name: 'MISSING_VAR' } }],
        },
      ],
    });
  });

  it('invalid: bracket access with undeclared key', () => {
    tester.run('no-undeclared-env-vars', rule, {
      valid: [],
      invalid: [
        {
          code: "const x = process.env['UNLISTED_KEY'];",
          options: opts,
          errors: [{ messageId: 'undeclared', data: { name: 'UNLISTED_KEY' } }],
        },
      ],
    });
  });

  it('valid: destructured declared vars', () => {
    tester.run('no-undeclared-env-vars', rule, {
      valid: [
        {
          code: 'const { DATABASE_URL, API_KEY } = process.env;',
          options: opts,
        },
      ],
      invalid: [],
    });
  });

  it('invalid: destructured undeclared var', () => {
    tester.run('no-undeclared-env-vars', rule, {
      valid: [],
      invalid: [
        {
          code: 'const { MISSING_VAR } = process.env;',
          options: opts,
          errors: [{ messageId: 'undeclared', data: { name: 'MISSING_VAR' } }],
        },
      ],
    });
  });

  it('invalid: mixed destructure — only undeclared keys reported', () => {
    tester.run('no-undeclared-env-vars', rule, {
      valid: [],
      invalid: [
        {
          code: 'const { DATABASE_URL, GHOST_VAR } = process.env;',
          options: opts,
          errors: [{ messageId: 'undeclared', data: { name: 'GHOST_VAR' } }],
        },
      ],
    });
  });

  it('valid: non-process.env member expressions are not flagged', () => {
    tester.run('no-undeclared-env-vars', rule, {
      valid: [
        { code: 'const x = obj.env.SOMETHING;', options: opts },
        { code: 'const x = process.config.SOMETHING;', options: opts },
        { code: 'const x = process.env;', options: opts },
      ],
      invalid: [],
    });
  });

  it('valid: dynamic access (computed non-literal) is ignored', () => {
    tester.run('no-undeclared-env-vars', rule, {
      valid: [
        { code: 'const key = "X"; const x = process.env[key];', options: opts },
      ],
      invalid: [],
    });
  });
});
