// Shared helpers for the @vscode/test-electron integration suite. Not a
// `*.test.ts` file itself, so it isn't picked up as a Mocha suite — it's
// compiled alongside the tests and `require()`-d by them.
import * as path from 'node:path';
import * as vscode from 'vscode';

/** `${publisher}.${name}` from package.json — used to look up the extension. */
export const EXTENSION_ID = 'AllThingsSmitty.env-var-auditor-vscode';

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetches the extension by id and ensures it's activated (idempotent). */
export async function getActivatedExtension(): Promise<vscode.Extension<unknown>> {
  const ext = vscode.extensions.getExtension(EXTENSION_ID);
  if (!ext) {
    throw new Error(
      `Extension "${EXTENSION_ID}" was not found in the test host — check the publisher/name fields in package.json.`,
    );
  }
  if (!ext.isActive) {
    await ext.activate();
  }
  return ext;
}

/** Resolves a path inside the test workspace (fixtures/nextjs-sample) to a vscode.Uri. */
export function workspaceUri(...segments: string[]): vscode.Uri {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    throw new Error('No workspace folder is open in the test host.');
  }
  return vscode.Uri.file(path.join(folders[0].uri.fsPath, ...segments));
}

/**
 * Polls `predicate` until it returns true or `timeoutMs` elapses. Diagnostics
 * are debounced (default 300ms) and re-published asynchronously, so tests
 * must poll rather than assert immediately after an edit/activation.
 */
export async function waitFor(
  predicate: () => boolean,
  options: { timeoutMs?: number; intervalMs?: number; message?: string } = {},
): Promise<void> {
  const { timeoutMs = 8000, intervalMs = 150, message = 'condition was not met in time' } = options;
  const start = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - start >= timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for: ${message}`);
    }
    await sleep(intervalMs);
  }
}

/** Diagnostic `code` strings currently published for a given file. */
export function diagnosticCodes(uri: vscode.Uri): string[] {
  return vscode.languages.getDiagnostics(uri).map((d) => (typeof d.code === 'string' ? d.code : String(d.code)));
}
