import { glob } from 'glob';
import fs from 'fs';
import path from 'path';
import { audit } from './audit.js';
import type {
  WorkspaceAuditOptions,
  WorkspaceAuditResult,
  PackageAuditResult,
} from './types.js';

/**
 * Minimal parser for the `packages:` list in pnpm-workspace.yaml.
 * Only handles the common YAML list-of-strings shape — no anchors, merges, etc.
 */
function parseWorkspacePackageGlobs(yamlContent: string): string[] {
  const globs: string[] = [];
  let inPackages = false;

  for (const raw of yamlContent.split('\n')) {
    const line = raw.trimEnd();
    if (/^packages\s*:/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages) {
      const match = line.match(/^\s+-\s+['"]?([^'"#\s]+)['"]?/);
      if (match) {
        globs.push(match[1]);
      } else if (line.trim() && !/^\s/.test(line)) {
        // New top-level key — packages block is over
        break;
      }
    }
  }

  return globs;
}

async function discoverPackages(rootDir: string): Promise<string[]> {
  // Try pnpm-workspace.yaml first
  const workspaceYaml = path.join(rootDir, 'pnpm-workspace.yaml');
  let packageGlobs: string[] = [];

  if (fs.existsSync(workspaceYaml)) {
    const content = fs.readFileSync(workspaceYaml, 'utf-8');
    packageGlobs = parseWorkspacePackageGlobs(content);
  }

  // Fall back to common monorepo conventions
  if (packageGlobs.length === 0) {
    packageGlobs = ['packages/*', 'apps/*'];
  }

  // Resolve each glob to directories that contain a package.json
  const dirs = new Set<string>();
  for (const pattern of packageGlobs) {
    const matches = await glob(pattern, {
      cwd: rootDir,
      absolute: true,
    });
    for (const match of matches) {
      const pkgJson = path.join(match, 'package.json');
      if (fs.existsSync(pkgJson) && fs.statSync(match).isDirectory()) {
        dirs.add(match);
      }
    }
  }

  return [...dirs].sort();
}

function readPackageName(packageDir: string): string {
  const pkgJsonPath = path.join(packageDir, 'package.json');
  try {
    const raw = fs.readFileSync(pkgJsonPath, 'utf-8');
    const parsed = JSON.parse(raw) as { name?: string };
    return parsed.name ?? path.basename(packageDir);
  } catch {
    return path.basename(packageDir);
  }
}

export async function auditWorkspace(
  options: WorkspaceAuditOptions,
): Promise<WorkspaceAuditResult> {
  const rootDir = path.resolve(options.rootDir);
  const packageDirs = await discoverPackages(rootDir);

  if (packageDirs.length === 0) {
    throw new Error(
      `No packages found under ${rootDir}. ` +
        `Check your pnpm-workspace.yaml or that packages/apps directories exist.`,
    );
  }

  const results: PackageAuditResult[] = [];

  for (const packageDir of packageDirs) {
    const packageName = readPackageName(packageDir);
    const result = await audit({
      dir: packageDir,
      rootDir,
      ignorePatterns: options.ignorePatterns,
      secretPatterns: options.secretPatterns,
    });
    results.push({ packageName, packageDir, result });
  }

  return { packages: results };
}
