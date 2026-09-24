// Runs second (see .vscode-test.mjs's explicit `files` order): perturbs the
// baseline diagnostics established in extension.test.ts via (a) an in-editor
// TextEditor.edit(), and (b) raw fs create/delete outside the editor — then
// restores everything so config.test.ts starts from the same baseline.
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { diagnosticCodes, getActivatedExtension, waitFor, workspaceUri } from './helpers';

suite('Live editing & filesystem watcher', function () {
  this.timeout(30000);

  suiteSetup(async function () {
    await getActivatedExtension();
  });

  test('editing an open document updates diagnostics after the debounce window', async function () {
    const uri = workspaceUri('app', 'page.tsx');
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);
    const originalText = document.getText();

    try {
      // Baseline (asserted already in extension.test.ts): DATABASE_URL is
      // flagged client-exposed/missing-prefix in this file.
      await waitFor(() => diagnosticCodes(uri).includes('client-exposed-missing-prefix'), {
        message: 'baseline client-exposed-missing-prefix diagnostic before editing',
      });

      const idx = document.getText().indexOf('process.env.DATABASE_URL');
      assert.ok(idx !== -1, 'fixture no longer contains the expected "process.env.DATABASE_URL" access');
      const insertPos = document.positionAt(idx + 'process.env.'.length);

      // NEXT_PUBLIC_DATABASE_URL has the public prefix and matches no secret
      // pattern, so the clientExposed finding should disappear; since it's
      // also not declared in .env.example, a read-but-undeclared warning
      // should appear in its place.
      await editor.edit((builder) => {
        builder.insert(insertPos, 'NEXT_PUBLIC_');
      });

      await waitFor(() => !diagnosticCodes(uri).includes('client-exposed-missing-prefix'), {
        timeoutMs: 10000,
        message: 'client-exposed-missing-prefix diagnostic to clear after the edit',
      });

      const diags = vscode.languages.getDiagnostics(uri);
      const newWarning = diags.find(
        (d) => d.code === 'read-but-undeclared' && String(d.message).includes('NEXT_PUBLIC_DATABASE_URL'),
      );
      assert.ok(
        newWarning,
        `expected a new read-but-undeclared diagnostic for NEXT_PUBLIC_DATABASE_URL, got: ${diags
          .map((d) => `${d.code}:${d.message}`)
          .join(' | ')}`,
      );
    } finally {
      // Always attempt to restore the original content and close the editor,
      // even if an assertion above failed — otherwise a leftover open/dirty
      // buffer for page.tsx would corrupt the baseline for config.test.ts.
      // Reverting via a direct edit() reuses the exact mechanism already
      // proven to trigger the onDidChangeTextDocument -> debounce -> republish
      // pipeline above, rather than relying on `workbench.action.files.revert`.
      // The document is still "dirty" afterwards even though its content now
      // matches disk exactly (VS Code tracks dirty state via the edit
      // history, not a content diff), so closing uses
      // `revertAndCloseActiveEditor` — which explicitly discards unsaved
      // changes — to avoid a save-prompt dialog that would hang the suite.
      try {
        const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length));
        await editor.edit((builder) => builder.replace(fullRange, originalText));
        await waitFor(() => diagnosticCodes(uri).includes('client-exposed-missing-prefix'), {
          timeoutMs: 10000,
          message: 'baseline diagnostics to restore after reverting the edit',
        });
      } finally {
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
      }
    }
  });

  test('creating and deleting a file on disk updates diagnostics via the FileSystemWatcher', async function () {
    const fsPath = path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, 'app', 'disk-watch-temp.ts');
    const uri = vscode.Uri.file(fsPath);
    assert.ok(!fs.existsSync(fsPath), 'temp disk-watch fixture file unexpectedly already exists');

    try {
      // Written directly via `fs`, not through an open editor, so this
      // exercises the FileSystemWatcher/onDidCreateFiles path in
      // extension.ts rather than the onDidChangeTextDocument path.
      fs.writeFileSync(
        fsPath,
        "export const diskWatchProbe = process.env.DISK_WATCH_UNDECLARED_VAR;\n",
        'utf-8',
      );

      await waitFor(() => diagnosticCodes(uri).includes('read-but-undeclared'), {
        timeoutMs: 10000,
        message: 'read-but-undeclared diagnostic for the newly created disk file',
      });
      const diags = vscode.languages.getDiagnostics(uri);
      assert.ok(diags.some((d) => String(d.message).includes('DISK_WATCH_UNDECLARED_VAR')));
    } finally {
      fs.rmSync(fsPath, { force: true });
    }

    await waitFor(() => vscode.languages.getDiagnostics(uri).length === 0, {
      timeoutMs: 10000,
      message: 'diagnostics for the deleted disk file to clear',
    });
  });
});
