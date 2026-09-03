export interface EnvDeclaration {
  name: string;
  value: string | undefined;
  source: string;
  line: number;
}

export type AccessType = 'member' | 'bracket' | 'destructure' | 'dynamic';

export interface EnvAccess {
  name: string | null;
  accessType: AccessType;
  file: string;
  line: number;
  column: number;
  isClientFile: boolean;
}

export interface ClientExposedVar {
  name: string;
  file: string;
  line: number;
  reason: 'missing-prefix' | 'secret-pattern';
  secretPattern?: string;
}

export interface AuditResult {
  scannedFiles: number;
  scannedEnvFiles: number;
  declaredButUnread: EnvDeclaration[];
  readButUndeclared: EnvAccess[];
  clientExposed: ClientExposedVar[];
  unauditable: EnvAccess[];
}

export interface AuditOptions {
  dir: string;
  /** Repo root for env-file inheritance (monorepo mode). Root .env* files are
   *  merged as base declarations; package-level files overlay them. */
  rootDir?: string;
  ignorePatterns?: string[];
  secretPatterns?: string[];
}

export interface PackageAuditResult {
  packageName: string;
  packageDir: string;
  result: AuditResult;
}

export interface WorkspaceAuditResult {
  packages: PackageAuditResult[];
}

export interface WorkspaceAuditOptions {
  rootDir: string;
  ignorePatterns?: string[];
  secretPatterns?: string[];
}

export interface EnvAuditorConfig {
  ignore?: string[];
  format?: 'table' | 'json';
  secretPatterns?: string[];
  baselinePath?: string;
}
