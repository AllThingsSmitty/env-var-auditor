import fs from 'fs';
import path from 'path';
import type { BaselineData } from './baseline.js';

export interface ProgressEntry {
  timestamp: string;
  version: string;
  findings: {
    clientExposed: number;
    readButUndeclared: number;
    declaredButUnread: number;
  };
}

export function createProgressEntry(baseline: BaselineData): ProgressEntry {
  return {
    timestamp: baseline.timestamp,
    version: baseline.version,
    findings: {
      clientExposed: baseline.findings.clientExposed.length,
      readButUndeclared: baseline.findings.readButUndeclared.length,
      declaredButUnread: baseline.findings.declaredButUnread.length,
    },
  };
}

export function getDefaultProgressPath(dir: string): string {
  return path.join(dir, '.env-auditor-progress.json');
}

export function resolveProgressPath(dir: string, configPath: string | undefined): string {
  if (configPath) {
    return path.resolve(dir, configPath);
  }
  return getDefaultProgressPath(dir);
}

export function loadProgressHistory(progressPath: string): ProgressEntry[] {
  if (!fs.existsSync(progressPath)) {
    return [];
  }

  const content = fs.readFileSync(progressPath, 'utf-8');
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(
      `Failed to parse progress file ${progressPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Progress file ${progressPath} must be a JSON array, got ${typeof parsed}`);
  }

  const validateEntry = (entry: unknown, index: number) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`Progress entry ${index} must be an object, got ${typeof entry}`);
    }

    const e = entry as Record<string, unknown>;

    if (typeof e.timestamp !== 'string') {
      throw new Error(`Progress entry ${index}: timestamp must be a string, got ${typeof e.timestamp}`);
    }

    if (typeof e.version !== 'string') {
      throw new Error(`Progress entry ${index}: version must be a string, got ${typeof e.version}`);
    }

    if (typeof e.findings !== 'object' || e.findings === null || Array.isArray(e.findings)) {
      throw new Error(
        `Progress entry ${index}: findings must be an object, got ${Array.isArray(e.findings) ? 'array' : typeof e.findings}`,
      );
    }

    const findings = e.findings as Record<string, unknown>;

    if (typeof findings.clientExposed !== 'number') {
      throw new Error(
        `Progress entry ${index}: findings.clientExposed must be a number, got ${typeof findings.clientExposed}`,
      );
    }

    if (typeof findings.readButUndeclared !== 'number') {
      throw new Error(
        `Progress entry ${index}: findings.readButUndeclared must be a number, got ${typeof findings.readButUndeclared}`,
      );
    }

    if (typeof findings.declaredButUnread !== 'number') {
      throw new Error(
        `Progress entry ${index}: findings.declaredButUnread must be a number, got ${typeof findings.declaredButUnread}`,
      );
    }
  };

  for (let i = 0; i < parsed.length; i++) {
    validateEntry(parsed[i], i);
  }

  return parsed as ProgressEntry[];
}

export function appendProgressEntry(
  progressPath: string,
  entry: ProgressEntry,
  maxEntries: number = 50,
): ProgressEntry[] {
  const dir = path.dirname(progressPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let history = loadProgressHistory(progressPath);
  history.push(entry);

  if (history.length > maxEntries) {
    history = history.slice(-maxEntries);
  }

  fs.writeFileSync(progressPath, JSON.stringify(history, null, 2) + '\n', 'utf-8');

  return history;
}
