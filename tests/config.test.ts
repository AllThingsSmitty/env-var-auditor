import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { loadConfig } from '../src/config.js';

const tempDir = path.join(process.cwd(), '.test-config-tmp');

beforeEach(() => {
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
});

afterEach(() => {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
});

describe('loadConfig', () => {
  it('returns null when no config file exists and no explicit path given', () => {
    const config = loadConfig(tempDir);
    expect(config).toBeNull();
  });

  it('parses a valid config file', () => {
    const configPath = path.join(tempDir, '.env-auditorrc.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ignore: ['**/node_modules/**'],
        format: 'json',
        secretPatterns: ['^CUSTOM_'],
      }),
    );

    const config = loadConfig(tempDir);
    expect(config).toEqual({
      ignore: ['**/node_modules/**'],
      format: 'json',
      secretPatterns: ['^CUSTOM_'],
    });
  });

  it('throws on malformed JSON', () => {
    const configPath = path.join(tempDir, '.env-auditorrc.json');
    fs.writeFileSync(configPath, '{ invalid json }');

    expect(() => loadConfig(tempDir)).toThrow(/Failed to parse config file/);
  });

  it('throws when ignore is not an array', () => {
    const configPath = path.join(tempDir, '.env-auditorrc.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ignore: 'should-be-array',
      }),
    );

    expect(() => loadConfig(tempDir)).toThrow(/ignore" must be an array/);
  });

  it('throws when format is not table or json', () => {
    const configPath = path.join(tempDir, '.env-auditorrc.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        format: 'yaml',
      }),
    );

    expect(() => loadConfig(tempDir)).toThrow(/format" must be "table" or "json"/);
  });

  it('throws when secretPatterns is not an array', () => {
    const configPath = path.join(tempDir, '.env-auditorrc.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        secretPatterns: { pattern: 'should-be-array' },
      }),
    );

    expect(() => loadConfig(tempDir)).toThrow(/secretPatterns" must be an array/);
  });

  it('throws when explicit config path does not exist', () => {
    const nonExistentPath = path.join(tempDir, 'nonexistent.json');
    expect(() => loadConfig(tempDir, nonExistentPath)).toThrow(/Config file not found/);
  });

  it('throws when root element is not an object', () => {
    const configPath = path.join(tempDir, '.env-auditorrc.json');
    fs.writeFileSync(configPath, JSON.stringify(['not', 'an', 'object']));

    expect(() => loadConfig(tempDir)).toThrow(/must be a JSON object/);
  });

  it('allows partial config (only some fields)', () => {
    const configPath = path.join(tempDir, '.env-auditorrc.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        ignore: ['**/dist/**'],
      }),
    );

    const config = loadConfig(tempDir);
    expect(config).toEqual({
      ignore: ['**/dist/**'],
      format: undefined,
      secretPatterns: undefined,
      baselinePath: undefined,
    });
  });

  it('parses baselinePath when provided', () => {
    const configPath = path.join(tempDir, '.env-auditorrc.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        baselinePath: 'baselines/baseline.json',
      }),
    );

    const config = loadConfig(tempDir);
    expect(config).toEqual({
      ignore: undefined,
      format: undefined,
      secretPatterns: undefined,
      baselinePath: 'baselines/baseline.json',
    });
  });

  it('throws when baselinePath is not a string', () => {
    const configPath = path.join(tempDir, '.env-auditorrc.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        baselinePath: { path: 'should-be-string' },
      }),
    );

    expect(() => loadConfig(tempDir)).toThrow(/baselinePath" must be a string/);
  });
});
