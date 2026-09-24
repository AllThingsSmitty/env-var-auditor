import { describe, it, expect } from 'vitest';
import { resolveEffectiveConfig, DEFAULT_VSCODE_SETTINGS } from '../src/configResolver.js';
import type { VsCodeAuditorSettings } from '../src/configResolver.js';
import type { EnvAuditorConfig } from 'env-var-auditor';

function settings(overrides: Partial<VsCodeAuditorSettings> = {}): VsCodeAuditorSettings {
  return { ...DEFAULT_VSCODE_SETTINGS, ...overrides };
}

describe('resolveEffectiveConfig', () => {
  it('uses built-in defaults when there is no file config and no VS Code overrides', () => {
    const result = resolveEffectiveConfig(settings(), null);
    expect(result).toEqual({
      enable: true,
      ignorePatterns: [],
      secretPatterns: [],
      debounceMs: 300,
    });
  });

  it('additively merges ignore: file config first, then VS Code setting', () => {
    const fileConfig: EnvAuditorConfig = { ignore: ['**/fixtures/**'] };
    const result = resolveEffectiveConfig(settings({ ignore: ['**/scripts/**'] }), fileConfig);
    expect(result.ignorePatterns).toEqual(['**/fixtures/**', '**/scripts/**']);
  });

  it('additively merges secretPatterns: file config first, then VS Code setting', () => {
    const fileConfig: EnvAuditorConfig = { secretPatterns: ['CUSTOM_SECRET'] };
    const result = resolveEffectiveConfig(settings({ secretPatterns: ['API_KEY'] }), fileConfig);
    expect(result.secretPatterns).toEqual(['CUSTOM_SECRET', 'API_KEY']);
  });

  it('de-duplicates identical entries appearing in both sources', () => {
    const fileConfig: EnvAuditorConfig = { ignore: ['**/dist/**'] };
    const result = resolveEffectiveConfig(settings({ ignore: ['**/dist/**', '**/out/**'] }), fileConfig);
    expect(result.ignorePatterns).toEqual(['**/dist/**', '**/out/**']);
  });

  it('lets the VS Code setting simply override enable (no config-file equivalent)', () => {
    const result = resolveEffectiveConfig(settings({ enable: false }), { ignore: [] });
    expect(result.enable).toBe(false);
  });

  it('lets the VS Code setting simply override debounceMs (no config-file equivalent)', () => {
    const result = resolveEffectiveConfig(settings({ debounceMs: 750 }), null);
    expect(result.debounceMs).toBe(750);
  });

  it('handles a file config with no ignore/secretPatterns fields at all', () => {
    const result = resolveEffectiveConfig(settings({ ignore: ['**/scripts/**'] }), { format: 'json' });
    expect(result.ignorePatterns).toEqual(['**/scripts/**']);
    expect(result.secretPatterns).toEqual([]);
  });
});
