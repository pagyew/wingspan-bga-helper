import { execFileSync } from 'node:child_process';

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

function runCapture(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
}

const bump = process.argv[2] ?? 'patch';
if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error(`Usage: npm run release -- <patch|minor|major>`);
  process.exit(1);
}

const branch = runCapture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== 'main') {
  console.error(`release must run on main (currently on ${branch})`);
  process.exit(1);
}

if (runCapture('git', ['status', '--porcelain'])) {
  console.error('working tree is not clean; commit or stash first');
  process.exit(1);
}

run('git', ['fetch', 'origin', 'main']);
if (runCapture('git', ['rev-parse', 'HEAD']) !== runCapture('git', ['rev-parse', 'origin/main'])) {
  console.error('local main is not up to date with origin/main');
  process.exit(1);
}

run('npm', ['run', 'check']);
run('npm', ['test']);

run('npm', ['version', bump, '-m', 'release: v%s']);
run('git', ['push', '--follow-tags']);

console.log(
  '\nTag pushed. GitHub Actions (release.yml) will build, package and publish the ' +
    'zip as a GitHub Release.'
);
