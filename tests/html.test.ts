import { describe, it, expect } from 'vitest';
import {
  formatHtml,
  formatWorkspaceHtml,
  formatProgressHtml,
  formatWorkspaceProgressHtml,
} from '../src/output/html.js';
import type { AuditResult, WorkspaceAuditResult } from '../src/types.js';
import type { ProgressEntry } from '../src/progress.js';
import type { PackageProgressInfo } from '../src/output/table.js';

describe('HTML output', () => {
  const mockResult: AuditResult = {
    scannedFiles: 5,
    scannedEnvFiles: 1,
    declaredButUnread: [{ name: 'UNUSED_VAR', value: 'test', source: '.env', line: 1 }],
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

  const emptyResult: AuditResult = {
    scannedFiles: 3,
    scannedEnvFiles: 1,
    declaredButUnread: [],
    readButUndeclared: [],
    clientExposed: [],
    unauditable: [],
  };

  describe('formatHtml', () => {
    it('returns a well-formed HTML document', () => {
      const output = formatHtml(mockResult, '/repo', '0.8.0');
      expect(output).toContain('<!DOCTYPE html>');
      expect(output).toContain('</html>');
    });

    it('includes the version', () => {
      const output = formatHtml(mockResult, '/repo', '0.8.0');
      expect(output).toContain('0.8.0');
    });

    it('renders findings for each category', () => {
      const output = formatHtml(mockResult, '/repo', '0.8.0');
      expect(output).toContain('SECRET_KEY');
      expect(output).toContain('MISSING_VAR');
      expect(output).toContain('UNUSED_VAR');
    });

    it('shows the empty state when there are no findings', () => {
      const output = formatHtml(emptyResult, '/repo', '0.8.0');
      expect(output).toContain('No findings');
    });

    it('escapes HTML-unsafe characters in variable names', () => {
      const malicious: AuditResult = {
        ...emptyResult,
        readButUndeclared: [
          {
            name: '<script>alert(1)</script>',
            accessType: 'member',
            file: 'src/index.ts',
            line: 1,
            column: 0,
            isClientFile: false,
          },
        ],
      };
      const output = formatHtml(malicious, '/repo', '0.8.0');
      expect(output).not.toContain('<script>alert(1)</script>');
      expect(output).toContain('&lt;script&gt;');
    });
  });

  describe('formatWorkspaceHtml', () => {
    const workspace: WorkspaceAuditResult = {
      packages: [
        { packageName: 'pkg-a', packageDir: '/repo/packages/a', result: mockResult },
        { packageName: 'pkg-b', packageDir: '/repo/packages/b', result: emptyResult },
      ],
    };

    it('returns a well-formed HTML document', () => {
      const output = formatWorkspaceHtml(workspace, '/repo', '0.8.0');
      expect(output).toContain('<!DOCTYPE html>');
    });

    it('renders a section per package with anchors', () => {
      const output = formatWorkspaceHtml(workspace, '/repo', '0.8.0');
      expect(output).toContain('id="pkg-a"');
      expect(output).toContain('id="pkg-b"');
      expect(output).toContain('href="#pkg-a"');
    });
  });

  describe('formatProgressHtml', () => {
    const history: ProgressEntry[] = [
      {
        timestamp: '2026-01-01T00:00:00.000Z',
        version: '0.6.0',
        findings: { clientExposed: 3, readButUndeclared: 2, declaredButUnread: 1 },
      },
      {
        timestamp: '2026-01-08T00:00:00.000Z',
        version: '0.6.0',
        findings: { clientExposed: 1, readButUndeclared: 1, declaredButUnread: 1 },
      },
    ];

    it('returns a well-formed HTML document', () => {
      const output = formatProgressHtml(history, '0.8.0');
      expect(output).toContain('<!DOCTYPE html>');
    });

    it('renders an SVG trend chart with a polyline per series', () => {
      const output = formatProgressHtml(history, '0.8.0');
      expect(output).toContain('<svg');
      expect((output.match(/<polyline/g) ?? []).length).toBe(3);
    });

    it('renders the legend with latest values', () => {
      const output = formatProgressHtml(history, '0.8.0');
      expect(output).toContain('Client-exposed');
      expect(output).toContain('Undeclared');
      expect(output).toContain('Unused');
    });

    it('renders a snapshot table row per entry', () => {
      const output = formatProgressHtml(history, '0.8.0');
      // +1 for the header row
      expect((output.match(/<tr>/g) ?? []).length).toBe(history.length + 1);
    });

    it('shows the empty state when there is no history', () => {
      const output = formatProgressHtml([], '0.8.0');
      expect(output).toContain('No progress history yet');
      expect(output).not.toContain('<svg');
    });

    it('handles a single snapshot without drawing a line', () => {
      const output = formatProgressHtml([history[0]], '0.8.0');
      expect(output).toContain('<svg');
      expect(output).not.toContain('<polyline');
    });
  });

  describe('formatWorkspaceProgressHtml', () => {
    const packages: PackageProgressInfo[] = [
      {
        packageName: 'pkg-a',
        packageDir: '/repo/packages/a',
        history: [
          {
            timestamp: '2026-01-01T00:00:00.000Z',
            version: '0.6.0',
            findings: { clientExposed: 1, readButUndeclared: 0, declaredButUnread: 0 },
          },
        ],
      },
      { packageName: 'pkg-b', packageDir: '/repo/packages/b', history: [] },
    ];

    it('returns a well-formed HTML document', () => {
      const output = formatWorkspaceProgressHtml(packages, '/repo', '0.8.0');
      expect(output).toContain('<!DOCTYPE html>');
    });

    it('renders a section per package with anchors', () => {
      const output = formatWorkspaceProgressHtml(packages, '/repo', '0.8.0');
      expect(output).toContain('id="pkg-a"');
      expect(output).toContain('id="pkg-b"');
    });

    it('shows the empty state for packages with no history', () => {
      const output = formatWorkspaceProgressHtml(packages, '/repo', '0.8.0');
      expect(output).toContain('No progress history yet');
    });
  });
});
