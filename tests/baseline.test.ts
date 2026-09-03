import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  createBaseline,
  saveBaseline,
  loadBaseline,
  validateBaselineVersion,
  compareFindings,
  getDefaultBaselinePath,
  resolveBaselinePath,
  saveWorkspaceBaselines,
  compareWorkspaceBaselines,
  type BaselineData,
} from '../src/baseline.js';
import type { AuditResult, WorkspaceAuditResult } from '../src/types.js';

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baseline-test-'));
});

afterEach(() => {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
});

const mockAuditResult: AuditResult = {
  scannedFiles: 5,
  scannedEnvFiles: 2,
  clientExposed: [
    { name: 'STRIPE_SECRET_KEY', file: 'app/page.tsx', line: 8, reason: 'missing-prefix' },
    { name: 'DATABASE_URL', file: 'app/checkout.tsx', line: 12, reason: 'missing-prefix' },
  ],
  readButUndeclared: [
    { name: 'REDIS_URL', accessType: 'member', file: 'lib/cache.ts', line: 3, column: 0, isClientFile: false },
  ],
  declaredButUnread: [
    { name: 'OLD_API_KEY', value: 'https://old-api.example.com', source: '.env.example', line: 5 },
  ],
  unauditable: [],
};

describe('baseline', () => {
  describe('createBaseline', () => {
    it('creates a baseline from audit result', () => {
      const baseline = createBaseline(mockAuditResult);

      expect(baseline.version).toBeDefined();
      expect(baseline.timestamp).toBeDefined();
      expect(baseline.findings.clientExposed).toEqual(['STRIPE_SECRET_KEY', 'DATABASE_URL']);
      expect(baseline.findings.readButUndeclared).toEqual(['REDIS_URL']);
      expect(baseline.findings.declaredButUnread).toEqual(['OLD_API_KEY']);
    });

    it('handles empty findings', () => {
      const emptyResult: AuditResult = {
        scannedFiles: 0,
        scannedEnvFiles: 0,
        clientExposed: [],
        readButUndeclared: [],
        declaredButUnread: [],
        unauditable: [],
      };

      const baseline = createBaseline(emptyResult);

      expect(baseline.findings.clientExposed).toEqual([]);
      expect(baseline.findings.readButUndeclared).toEqual([]);
      expect(baseline.findings.declaredButUnread).toEqual([]);
    });
  });

  describe('saveBaseline', () => {
    it('saves baseline to file', () => {
      const baselinePath = path.join(tempDir, '.env-auditor-baseline.json');
      const baseline = createBaseline(mockAuditResult);

      saveBaseline(baselinePath, baseline);

      expect(fs.existsSync(baselinePath)).toBe(true);
      const content = fs.readFileSync(baselinePath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.version).toBe(baseline.version);
      expect(parsed.timestamp).toBe(baseline.timestamp);
      expect(parsed.findings).toEqual(baseline.findings);
    });

    it('creates parent directories if they do not exist', () => {
      const baselinePath = path.join(tempDir, 'subdir', 'nested', '.env-auditor-baseline.json');
      const baseline = createBaseline(mockAuditResult);

      saveBaseline(baselinePath, baseline);

      expect(fs.existsSync(baselinePath)).toBe(true);
    });

    it('overwrites existing baseline', () => {
      const baselinePath = path.join(tempDir, '.env-auditor-baseline.json');
      const baseline1 = createBaseline(mockAuditResult);

      saveBaseline(baselinePath, baseline1);

      const result2: AuditResult = {
        ...mockAuditResult,
        clientExposed: [],
      };
      const baseline2 = createBaseline(result2);

      saveBaseline(baselinePath, baseline2);

      const loaded = loadBaseline(baselinePath);
      expect(loaded.findings.clientExposed).toEqual([]);
    });
  });

  describe('loadBaseline', () => {
    it('loads baseline from file', () => {
      const baselinePath = path.join(tempDir, '.env-auditor-baseline.json');
      const baseline = createBaseline(mockAuditResult);

      saveBaseline(baselinePath, baseline);

      const loaded = loadBaseline(baselinePath);

      expect(loaded.version).toBe(baseline.version);
      expect(loaded.findings).toEqual(baseline.findings);
    });

    it('throws error if file does not exist', () => {
      const baselinePath = path.join(tempDir, 'nonexistent.json');

      expect(() => loadBaseline(baselinePath)).toThrow('Baseline file not found');
    });

    it('throws error if file is invalid JSON', () => {
      const baselinePath = path.join(tempDir, '.env-auditor-baseline.json');

      fs.writeFileSync(baselinePath, 'invalid json {', 'utf-8');

      expect(() => loadBaseline(baselinePath)).toThrow('Failed to parse baseline file');
    });

    it('throws error if version is missing', () => {
      const baselinePath = path.join(tempDir, '.env-auditor-baseline.json');

      fs.writeFileSync(
        baselinePath,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          findings: { clientExposed: [], readButUndeclared: [], declaredButUnread: [] },
        }),
        'utf-8',
      );

      expect(() => loadBaseline(baselinePath)).toThrow('missing or invalid version field');
    });

    it('throws error if findings.clientExposed is not an array', () => {
      const baselinePath = path.join(tempDir, '.env-auditor-baseline.json');

      fs.writeFileSync(
        baselinePath,
        JSON.stringify({
          version: '0.3.0',
          timestamp: new Date().toISOString(),
          findings: { clientExposed: 'not an array', readButUndeclared: [], declaredButUnread: [] },
        }),
        'utf-8',
      );

      expect(() => loadBaseline(baselinePath)).toThrow('findings.clientExposed must be an array');
    });

    it('throws error if finding is not a string', () => {
      const baselinePath = path.join(tempDir, '.env-auditor-baseline.json');

      fs.writeFileSync(
        baselinePath,
        JSON.stringify({
          version: '0.3.0',
          timestamp: new Date().toISOString(),
          findings: { clientExposed: [123], readButUndeclared: [], declaredButUnread: [] },
        }),
        'utf-8',
      );

      expect(() => loadBaseline(baselinePath)).toThrow('findings.clientExposed must contain only strings');
    });
  });

  describe('validateBaselineVersion', () => {
    it('passes if versions match', () => {
      const baseline = createBaseline(mockAuditResult);

      expect(() => validateBaselineVersion(baseline)).not.toThrow();
    });

    it('throws error if versions do not match', () => {
      const baseline: BaselineData = {
        version: '0.1.0',
        timestamp: new Date().toISOString(),
        findings: { clientExposed: [], readButUndeclared: [], declaredButUnread: [] },
      };

      expect(() => validateBaselineVersion(baseline)).toThrow('Baseline version mismatch');
      expect(() => validateBaselineVersion(baseline)).toThrow('v0.1.0');
    });
  });

  describe('compareFindings', () => {
    it('identifies new findings', () => {
      const baseline: BaselineData = {
        version: '0.3.0',
        timestamp: new Date().toISOString(),
        findings: {
          clientExposed: ['STRIPE_SECRET_KEY'],
          readButUndeclared: [],
          declaredButUnread: [],
        },
      };

      const comparison = compareFindings(mockAuditResult, baseline);

      expect(comparison.newFindings.clientExposed).toEqual(['DATABASE_URL']);
      expect(comparison.newFindings.readButUndeclared).toEqual(['REDIS_URL']);
      expect(comparison.newFindings.declaredButUnread).toEqual(['OLD_API_KEY']);
    });

    it('identifies baseline findings', () => {
      const baseline: BaselineData = {
        version: '0.3.0',
        timestamp: new Date().toISOString(),
        findings: {
          clientExposed: ['STRIPE_SECRET_KEY', 'DATABASE_URL'],
          readButUndeclared: ['REDIS_URL'],
          declaredButUnread: ['OLD_API_KEY'],
        },
      };

      const comparison = compareFindings(mockAuditResult, baseline);

      expect(comparison.baselineFindings.clientExposed).toContain('STRIPE_SECRET_KEY');
      expect(comparison.baselineFindings.clientExposed).toContain('DATABASE_URL');
      expect(comparison.baselineFindings.readButUndeclared).toContain('REDIS_URL');
      expect(comparison.baselineFindings.declaredButUnread).toContain('OLD_API_KEY');
    });

    it('identifies fixed findings', () => {
      const baseline: BaselineData = {
        version: '0.3.0',
        timestamp: new Date().toISOString(),
        findings: {
          clientExposed: ['OLD_SECRET', 'STRIPE_SECRET_KEY', 'DATABASE_URL'],
          readButUndeclared: ['MISSING_VAR'],
          declaredButUnread: ['OLD_API_KEY', 'REMOVED_VAR'],
        },
      };

      const comparison = compareFindings(mockAuditResult, baseline);

      expect(comparison.fixedFindings.clientExposed).toEqual(['OLD_SECRET']);
      expect(comparison.fixedFindings.readButUndeclared).toEqual(['MISSING_VAR']);
      expect(comparison.fixedFindings.declaredButUnread).toEqual(['REMOVED_VAR']);
    });

    it('returns empty arrays when all findings are new', () => {
      const emptyBaseline: BaselineData = {
        version: '0.3.0',
        timestamp: new Date().toISOString(),
        findings: { clientExposed: [], readButUndeclared: [], declaredButUnread: [] },
      };

      const comparison = compareFindings(mockAuditResult, emptyBaseline);

      expect(comparison.baselineFindings.clientExposed).toEqual([]);
      expect(comparison.baselineFindings.readButUndeclared).toEqual([]);
      expect(comparison.baselineFindings.declaredButUnread).toEqual([]);
      expect(comparison.fixedFindings.clientExposed).toEqual([]);
    });

    it('handles undefined names in readButUndeclared', () => {
      const resultWithUndefinedName: AuditResult = {
        scannedFiles: 1,
        scannedEnvFiles: 0,
        clientExposed: [],
        readButUndeclared: [
          { name: null, accessType: 'dynamic', file: 'lib/dynamic.ts', line: 10, column: 0, isClientFile: false },
        ],
        declaredButUnread: [],
        unauditable: [],
      };

      const baseline: BaselineData = {
        version: '0.3.0',
        timestamp: new Date().toISOString(),
        findings: { clientExposed: [], readButUndeclared: [], declaredButUnread: [] },
      };

      const comparison = compareFindings(resultWithUndefinedName, baseline);

      expect(comparison.newFindings.readButUndeclared).toContain('');
    });
  });

  describe('getDefaultBaselinePath', () => {
    it('returns default baseline path', () => {
      const dir = '/path/to/project';
      const baselinePath = getDefaultBaselinePath(dir);

      expect(baselinePath).toBe(path.join(dir, '.env-auditor-baseline.json'));
    });
  });

  describe('resolveBaselinePath', () => {
    it('uses explicit CLI path when provided as string', () => {
      const resolved = resolveBaselinePath('/some/dir', '.env-auditorrc.json', '/custom/baseline.json');
      expect(resolved).toBe('/custom/baseline.json');
    });

    it('uses config path when CLI path is true', () => {
      const resolved = resolveBaselinePath('/some/dir', 'custom-baseline.json', true);
      expect(resolved).toBe(path.resolve('/some/dir', 'custom-baseline.json'));
    });

    it('uses default path when CLI path is false and no config', () => {
      const resolved = resolveBaselinePath('/some/dir', undefined, false);
      expect(resolved).toBe(path.join('/some/dir', '.env-auditor-baseline.json'));
    });

    it('uses default path when no CLI path and no config', () => {
      const resolved = resolveBaselinePath('/some/dir', undefined, undefined);
      expect(resolved).toBe(path.join('/some/dir', '.env-auditor-baseline.json'));
    });

    it('resolves config path relative to dir', () => {
      const dir = path.join(tempDir, 'project');
      const resolved = resolveBaselinePath(dir, 'baselines/baseline.json', undefined);
      expect(resolved).toBe(path.resolve(dir, 'baselines/baseline.json'));
    });
  });

  describe('saveWorkspaceBaselines', () => {
    it('saves baselines for all packages', () => {
      const workspace: WorkspaceAuditResult = {
        packages: [
          {
            packageName: '@monorepo/api',
            packageDir: path.join(tempDir, 'packages/api'),
            result: mockAuditResult,
          },
          {
            packageName: '@monorepo/web',
            packageDir: path.join(tempDir, 'packages/web'),
            result: { ...mockAuditResult, clientExposed: [] },
          },
        ],
      };

      const basePaths = path.join(tempDir, 'baselines');
      const resolvePath = (packageDir: string) =>
        path.join(basePaths, path.basename(packageDir), '.env-auditor-baseline.json');

      const saved = saveWorkspaceBaselines(workspace, resolvePath);

      expect(saved).toHaveLength(2);
      expect(saved[0].packageName).toBe('@monorepo/api');
      expect(saved[1].packageName).toBe('@monorepo/web');

      for (const item of saved) {
        const expectedPath = resolvePath(
          workspace.packages.find((p) => p.packageName === item.packageName)!.packageDir,
        );
        expect(fs.existsSync(expectedPath)).toBe(true);
      }
    });
  });

  describe('compareWorkspaceBaselines', () => {
    it('compares all packages against their baselines', () => {
      const workspace: WorkspaceAuditResult = {
        packages: [
          {
            packageName: '@monorepo/api',
            packageDir: path.join(tempDir, 'packages/api'),
            result: mockAuditResult,
          },
          {
            packageName: '@monorepo/web',
            packageDir: path.join(tempDir, 'packages/web'),
            result: { ...mockAuditResult, clientExposed: [] },
          },
        ],
      };

      const basePaths = path.join(tempDir, 'baselines');
      const resolvePath = (packageDir: string) =>
        path.join(basePaths, path.basename(packageDir), '.env-auditor-baseline.json');

      // Save baselines first
      saveWorkspaceBaselines(workspace, resolvePath);

      // Now compare
      const results = compareWorkspaceBaselines(workspace, resolvePath);

      expect(results).toHaveLength(2);
      expect(results[0].packageName).toBe('@monorepo/api');
      expect(results[0].baselineMissing).toBe(false);
      expect(results[1].packageName).toBe('@monorepo/web');
      expect(results[1].baselineMissing).toBe(false);
    });

    it('treats missing baseline as empty with baselineMissing flag', () => {
      const workspace: WorkspaceAuditResult = {
        packages: [
          {
            packageName: '@monorepo/api',
            packageDir: path.join(tempDir, 'packages/api'),
            result: mockAuditResult,
          },
        ],
      };

      const resolvePath = (packageDir: string) =>
        path.join(packageDir, '.env-auditor-baseline.json');

      const results = compareWorkspaceBaselines(workspace, resolvePath);

      expect(results).toHaveLength(1);
      expect(results[0].baselineMissing).toBe(true);
      expect(results[0].baseline.findings.clientExposed).toEqual([]);
      expect(results[0].comparison.newFindings.clientExposed).toEqual(
        mockAuditResult.clientExposed.map((f) => f.name),
      );
    });

    it('validates baseline version when baseline exists', () => {
      const workspace: WorkspaceAuditResult = {
        packages: [
          {
            packageName: '@monorepo/api',
            packageDir: path.join(tempDir, 'packages/api'),
            result: mockAuditResult,
          },
        ],
      };

      const baselinePath = path.join(tempDir, 'baseline.json');
      const resolvePath = () => baselinePath;

      // Save a baseline with wrong version
      const badBaseline: BaselineData = {
        version: '0.1.0',
        timestamp: new Date().toISOString(),
        findings: { clientExposed: [], readButUndeclared: [], declaredButUnread: [] },
      };
      fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
      fs.writeFileSync(baselinePath, JSON.stringify(badBaseline), 'utf-8');

      expect(() => compareWorkspaceBaselines(workspace, resolvePath)).toThrow('Baseline version mismatch');
    });
  });
});
