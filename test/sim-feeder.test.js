// Issue #26: feeder reroll and deck/discard reshuffle. Crafted states, not a
// random game — these two rules are rare enough that hunting for them in a
// random playthrough would be slow and flaky.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, legalMoves, apply } from '../src/sim/index.js';
import { mulberry32 } from '../src/sim/rng.js';
import { bagFromList, bagTotal } from '../src/sim/bag.js';

const GOALS = ['Birds in the forest', 'Eggs in bowl nests', 'Total birds', 'Birds in the wetland'];

function baseState() {
  const rng = mulberry32(7);
  let state = setup({ players: [{ id: 'a' }, { id: 'b' }], goals: GOALS, rng });
  // fast-forward through the opening deal with whatever legalMoves offers first
  while (state.phase === 'opening') {
    const moves = legalMoves(state);
    state = apply(state, moves[0]);
  }
  return state;
}

test('feeder rerolls exactly when all five dice show the same face', () => {
  let state = baseState();
  state = { ...state, feeder: [0, 0, 0, 0, null], pending: [{ kind: 'feederRefill', slots: [4] }] };

  const moves = legalMoves(state);
  assert.equal(moves.length, 6); // one chance option per face 0..5
  const matchAll = moves.find(m => m.face === 0);
  state = apply(state, matchAll);

  assert.equal(state.pending[0].kind, 'feederRefill');
  assert.deepEqual(state.pending[0].slots, [0, 1, 2, 3, 4]); // full reroll triggered

  // Resolve the reroll with five different faces — it must not reroll again.
  const faces = [0, 1, 2, 3, 4];
  for (const face of faces) {
    const opts = legalMoves(state);
    const chosen = opts.find(o => o.face === face);
    state = apply(state, chosen);
  }
  assert.equal(state.pending.length, 0);
  assert.deepEqual(state.feeder, faces);
});

test('feeder does not reroll when the refilled dice differ', () => {
  let state = baseState();
  state = { ...state, feeder: [0, 0, 0, 0, null], pending: [{ kind: 'feederRefill', slots: [4] }] };
  const moves = legalMoves(state);
  const differs = moves.find(m => m.face === 3);
  state = apply(state, differs);
  assert.equal(state.pending.length, 0);
  assert.deepEqual(state.feeder, [0, 0, 0, 0, 3]);
});

test('an empty deck reshuffles the discard pile before a tray refill draws', () => {
  let state = baseState();
  const [idA, idB] = [11, 22];
  state = {
    ...state,
    deckSize: 0,
    unseen: {},
    discard: bagFromList([idA, idB]),
    tray: [null, state.tray[1], state.tray[2]],
    pending: [{ kind: 'trayRefill', slot: 0 }],
  };

  const moves = legalMoves(state);
  assert.equal(moves.length, 2); // drawn from the reshuffled discard, one option per id
  assert.equal(moves.reduce((a, m) => a + m.p, 0), 1);

  const chosen = moves[0];
  state = apply(state, chosen);

  assert.deepEqual(state.discard, {});
  assert.equal(state.deckSize, 1); // one card reshuffled in, one drawn
  assert.equal(bagTotal(state.unseen), 1);
  assert.equal(state.tray[0], chosen.card);
  assert.equal(state.pending.length, 0);
});
