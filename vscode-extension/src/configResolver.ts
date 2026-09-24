// Plain TypeScript, no `vscode` import — the actual
// `vscode.workspace.getConfiguration(...)` call happens in `extension.ts`,
// which shapes its result into `VsCodeAuditorSettings` before calling in
// here, keeping this function testable without an extension host.
import type { EnvAuditorConfig } from 'env-var-auditor';
import { mergePatternLists } from './ignoreMatcher.js';

/** Plain-object mirror of the `envVarAuditor.*` settings, as read from VS Code. */
export interface VsCodeAuditorSettings {
  enable: boolean;
  ignore: string[];
  secretPatterns: string[];
  configPath: string;
  debounceMs: number;
}

export interface EffectiveConfig {
  enable: boolean;
  /** `.env-auditorrc.json` ignore + `envVarAuditor.ignore`, additively merged. */
  ignorePatterns: string[];
  /** `.env-auditorrc.json` secretPatterns + `envVarAuditor.secretPatterns`, additively merged. */
  secretPatterns: string[];
  debounceMs: number;
}

export const DEFAULT_VSCODE_SETTINGS: VsCodeAuditorSettings = {
  enable: true,
  ignore: [],
  secretPatterns: [],
  configPath: '',
  debounceMs: 300,
};

/**
 * Merges VS Code settings with the (optional) `.env-auditorrc.json` file,
 * mirroring the CLI's additive-merge pattern (`src/cli.ts`) for `ignore` /
 * `secretPatterns`: config-file entries first, then the VS Code setting's
 * entries. `enable` / `debounceMs` are extension-only concepts with no
 * config-file equivalent, so the VS Code setting simply wins.
 */
export function resolveEffectiveConfig(
  vsCodeSettings: VsCodeAuditorSettings,
  fileConfig: EnvAuditorConfig | null,
): EffectiveConfig {
  return {
    enable: vsCodeSettings.enable,
    ignorePatterns: mergePatternLists(fileConfig?.ignore, vsCodeSettings.ignore),
    secretPatterns: mergePatternLists(fileConfig?.secretPatterns, vsCodeSettings.secretPatterns),
    debounceMs: vsCodeSettings.debounceMs,
  };
}
