import * as vscode from 'vscode';

/** Registers the `Env Var Auditor: Rescan Workspace` manual command. */
export function registerCommands(context: vscode.ExtensionContext, onRescan: () => void): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('envVarAuditor.rescanWorkspace', () => {
      onRescan();
    }),
  );
}
