import { Project, Node } from 'ts-morph';
import type { EnvAccess } from '../types.js';

// Numeric enum values stable across TypeScript versions
const JSX_REACT_JSX = 4;
const SCRIPT_TARGET_LATEST = 99;

export function parseCodeFiles(
  files: Array<{ path: string; content: string }>,
): EnvAccess[] {
  if (files.length === 0) return [];

  const project = new Project({
    compilerOptions: {
      allowJs: true,
      jsx: JSX_REACT_JSX,
      target: SCRIPT_TARGET_LATEST,
    },
    useInMemoryFileSystem: true,
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  for (const { path, content } of files) {
    project.createSourceFile(path, content, { overwrite: true });
  }

  const accesses: EnvAccess[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    const clientFile = isClientFile(sourceFile);

    sourceFile.forEachDescendant((node) => {
      if (!Node.isPropertyAccessExpression(node)) return;

      const expr = node.getExpression();
      if (!Node.isIdentifier(expr) || expr.getText() !== 'process') return;
      if (node.getName() !== 'env') return;

      // node is `process.env` — inspect its parent for the access pattern
      const parent = node.getParent();
      if (!parent) return;

      if (Node.isPropertyAccessExpression(parent)) {
        // process.env.FOO
        accesses.push({
          name: parent.getName(),
          accessType: 'member',
          file: sourceFile.getFilePath(),
          line: parent.getStartLineNumber(),
          column: parent.getStartLinePos(),
          isClientFile: clientFile,
        });
      } else if (Node.isElementAccessExpression(parent)) {
        const arg = parent.getArgumentExpression();
        if (arg && Node.isStringLiteral(arg)) {
          // process.env['FOO']
          accesses.push({
            name: arg.getLiteralValue(),
            accessType: 'bracket',
            file: sourceFile.getFilePath(),
            line: parent.getStartLineNumber(),
            column: parent.getStartLinePos(),
            isClientFile: clientFile,
          });
        } else {
          // process.env[someVar]
          accesses.push({
            name: null,
            accessType: 'dynamic',
            file: sourceFile.getFilePath(),
            line: parent.getStartLineNumber(),
            column: parent.getStartLinePos(),
            isClientFile: clientFile,
          });
        }
      } else if (Node.isVariableDeclaration(parent)) {
        // const { FOO, BAR } = process.env
        const nameNode = parent.getNameNode();
        if (Node.isObjectBindingPattern(nameNode)) {
          for (const element of nameNode.getElements()) {
            const propNameNode = element.getPropertyNameNode();
            const bindingName = element.getNameNode();

            // { FOO: localName } → env var is FOO; { FOO } → env var is FOO
            let varName: string | null = null;
            if (propNameNode && Node.isIdentifier(propNameNode)) {
              varName = propNameNode.getText();
            } else if (Node.isIdentifier(bindingName)) {
              varName = bindingName.getText();
            }

            if (varName) {
              accesses.push({
                name: varName,
                accessType: 'destructure',
                file: sourceFile.getFilePath(),
                line: element.getStartLineNumber(),
                column: element.getStartLinePos(),
                isClientFile: clientFile,
              });
            }
          }
        }
      } else {
        // Spread, function arg, etc. — cannot determine which vars are accessed
        accesses.push({
          name: null,
          accessType: 'dynamic',
          file: sourceFile.getFilePath(),
          line: node.getStartLineNumber(),
          column: node.getStartLinePos(),
          isClientFile: clientFile,
        });
      }
    });
  }

  return accesses;
}

function isClientFile(sourceFile: ReturnType<Project['getSourceFiles']>[number]): boolean {
  const stmts = sourceFile.getStatements();
  if (stmts.length === 0) return false;
  const first = stmts[0];
  if (!Node.isExpressionStatement(first)) return false;
  const expr = first.getExpression();
  if (!Node.isStringLiteral(expr)) return false;
  return expr.getLiteralValue() === 'use client';
}
