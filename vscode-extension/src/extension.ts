import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { collectAuditInputs, loadConfig, parseCodeFiles, parseEnvFile } from 'env-var-auditor';
import type { EnvAuditorConfig } from 'env-var-auditor';
import { ProjectState } from './projectState.js';
import { resolveEffectiveConfig, DEFAULT_VSCODE_SETTINGS } from './configResolver.js';
import type { EffectiveConfig, VsCodeAuditorSettings } from './configResolver.js';
import { isIgnored } from './ignoreMatcher.js';
import { createDebouncer, createKeyedDebouncer } from './debounce.js';
import type { KeyedDebouncer } from './debounce.js';
import { buildDiagnosticsByFile, createLineTextLookup, normalizeFileKey } from './diagnostics.js';
import { publish } from './diagnosticsPublisher.js';
import { registerWatchers } from './watchers.js';
import { registerCommands } from './commands.js';
import { log, disposeOutputChannel } from './outputChannel.js';

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
// Short coalescing window for the shared "flatten -> analyze -> publish"
// pipeline, separate from the (longer, user-tunable) per-file parse
// debounce, so e.g. a branch switch firing many FS events doesn't run
// analyze() once per file.
const COALESCE_MS = 50;

function isSourceFile(fsPath: string): boolean {
  return SOURCE_EXTENSIONS.some((ext) => fsPath.endsWith(ext));
}

function isEnvFile(fsPath: string): boolean {
  const base = path.basename(fsPath);
  return base === '.env' || base.startsWith('.env.');
}

