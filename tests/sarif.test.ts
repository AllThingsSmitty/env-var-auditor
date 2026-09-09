import { describe, it, expect } from 'vitest';
import { formatSarifJson, formatWorkspaceSarifJson } from '../src/output/sarif.js';
import type { AuditResult, WorkspaceAuditResult } from '../src/types.js';

describe('SARIF output', () => {
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

  describe('formatSarifJson', () => {
    it('returns valid JSON', () => {
      const output = formatSarifJson(mockResult);
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('includes schema reference', () => {
      const output = JSON.parse(formatSarifJson(mockResult));
      expect(output.$schema).toContain('sarif-spec');
    });

    it('sets version to 2.1.0', () => {
      const output = JSON.parse(formatSarifJson(mockResult));
      expect(output.version).toBe('2.1.0');
    });

    it('has single run', () => {
      const output = JSON.parse(formatSarifJson(mockResult));
      expect(output.runs).toHaveLength(1);
    });

    it('includes tool driver info', () => {
      const output = JSON.parse(formatSarifJson(mockResult));
      const driver = output.runs[0].tool.driver;
      expect(driver.name).toBe('env-var-auditor');
      expect(driver.version).toBeTruthy();
    });

    it('defines three rule types', () => {
      const output = JSON.parse(formatSarifJson(mockResult));
      const rules = output.runs[0].tool.driver.rules;
      expect(rules).toHaveLength(3);
      expect(rules.map((r: { id: string }) => r.id)).toEqual([
        'client-exposed',
        'read-but-undeclared',
        'declared-but-unread',
      ]);
    });

    it('creates result for client-exposed finding', () => {
      const output = JSON.parse(formatSarifJson(mockResult));
      const results = output.runs[0].results;
      const clientExposedResult = results.find((r: { ruleId: string }) => r.ruleId === 'client-exposed');

      expect(clientExposedResult).toBeDefined();
      expect(clientExposedResult.level).toBe('error');
      expect(clientExposedResult.message.text).toContain('SECRET_KEY');
      expect(clientExposedResult.locations[0].physicalLocation.artifactLocation.uri).toBe('src/client.ts');
      expect(clientExposedResult.locations[0].physicalLocation.region.startLine).toBe(20);
    });

    it('creates result for read-but-undeclared finding', () => {
      const output = JSON.parse(formatSarifJson(mockResult));
      const results = output.runs[0].results;
      const readUndeclaredResult = results.find((r: { ruleId: string }) => r.ruleId === 'read-but-undeclared');

      expect(readUndeclaredResult).toBeDefined();
      expect(readUndeclaredResult.level).toBe('warning');
      expect(readUndeclaredResult.message.text).toContain('MISSING_VAR');
      expect(readUndeclaredResult.locations[0].physicalLocation.artifactLocation.uri).toBe('src/index.ts');
      expect(readUndeclaredResult.locations[0].physicalLocation.region.startLine).toBe(10);
    });

    it('creates result for declared-but-unread finding', () => {
      const output = JSON.parse(formatSarifJson(mockResult));
      const results = output.runs[0].results;
      const declaredUnreadResult = results.find((r: { ruleId: string }) => r.ruleId === 'declared-but-unread');

      expect(declaredUnreadResult).toBeDefined();
      expect(declaredUnreadResult.level).toBe('note');
      expect(declaredUnreadResult.message.text).toContain('UNUSED_VAR');
      expect(declaredUnreadResult.locations[0].physicalLocation.artifactLocation.uri).toBe('.env');
      expect(declaredUnreadResult.locations[0].physicalLocation.region.startLine).toBe(1);
    });

    it('includes package info when provided', () => {
      const output = JSON.parse(formatSarifJson(mockResult, '@my-org/pkg', 'packages/pkg'));
      const run = output.runs[0];
      expect(run.properties).toBeDefined();
      expect(run.properties.packageName).toBe('@my-org/pkg');
      expect(run.properties.packageDir).toBe('packages/pkg');
    });
  });

  describe('formatWorkspaceSarifJson', () => {
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

    it('returns valid JSON', () => {
      const output = formatWorkspaceSarifJson(mockWorkspace);
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('creates separate runs for each package', () => {
      const output = JSON.parse(formatWorkspaceSarifJson(mockWorkspace));
      expect(output.runs).toHaveLength(2);
    });

    it('includes package properties in each run', () => {
      const output = JSON.parse(formatWorkspaceSarifJson(mockWorkspace));
      expect(output.runs[0].properties.packageName).toBe('@app/web');
      expect(output.runs[0].properties.packageDir).toBe('packages/web');
      expect(output.runs[1].properties.packageName).toBe('@app/api');
      expect(output.runs[1].properties.packageDir).toBe('packages/api');
    });

    it('aggregates results from all packages', () => {
      const output = JSON.parse(formatWorkspaceSarifJson(mockWorkspace));
      const webResults = output.runs[0].results;
      const apiResults = output.runs[1].results;

      expect(webResults.filter((r: { ruleId: string }) => r.ruleId === 'client-exposed')).toHaveLength(1);
      expect(apiResults).toHaveLength(1); // declared-but-unread only (clientExposed and readButUndeclared are empty)
    });
  });

  describe('SARIF schema compliance', () => {
    it('rule levels are valid', () => {
      const output = JSON.parse(formatSarifJson(mockResult));
      const rules = output.runs[0].tool.driver.rules;
      const validLevels = ['note', 'warning', 'error'];

      for (const rule of rules) {
        expect(validLevels).toContain(rule.defaultConfiguration.level);
      }
    });

    it('result levels match rule defaults', () => {
      const output = JSON.parse(formatSarifJson(mockResult));
      const rules = output.runs[0].tool.driver.rules;
      const results = output.runs[0].results;
      const ruleMap = new Map(rules.map((r: { id: string; defaultConfiguration: { level: string } }) => [r.id, r.defaultConfiguration.level]));

      for (const result of results) {
        expect(result.level).toBe(ruleMap.get(result.ruleId));
      }
    });

    it('all results have required SARIF fields', () => {
      const output = JSON.parse(formatSarifJson(mockResult));
      const results = output.runs[0].results;

      for (const result of results) {
        expect(result.ruleId).toBeDefined();
        expect(result.message).toBeDefined();
        expect(result.message.text).toBeDefined();
        expect(result.level).toBeDefined();
        expect(result.locations).toBeDefined();
        expect(result.locations).toHaveLength(1);
        expect(result.locations[0].physicalLocation).toBeDefined();
        expect(result.locations[0].physicalLocation.artifactLocation).toBeDefined();
        expect(result.locations[0].physicalLocation.artifactLocation.uri).toBeDefined();
      }
    });
  });
});
