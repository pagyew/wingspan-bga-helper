// Issue #25: canonical state + pure legalMoves/apply. No DOM, no BGA — these
// tests run in plain Node, same as the rest of the suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, legalMoves, apply, isTerminal, clone, finalScore } from '../src/sim/index.js';
import { mulberry32, sampleWeighted } from '../src/sim/rng.js';

const GOALS = ['Birds in the forest', 'Eggs in bowl nests', 'Total birds', 'Birds in the wetland'];

function players(n) {
  return Array.from({ length: n }, (_, i) => ({ id: 'p' + i }));
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

function playRandomGame(seed, nPlayers = 2, maxSteps = 5000) {
  const rng = mulberry32(seed);
  let state = setup({ players: players(nPlayers), goals: GOALS, rng });
  let steps = 0;
  while (!isTerminal(state) && steps < maxSteps) {
    const moves = legalMoves(state);
    assert.ok(moves.length > 0, `no legal moves at step ${steps}, pending=${JSON.stringify(state.pending)}`);
    const move = moves[0].kind === 'chance' ? sampleWeighted(moves, rng) : moves[Math.floor(rng() * moves.length)];
    state = apply(state, move);
    steps++;
  }
  assert.ok(isTerminal(state), `did not terminate within ${maxSteps} steps`);
  return { state, steps };
}

test('setup() builds the documented shape', () => {
  const rng = mulberry32(1);
  const state = setup({ players: players(2), goals: GOALS, rng });
  assert.equal(state.round, 1);
  assert.equal(state.goalBoard, 'green');
  assert.equal(state.goals.length, 4);
  assert.equal(state.seats.length, 2);
  assert.equal(state.tray.length, 3);
  assert.equal(state.feeder.length, 5);
  for (const seat of state.seats) {
    assert.equal(seat.food.length, 5);
    assert.equal(seat.hand.unknown, 0);
    assert.equal(seat.rows.length, 3);
    for (const row of seat.rows) assert.equal(row.length, 5);
  }
  assert.deepEqual(state.pending.map(p => p.kind), ['discardBonus', 'openingKeep']);
});

test('legalMoves and apply do not mutate their input', () => {
  const rng = mulberry32(2);
  let state = setup({ players: players(2), goals: GOALS, rng });
  for (let i = 0; i < 30 && !isTerminal(state); i++) {
    deepFreeze(state);
    const moves = legalMoves(state); // throws if it tries to write to a frozen object
    const move = moves[0].kind === 'chance' ? moves[0] : moves[0];
    const next = apply(state, move); // throws if apply mutates the frozen input
    assert.notEqual(next, state);
    state = clone(next); // clone() is explicit — nothing deep-copies implicitly by surprise
  }
});

test('clone() produces an independent copy', () => {
  const rng = mulberry32(3);
  const state = setup({ players: players(2), goals: GOALS, rng });
  const copy = clone(state);
  copy.seats[0].food[0] = 999;
  copy.tray[0] = -1;
  assert.notEqual(state.seats[0].food[0], 999);
  assert.notEqual(state.tray[0], -1);
});

test('a game of row actions and plain bird plays runs from setup to the last turn (2..5 players)', () => {
  for (const n of [2, 3, 4, 5]) {
    const { state, steps } = playRandomGame(1000 + n, n);
    assert.equal(state.round, 4);
    assert.ok(steps > 0);
    const score = finalScore(state);
    assert.equal(score.length, n);
    for (const row of score) assert.equal(typeof row.total, 'number');
  }
});

test('no external imports under src/sim — same discipline npm run check enforces for src/', async () => {
  const { readFile } = await import('node:fs/promises');
  const files = ['cards.js', 'bag.js', 'pay.js', 'rng.js', 'state.js', 'engine.js', 'index.js'];
  for (const f of files) {
    const src = await readFile(new URL('../src/sim/' + f, import.meta.url), 'utf8');
    const specifiers = [...src.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)].map(m => m[1]);
    for (const spec of specifiers) assert.ok(spec.startsWith('.'), `${f}: bare import "${spec}"`);
  }
});
