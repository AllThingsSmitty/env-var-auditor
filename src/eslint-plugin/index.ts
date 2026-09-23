import type { Rule } from 'eslint';
import noUndeclaredEnvVars from './rules/no-undeclared-env-vars.js';
import noClientExposure from './rules/no-client-exposure.js';

const rules: Record<string, Rule.RuleModule> = {
  'no-undeclared-env-vars': noUndeclaredEnvVars,
  'no-client-exposure': noClientExposure,
};

const plugin = {
  meta: {
    name: 'env-var-auditor',
    version: '0.8.0',
  },
  rules,
  configs: {} as Record<string, unknown>,
};

plugin.configs = {
  recommended: {
    plugins: { 'env-var-auditor': plugin },
    rules: {
      'env-var-auditor/no-undeclared-env-vars': 'warn',
      'env-var-auditor/no-client-exposure': 'error',
    },
  },
};

export default plugin;
export { clearCache } from './utils.js';
