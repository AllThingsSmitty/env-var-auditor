import { describe, beforeAll } from 'vitest';
import { RuleTester } from 'eslint';
import path from 'path';
import { fileURLToPath } from 'url';
import rule from '../../src/eslint-plugin/rules/no-undeclared-env-vars.js';
import { clearCache } from '../../src/eslint-plugin/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureEnv = path.resolve(__dirname, '../../fixtures/eslint-plugin/.env');

// RuleTester integrates with vitest globals (describe/it) internally — its
// own `.run()` call must not be nested inside an `it()` block, only inside
// `describe()` or at the top level.
const tester = new RuleTester();
const opts = [{ envFiles: [fixtureEnv] }];

describe('no-undeclared-env-vars', () => {
  beforeAll(() => clearCache());

  tester.run('no-undeclared-env-vars', rule, {
    valid: [
      { code: 'const x = process.env.DATABASE_URL;', options: opts },
      { code: 'const x = process.env.API_KEY;', options: opts },
      { code: 'const x = process.env.NEXT_PUBLIC_APP_URL;', options: opts },
      { code: "const x = process.env['JWT_SECRET'];", options: opts },
      { code: 'const { DATABASE_URL, API_KEY } = process.env;', options: opts },
      { code: 'const x = obj.env.SOMETHING;', options: opts },
      { code: 'const x = process.config.SOMETHING;', options: opts },
      { code: 'const x = process.env;', options: opts },
      { code: 'const key = "X"; const x = process.env[key];', options: opts },
    ],
    invalid: [
      {
        code: 'const x = process.env.MISSING_VAR;',
        options: opts,
        errors: [{ messageId: 'undeclared', data: { name: 'MISSING_VAR' } }],
      },
      {
        code: "const x = process.env['UNLISTED_KEY'];",
        options: opts,
        errors: [{ messageId: 'undeclared', data: { name: 'UNLISTED_KEY' } }],
      },
      {
        code: 'const { MISSING_VAR } = process.env;',
        options: opts,
        errors: [{ messageId: 'undeclared', data: { name: 'MISSING_VAR' } }],
      },
      {
        code: 'const { DATABASE_URL, GHOST_VAR } = process.env;',
        options: opts,
        errors: [{ messageId: 'undeclared', data: { name: 'GHOST_VAR' } }],
      },
    ],
  });
});
