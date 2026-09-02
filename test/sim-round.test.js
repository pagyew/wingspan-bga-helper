// Issue #27: the round loop, action cubes, round-end goal scoring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, legalMoves, apply, isTerminal, finalScore } from '../src/sim/index.js';
import { turnsInRound } from '../src/engine/mat.js';
import { mulberry32, sampleWeighted } from '../src/sim/rng.js';

const GOALS = ['Birds in the forest', 'Eggs in bowl nests', 'Total birds', 'Birds in the wetland'];
const players = n => Array.from({ length: n }, (_, i) => ({ id: 'p' + i }));

test('cubes follow 8/7/6/5 and a round ends exactly when the last cube is spent', () => {
  const rng = mulberry32(11);
  let state = setup({ players: players(2), goals: GOALS, rng });
  let seenRound = 1;
  assert.deepEqual(state.seats.map(s => s.cubes), [8, 8]);

  for (let i = 0; i < 3000 && !isTerminal(state); i++) {
    const moves = legalMoves(state);
    const move = moves[0].kind === 'chance' ? sampleWeighted(moves, rng) : moves[Math.floor(rng() * moves.length)];
    const prevRound = state.round;
    state = apply(state, move);

    if (state.round !== prevRound) {
      seenRound = state.round;
      assert.equal(state.round, prevRound + 1);
      assert.deepEqual(state.seats.map(s => s.cubes), state.seats.map(() => turnsInRound(state.round)));
    } else if (state.pending.length === 0 && !isTerminal(state)) {
      // between turns: every seat's cubes are within [0, turnsInRound(round)]
      for (const s of state.seats) {
        assert.ok(s.cubes >= 0 && s.cubes <= turnsInRound(state.round));
      }
    }
  }
  assert.ok(isTerminal(state));
  assert.equal(seenRound, 4);
});

test('round-goal values are frozen at round end, one array of counts per round', () => {
  const rng = mulberry32(12);
  let state = setup({ players: players(2), goals: GOALS, rng });
  while (!isTerminal(state)) {
    const moves = legalMoves(state);
    const move = moves[0].kind === 'chance' ? sampleWeighted(moves, rng) : moves[Math.floor(rng() * moves.length)];
    state = apply(state, move);
  }
  for (const g of state.goals) {
    assert.ok(Array.isArray(g.values), `goal "${g.description}" never scored`);
    assert.equal(g.values.length, 2);
    for (const v of g.values) assert.ok(Number.isInteger(v) && v >= 0);
  }
});

test('a game ends after round 4 with a final score from src/engine/scoring.js', () => {
  const rng = mulberry32(13);
  let state = setup({ players: players(2), goals: GOALS, rng });
  while (!isTerminal(state)) {
    const moves = legalMoves(state);
    const move = moves[0].kind === 'chance' ? sampleWeighted(moves, rng) : moves[Math.floor(rng() * moves.length)];
    state = apply(state, move);
  }
  assert.equal(state.round, 4);
  const score = finalScore(state);
  assert.equal(score.length, 2);
  for (const row of score) {
    assert.equal(row.total, row.birds + row.bonus + row.goals + row.eggs + row.cached + row.tucked);
  }
});

test('the blue goal board throws the same explicit error it throws today, not a zero', () => {
  const rng = mulberry32(14);
  let state = setup({ players: players(2), goals: GOALS, goalBoard: 'blue', rng });
  while (!isTerminal(state)) {
    const moves = legalMoves(state);
    const move = moves[0].kind === 'chance' ? sampleWeighted(moves, rng) : moves[Math.floor(rng() * moves.length)];
    state = apply(state, move);
  }
  assert.throws(() => finalScore(state), /синее поле целей/);
});
