export { audit, collectAuditInputs } from './audit.js';
export { auditWorkspace } from './workspace.js';
export { loadConfig } from './config.js';
export { analyze } from './analyzers/index.js';
export { parseCodeFiles } from './parsers/code.js';
export { parseEnvFile } from './parsers/env-file.js';
export {
  createBaseline,
  saveBaseline,
  loadBaseline,
  validateBaselineVersion,
  compareFindings,
  getDefaultBaselinePath,
} from './baseline.js';
export type {
  AuditOptions,
  AuditResult,
  EnvDeclaration,
  EnvAccess,
  ClientExposedVar,
  AccessType,
  PackageAuditResult,
  WorkspaceAuditResult,
  WorkspaceAuditOptions,
  EnvAuditorConfig,
} from './types.js';
export type { AuditInputs } from './audit.js';
export type { AnalysisResult, AnalyzeOptions } from './analyzers/index.js';
export type { BaselineData, BaselineComparison } from './baseline.js';
