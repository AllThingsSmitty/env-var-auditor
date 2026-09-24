import * as vscode from 'vscode';
import { computeFilesToRepublish } from './projectState.js';

/**
 * Publishes diagnostics for the union of files that currently have findings
 * and files that had findings last round (`previousFiles`), clearing
 * diagnostics (`collection.set(uri, [])`) for files that dropped out. Never
 * touches only the just-edited file — see `ProjectState.filesToRepublish`
 * for why that would be wrong (dedup-by-name can move/drop findings across
 * files).
 */
export function publish(
  collection: vscode.DiagnosticCollection,
  byFile: Map<string, vscode.Diagnostic[]>,
  previousFiles: Iterable<string>,
): void {
  const filesToRepublish = computeFilesToRepublish(byFile.keys(), previousFiles);

  for (const file of filesToRepublish) {
    collection.set(vscode.Uri.file(file), byFile.get(file) ?? []);
  }
}
