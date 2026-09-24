// Runs third (see .vscode-test.mjs's explicit `files` order), after the
// baseline (extension.test.ts) and live-editing/disk-watcher (liveEditing.test.ts)
// suites. Uses ConfigurationTarget.Global rather than Workspace so `update()`
// writes to the test host's isolated, ephemeral user profile instead of
// creating a real `.vscode/settings.json` inside the fixture workspace.
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { diagnosticCodes, getActivatedExtension, waitFor, workspaceUri } from './helpers';

const SECTION = 'envVarAuditor';

async function resetSetting(key: string): Promise<void> {
  const config = vscode.workspace.getConfiguration(SECTION);
  // Passing `undefined` removes the override at that target, reverting to
  // the setting's declared default.
  await config.update(key, undefined, vscode.ConfigurationTarget.Global);
}

suite('Configuration: envVarAuditor.ignore / envVarAuditor.enable', function () {
  this.timeout(30000);

  suiteSetup(async function () {
    await getActivatedExtension();
  });

  teardown(async function () {
    await resetSetting('ignore');
    await resetSetting('enable');
    // Each config change triggers an async full rescan — wait for baseline
    // diagnostics to come back before the next test/file runs.
    const uri = workspaceUri('app', 'api', 'route.ts');
    await waitFor(() => diagnosticCodes(uri).includes('read-but-undeclared'), {
      timeoutMs: 10000,
      message: 'baseline diagnostics restored after resetting settings in teardown',
    });
  });

  test('envVarAuditor.ignore removes diagnostics for matching files', async function () {
    const uri = workspaceUri('app', 'page.tsx');
    await waitFor(() => diagnosticCodes(uri).length > 0, {
      message: 'baseline diagnostics present on page.tsx before changing envVarAuditor.ignore',
    });

    const config = vscode.workspace.getConfiguration(SECTION);
    await config.update('ignore', ['**/page.tsx'], vscode.ConfigurationTarget.Global);

    await waitFor(() => vscode.languages.getDiagnostics(uri).length === 0, {
      timeoutMs: 10000,
      message: 'diagnostics on page.tsx to clear once it matches envVarAuditor.ignore',
    });
  });

  test('envVarAuditor.enable = false clears diagnostics; re-enabling restores them', async function () {
    const uri = workspaceUri('app', 'api', 'route.ts');
    await waitFor(() => diagnosticCodes(uri).includes('read-but-undeclared'), {
      message: 'baseline diagnostics present on route.ts before disabling',
    });

    const config = vscode.workspace.getConfiguration(SECTION);
    await config.update('enable', false, vscode.ConfigurationTarget.Global);

    await waitFor(() => vscode.languages.getDiagnostics(uri).length === 0, {
      timeoutMs: 10000,
      message: 'diagnostics to clear once envVarAuditor.enable is false',
    });

    await config.update('enable', true, vscode.ConfigurationTarget.Global);

    await waitFor(() => diagnosticCodes(uri).includes('read-but-undeclared'), {
      timeoutMs: 10000,
      message: 'diagnostics to reappear once envVarAuditor.enable is true again',
    });
  });
});
