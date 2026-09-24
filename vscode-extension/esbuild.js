// Bundles the extension into a single CJS file with esbuild instead of a
// plain `tsc` build. `vsce package` walks `node_modules` to decide what to
// ship, and pnpm's symlinked `node_modules` layout famously trips that walk
// up. Bundling everything except `vscode` itself sidesteps the problem
// entirely: the shipped `dependencies` field is empty, so vsce never needs to
// resolve the workspace symlink for `env-var-auditor`.
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Prints `[watch] build started` / `[watch] build finished` markers that
 * `.vscode/tasks.json`'s background problem matcher watches for. Only
 * active in `--watch` mode so a one-off `--production` build doesn't print
 * misleading "[watch]" text.
 * @type {import('esbuild').Plugin}
 */
const watchLogPlugin = {
  name: 'watch-log',
  setup(build) {
    if (!watch) return;
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      for (const error of result.errors) {
        const loc = error.location;
        if (loc) {
          console.error(`> ${loc.file}:${loc.line}:${loc.column}: error: ${error.text}`);
        } else {
          console.error(`> error: ${error.text}`);
        }
      }
      console.log('[watch] build finished');
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    sourcemap: !production,
    minify: production,
    logLevel: 'silent',
    plugins: [watchLogPlugin],
  });

  if (watch) {
    await ctx.watch();
  } else {
    const result = await ctx.rebuild();
    for (const error of result.errors) {
      const loc = error.location;
      console.error(loc ? `> ${loc.file}:${loc.line}:${loc.column}: error: ${error.text}` : `> error: ${error.text}`);
    }
    await ctx.dispose();
    if (result.errors.length > 0) process.exit(1);
    console.log(`Build complete: dist/extension.js${production ? ' (production)' : ''}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
