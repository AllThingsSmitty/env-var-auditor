export { audit } from './audit.js';
export { auditWorkspace } from './workspace.js';
export { loadConfig } from './config.js';
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
export type { BaselineData, BaselineComparison } from './baseline.js';
