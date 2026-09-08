import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  createProgressEntry,
  loadProgressHistory,
  appendProgressEntry,
  getDefaultProgressPath,
  resolveProgressPath,
} from '../src/progress.js';
import { createBaseline } from '../src/baseline.js';
import type { AuditResult } from '../src/types.js';

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'progress-test-'));
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

describe('progress', () => {
  describe('createProgressEntry', () => {
    it('derives counts from a baseline', () => {
      const baseline = createBaseline(mockAuditResult);
      const entry = createProgressEntry(baseline);

      expect(entry.timestamp).toBe(baseline.timestamp);
      expect(entry.version).toBe(baseline.version);
      expect(entry.findings.clientExposed).toBe(2);
      expect(entry.findings.readButUndeclared).toBe(1);
      expect(entry.findings.declaredButUnread).toBe(1);
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
      const entry = createProgressEntry(baseline);

      expect(entry.findings.clientExposed).toBe(0);
      expect(entry.findings.readButUndeclared).toBe(0);
      expect(entry.findings.declaredButUnread).toBe(0);
    });
  });

  describe('getDefaultProgressPath', () => {
    it('returns the default progress file path', () => {
      const result = getDefaultProgressPath(tempDir);

      expect(result).toBe(path.join(tempDir, '.env-auditor-progress.json'));
    });
  });

  describe('resolveProgressPath', () => {
    it('returns default path when config path not provided', () => {
      const result = resolveProgressPath(tempDir, undefined);

      expect(result).toBe(path.join(tempDir, '.env-auditor-progress.json'));
    });

    it('resolves config path relative to dir', () => {
      const configPath = 'custom/progress.json';
      const result = resolveProgressPath(tempDir, configPath);

      expect(result).toBe(path.resolve(tempDir, configPath));
    });
  });

  describe('loadProgressHistory', () => {
    it('returns empty array when file does not exist', () => {
      const progressPath = path.join(tempDir, '.env-auditor-progress.json');
      const result = loadProgressHistory(progressPath);

      expect(result).toEqual([]);
    });

    it('loads progress history from file', () => {
      const progressPath = path.join(tempDir, '.env-auditor-progress.json');
      const baseline = createBaseline(mockAuditResult);
      const entry = createProgressEntry(baseline);

      fs.writeFileSync(progressPath, JSON.stringify([entry], null, 2), 'utf-8');

      const loaded = loadProgressHistory(progressPath);

      expect(loaded).toHaveLength(1);
      expect(loaded[0].timestamp).toBe(entry.timestamp);
      expect(loaded[0].version).toBe(entry.version);
      expect(loaded[0].findings).toEqual(entry.findings);
    });

    it('throws error if file is invalid JSON', () => {
      const progressPath = path.join(tempDir, '.env-auditor-progress.json');
      fs.writeFileSync(progressPath, 'invalid json {', 'utf-8');

      expect(() => loadProgressHistory(progressPath)).toThrow('Failed to parse progress file');
    });

    it('throws error if content is not an array', () => {
      const progressPath = path.join(tempDir, '.env-auditor-progress.json');
      fs.writeFileSync(progressPath, JSON.stringify({ entries: [] }), 'utf-8');

      expect(() => loadProgressHistory(progressPath)).toThrow('must be a JSON array');
    });

    it('throws error if entry is not an object', () => {
      const progressPath = path.join(tempDir, '.env-auditor-progress.json');
      fs.writeFileSync(progressPath, JSON.stringify(['not an object']), 'utf-8');

      expect(() => loadProgressHistory(progressPath)).toThrow('entry 0 must be an object');
    });

    it('throws error if timestamp is missing or wrong type', () => {
      const progressPath = path.join(tempDir, '.env-auditor-progress.json');
      fs.writeFileSync(
        progressPath,
        JSON.stringify([
          {
            version: '0.6.0',
            findings: { clientExposed: 0, readButUndeclared: 0, declaredButUnread: 0 },
          },
        ]),
        'utf-8',
      );

      expect(() => loadProgressHistory(progressPath)).toThrow('timestamp must be a string');
    });

    it('throws error if version is missing or wrong type', () => {
      const progressPath = path.join(tempDir, '.env-auditor-progress.json');
      fs.writeFileSync(
        progressPath,
        JSON.stringify([
          {
            timestamp: new Date().toISOString(),
            findings: { clientExposed: 0, readButUndeclared: 0, declaredButUnread: 0 },
          },
        ]),
        'utf-8',
      );

      expect(() => loadProgressHistory(progressPath)).toThrow('version must be a string');
    });

    it('throws error if findings is not an object', () => {
      const progressPath = path.join(tempDir, '.env-auditor-progress.json');
      fs.writeFileSync(
        progressPath,
        JSON.stringify([
          {
            timestamp: new Date().toISOString(),
            version: '0.6.0',
            findings: null,
          },
        ]),
        'utf-8',
      );

      expect(() => loadProgressHistory(progressPath)).toThrow('findings must be an object');
    });

    it('throws error if findings counts are not numbers', () => {
      const progressPath = path.join(tempDir, '.env-auditor-progress.json');
      fs.writeFileSync(
        progressPath,
        JSON.stringify([
          {
            timestamp: new Date().toISOString(),
            version: '0.6.0',
            findings: { clientExposed: 'not a number', readButUndeclared: 0, declaredButUnread: 0 },
          },
        ]),
        'utf-8',
      );

      expect(() => loadProgressHistory(progressPath)).toThrow('findings.clientExposed must be a number');
    });
  });

  describe('appendProgressEntry', () => {
    it('creates file and appends entry', () => {
      const progressPath = path.join(tempDir, '.env-auditor-progress.json');
      const baseline = createBaseline(mockAuditResult);
      const entry = createProgressEntry(baseline);

      const result = appendProgressEntry(progressPath, entry);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(entry);
      expect(fs.existsSync(progressPath)).toBe(true);
    });

    it('appends to existing history', () => {
      const progressPath = path.join(tempDir, '.env-auditor-progress.json');
      const baseline1 = createBaseline(mockAuditResult);
      const entry1 = createProgressEntry(baseline1);

      appendProgressEntry(progressPath, entry1);

      const mockAuditResult2: AuditResult = {
        ...mockAuditResult,
        clientExposed: [...mockAuditResult.clientExposed, { name: 'ANOTHER_SECRET', file: 'app/test.ts', line: 20, reason: 'missing-prefix' }],
      };
      const baseline2 = createBaseline(mockAuditResult2);
      const entry2 = createProgressEntry(baseline2);

      const result = appendProgressEntry(progressPath, entry2);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(entry1);
      expect(result[1]).toEqual(entry2);
    });

    it('trims history to maxEntries', () => {
      const progressPath = path.join(tempDir, '.env-auditor-progress.json');
      const baseline = createBaseline(mockAuditResult);

      const entry1 = createProgressEntry(baseline);
      appendProgressEntry(progressPath, entry1, 3);

      const entry2 = createProgressEntry(baseline);
      appendProgressEntry(progressPath, entry2, 3);

      const entry3 = createProgressEntry(baseline);
      appendProgressEntry(progressPath, entry3, 3);

      const entry4 = createProgressEntry(baseline);
      const result = appendProgressEntry(progressPath, entry4, 3);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(entry2);
      expect(result[1]).toEqual(entry3);
      expect(result[2]).toEqual(entry4);
    });

    it('creates parent directories if they do not exist', () => {
      const progressPath = path.join(tempDir, 'nested', 'dir', '.env-auditor-progress.json');
      const baseline = createBaseline(mockAuditResult);
      const entry = createProgressEntry(baseline);

      appendProgressEntry(progressPath, entry);

      expect(fs.existsSync(progressPath)).toBe(true);
    });
  });
});
