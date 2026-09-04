import { execFileSync } from 'node:child_process';

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

function runCapture(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8' }).trim();
}

function remoteBranchExists(branch) {
  return runCapture('git', ['ls-remote', '--heads', 'origin', branch]).length > 0;
}

const bump = process.argv[2] ?? 'patch';
if (!['patch', 'minor', 'major'].includes(bump)) {
  console.error(`Usage: npm run release -- <patch|minor|major>`);
  process.exit(1);
}

const branch = runCapture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch === 'HEAD') {
  console.error('release cannot run from a detached HEAD; check out a branch first');
  process.exit(1);
}

if (runCapture('git', ['status', '--porcelain'])) {
  console.error('working tree is not clean; commit or stash first');
  process.exit(1);
}

// The release tag is what release.yml actually keys off (any branch, any
// tag matching v*), so the branch itself only needs to be in sync with
// whatever the remote already has for it, not specifically main.
if (remoteBranchExists(branch)) {
  run('git', ['fetch', 'origin', branch]);
  if (runCapture('git', ['rev-parse', 'HEAD']) !== runCapture('git', ['rev-parse', `origin/${branch}`])) {
    console.error(`local ${branch} is not up to date with origin/${branch}`);
    process.exit(1);
  }
}

run('npm', ['run', 'check']);
run('npm', ['test']);

run('npm', ['version', bump, '-m', 'release: v%s']);
run('git', ['push', '-u', 'origin', branch, '--follow-tags']);

console.log(
  '\nTag pushed. GitHub Actions (release.yml) will build, package and publish the ' +
    'zip as a GitHub Release.'
);
