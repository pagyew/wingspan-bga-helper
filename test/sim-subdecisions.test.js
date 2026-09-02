// Issue #28: sub-decisions as their own decision nodes. gainFromFeeder,
// placeEgg, takeTrayCard, discardBonus and openingKeep are all exercised by
// the random games in sim.test.js/sim-property.test.js; the two rare paths
// (feeder reroll, deck reshuffle) get sim-feeder.test.js. This file covers
// what those don't: discardBird (unreachable from B1's base rules — see the
// #28 comment — so it needs its own direct test) and that a turn really is
// a sequence of single `apply` calls, not one big atomic action.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, legalMoves, apply } from '../src/sim/index.js';
import { mulberry32 } from '../src/sim/rng.js';
import { bagFromList, bagTotal } from '../src/sim/bag.js';

const GOALS = ['Birds in the forest', 'Eggs in bowl nests', 'Total birds', 'Birds in the wetland'];

function openState() {
  const rng = mulberry32(21);
  let state = setup({ players: [{ id: 'a' }, { id: 'b' }], goals: GOALS, rng });
  while (state.phase === 'opening') {
    const moves = legalMoves(state);
    // Keep the whole opening hand rather than the first (empty-keep) option.
    const move = moves.reduce((best, m) => (m.keep && (!best.keep || m.keep.length > best.keep.length) ? m : best), moves[0]);
    state = apply(state, move);
  }
  return state;
}

test('discardBird is a real decision node, one option per hand card', () => {
  let state = openState();
  const actingSeatId = state.seats[state.active].id;
  const heldIds = Object.keys(state.seats[state.active].hand.known).map(Number);
  assert.ok(heldIds.length > 0);

  state = { ...state, pending: [{ kind: 'discardBird', n: 1 }] };
  const moves = legalMoves(state);
  assert.equal(moves.length, heldIds.length);
  assert.deepEqual(moves.map(m => m.discard).sort((a, b) => a - b), heldIds.sort((a, b) => a - b));

  const before = bagTotal(state.discard);
  state = apply(state, moves[0]);
  assert.equal(bagTotal(state.discard), before + 1);
  const seatAfter = state.seats.find(s => s.id === actingSeatId);
  assert.equal(bagTotal(seatAfter.hand.known), heldIds.length - 1);
  assert.equal(state.pending.length, 0);
});

test('discardBird with an empty hand offers a skip rather than no moves', () => {
  let state = openState();
  state = { ...state, seats: state.seats.map((s, i) => i === state.active ? { ...s, hand: { known: {}, unknown: 0 } } : s), pending: [{ kind: 'discardBird', n: 1 }] };
  const moves = legalMoves(state);
  assert.deepEqual(moves, [{ kind: 'discardBird', skip: true }]);
  const next = apply(state, moves[0]);
  assert.equal(next.pending.length, 0);
});

test('a row action resolves as a sequence of single apply() calls, not one atomic move', () => {
  let state = openState();
  // Force the active seat to a plain forest row action with a known feeder.
  state = { ...state, feeder: [1, 2, 3, 4, 1] };
  const rowAction = legalMoves(state).find(m => m.kind === 'rowAction' && m.habitat === 'forest');
  state = apply(state, rowAction);
  assert.equal(state.pending[0].kind, 'gainFromFeeder');
  assert.ok(state.pending[0].n >= 1);

  const before = state.pending[0].n;
  const dieMove = legalMoves(state)[0];
  state = apply(state, dieMove);
  // Either the counter went down by one, or (n was 1) a feederRefill/next turn followed.
  assert.ok(state.pending[0]?.kind !== 'gainFromFeeder' || state.pending[0].n === before - 1);
});

test('bag helpers round-trip a list', () => {
  const bag = bagFromList([5, 5, 7]);
  assert.deepEqual(bag, { 5: 2, 7: 1 });
  assert.equal(bagTotal(bag), 3);
});
