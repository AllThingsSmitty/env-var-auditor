import type { Rule } from 'eslint';
import { loadDeclaredNames } from '../utils.js';

interface Identifier { type: 'Identifier'; name: string }
interface Literal { type: 'Literal'; value: unknown }
interface MemberExpression {
  type: 'MemberExpression';
  object: { type: string; [k: string]: unknown };
  property: Identifier | Literal | { type: string; [k: string]: unknown };
  computed: boolean;
}
interface ObjectPattern {
  type: 'ObjectPattern';
  properties: Array<{ type: string; [k: string]: unknown }>;
}
interface Property {
  type: 'Property';
  key: Identifier | Literal | { type: string; [k: string]: unknown };
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

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow process.env access for variables not declared in any .env file',
      url: 'https://github.com/AllThingsSmitty/env-var-auditor#eslint-plugin',
    },
    schema: [
      {
        type: 'object',
        properties: {
          envDir: { type: 'string' },
          envFiles: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      undeclared: 'Environment variable "{{name}}" is not declared in any .env file.',
    },
  },

  create(context) {
    const opts = (context.options[0] ?? {}) as { envDir?: string; envFiles?: string[] };
    const envDir = opts.envDir ?? process.cwd();
    const declared = loadDeclaredNames(envDir, opts.envFiles);

    return {
      MemberExpression(node) {
        const name = getProcessEnvVarName(node as unknown as MemberExpression);
        if (name === null || declared.has(name)) return;
        context.report({ node, messageId: 'undeclared', data: { name } });
      },

      VariableDeclarator(node) {
        const vd = node as unknown as {
          init: { type: string; object: Identifier; property: Identifier } | null;
          id: ObjectPattern | { type: string };
        };
        if (!vd.init || vd.init.type !== 'MemberExpression' || vd.id.type !== 'ObjectPattern') return;
        if (vd.init.object.type !== 'Identifier' || vd.init.object.name !== 'process') return;
        if (vd.init.property.type !== 'Identifier' || vd.init.property.name !== 'env') return;

        const pattern = vd.id as ObjectPattern;
        for (const elem of pattern.properties) {
          if (elem.type !== 'Property') continue;
          const prop = elem as unknown as Property;
          const keyName =
            prop.key.type === 'Identifier'
              ? (prop.key as Identifier).name
              : prop.key.type === 'Literal' && typeof (prop.key as Literal).value === 'string'
              ? (prop.key as Literal).value as string
              : null;
          if (!keyName || declared.has(keyName)) continue;
          context.report({
            node: prop.key as unknown as Rule.Node,
            messageId: 'undeclared',
            data: { name: keyName },
          });
        }
      },
    };
  },
};

export default rule;
