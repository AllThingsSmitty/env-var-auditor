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
  ignorePatterns?: string[];
}
