// Content scripts are classic scripts: `import` does not work in them. The
// engine, however, is ESM so that the Node tests can run exactly the code that
// ships. esbuild bridges the two — two IIFE bundles, no framework, one command.

import { build, context } from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';

const OUT = 'dist';
const watch = process.argv.includes('--watch');

const entries = [
  { in: 'src/page/collector.js', out: 'page.bundle' },
  { in: 'src/ui/boot.js', out: 'ui.bundle' },
  { in: 'src/sw.js', out: 'sw' },
  { in: 'src/options.js', out: 'options' }
];

const options = {
  entryPoints: entries.map((e) => ({ in: e.in, out: e.out })),
  outdir: OUT,
  bundle: true,
  format: 'iife',
  target: ['chrome111'],
  legalComments: 'inline',
  logLevel: 'info',
  sourcemap: watch ? 'inline' : false,
  minify: !watch
};

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
manifest.version = pkg.version;
await writeFile(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));

await cp('_locales', `${OUT}/_locales`, { recursive: true });
await cp('icons', `${OUT}/icons`, { recursive: true }).catch(() => {});
await cp('src/options.html', `${OUT}/options.html`);

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('watching…');
} else {
  await build(options);
  console.log(`built ${OUT}/ (manifest ${manifest.version})`);
}
