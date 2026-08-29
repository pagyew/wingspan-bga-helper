// esbuild is not always installable in a sandbox, and a broken relative import
// is the failure that wastes the most time when it finally is. Resolve the whole
// graph from both entry points with nothing but the filesystem.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

const ENTRIES = ['src/page/collector.js', 'src/ui/boot.js', 'src/sw.js', 'src/options.js'];
const seen = new Set();
const problems = [];

async function walk(file) {
  if (seen.has(file)) return;
  seen.add(file);
  if (!existsSync(file)) {
    problems.push(`missing: ${file}`);
    return;
  }
  const source = await readFile(file, 'utf8');
  const specifiers = [...source.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  for (const spec of specifiers) {
    if (!spec.startsWith('.')) {
      problems.push(`${file}: bare import "${spec}" — src/ must stay dependency-free`);
      continue;
    }
    await walk(relative(process.cwd(), resolve(dirname(file), spec)));
  }
}

for (const entry of ENTRIES) await walk(entry);

if (problems.length) {
  for (const p of problems) console.error('  ✗ ' + p);
  process.exit(1);
}
console.log(`imports ok (${seen.size} modules reachable from ${ENTRIES.length} entry points)`);
