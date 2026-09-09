import { createRequire } from 'module';
import type { AuditResult, ClientExposedVar, EnvAccess, WorkspaceAuditResult } from '../types.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

interface JunitTestCase {
  name: string;
  classname: string;
  file: string;
  line: number;
  failure?: {
    message: string;
    text: string;
  };
}

interface JunitTestSuite {
  name: string;
  tests: number;
  failures: number;
  package?: string;
  testcases: JunitTestCase[];
}

interface JunitDocument {
  testsuites: JunitTestSuite[];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function clientExposedToTestCase(item: ClientExposedVar, index: number): JunitTestCase {
  const reason = item.secretPattern
    ? `matches secret pattern "${item.secretPattern}"`
    : 'missing NEXT_PUBLIC_ prefix or equivalent';
  return {
    name: `client-exposed-${item.name}-${index}`,
    classname: 'env-var-auditor.client-exposed',
    file: item.file,
    line: item.line,
    failure: {
      message: `Client-exposed variable "${item.name}" (${reason})`,
      text: `File: ${item.file}:${item.line}\nVariable: ${item.name}\nReason: ${reason}`,
    },
  };
}

function readButUndeclaredToTestCase(item: EnvAccess, index: number): JunitTestCase {
  return {
    name: `read-but-undeclared-${item.name}-${index}`,
    classname: 'env-var-auditor.read-but-undeclared',
    file: item.file,
    line: item.line,
    failure: {
      message: `Variable "${item.name}" read but not declared in .env files`,
      text: `File: ${item.file}:${item.line}\nVariable: ${item.name}\nAccess type: ${item.accessType}`,
    },
  };
}

function declaredButUnreadToTestCase(item: { name: string; source: string; line: number }, index: number): JunitTestCase {
  return {
    name: `declared-but-unread-${item.name}-${index}`,
    classname: 'env-var-auditor.declared-but-unread',
    file: item.source,
    line: item.line,
    failure: {
      message: `Variable "${item.name}" declared but never read`,
      text: `File: ${item.source}:${item.line}\nVariable: ${item.name}`,
    },
  };
}

function renderTestCase(tc: JunitTestCase): string {
  const attrs = `name="${escapeXml(tc.name)}" classname="${escapeXml(tc.classname)}" file="${escapeXml(tc.file)}" line="${tc.line}"`;

  if (tc.failure) {
    return (
      `    <testcase ${attrs}>\n` +
      `      <failure message="${escapeXml(tc.failure.message)}">${escapeXml(tc.failure.text)}</failure>\n` +
      `    </testcase>\n`
    );
  }

  return `    <testcase ${attrs} />\n`;
}

function renderTestSuite(suite: JunitTestSuite): string {
  const attrs = `name="${escapeXml(suite.name)}" tests="${suite.tests}" failures="${suite.failures}"`;
  const packageAttr = suite.package ? ` package="${escapeXml(suite.package)}"` : '';

  let xml = `  <testsuite ${attrs}${packageAttr}>\n`;
  for (const tc of suite.testcases) {
    xml += renderTestCase(tc);
  }
  xml += `  </testsuite>\n`;

  return xml;
}

export function formatJunitXml(result: AuditResult, projectName: string = 'env-var-auditor'): string {
  const testcases: JunitTestCase[] = [
    ...result.clientExposed.map(clientExposedToTestCase),
    ...result.readButUndeclared.map(readButUndeclaredToTestCase),
    ...result.declaredButUnread.map(declaredButUnreadToTestCase),
  ];

  const suite: JunitTestSuite = {
    name: projectName,
    tests: testcases.length,
    failures: testcases.filter((tc) => tc.failure).length,
    testcases,
  };

  const doc: JunitDocument = {
    testsuites: [suite],
  };

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<testsuites name="env-var-auditor" tests="${doc.testsuites[0].tests}" failures="${doc.testsuites[0].failures}">\n`;
  for (const suite of doc.testsuites) {
    xml += renderTestSuite(suite);
  }
  xml += `</testsuites>\n`;

  return xml;
}

export function formatWorkspaceJunitXml(workspace: WorkspaceAuditResult): string {
  const suites: JunitTestSuite[] = workspace.packages.map((pkg) => {
    const testcases: JunitTestCase[] = [
      ...pkg.result.clientExposed.map(clientExposedToTestCase),
      ...pkg.result.readButUndeclared.map(readButUndeclaredToTestCase),
      ...pkg.result.declaredButUnread.map(declaredButUnreadToTestCase),
    ];

    return {
      name: pkg.packageName,
      tests: testcases.length,
      failures: testcases.filter((tc) => tc.failure).length,
      package: pkg.packageDir,
      testcases,
    };
  });

  const totalTests = suites.reduce((sum, s) => sum + s.tests, 0);
  const totalFailures = suites.reduce((sum, s) => sum + s.failures, 0);

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<testsuites name="env-var-auditor" tests="${totalTests}" failures="${totalFailures}">\n`;
  for (const suite of suites) {
    xml += renderTestSuite(suite);
  }
  xml += `</testsuites>\n`;

  return xml;
}
