import type { Rule } from 'eslint';
import { NEXT_PUBLIC_PREFIX, SECRET_PATTERNS } from '../utils.js';

interface Identifier { type: 'Identifier'; name: string }
interface Literal { type: 'Literal'; value: unknown }
interface MemberExpression {
  type: 'MemberExpression';
  object: { type: string; [k: string]: unknown };
  property: Identifier | Literal | { type: string; [k: string]: unknown };
  computed: boolean;
}
interface ExpressionStatement {
  type: 'ExpressionStatement';
  expression: { type: string; [k: string]: unknown };
}
interface Program {
  type: 'Program';
  body: Array<{ type: string; [k: string]: unknown }>;
}

function getProcessEnvVarName(node: MemberExpression): string | null {
  const { object, property, computed } = node;
  if (object.type !== 'MemberExpression') return null;

  const envObj = object as unknown as MemberExpression;
  const proc = envObj.object as unknown as Identifier;
  const envProp = envObj.property as unknown as Identifier;
  if (proc.type !== 'Identifier' || proc.name !== 'process') return null;
  if (envProp.type !== 'Identifier' || envProp.name !== 'env') return null;

  if (!computed && property.type === 'Identifier') {
    return (property as Identifier).name;
  }
  if (computed && property.type === 'Literal' && typeof (property as Literal).value === 'string') {
    return (property as Literal).value as string;
  }
  return null;
}

function hasUseClientDirective(program: Program): boolean {
  const first = program.body[0];
  if (!first || first.type !== 'ExpressionStatement') return false;
  const stmt = first as unknown as ExpressionStatement;
  const expr = stmt.expression as unknown as Literal;
  return expr.type === 'Literal' && expr.value === 'use client';
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow server-only env vars in client files and secrets in client-exposed vars',
      url: 'https://github.com/AllThingsSmitty/env-var-auditor#eslint-plugin',
    },
    schema: [
      {
        type: 'object',
        properties: {
          secretPatterns: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      missingPrefix:
        'Environment variable "{{name}}" is accessed in a client file but lacks the NEXT_PUBLIC_ prefix. Server-only vars must not be used in client bundles.',
      secretInClient:
        'Environment variable "{{name}}" matches secret pattern "{{pattern}}" and must not be accessed in client files.',
    },
  },

  create(context) {
    const opts = (context.options[0] ?? {}) as { secretPatterns?: string[] };
    const extraPatterns = (opts.secretPatterns ?? []).map((p) => ({
      pattern: new RegExp(p, 'i'),
      label: p,
    }));
    const allPatterns = [...SECRET_PATTERNS, ...extraPatterns];

    let isClientFile = false;

    return {
      Program(node) {
        isClientFile = hasUseClientDirective(node as unknown as Program);
      },

      MemberExpression(node) {
        if (!isClientFile) return;
        const name = getProcessEnvVarName(node as unknown as MemberExpression);
        if (name === null) return;

        const hasPublicPrefix = name.startsWith(NEXT_PUBLIC_PREFIX);
        const nameToCheck = hasPublicPrefix ? name.slice(NEXT_PUBLIC_PREFIX.length) : name;
        const secretMatch = allPatterns.find(({ pattern }) => pattern.test(nameToCheck));

        if (secretMatch) {
          context.report({
            node,
            messageId: 'secretInClient',
            data: { name, pattern: secretMatch.label },
          });
        } else if (!hasPublicPrefix) {
          context.report({ node, messageId: 'missingPrefix', data: { name } });
        }
      },
    };
  },
};

export default rule;
