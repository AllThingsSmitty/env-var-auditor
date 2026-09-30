import { describe, it, expect } from 'vitest';
import { parseWebConfigFile } from '../src/webConfigParser.js';

describe('parseWebConfigFile', () => {
  it('extracts a single environmentVariable entry', () => {
    const xml = `<environmentVariable name="API_URL" value="https://example.com" />`;
    expect(parseWebConfigFile(xml, 'web.config')).toEqual([
      { name: 'API_URL', value: undefined, source: 'web.config', line: 0 },
    ]);
  });

  it('extracts multiple entries', () => {
    const xml = `
      <environmentVariable name="FOO" value="a" />
      <environmentVariable name="BAR" value="b" />
    `;
    const result = parseWebConfigFile(xml, 'web.config');
    expect(result.map((d) => d.name)).toEqual(['FOO', 'BAR']);
  });

  it('handles value attribute appearing before name attribute', () => {
    const xml = `<environmentVariable value="x" name="REVERSED" />`;
    expect(parseWebConfigFile(xml, 'web.config')[0].name).toBe('REVERSED');
  });

  it('handles token-placeholder values (e.g. #{Workday.CareersEventsUrl})', () => {
    const xml = `<environmentVariable name="WORKDAY_URL" value="#{Workday.CareersEventsUrl}" />`;
    expect(parseWebConfigFile(xml, 'web.config')[0].name).toBe('WORKDAY_URL');
  });

  it('returns empty array when no environmentVariable entries are present', () => {
    expect(parseWebConfigFile('<configuration />', 'web.config')).toEqual([]);
  });

  it('returns empty array for empty content', () => {
    expect(parseWebConfigFile('', 'web.config')).toEqual([]);
  });

  it('uses the supplied filePath as the source on every declaration', () => {
    const xml = `
      <environmentVariable name="A" value="1" />
      <environmentVariable name="B" value="2" />
    `;
    const result = parseWebConfigFile(xml, 'web.config.delivery');
    expect(result.every((d) => d.source === 'web.config.delivery')).toBe(true);
  });
});
