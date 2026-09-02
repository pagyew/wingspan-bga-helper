// Issue #30: random games with invariants held after every move. Full games
// are the cheapest way to find a rule that was modelled wrong.
//
// WINGSPAN_SIM_GAMES controls the sample size — a small one runs in CI,
// `npm run sim:property` is the full 10 000-game run "one command away"
// (see package.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, legalMoves, apply, isTerminal } from '../src/sim/index.js';
import { turnsInRound } from '../src/engine/mat.js';
import { birdCard } from '../src/sim/cards.js';
import { bagTotal, bagIds } from '../src/sim/bag.js';
import { tableauSlots } from '../src/sim/state.js';
import { mulberry32, sampleWeighted } from '../src/sim/rng.js';

const GOAL_POOL = [
  'Birds in the forest', 'Birds in the grassland', 'Birds in the wetland',
  'Eggs in bowl nests', 'Eggs in cavity nests', 'Eggs in ground nests', 'Eggs in platform nests',
  'Birds with eggs in bowl nests', 'Birds with eggs in cavity nests',
  'Total birds', 'Sets of eggs',
];

function pickGoals(rng) {
  const pool = GOAL_POOL.slice();
  const goals = [];
  for (let i = 0; i < 4; i++) goals.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return goals;
}

function playersFor(n) {
  return Array.from({ length: n }, (_, i) => ({ id: 'p' + i }));
}

function checkInvariants(state, totalBirds, label) {
  for (const s of state.seats) {
    assert.ok(s.cubes >= 0 && s.cubes <= turnsInRound(state.round), `${label}: cubes out of range`);
    assert.ok(s.food.every(f => f >= 0), `${label}: negative food`);
  }
  for (const s of state.seats) {
    for (const { slot } of tableauSlots(s)) {
      assert.ok(slot.eggs <= birdCard(slot.card).eggLimit, `${label}: nest egg limit exceeded`);
      assert.ok(slot.eggs >= 0, `${label}: negative eggs`);
    }
  }

  const trayCount = state.tray.filter(c => c != null).length;
  const handCount = state.seats.reduce((a, s) => a + bagTotal(s.hand.known), 0);
  const playedCount = state.seats.reduce((a, s) => a + tableauSlots(s).length, 0);
  const unseenCount = bagTotal(state.unseen);
  const discardCount = bagTotal(state.discard);
  assert.equal(
    unseenCount + trayCount + handCount + playedCount + discardCount,
    totalBirds,
    `${label}: deck conservation broken`
  );
  assert.equal(state.deckSize, unseenCount, `${label}: deckSize/unseen out of sync (perfect information)`);

  const bonusHeld = state.seats.reduce((a, s) => a + bagTotal(s.bonus.known), 0);
  assert.equal(bagTotal(state.bonusUnseen) + bonusHeld, 26, `${label}: bonus-deck conservation broken`);
}

const N = Number(process.env.WINGSPAN_SIM_GAMES) || 300;

test(`${N} random games run to completion with invariants held after every move`, () => {
  let totalSteps = 0;
  for (let seed = 0; seed < N; seed++) {
    const rng = mulberry32(seed * 2654435761 + 1);
    const nPlayers = 2 + (seed % 4);
    const goals = pickGoals(rng);
    let state = setup({ players: playersFor(nPlayers), goals, rng });
    let steps = 0;
    while (!isTerminal(state) && steps < 5000) {
      const moves = legalMoves(state);
      assert.ok(moves.length > 0, `seed ${seed} step ${steps}: no legal moves`);
      const move = moves[0].kind === 'chance' ? sampleWeighted(moves, rng) : moves[Math.floor(rng() * moves.length)];
      state = apply(state, move);
      checkInvariants(state, 170, `seed ${seed} step ${steps}`);
      steps++;
    }
    assert.ok(isTerminal(state), `seed ${seed}: did not terminate within 5000 steps`);
    totalSteps += steps;
  }
  console.log(`  (${N} games, ${totalSteps} total moves)`);
});
