import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const name = `wingspan-bga-helper-${pkg.version}.zip`;
execFileSync('zip', ['-r', '-q', `../${name}`, '.'], { cwd: 'dist', stdio: 'inherit' });
console.log(name);
