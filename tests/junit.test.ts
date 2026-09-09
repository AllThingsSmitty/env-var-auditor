import { describe, it, expect } from 'vitest';
import { formatJunitXml, formatWorkspaceJunitXml } from '../src/output/junit.js';
import type { AuditResult, WorkspaceAuditResult } from '../src/types.js';

describe('JUnit XML output', () => {
  const mockResult: AuditResult = {
    scannedFiles: 5,
    scannedEnvFiles: 1,
    declaredButUnread: [
      { name: 'UNUSED_VAR', value: 'test', source: '.env', line: 1 },
    ],
    readButUndeclared: [
      {
        name: 'MISSING_VAR',
        accessType: 'member',
        file: 'src/index.ts',
        line: 10,
        column: 5,
        isClientFile: false,
      },
    ],
    clientExposed: [
      {
        name: 'SECRET_KEY',
        file: 'src/client.ts',
        line: 20,
        reason: 'missing-prefix',
      },
    ],
    unauditable: [],
  };

  describe('formatJunitXml', () => {
    it('returns valid XML', () => {
      const output = formatJunitXml(mockResult);
      expect(output).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    });

    it('includes testsuites root element', () => {
      const output = formatJunitXml(mockResult);
      expect(output).toContain('<testsuites');
      expect(output).toContain('</testsuites>');
    });

    it('counts total tests and failures correctly', () => {
      const output = formatJunitXml(mockResult);
      expect(output).toContain('tests="3"');
      expect(output).toContain('failures="3"');
    });

    it('includes testsuite for project', () => {
      const output = formatJunitXml(mockResult, 'my-project');
      expect(output).toContain('<testsuite');
      expect(output).toContain('name="my-project"');
      expect(output).toContain('tests="3"');
      expect(output).toContain('failures="3"');
    });

    it('creates testcase for client-exposed finding', () => {
      const output = formatJunitXml(mockResult);
      expect(output).toContain('classname="env-var-auditor.client-exposed"');
      expect(output).toContain('SECRET_KEY');
      expect(output).toContain('file="src/client.ts"');
      expect(output).toContain('line="20"');
      expect(output).toContain('Client-exposed variable');
      expect(output).toContain('missing NEXT_PUBLIC_ prefix');
    });

    it('creates testcase for read-but-undeclared finding', () => {
      const output = formatJunitXml(mockResult);
      expect(output).toContain('classname="env-var-auditor.read-but-undeclared"');
      expect(output).toContain('file="src/index.ts"');
      expect(output).toContain('line="10"');
      expect(output).toContain('MISSING_VAR');
      expect(output).toContain('read but not declared');
    });

    it('creates testcase for declared-but-unread finding', () => {
      const output = formatJunitXml(mockResult);
      expect(output).toContain('classname="env-var-auditor.declared-but-unread"');
      expect(output).toContain('file=".env"');
      expect(output).toContain('line="1"');
      expect(output).toContain('UNUSED_VAR');
      expect(output).toContain('declared but never read');
    });

    it('escapes XML special characters in messages', () => {
      const resultWithSpecialChars: AuditResult = {
        ...mockResult,
        clientExposed: [
          {
            name: 'KEY_<>&"\'',
            file: 'src/file.ts',
            line: 5,
            reason: 'missing-prefix',
          },
        ],
        readButUndeclared: [],
        declaredButUnread: [],
      };

      const output = formatJunitXml(resultWithSpecialChars);
      expect(output).toContain('&lt;');
      expect(output).toContain('&gt;');
      expect(output).toContain('&amp;');
      expect(output).toContain('&quot;');
      expect(output).toContain('&apos;');
    });

    it('handles empty results', () => {
      const emptyResult: AuditResult = {
        scannedFiles: 0,
        scannedEnvFiles: 0,
        declaredButUnread: [],
        readButUndeclared: [],
        clientExposed: [],
        unauditable: [],
      };

      const output = formatJunitXml(emptyResult);
      expect(output).toContain('tests="0"');
      expect(output).toContain('failures="0"');
    });
  });

  describe('formatWorkspaceJunitXml', () => {
    const mockWorkspace: WorkspaceAuditResult = {
      packages: [
        {
          packageName: '@app/web',
          packageDir: 'packages/web',
          result: {
            ...mockResult,
            clientExposed: [
              {
                name: 'API_KEY',
                file: 'src/api.ts',
                line: 5,
                reason: 'secret-pattern',
                secretPattern: 'sk_',
              },
            ],
          },
        },
        {
          packageName: '@app/api',
          packageDir: 'packages/api',
          result: {
            ...mockResult,
            clientExposed: [],
            readButUndeclared: [],
          },
        },
      ],
    };

    it('returns valid XML', () => {
      const output = formatWorkspaceJunitXml(mockWorkspace);
      expect(output).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    });

    it('creates separate testsuite for each package', () => {
      const output = formatWorkspaceJunitXml(mockWorkspace);
      expect(output).toContain('name="@app/web"');
      expect(output).toContain('name="@app/api"');
      expect(output).toMatch(/<testsuite/g);
    });

    it('aggregates total tests and failures', () => {
      const output = formatWorkspaceJunitXml(mockWorkspace);
      // web: 3 tests (1 client-exposed + 1 read-but-undeclared + 1 declared-but-unread)
      // api: 1 test (1 declared-but-unread only, as clientExposed and readButUndeclared are empty)
      // total: 4 tests, 4 failures
      expect(output).toContain('tests="4"');
      expect(output).toContain('failures="4"');
    });

    it('includes package directory as attribute', () => {
      const output = formatWorkspaceJunitXml(mockWorkspace);
      expect(output).toContain('package="packages/web"');
      expect(output).toContain('package="packages/api"');
    });

    it('handles packages with no findings', () => {
      const workspaceNoCases: WorkspaceAuditResult = {
        packages: [
          {
            packageName: '@app/clean',
            packageDir: 'packages/clean',
            result: {
              scannedFiles: 5,
              scannedEnvFiles: 1,
              declaredButUnread: [],
              readButUndeclared: [],
              clientExposed: [],
              unauditable: [],
            },
          },
        ],
      };

      const output = formatWorkspaceJunitXml(workspaceNoCases);
      expect(output).toContain('tests="0"');
      expect(output).toContain('failures="0"');
    });
  });

  describe('JUnit XML schema compliance', () => {
    it('all testcases have required attributes', () => {
      const output = formatJunitXml(mockResult);
      const testcasePattern = /<testcase[^>]*>/g;
      const matches = output.match(testcasePattern);

      expect(matches).not.toBeNull();
      if (matches) {
        for (const match of matches) {
          expect(match).toMatch(/name="/);
          expect(match).toMatch(/classname="/);
          expect(match).toMatch(/file="/);
          expect(match).toMatch(/line="/);
        }
      }
    });

    it('failure elements have message attribute', () => {
      const output = formatJunitXml(mockResult);
      const failurePattern = /<failure message="[^"]*">/g;
      const matches = output.match(failurePattern);

      expect(matches).not.toBeNull();
      expect(matches?.length).toBeGreaterThan(0);
    });

    it('properly closes all XML tags', () => {
      const output = formatJunitXml(mockResult);
      const openTags = (output.match(/<[a-z]/g) || []).length;
      const closeTags = (output.match(/<\/[a-z]/g) || []).length;
      const selfClosing = (output.match(/\/>/g) || []).length;

      // Each opening tag is either closed with a closing tag or self-closing
      expect(openTags).toBeLessThanOrEqual(closeTags + selfClosing);
    });
  });
});
