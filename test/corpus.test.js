// Regression guards on the recorded corpus (milestone B3, see docs/benchmarks.md).
//
// These are ratchets, not targets: they fail when a change makes the evaluator
// measurably worse on real games. Tighten them when a change makes it better.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createEngine } from '../src/engine/index.js';
import { replay } from '../src/engine/corpus.js';
import { turnsLeftInRound } from '../src/engine/from-snapshot.js';

const here = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(here, 'fixtures/corpus/decisions.json'), 'utf8'));
const result = replay(corpus, createEngine());

test('corpus: every recorded decision produces at least one option', () => {
  const total = corpus.games.reduce((a, g) => a + g.decisions.length, 0);
  assert.equal(result.positions, total, 'some position produced no legal move at all');
});

// Four of the 81 come from two games where the recorder double-counted an
// action cube once, which shifts one decision snapshot by a turn — visible
// because the bird played is not even in hand. They are corpus artefacts, not
// rules bugs. Anything above four means the evaluator lost a legal move.
test('corpus: the human\'s move is among the options the evaluator lists', () => {
  assert.ok(result.illegal <= 4, `moves not enumerated: ${result.illegal}\n${result.misses.join('\n')}`);
});

// Birds priced "1 X or 1 Y" (31 of 180 — totalFood below the sum of the food
// icons) were unplayable before, so this is the case that regressed silently.
test('corpus: an "or"-priced bird is playable when only one of its foods is in stock', () => {
  const engine = createEngine();
  const warbler = engine.db.yellowrumpedwarbler;
  assert.ok(warbler.totalFood < warbler.food.reduce((a, x) => a + x, 0) + warbler.foodWild,
    'yellowrumpedwarbler should be an "or"-priced bird');
  const state = {
    round: 2, cubesLeft: 5, goalBoard: 'green',
    goals: [{ description: 'Birds in forest' }, { description: 'Eggs in bowl nests' },
      { description: 'Birds in wetland' }, { description: 'Eggs in ground nests' }],
    feeder: ['seed'], tray: [],
    players: [
      { name: 'me', food: [0, 0, 0, 1, 0], bonus: [], handBirdCount: 1, handBirds: ['yellowrumpedwarbler'], tableau: [] },
      { name: 'opp', food: [0, 0, 0, 0, 0], bonus: [], handBirdCount: 0, handBirds: [], tableau: [] }
    ]
  };
  const options = engine.suggest(state).options;
  assert.ok(options.some((o) => o.action.type === 'playBird' && o.action.bird === 'yellowrumpedwarbler'),
    'a bird costing "invertebrate or seed or fruit" must be payable with one fruit');
});

test('corpus: V forecasts the final score within 10 VP on average', () => {
  assert.ok(result.rmse < 10, `RMSE ${result.rmse.toFixed(2)} — the forecast drifted`);
});

test('corpus: no round is biased by more than 8 VP', () => {
  for (const [round, x] of Object.entries(result.rounds))
    assert.ok(Math.abs(x.bias) < 8, `round ${round}: bias ${x.bias.toFixed(2)}`);
});

test('corpus: the top option matches the human on at least a third of turns', () => {
  assert.ok(result.top1 / result.positions >= 0.33, `top-1 ${result.top1}/${result.positions}`);
});

// counter_cubes lags during animations in about a third of the snapshots; the
// per-habitat cube zones do not. See docs/benchmarks.md.
test('turnsLeftInRound: placed cubes win when the counter disagrees', () => {
  assert.equal(turnsLeftInRound(1, { cubesLeft: 7, cubesPlaced: [1, 1, 0, 0] }), 6);
  assert.equal(turnsLeftInRound(1, { cubesLeft: 6, cubesPlaced: [1, 1, 0, 0] }), 6);
  assert.equal(turnsLeftInRound(1, { cubesLeft: 8, cubesPlaced: [0, 0, 0, 0] }), 8);
  assert.equal(turnsLeftInRound(4, { cubesLeft: 2, cubesPlaced: [1, 1, 1, 0] }), 2);
  // no cube zones read at all: fall back to the counter rather than invent a number
  assert.equal(turnsLeftInRound(2, { cubesLeft: 4 }), 4);
});
