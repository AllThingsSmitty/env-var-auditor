import { describe, it, expect } from 'vitest';
import { parseEnvFile } from '../../src/parsers/env-file.js';

describe('parseEnvFile', () => {
  it('parses simple key=value pairs', () => {
    const result = parseEnvFile('FOO=bar\nBAR=baz', '/fake/.env');
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: 'FOO', value: 'bar', line: 1 });
    expect(result[1]).toMatchObject({ name: 'BAR', value: 'baz', line: 2 });
  });

  it('strips comment lines', () => {
    const result = parseEnvFile('# comment\nFOO=bar', '/fake/.env');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('FOO');
  });

  it('handles double-quoted values', () => {
    const result = parseEnvFile('FOO="hello world"', '/fake/.env');
    expect(result[0].value).toBe('hello world');
  });

  it('handles single-quoted values', () => {
    const result = parseEnvFile("FOO='hello world'", '/fake/.env');
    expect(result[0].value).toBe('hello world');
  });

  it('strips inline comments outside quotes', () => {
    const result = parseEnvFile('FOO=bar # this is a comment', '/fake/.env');
    expect(result[0].value).toBe('bar');
  });

  it('preserves # inside quoted values', () => {
    const result = parseEnvFile('FOO="bar#baz"', '/fake/.env');
    expect(result[0].value).toBe('bar#baz');
  });

  it('handles empty values', () => {
    const result = parseEnvFile('FOO=', '/fake/.env');
    expect(result[0].value).toBeUndefined();
  });

  it('handles export prefix', () => {
    const result = parseEnvFile('export FOO=bar', '/fake/.env');
    expect(result[0]).toMatchObject({ name: 'FOO', value: 'bar' });
  });

  it('records the source file path and line number', () => {
    const result = parseEnvFile('\nFOO=bar', '/project/.env.example');
    expect(result[0].source).toBe('/project/.env.example');
    expect(result[0].line).toBe(2);
  });

  it('ignores blank lines', () => {
    const result = parseEnvFile('FOO=1\n\nBAR=2', '/fake/.env');
    expect(result).toHaveLength(2);
  });
});