function readVsCodeSettings(): VsCodeAuditorSettings {
  const config = vscode.workspace.getConfiguration('envVarAuditor');
  return {
    enable: config.get('enable', DEFAULT_VSCODE_SETTINGS.enable),
    ignore: config.get('ignore', DEFAULT_VSCODE_SETTINGS.ignore),
    secretPatterns: config.get('secretPatterns', DEFAULT_VSCODE_SETTINGS.secretPatterns),
    configPath: config.get('configPath', DEFAULT_VSCODE_SETTINGS.configPath),
    debounceMs: config.get('debounceMs', DEFAULT_VSCODE_SETTINGS.debounceMs),
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    log('No workspace folder open — Env Var Auditor is idle.');
    return;
  }
  if (folders.length > 1) {
    void vscode.window.showWarningMessage(
      'Env Var Auditor only audits the first workspace folder in multi-root workspaces.',
    );
  }
  const rootDir = folders[0].uri.fsPath;

  const diagnosticCollection = vscode.languages.createDiagnosticCollection('envVarAuditor');
  context.subscriptions.push(diagnosticCollection);

  const projectState = new ProjectState();
  const lineTextLookup = createLineTextLookup();
  const publishDebouncer = createDebouncer(COALESCE_MS);

  let effectiveConfig: EffectiveConfig = resolveEffectiveConfig(readVsCodeSettings(), null);
  let perFileDebouncer: KeyedDebouncer<string> = createKeyedDebouncer(effectiveConfig.debounceMs);

  function loadEffectiveConfig(): EffectiveConfig {
    const vsCodeSettings = readVsCodeSettings();
    const configPath = vsCodeSettings.configPath
      ? path.isAbsolute(vsCodeSettings.configPath)
        ? vsCodeSettings.configPath
        : path.join(rootDir, vsCodeSettings.configPath)
      : undefined;

    let fileConfig: EnvAuditorConfig | null = null;
    try {
      fileConfig = loadConfig(rootDir, configPath);
    } catch (err) {
      log(`Failed to load .env-auditorrc.json: ${err instanceof Error ? err.message : String(err)}`);
    }
    return resolveEffectiveConfig(vsCodeSettings, fileConfig);
  }

  function schedulePublish(): void {
    publishDebouncer.trigger(() => {
      if (!effectiveConfig.enable) {
        for (const file of projectState.getLastPublishedFiles()) {
          diagnosticCollection.delete(vscode.Uri.file(file));
        }
        projectState.setLastPublishedFiles([]);
        return;
      }
      const analysis = projectState.analyze({ extraSecretPatterns: effectiveConfig.secretPatterns });
      const byFile = buildDiagnosticsByFile(analysis, lineTextLookup);
      publish(diagnosticCollection, byFile, projectState.getLastPublishedFiles());
      projectState.setLastPublishedFiles(byFile.keys());
    });
  }

  function isIgnoredPath(fsPath: string): boolean {
    return isIgnored(fsPath, effectiveConfig.ignorePatterns);
  }

  async function fullRescan(): Promise<void> {
    effectiveConfig = loadEffectiveConfig();

    // Recreate the per-file debouncer in case envVarAuditor.debounceMs
    // changed; cheap since a full rescan clears in-flight edits anyway.
    perFileDebouncer.cancelAll();
    perFileDebouncer = createKeyedDebouncer(effectiveConfig.debounceMs);

    if (!effectiveConfig.enable) {
      projectState.clear();
      diagnosticCollection.clear();
      log('Env Var Auditor is disabled (envVarAuditor.enable = false).');
      return;
    }

    try {
      const inputs = await collectAuditInputs({
        dir: rootDir,
        ignorePatterns: effectiveConfig.ignorePatterns,
        secretPatterns: effectiveConfig.secretPatterns,
        useCache: false,
      });
      // Normalize every declaration/access's file-identity string to VS
      // Code's own Uri.file(...).fsPath casing (e.g. lowercased drive letter
      // on Windows). `collectAuditInputs` sources its paths via `glob`,
      // which yields whatever casing Node/the OS reports (typically an
      // uppercase drive letter on Windows) — different from the lowercase
      // casing `document.uri.fsPath` always uses for the live-edit/disk-watch
      // paths below. Without this, the *same* file could be tracked under
      // two different ProjectState keys across a rescan + a live edit, and
      // diagnostics for one casing could clobber the other's — see the
      // matching comment on `normalizeFileKey` in diagnostics.ts.
      const declarations = inputs.declarations.map((d) => ({ ...d, source: normalizeFileKey(d.source) }));
      const accesses = inputs.accesses.map((a) => ({ ...a, file: normalizeFileKey(a.file) }));
      projectState.seedAll(declarations, accesses);
      log(
        `Rescanned workspace: ${inputs.sourceFiles.length} source file(s), ${inputs.envFiles.length} env file(s).`,
      );
      schedulePublish();
    } catch (err) {
      log(`Rescan failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function scheduleReparse(document: vscode.TextDocument): void {
    if (!effectiveConfig.enable) return;
    const fsPath = document.uri.fsPath;
    const isSource = isSourceFile(fsPath);
    const isEnv = isEnvFile(fsPath);
    if (!isSource && !isEnv) return;
    if (isIgnoredPath(fsPath)) return;

    const key = document.uri.toString();
    const version = document.version;
    const content = document.getText();

    perFileDebouncer.trigger(key, () => {
      // Discard stale results: a newer edit's timer already superseded this one.
      if (document.version !== version) return;

      if (isSource) {
        const accesses = parseCodeFiles([{ path: fsPath, content }]);
        if (projectState.updateAccesses(fsPath, accesses, version)) schedulePublish();
      } else {
        const declarations = parseEnvFile(content, fsPath);
        if (projectState.updateDeclarations(fsPath, declarations, version)) schedulePublish();
      }
    });
  }

  function readFileFromDisk(fsPath: string): string | undefined {
    try {
      return fs.readFileSync(fsPath, 'utf-8');
    } catch {
      return undefined;
    }
  }

  function handleDiskChange(uri: vscode.Uri): void {
    const fsPath = uri.fsPath;
    // If the file is already open in an editor, the document-change path
    // above has more current (possibly unsaved) content — skip the raw
    // FS event to avoid clobbering it with on-disk content.
    const isOpen = vscode.workspace.textDocuments.some((doc) => doc.uri.fsPath === fsPath);
    if (isOpen) return;
    if (isIgnoredPath(fsPath)) return;

    if (isSourceFile(fsPath)) {
      const content = readFileFromDisk(fsPath);
      if (content === undefined) return;
      const accesses = parseCodeFiles([{ path: fsPath, content }]);
      if (projectState.updateAccesses(fsPath, accesses)) schedulePublish();
    } else if (isEnvFile(fsPath)) {
      const content = readFileFromDisk(fsPath);
      if (content === undefined) return;
      const declarations = parseEnvFile(content, fsPath);
      if (projectState.updateDeclarations(fsPath, declarations)) schedulePublish();
    }
  }

  function handleDiskDelete(uri: vscode.Uri): void {
    const fsPath = uri.fsPath;
    if (!projectState.hasFile(fsPath)) return;
    projectState.removeFile(fsPath);
    diagnosticCollection.delete(uri);
    schedulePublish();
  }

  registerWatchers(context, {
    onDocumentChanged: scheduleReparse,
    onDocumentSaved: scheduleReparse,
    onFileChanged: handleDiskChange,
    onFileCreated: handleDiskChange,
    onFileDeleted: handleDiskDelete,
    onFileRenamed: (oldUri, newUri) => {
      handleDiskDelete(oldUri);
      handleDiskChange(newUri);
    },
    onConfigChanged: () => {
      void fullRescan();
    },
    onWorkspaceFoldersChanged: () => {
      // The audited root is fixed at activation time (v1: single-root
      // only); folder-list changes can't retarget it without a reload.
      void vscode.window.showInformationMessage(
        'Workspace folders changed — reload the window for Env Var Auditor to audit the new first folder.',
      );
      void fullRescan();
    },
  });

  registerCommands(context, () => {
    void fullRescan();
  });

  context.subscriptions.push({
    dispose: () => {
      perFileDebouncer.cancelAll();
      publishDebouncer.cancel();
    },
  });

  void fullRescan();
}

export function deactivate(): void {
  disposeOutputChannel();
}
