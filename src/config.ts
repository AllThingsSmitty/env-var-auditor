import fs from 'fs';
import path from 'path';
import type { EnvAuditorConfig } from './types.js';

export function loadConfig(dir: string, explicitPath?: string): EnvAuditorConfig | null {
  const configPath = explicitPath ?? path.join(dir, '.env-auditorrc.json');

  if (!fs.existsSync(configPath)) {
    if (explicitPath) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    return null;
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(
      `Failed to parse config file ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Config file ${configPath} must be a JSON object, not ${Array.isArray(parsed) ? 'array' : typeof parsed}`);
  }

  const config = parsed as Record<string, unknown>;

  if ('ignore' in config && !Array.isArray(config.ignore)) {
    throw new Error(`Config field "ignore" must be an array, got ${typeof config.ignore}`);
  }

  if ('format' in config && (config.format !== 'table' && config.format !== 'json')) {
    throw new Error(
      `Config field "format" must be "table" or "json", got "${config.format}"`,
    );
  }

  if ('secretPatterns' in config && !Array.isArray(config.secretPatterns)) {
    throw new Error(
      `Config field "secretPatterns" must be an array, got ${typeof config.secretPatterns}`,
    );
  }

  if ('baselinePath' in config && typeof config.baselinePath !== 'string') {
    throw new Error(
      `Config field "baselinePath" must be a string, got ${typeof config.baselinePath}`,
    );
  }

  return {
    ignore: config.ignore as string[] | undefined,
    format: config.format as 'table' | 'json' | undefined,
    secretPatterns: config.secretPatterns as string[] | undefined,
    baselinePath: config.baselinePath as string | undefined,
  };
}
