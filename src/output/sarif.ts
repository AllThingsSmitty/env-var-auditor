import { createRequire } from 'module';
import type { AuditResult, ClientExposedVar, EnvAccess, WorkspaceAuditResult } from '../types.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

interface SarifRegion {
  startLine: number;
}

interface SarifArtifactLocation {
  uri: string;
}

interface SarifPhysicalLocation {
  artifactLocation: SarifArtifactLocation;
  region?: SarifRegion;
}

interface SarifLocation {
  physicalLocation: SarifPhysicalLocation;
}

interface SarifMessage {
  text: string;
}

interface SarifResult {
  ruleId: string;
  message: SarifMessage;
  level: 'note' | 'warning' | 'error';
  locations: SarifLocation[];
}

interface SarifRuleDescriptor {
  id: string;
  shortDescription: { text: string };
  fullDescription: { text: string };
  defaultConfiguration: { level: 'note' | 'warning' | 'error' };
  properties: {
    category: string;
    precision?: string;
  };
}

interface SarifToolDriver {
  name: string;
  version: string;
  rules: SarifRuleDescriptor[];
}

interface SarifTool {
  driver: SarifToolDriver;
}

interface SarifRun {
  tool: SarifTool;
  results: SarifResult[];
  properties?: {
    packageName?: string;
    packageDir?: string;
  };
}

interface SarifLog {
  $schema: string;
  version: string;
  runs: SarifRun[];
}

const RULES: SarifRuleDescriptor[] = [
  {
    id: 'client-exposed',
    shortDescription: { text: 'Environment variable exposed to client' },
    fullDescription: {
      text: 'Variables read by client-side code may be exposed in the browser, leaking secrets. Prefix with NEXT_PUBLIC_ (Next.js) or equivalent only for non-sensitive values.',
    },
    defaultConfiguration: { level: 'error' },
    properties: {
      category: 'security',
      precision: 'high',
    },
  },
  {
    id: 'read-but-undeclared',
    shortDescription: { text: 'Environment variable read but not declared' },
    fullDescription: {
      text: 'Code references an environment variable that is not declared in .env files. This may cause runtime failures if the variable is not set.',
    },
    defaultConfiguration: { level: 'warning' },
    properties: {
      category: 'correctness',
    },
  },
  {
    id: 'declared-but-unread',
    shortDescription: { text: 'Environment variable declared but not read' },
    fullDescription: {
      text: 'An environment variable is declared in .env files but never used in the code. This may indicate dead configuration or incomplete refactoring.',
    },
    defaultConfiguration: { level: 'note' },
    properties: {
      category: 'maintenance',
    },
  },
];

function createResult(ruleId: string, file: string, line: number, message: string): SarifResult {
  return {
    ruleId,
    message: { text: message },
    level: RULES.find((r) => r.id === ruleId)?.defaultConfiguration.level || 'note',
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: file },
          region: { startLine: line },
        },
      },
    ],
  };
}

function clientExposedToResult(item: ClientExposedVar): SarifResult {
  const reason = item.secretPattern
    ? `matches secret pattern "${item.secretPattern}"`
    : 'missing NEXT_PUBLIC_ prefix or equivalent';
  return createResult(
    'client-exposed',
    item.file,
    item.line,
    `Client-exposed variable "${item.name}" (${reason})`
  );
}

function readButUndeclaredToResult(item: EnvAccess): SarifResult {
  return createResult(
    'read-but-undeclared',
    item.file,
    item.line,
    `Variable "${item.name}" read but not declared in .env files`
  );
}

function declaredButUnreadToResult(item: { name: string; source: string; line: number }): SarifResult {
  return createResult(
    'declared-but-unread',
    item.source,
    item.line,
    `Variable "${item.name}" declared but never read`
  );
}

export function formatSarifJson(result: AuditResult, packageName?: string, packageDir?: string): string {
  const results: SarifResult[] = [
    ...result.clientExposed.map(clientExposedToResult),
    ...result.readButUndeclared.map(readButUndeclaredToResult),
    ...result.declaredButUnread.map(declaredButUnreadToResult),
  ];

  const run: SarifRun = {
    tool: {
      driver: {
        name: 'env-var-auditor',
        version,
        rules: RULES,
      },
    },
    results,
  };

  if (packageName && packageDir) {
    run.properties = { packageName, packageDir };
  }

  const log: SarifLog = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [run],
  };

  return JSON.stringify(log, null, 2);
}

export function formatWorkspaceSarifJson(workspace: WorkspaceAuditResult): string {
  const runs: SarifRun[] = workspace.packages.map((pkg) => {
    const results: SarifResult[] = [
      ...pkg.result.clientExposed.map(clientExposedToResult),
      ...pkg.result.readButUndeclared.map(readButUndeclaredToResult),
      ...pkg.result.declaredButUnread.map(declaredButUnreadToResult),
    ];

    return {
      tool: {
        driver: {
          name: 'env-var-auditor',
          version,
          rules: RULES,
        },
      },
      results,
      properties: {
        packageName: pkg.packageName,
        packageDir: pkg.packageDir,
      },
    };
  });

  const log: SarifLog = {
    $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs,
  };

  return JSON.stringify(log, null, 2);
}
