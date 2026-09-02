#!/usr/bin/env node
// Replays test/fixtures/corpus/decisions.json through the evaluator.
//
//   npm run corpus                          the three measurements
//   npm run corpus -- --sweep playShare 0.2 0.9 0.05    one weight, swept
//   npm run corpus -- --regret              how far the human's move sat from the top
//
// Numbers printed here belong in docs/benchmarks.md with date and commit.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createEngine, WEIGHTS } from '../src/engine/index.js';
import { replay, decisionToState } from '../src/engine/corpus.js';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(here, '../test/fixtures/corpus/decisions.json'), 'utf8'));
const engine = createEngine();
const argv = process.argv.slice(2);
const f2 = (x) => x.toFixed(2);

if (argv[0] === '--sweep') {
  const [, key, lo, hi, step] = argv;
  if (!key) { console.error('usage: npm run corpus -- --sweep <weight> <from> <to> <step>'); process.exit(1); }
  for (let x = Number(lo); x <= Number(hi) + 1e-9; x += Number(step)) {
    const r = replay(corpus, engine, { ...WEIGHTS, [key]: x });
    console.log(`${key} ${x.toFixed(3)}  rmse ${f2(r.rmse)}  top-1 ${r.top1}/${r.positions}  illegal ${r.illegal}  ${JSON.stringify(r.mix)}`);
  }
} else if (argv[0] === '--regret') {
  const buckets = {};
  for (const game of corpus.games) {
    for (const d of game.decisions) {
      const result = engine.suggest(decisionToState(d));
      if (!result.options.length) continue;
      const played = d.actual.played[0];
      const chosen = result.options.find((o) =>
        d.actual.action === 'playbird'
          ? o.action.type === 'playBird' && played && o.action.bird === played.key && o.action.habitat === played.habitat
          : o.action.type === 'row' && o.action.habitat === d.actual.action);
      if (!chosen) continue;
      (buckets[d.actual.action] ??= []).push(result.options[0].gain - chosen.gain);
    }
  }
  console.log('How far behind the top option the human\'s move ranked, in VP:');
  for (const [action, xs] of Object.entries(buckets)) {
    xs.sort((a, b) => a - b);
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    console.log(`  ${action.padEnd(10)} n=${String(xs.length).padStart(3)}  median ${f2(xs[xs.length >> 1])}  mean ${f2(mean)}  max ${f2(xs[xs.length - 1])}`);
  }
} else {
  const r = replay(corpus, engine);
  const games = corpus.games.map((g) => `#${g.table} ${g.myName} ${g.finalScore[g.myName]}`).join(', ');
  console.log(`corpus: ${corpus.games.length} games (${games}), ${r.positions} decisions\n`);
  console.log(`1) legality   moves played by the human that the evaluator never listed: ${r.illegal}`);
  r.misses.forEach((m) => console.log(`     ${m}`));
  console.log(`2) calibration  RMSE of the final-score forecast: ${f2(r.rmse)} VP`);
  for (const [round, x] of Object.entries(r.rounds))
    console.log(`     round ${round}: n=${x.n}  bias ${f2(x.bias)}  rmse ${f2(x.rmse)}`);
  console.log(`3) agreement  top-1 ${r.top1}/${r.positions} · top-2 ${r.top2}/${r.positions} · top-3 ${r.top3}/${r.positions}`);
  console.log(`     by move: ${JSON.stringify(Object.fromEntries(Object.entries(r.byAction).map(([k, v]) => [k, `${v.top1}/${v.n}`])))}`);
  console.log(`     what the evaluator picks: ${JSON.stringify(r.mix)}`);
}
