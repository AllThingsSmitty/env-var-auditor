import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendAuditToSlack } from '../src/slack.js';
import type { AuditResult, WorkspaceAuditResult } from '../src/types.js';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('slack', () => {
  describe('sendAuditToSlack', () => {
    it('sends audit results to Slack webhook', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);

      const result: AuditResult = {
        scannedFiles: 5,
        scannedEnvFiles: 2,
        clientExposed: [
          {
            name: 'STRIPE_SECRET_KEY',
            file: 'app/page.tsx',
            line: 10,
            reason: 'missing-prefix',
          },
        ],
        readButUndeclared: [
          {
            name: 'API_URL',
            accessType: 'member',
            file: 'lib/api.ts',
            line: 5,
            column: 20,
            isClientFile: false,
          },
        ],
        declaredButUnread: [
          {
            name: 'OLD_VAR',
            value: 'test',
            source: '.env.example',
            line: 15,
          },
        ],
        unauditable: [],
      };

      const webhook = 'https://hooks.slack.com/services/T123/B123/abc';
      await sendAuditToSlack(result, webhook, 'my-project');

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe(webhook);
      expect(options?.method).toBe('POST');
      expect(options?.headers).toEqual({ 'Content-Type': 'application/json' });

      const payload = JSON.parse(options?.body as string);
      expect(payload.blocks).toBeDefined();
      expect(payload.blocks.length).toBeGreaterThan(0);
      expect(payload.text).toBe('Environment Variable Audit Results');

      // Check that findings are in the blocks
      const blockText = JSON.stringify(payload.blocks);
      expect(blockText).toContain('STRIPE_SECRET_KEY');
      expect(blockText).toContain('API_URL');
      expect(blockText).toContain('OLD_VAR');
    });

    it('does not send if there are no findings', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);

      const result: AuditResult = {
        scannedFiles: 5,
        scannedEnvFiles: 2,
        clientExposed: [],
        readButUndeclared: [],
        declaredButUnread: [],
        unauditable: [],
      };

      const webhook = 'https://hooks.slack.com/services/T123/B123/abc';
      await sendAuditToSlack(result, webhook);

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('truncates long finding lists', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);

      const result: AuditResult = {
        scannedFiles: 10,
        scannedEnvFiles: 2,
        clientExposed: Array.from({ length: 10 }, (_, i) => ({
          name: `SECRET_${i}`,
          file: 'app.tsx',
          line: i,
          reason: 'secret-pattern' as const,
          secretPattern: 'sk_',
        })),
        readButUndeclared: [],
        declaredButUnread: [],
        unauditable: [],
      };

      await sendAuditToSlack(result, 'https://hooks.slack.com/services/T123/B123/abc');

      const payload = JSON.parse(
        vi.mocked(global.fetch).mock.calls[0][1]?.body as string,
      );
      const blockText = JSON.stringify(payload.blocks);

      // Should show first 5 items and "and X more"
      expect(blockText).toContain('SECRET_0');
      expect(blockText).toContain('and 5 more');
    });

    it('sends workspace audit results', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);

      const workspace: WorkspaceAuditResult = {
        packages: [
          {
            packageName: '@my-org/api',
            packageDir: 'packages/api',
            result: {
              scannedFiles: 5,
              scannedEnvFiles: 1,
              clientExposed: [
                {
                  name: 'DB_PASSWORD',
                  file: 'src/db.ts',
                  line: 8,
                  reason: 'missing-prefix',
                },
              ],
              readButUndeclared: [],
              declaredButUnread: [],
              unauditable: [],
            },
          },
          {
            packageName: '@my-org/web',
            packageDir: 'packages/web',
            result: {
              scannedFiles: 3,
              scannedEnvFiles: 1,
              clientExposed: [],
              readButUndeclared: [
                {
                  name: 'NEXT_PUBLIC_API_URL',
                  accessType: 'member',
                  file: 'app/page.tsx',
                  line: 5,
                  column: 10,
                  isClientFile: true,
                },
              ],
              declaredButUnread: [],
              unauditable: [],
            },
          },
        ],
      };

      await sendAuditToSlack(workspace, 'https://hooks.slack.com/services/T123/B123/abc');

      expect(mockFetch).toHaveBeenCalledOnce();

      const payload = JSON.parse(
        vi.mocked(global.fetch).mock.calls[0][1]?.body as string,
      );
      expect(payload.text).toBe('📦 Monorepo Audit Results');

      const blockText = JSON.stringify(payload.blocks);
      expect(blockText).toContain('@my-org/api');
      expect(blockText).toContain('@my-org/web');
      expect(blockText).toContain('DB_PASSWORD');
    });

    it('does not send workspace if all packages are clean', async () => {
      const mockFetch = vi.mocked(global.fetch);

      const workspace: WorkspaceAuditResult = {
        packages: [
          {
            packageName: '@my-org/api',
            packageDir: 'packages/api',
            result: {
              scannedFiles: 5,
              scannedEnvFiles: 1,
              clientExposed: [],
              readButUndeclared: [],
              declaredButUnread: [],
              unauditable: [],
            },
          },
        ],
      };

      await sendAuditToSlack(
        workspace,
        'https://hooks.slack.com/services/T123/B123/abc',
      );

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('throws on webhook error', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      } as Response);

      const result: AuditResult = {
        scannedFiles: 5,
        scannedEnvFiles: 2,
        clientExposed: [
          {
            name: 'SECRET',
            file: 'app.tsx',
            line: 1,
            reason: 'secret-pattern',
            secretPattern: 'sk_',
          },
        ],
        readButUndeclared: [],
        declaredButUnread: [],
        unauditable: [],
      };

      await expect(
        sendAuditToSlack(
          result,
          'https://hooks.slack.com/services/T123/B123/abc',
        ),
      ).rejects.toThrow('Slack webhook failed: 401 Unauthorized');
    });

    it('includes project path in header when provided', async () => {
      const mockFetch = vi.mocked(global.fetch);
      mockFetch.mockResolvedValueOnce({ ok: true } as Response);

      const result: AuditResult = {
        scannedFiles: 1,
        scannedEnvFiles: 1,
        clientExposed: [
          {
            name: 'KEY',
            file: 'app.tsx',
            line: 1,
            reason: 'secret-pattern',
            secretPattern: 'sk_',
          },
        ],
        readButUndeclared: [],
        declaredButUnread: [],
        unauditable: [],
      };

      await sendAuditToSlack(
        result,
        'https://hooks.slack.com/services/T123/B123/abc',
        'apps/my-app',
      );

      const payload = JSON.parse(
        vi.mocked(global.fetch).mock.calls[0][1]?.body as string,
      );
      const blockText = JSON.stringify(payload.blocks);

      expect(blockText).toContain('apps/my-app');
    });
  });
});
