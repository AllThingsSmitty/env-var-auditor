import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createRequire } from 'module';
import {
  loadCache,
  saveCache,
  hashContent,
  resolveAccesses,
  getDefaultCachePath,
  type CacheData,
} from '../src/cache.js';
import type { EnvAccess } from '../src/types.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

let tempDir: string;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-test-'));
});

afterEach(() => {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true });
  }
});

const mockAccess: EnvAccess = {
  name: 'TEST_VAR',
  accessType: 'member',
  file: '/path/to/file.ts',
  line: 1,
  column: 0,
  isClientFile: false,
};

describe('cache', () => {
  describe('getDefaultCachePath', () => {
    it('returns correct default path', () => {
      const dir = path.join(tempDir, 'project');
      const cachePath = getDefaultCachePath(dir);
      expect(cachePath).toBe(path.join(dir, '.env-auditor-cache.json'));
    });
  });

  describe('hashContent', () => {
    it('returns consistent hash for same content', () => {
      const content = 'const x = process.env.FOO;';
      const hash1 = hashContent(content);
      const hash2 = hashContent(content);
      expect(hash1).toBe(hash2);
    });

    it('returns different hash for different content', () => {
      const hash1 = hashContent('content1');
      const hash2 = hashContent('content2');
      expect(hash1).not.toBe(hash2);
    });

    it('returns sha256 hex string', () => {
      const hash = hashContent('test');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('loadCache', () => {
    it('returns empty cache if file does not exist', () => {
      const cachePath = path.join(tempDir, 'nonexistent.json');
      const cache = loadCache(cachePath);
      expect(cache.entries).toEqual({});
    });

    it('returns empty cache if JSON is invalid', () => {
      const cachePath = path.join(tempDir, 'cache.json');
      fs.writeFileSync(cachePath, 'invalid json {');
      const cache = loadCache(cachePath);
      expect(cache.entries).toEqual({});
    });

    it('returns empty cache if version does not match', () => {
      const cachePath = path.join(tempDir, 'cache.json');
      const data = {
        version: '0.0.0',
        entries: { '/some/file.ts': { mtimeMs: 1, size: 100, hash: 'abc', accesses: [] } },
      };
      fs.writeFileSync(cachePath, JSON.stringify(data));
      const cache = loadCache(cachePath);
      expect(cache.entries).toEqual({});
    });

    it('returns empty cache if entries field is invalid', () => {
      const cachePath = path.join(tempDir, 'cache.json');
      const data = { version: pkg.version, entries: 'not an object' };
      fs.writeFileSync(cachePath, JSON.stringify(data));
      const cache = loadCache(cachePath);
      expect(cache.entries).toEqual({});
    });

    it('loads valid cache file', () => {
      const cachePath = path.join(tempDir, 'cache.json');
      const originalData: CacheData = {
        version: pkg.version,
        entries: {
          '/file.ts': {
            mtimeMs: 123,
            size: 100,
            hash: 'abc123',
            accesses: [mockAccess],
          },
        },
      };
      fs.writeFileSync(cachePath, JSON.stringify(originalData));

      const cache = loadCache(cachePath);
      expect(cache.version).toBe(pkg.version);
      expect(cache.entries['/file.ts']).toEqual(originalData.entries['/file.ts']);
    });
  });

  describe('saveCache', () => {
    it('creates parent directories if needed', () => {
      const cachePath = path.join(tempDir, 'subdir', 'nested', 'cache.json');
      const cache: CacheData = { version: pkg.version, entries: {} };

      saveCache(cachePath, cache);
      expect(fs.existsSync(cachePath)).toBe(true);
    });

    it('saves and round-trips cache data', () => {
      const cachePath = path.join(tempDir, 'cache.json');
      const originalData: CacheData = {
        version: pkg.version,
        entries: {
          '/file.ts': {
            mtimeMs: 123,
            size: 100,
            hash: 'abc123',
            accesses: [mockAccess],
          },
        },
      };

      saveCache(cachePath, originalData);
      const loaded = loadCache(cachePath);

      expect(loaded.version).toBe(originalData.version);
      expect(loaded.entries).toEqual(originalData.entries);
    });
  });

  describe('resolveAccesses', () => {
    it('returns cached accesses on mtime+size match', () => {
      const filePath = path.join(tempDir, 'file.ts');
      fs.writeFileSync(filePath, 'const x = process.env.FOO;');

      const stat = fs.statSync(filePath);
      const cachedAccess = { ...mockAccess, file: filePath };
      const cache: CacheData = {
        version: pkg.version,
        entries: {
          [filePath]: {
            mtimeMs: stat.mtimeMs,
            size: stat.size,
            hash: hashContent('old content'),
            accesses: [cachedAccess],
          },
        },
      };

      const mockParseCodeFiles = vi.fn(() => []);
      const result = resolveAccesses([filePath], cache, mockParseCodeFiles);

      expect(result.accesses).toEqual([cachedAccess]);
      expect(mockParseCodeFiles).not.toHaveBeenCalled();
    });

    it('uses hash fallback when mtime differs but content unchanged', () => {
      const filePath = path.join(tempDir, 'file.ts');
      const content = 'const x = process.env.FOO;';
      fs.writeFileSync(filePath, content);

      const hash = hashContent(content);
      const cachedAccess = { ...mockAccess, file: filePath };
      const cache: CacheData = {
        version: pkg.version,
        entries: {
          [filePath]: {
            mtimeMs: 999999,
            size: 999,
            hash,
            accesses: [cachedAccess],
          },
        },
      };

      const mockParseCodeFiles = vi.fn(() => []);
      const result = resolveAccesses([filePath], cache, mockParseCodeFiles);

      expect(result.accesses).toEqual([cachedAccess]);
      expect(mockParseCodeFiles).not.toHaveBeenCalled();
      // Verify mtime was refreshed for next run
      expect(result.entries[filePath]?.mtimeMs).toBe(fs.statSync(filePath).mtimeMs);
    });

    it('re-parses file on content change (hash mismatch)', () => {
      const filePath = path.join(tempDir, 'file.ts');
      const currentContent = 'const x = process.env.FOO;';
      fs.writeFileSync(filePath, currentContent);

      const cache: CacheData = {
        version: pkg.version,
        entries: {
          filePath: {
            mtimeMs: 0,
            size: 0,
            hash: 'oldhash',
            accesses: [mockAccess],
          },
        },
      };

      const newAccess: EnvAccess = { ...mockAccess, file: filePath, name: 'NEW_VAR' };
      const mockParseCodeFiles = vi.fn(() => [newAccess]);
      const result = resolveAccesses([filePath], cache, mockParseCodeFiles);

      expect(mockParseCodeFiles).toHaveBeenCalledWith([{ path: filePath, content: currentContent }]);
      expect(result.accesses).toEqual([newAccess]);
      expect(result.entries[filePath]?.accesses).toEqual([newAccess]);
    });

    it('handles uncached files', () => {
      const filePath = path.join(tempDir, 'file.ts');
      const content = 'const x = process.env.BAR;';
      fs.writeFileSync(filePath, content);

      const cache: CacheData = { version: pkg.version, entries: {} };

      const newAccess: EnvAccess = { ...mockAccess, file: filePath, name: 'BAR' };
      const mockParseCodeFiles = vi.fn(() => [newAccess]);
      const result = resolveAccesses([filePath], cache, mockParseCodeFiles);

      expect(mockParseCodeFiles).toHaveBeenCalled();
      expect(result.accesses).toEqual([newAccess]);
      expect(result.entries[filePath]).toBeDefined();
    });

    it('batches all uncached files into one parse call', () => {
      const file1 = path.join(tempDir, 'file1.ts');
      const file2 = path.join(tempDir, 'file2.ts');
      const file3 = path.join(tempDir, 'file3.ts');

      fs.writeFileSync(file1, 'const x = process.env.A;');
      fs.writeFileSync(file2, 'const x = process.env.B;');
      fs.writeFileSync(file3, 'const x = process.env.C;');

      const cache: CacheData = { version: pkg.version, entries: {} };

      const access1: EnvAccess = { ...mockAccess, file: file1, name: 'A' };
      const access2: EnvAccess = { ...mockAccess, file: file2, name: 'B' };
      const access3: EnvAccess = { ...mockAccess, file: file3, name: 'C' };
      const mockParseCodeFiles = vi.fn(() => [access1, access2, access3]);

      const result = resolveAccesses([file1, file2, file3], cache, mockParseCodeFiles);

      expect(mockParseCodeFiles).toHaveBeenCalledOnce();
      const callArg = mockParseCodeFiles.mock.calls[0][0];
      expect(callArg).toHaveLength(3);
      expect(result.accesses).toHaveLength(3);
      expect(result.accesses).toEqual([access1, access2, access3]);
    });

    it('mixes cached and uncached files correctly', () => {
      const file1 = path.join(tempDir, 'file1.ts');
      const file2 = path.join(tempDir, 'file2.ts');

      const content1 = 'const x = process.env.A;';
      const content2 = 'const x = process.env.B;';
      fs.writeFileSync(file1, content1);
      fs.writeFileSync(file2, content2);

      const access1: EnvAccess = { ...mockAccess, file: file1, name: 'A' };
      const access2: EnvAccess = { ...mockAccess, file: file2, name: 'B' };

      const stat1 = fs.statSync(file1);
      const cache: CacheData = {
        version: pkg.version,
        entries: {
          [file1]: {
            mtimeMs: stat1.mtimeMs,
            size: stat1.size,
            hash: hashContent(content1),
            accesses: [access1],
          },
        },
      };

      const mockParseCodeFiles = vi.fn(() => [access2]);
      const result = resolveAccesses([file1, file2], cache, mockParseCodeFiles);

      // file1 was cached, so parseCodeFiles should only be called with file2
      expect(mockParseCodeFiles).toHaveBeenCalledWith([
        { path: file2, content: content2 },
      ]);
      // Result should include both accesses
      expect(result.accesses).toEqual([access1, access2]);
    });
  });
});
