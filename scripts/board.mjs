#!/usr/bin/env node
/**
 * Печать состояния доски: вехи с прогрессом, что в работе, что готово взять.
 *
 * Цель — чтобы сессия, начатая с нуля, за одну команду понимала, где проект.
 * Всё читается из GitHub через gh; ничего не меняется.
 *
 *   npm run board                 все открытые вехи
 *   npm run board -- --all        включая закрытые
 *   npm run board -- B2           только эта веха
 */
import { execFileSync } from 'node:child_process';

const SLUG = process.env.SLUG || 'pagyew/wingspan-bga-helper';
const args = process.argv.slice(2);
const showAll = args.includes('--all');
const filter = args.find(a => !a.startsWith('-'));

function gh(path) {
  try {
    return JSON.parse(execFileSync('gh', ['api', path, '--paginate'], {
      encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
    }).replace(/\]\s*\[/g, ','));      // --paginate склеивает страницы как ][
  } catch (e) {
    if (e.code === 'ENOENT') fail('нужен gh CLI: https://cli.github.com');
    fail(String(e.stderr || e.message).trim());
  }
}

function fail(msg) { console.error('board: ' + msg); process.exit(1); }

const bar = (done, total, width = 24) => {
  if (!total) return '·'.repeat(width);
  const n = Math.round((done / total) * width);
  return '█'.repeat(n) + '·'.repeat(width - n);
};

const milestones = gh(`repos/${SLUG}/milestones?state=all&per_page=100`)
  .filter(m => showAll || m.state === 'open')
  .filter(m => !filter || m.title.toLowerCase().startsWith(filter.toLowerCase()))
  .sort((a, b) => a.title.localeCompare(b.title));

const issues = gh(`repos/${SLUG}/issues?state=all&per_page=100`).filter(i => !i.pull_request);
const prs = gh(`repos/${SLUG}/pulls?state=open&per_page=100`);

const openBlockers = new Set(issues.filter(i => i.state === 'open').map(i => i.number));
const blockedBy = i => [...String(i.body || '').matchAll(/blocked by #(\d+)/gi)]
  .map(m => Number(m[1])).filter(n => openBlockers.has(n));

const prForIssue = new Map();
for (const p of prs) {
  for (const m of String(p.body || '').matchAll(/(?:closes|fixes|resolves)\s+#(\d+)/gi)) {
    prForIssue.set(Number(m[1]), p);
  }
}

console.log(`\n  ${SLUG}\n`);

let ready = [], inWork = [];

for (const m of milestones) {
  const mine = issues.filter(i => i.milestone && i.milestone.number === m.number);
  const done = mine.filter(i => i.state === 'closed').length;
  const state = m.state === 'closed' ? ' (закрыта)' : '';
  console.log(`  ${m.title}${state}`);
  console.log(`  ${bar(done, mine.length)}  ${done}/${mine.length}`);
  for (const i of mine.filter(i => i.state === 'open')) {
    const pr = prForIssue.get(i.number);
    const blocks = blockedBy(i);
    const who = i.assignee ? `@${i.assignee.login}` : '';
    const mark = pr ? `PR #${pr.number}` : blocks.length ? `ждёт #${blocks.join(', #')}` : who || '';
    console.log(`    #${String(i.number).padEnd(3)} ${i.title}${mark ? '   — ' + mark : ''}`);
    if (pr || i.assignee) inWork.push(i);
    else if (!blocks.length) ready.push({ i, m });
  }
  console.log('');
}

if (inWork.length > 1) {
  console.log(`  ⚠ в работе больше одной задачи (${inWork.map(i => '#' + i.number).join(', ')}) — инвариант 2 процесса\n`);
}

const next = ready[0];
console.log(next
  ? `  Следующая: #${next.i.number} ${next.i.title}   [${next.m.title}]\n`
  : '  Готовых к работе задач нет — либо всё в работе, либо всё заблокировано.\n');
