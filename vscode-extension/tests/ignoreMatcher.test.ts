import { describe, it, expect } from 'vitest';
import { isIgnored, mergePatternLists } from '../src/ignoreMatcher.js';

describe('isIgnored', () => {
  it('returns false when there are no patterns', () => {
    expect(isIgnored('/repo/src/index.ts', [])).toBe(false);
  });

  it('matches a file under an ignored directory glob', () => {
    expect(isIgnored('/repo/node_modules/pkg/index.js', ['**/node_modules/**'])).toBe(true);
  });

  it('does not match files outside the ignored glob', () => {
    expect(isIgnored('/repo/src/index.ts', ['**/node_modules/**'])).toBe(false);
  });

  it('normalizes Windows-style backslashes before matching', () => {
    expect(isIgnored('C:\\repo\\node_modules\\pkg\\index.js', ['**/node_modules/**'])).toBe(true);
  });

  it('matches against a merged list of multiple patterns', () => {
    const patterns = ['**/node_modules/**', '**/*.test.ts', '**/dist/**'];
    expect(isIgnored('/repo/src/foo.test.ts', patterns)).toBe(true);
    expect(isIgnored('/repo/dist/index.js', patterns)).toBe(true);
    expect(isIgnored('/repo/src/foo.ts', patterns)).toBe(false);
  });
});

describe('mergePatternLists', () => {
  it('concatenates lists in order, config-file entries first', () => {
    expect(mergePatternLists(['a', 'b'], ['c'])).toEqual(['a', 'b', 'c']);
  });

  it('de-duplicates repeated patterns, keeping first occurrence order', () => {
    expect(mergePatternLists(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('tolerates undefined lists', () => {
    expect(mergePatternLists(undefined, ['a'], undefined)).toEqual(['a']);
  });

  it('returns an empty array when everything is empty/undefined', () => {
    expect(mergePatternLists(undefined, [])).toEqual([]);
  });
});
