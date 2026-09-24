// Thin `vscode`-aware layer: wires editor/filesystem events to plain
// callback functions supplied by `extension.ts`, which owns the actual
// update/debounce/re-analyze logic.
import * as vscode from 'vscode';

const SOURCE_GLOB = '**/*.{ts,tsx,js,jsx,mjs,cjs}';
const ENV_GLOB = '**/.env*';
const CONFIG_GLOB = '**/.env-auditorrc.json';

export interface WatcherCallbacks {
  onDocumentChanged(document: vscode.TextDocument): void;
  onDocumentSaved(document: vscode.TextDocument): void;
  /** Disk change to a watched file that isn't necessarily open in an editor. */
  onFileChanged(uri: vscode.Uri): void;
  onFileCreated(uri: vscode.Uri): void;
  onFileDeleted(uri: vscode.Uri): void;
  onFileRenamed(oldUri: vscode.Uri, newUri: vscode.Uri): void;
  /** Any change under `.env-auditorrc.json`, or an `envVarAuditor.*` setting. */
  onConfigChanged(): void;
  onWorkspaceFoldersChanged(): void;
}

export function registerWatchers(context: vscode.ExtensionContext, callbacks: WatcherCallbacks): void {
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => callbacks.onDocumentChanged(e.document)),
    vscode.workspace.onDidSaveTextDocument((doc) => callbacks.onDocumentSaved(doc)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('envVarAuditor')) callbacks.onConfigChanged();
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => callbacks.onWorkspaceFoldersChanged()),
    vscode.workspace.onDidCreateFiles((e) => {
      for (const uri of e.files) callbacks.onFileCreated(uri);
    }),
    vscode.workspace.onDidDeleteFiles((e) => {
      for (const uri of e.files) callbacks.onFileDeleted(uri);
    }),
    vscode.workspace.onDidRenameFiles((e) => {
      for (const { oldUri, newUri } of e.files) callbacks.onFileRenamed(oldUri, newUri);
    }),
  );

  const sourceWatcher = vscode.workspace.createFileSystemWatcher(SOURCE_GLOB);
  sourceWatcher.onDidChange((uri) => callbacks.onFileChanged(uri));
  sourceWatcher.onDidCreate((uri) => callbacks.onFileCreated(uri));
  sourceWatcher.onDidDelete((uri) => callbacks.onFileDeleted(uri));

  const envWatcher = vscode.workspace.createFileSystemWatcher(ENV_GLOB);
  envWatcher.onDidChange((uri) => callbacks.onFileChanged(uri));
  envWatcher.onDidCreate((uri) => callbacks.onFileCreated(uri));
  envWatcher.onDidDelete((uri) => callbacks.onFileDeleted(uri));

  // `.env-auditorrc.json` changes can change the *set* of scanned files
  // (ignore/secretPatterns), so any change to it triggers a full rescan
  // rather than an incremental per-file update.
  const configWatcher = vscode.workspace.createFileSystemWatcher(CONFIG_GLOB);
  configWatcher.onDidChange(() => callbacks.onConfigChanged());
  configWatcher.onDidCreate(() => callbacks.onConfigChanged());
  configWatcher.onDidDelete(() => callbacks.onConfigChanged());

  context.subscriptions.push(sourceWatcher, envWatcher, configWatcher);
}
