// Issue #31: the effect DSL and its executor. Covers the eight verbs the
// issue names (gain, lay, tuck, cache, draw, discard, repeat, choose) plus
// the three worked examples from docs/powers.md, run against real card data
// so a mismatch between the doc and the executor shows up here first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, legalMoves, apply } from '../src/sim/index.js';
import { mulberry32 } from '../src/sim/rng.js';
import { birdIdOf } from '../src/sim/cards.js';
import { habitatIndex } from '../src/sim/state.js';
import { runPower } from '../src/sim/powers.js';

const GOALS = ['Birds in the forest', 'Eggs in bowl nests', 'Total birds', 'Birds in the wetland'];

function baseState() {
  const rng = mulberry32(1);
  let state = setup({ players: [{ id: 'a' }, { id: 'b' }], goals: GOALS, rng });
  while (state.phase === 'opening') state = apply(state, legalMoves(state)[0]);
  return state;
}

/** Places a card straight onto seat 0's tableau, bypassing playBird — these
 * are executor unit tests, not a replay, so the card just needs to be there. */
function place(state, col, cardKey, extra = {}) {
  const row = state.seats[0].rows[habitatIndex('forest')];
  row[col - 1] = { card: birdIdOf(cardKey), eggs: 0, tucked: 0, cached: [0, 0, 0, 0, 0], ...extra };
  return state;
}

const origin = (col) => ({ habitat: 'forest', col });

// --- gain --------------------------------------------------------------

test('gain: takes one die of the requested type off the feeder', () => {
  let state = baseState();
  state.feeder = [1, 0, 2, 3, 4];
  state = runPower(state, 0, origin(1), { do: { effect: 'gain', resource: 'food', source: 'feeder', foodType: 1 } });
  assert.equal(state.seats[0].food[1], 1);
  assert.deepEqual(state.feeder, [null, 0, 2, 3, 4]);
});

test('gain: a type the feeder does not show is a no-op ("if available")', () => {
  let state = baseState();
  state.feeder = [2, 2, 3, 3, 4];
  const before = state.seats[0].food.slice();
  state = runPower(state, 0, origin(1), { do: { effect: 'gain', resource: 'food', source: 'feeder', foodType: 1 } });
  assert.deepEqual(state.seats[0].food, before);
  assert.deepEqual(state.feeder, [2, 2, 3, 3, 4]);
});

test('gain: an unspecified type with more than one on the feeder asks resolve()', () => {
  let state = baseState();
  state.feeder = [0, 1, 2, 3, 4];
  const before = state.seats[0].food.slice();
  assert.throws(
    () => runPower(state, 0, origin(1), { do: { effect: 'gain', resource: 'food', source: 'feeder' } }),
    /no resolver was given/
  );
  state = runPower(state, 0, origin(1),
    { do: { effect: 'gain', resource: 'food', source: 'feeder' } },
    { resolve: () => 0 });
  assert.equal(state.seats[0].food[0], before[0] + 1);
});

// --- lay / tuck / cache / draw / discard ---------------------------------

test('lay: onto self adds one egg to this bird', () => {
  let state = baseState();
  place(state, 1, 'acornwoodpecker');
  state = runPower(state, 0, origin(1), { do: { effect: 'lay', onto: 'self' } });
  assert.equal(state.seats[0].rows[habitatIndex('forest')][0].eggs, 1);
});

test('tuck: moves a hand card behind this bird', () => {
  let state = baseState();
  place(state, 1, 'acornwoodpecker');
  state.seats[0].hand.known = { [birdIdOf('graycatbird')]: 1, [birdIdOf('barredowl')]: 1 };
  state = runPower(state, 0, origin(1), { do: { effect: 'tuck', onto: 'self' } },
    { resolve: ({ options }) => options[0] });
  assert.equal(state.seats[0].rows[habitatIndex('forest')][0].tucked, 1);
  assert.equal(Object.values(state.seats[0].hand.known).reduce((a, b) => a + b, 0), 1);
});

test('cache: moves a named food type from the seat onto this bird', () => {
  let state = baseState();
  place(state, 1, 'acornwoodpecker');
  state.seats[0].food = [0, 3, 0, 0, 0];
  state = runPower(state, 0, origin(1), { do: { effect: 'cache', onto: 'self', foodType: 1 } });
  assert.equal(state.seats[0].food[1], 2);
  assert.deepEqual(state.seats[0].rows[habitatIndex('forest')][0].cached, [0, 1, 0, 0, 0]);
});

test('draw: adds cards from the deck to hand', () => {
  let state = baseState();
  const before = Object.values(state.seats[0].hand.known).reduce((a, b) => a + b, 0);
  state = runPower(state, 0, origin(1), { do: { effect: 'draw', source: 'deck', amount: 2 } },
    { resolve: ({ options }) => options[0] });
  const after = Object.values(state.seats[0].hand.known).reduce((a, b) => a + b, 0);
  assert.equal(after, before + 2);
});

test('draw: from the tray removes the card from its slot', () => {
  let state = baseState();
  const card = state.tray[0];
  state = runPower(state, 0, origin(1), { do: { effect: 'draw', source: 'tray', amount: 1 } },
    { resolve: ({ options }) => options[0] });
  assert.equal(state.tray[0], null);
  assert.equal(state.seats[0].hand.known[card] > 0, true);
});

test('discard: from hand removes the card and adds it to the discard pile', () => {
  let state = baseState();
  state.seats[0].hand.known = { [birdIdOf('graycatbird')]: 1 };
  state = runPower(state, 0, origin(1), { do: { effect: 'discard', resource: 'card' } },
    { resolve: ({ options }) => options[0] });
  assert.equal(state.seats[0].hand.known[birdIdOf('graycatbird')], undefined);
  assert.equal(state.discard[birdIdOf('graycatbird')], 1);
});

// --- choose and target ---------------------------------------------------

test('choose: runs whichever branch resolve() picks', () => {
  let state = baseState();
  place(state, 1, 'acornwoodpecker');
  const description = {
    do: {
      effect: 'choose',
      options: [
        { effect: 'lay', onto: 'self' },
        { effect: 'gain', resource: 'food', source: 'feeder', foodType: 0 },
      ],
    },
  };
  state.feeder = [0, 0, 0, 0, 0];
  const before = state.seats[0].food[0];
  state = runPower(state, 0, origin(1), description, { resolve: () => 1 });
  assert.equal(state.seats[0].rows[habitatIndex('forest')][0].eggs, 0);
  assert.equal(state.seats[0].food[0], before + 1);
});

test('target: "each" runs the effect for every seat starting with the acting one', () => {
  let state = baseState();
  state.feeder = [0, 0, 0, 0, 0]; // enough dice of one type for both seats
  const before = state.seats.map((s) => s.food[0]);
  state = runPower(state, 1, origin(1),
    { do: { effect: 'gain', resource: 'food', source: 'feeder', foodType: 0, target: 'each' } });
  assert.equal(state.seats[1].food[0], before[1] + 1);
  assert.equal(state.seats[0].food[0], before[0] + 1);
});

test('target: "others" skips the acting seat', () => {
  let state = baseState();
  state.feeder = [0, 0, 0, 0, 0];
  const before = state.seats.map((s) => s.food[0]);
  state = runPower(state, 0, origin(1),
    { do: { effect: 'gain', resource: 'food', source: 'feeder', foodType: 0, target: 'others' } });
  assert.equal(state.seats[0].food[0], before[0]);
  assert.equal(state.seats[1].food[0], before[1] + 1);
});

// --- cost: a step gated on paying one first (docs/powers.md) --------------
// Killdeer, brown: "Discard 1 [egg] to draw 2 [card]."

const KILLDEER = {
  trigger: 'brown',
  do: {
    effect: 'draw', source: 'deck', amount: 2,
    condition: { check: 'anyBirdMatches', filter: { minEggs: 1 } },
    cost: { effect: 'discard', resource: 'egg' },
  },
};

test('cost: paying an egg unlocks the effect', () => {
  let state = baseState();
  place(state, 1, 'acornwoodpecker', { eggs: 1 });
  const before = Object.values(state.seats[0].hand.known).reduce((a, b) => a + b, 0);
  state = runPower(state, 0, origin(1), KILLDEER, { resolve: ({ options }) => options[0] });
  assert.equal(state.seats[0].rows[habitatIndex('forest')][0].eggs, 0);
  const after = Object.values(state.seats[0].hand.known).reduce((a, b) => a + b, 0);
  assert.equal(after, before + 2);
});

test('cost: no egg to pay with means the whole step, cost included, never runs', () => {
  let state = baseState();
  place(state, 1, 'acornwoodpecker'); // eggs: 0
  const before = Object.values(state.seats[0].hand.known).reduce((a, b) => a + b, 0);
  state = runPower(state, 0, origin(1), KILLDEER,
    { resolve: () => { throw new Error('should not be asked — nothing to pay with'); } });
  assert.equal(state.seats[0].rows[habitatIndex('forest')][0].eggs, 0);
  const after = Object.values(state.seats[0].hand.known).reduce((a, b) => a + b, 0);
  assert.equal(after, before);
});

// --- worked example 1 (docs/powers.md): Acorn Woodpecker, brown -----------
// "Gain 1 [seed] from the birdfeeder, if available. You may cache it on this bird."

const ACORN_WOODPECKER = {
  trigger: 'brown',
  do: {
    effect: 'gain', resource: 'food', source: 'feeder', foodType: 1,
    condition: { check: 'feederHasFoodType', type: 1 },
    then: { effect: 'cache', onto: 'self', optional: true },
  },
};

test('worked example 1: gains a seed and caches it when the player opts in', () => {
  let state = baseState();
  place(state, 1, 'acornwoodpecker');
  state.feeder = [1, 2, 3, 4, 0];
  state = runPower(state, 0, origin(1), ACORN_WOODPECKER, { resolve: () => true });
  assert.equal(state.seats[0].food[1], 0);
  assert.deepEqual(state.seats[0].rows[habitatIndex('forest')][0].cached, [0, 1, 0, 0, 0]);
});

test('worked example 1: declining the cache leaves the seed in hand', () => {
  let state = baseState();
  place(state, 1, 'acornwoodpecker');
  state.feeder = [1, 2, 3, 4, 0];
  state = runPower(state, 0, origin(1), ACORN_WOODPECKER, { resolve: () => false });
  assert.equal(state.seats[0].food[1], 1);
  assert.deepEqual(state.seats[0].rows[habitatIndex('forest')][0].cached, [0, 0, 0, 0, 0]);
});

test('worked example 1: no seed on the feeder skips the whole step, no resolver called', () => {
  let state = baseState();
  place(state, 1, 'acornwoodpecker');
  state.feeder = [2, 2, 3, 3, 4];
  const before = state.seats[0].food.slice();
  state = runPower(state, 0, origin(1), ACORN_WOODPECKER,
    { resolve: () => { throw new Error('should not be asked'); } });
  assert.deepEqual(state.seats[0].food, before);
});

// --- worked example 2 (docs/powers.md): Barred Owl, brown -----------------
// "Look at a [card] from the deck. If less than 75cm, tuck it behind this
// bird. If not, discard it."

const BARRED_OWL = {
  trigger: 'brown',
  do: {
    effect: 'draw', source: 'deck', peek: true, as: 'peeked',
    then: {
      effect: 'tuck', onto: 'self', from: 'peeked',
      condition: { check: 'ref', from: 'peeked', prop: 'wingspan', cmp: 'lt', value: 75 },
      otherwise: { effect: 'discard', resource: 'card', from: 'peeked' },
    },
  },
};

function deckOf(state, ...keys) {
  state.unseen = Object.fromEntries(keys.map((k) => [birdIdOf(k), 1]));
  state.deckSize = keys.length;
  return state;
}

test('worked example 2: a small card gets tucked', () => {
  let state = baseState();
  place(state, 2, 'barredowl');
  state = deckOf(state, 'graycatbird'); // wingspan 28
  state = runPower(state, 0, origin(2), BARRED_OWL);
  assert.equal(state.seats[0].rows[habitatIndex('forest')][1].tucked, 1);
  assert.equal(Object.keys(state.discard).length, 0);
});

test('worked example 2: a large card gets discarded instead', () => {
  let state = baseState();
  place(state, 2, 'barredowl');
  state = deckOf(state, 'barredowl'); // wingspan 107 — looked at, then discarded
  state = runPower(state, 0, origin(2), BARRED_OWL);
  assert.equal(state.seats[0].rows[habitatIndex('forest')][1].tucked, 0);
  assert.equal(state.discard[birdIdOf('barredowl')], 1);
});

// --- worked example 3 (docs/powers.md): Gray Catbird, brown ---------------
// "Repeat a brown power on another bird in this habitat."

const GRAY_CATBIRD = {
  trigger: 'brown',
  do: { effect: 'repeat', of: 'anotherBirdPower', filter: { habitat: 'same', color: 'brown', excludeSelf: true } },
};

test('worked example 3: repeats the one describable brown power sharing the habitat', () => {
  let state = baseState();
  place(state, 1, 'acornwoodpecker');
  place(state, 2, 'graycatbird');
  state.feeder = [1, 2, 3, 4, 0];
  const describe = (cardId) => (cardId === birdIdOf('acornwoodpecker') ? ACORN_WOODPECKER : undefined);
  state = runPower(state, 0, origin(2), GRAY_CATBIRD, { resolve: () => true, describe });
  // The repeated power's "this bird" is the Acorn Woodpecker, not the Catbird.
  assert.deepEqual(state.seats[0].rows[habitatIndex('forest')][0].cached, [0, 1, 0, 0, 0]);
  assert.deepEqual(state.seats[0].rows[habitatIndex('forest')][1].cached, [0, 0, 0, 0, 0]);
});

test('worked example 3: an undescribed neighbour is not a candidate, and nothing happens', () => {
  let state = baseState();
  place(state, 1, 'barredowl'); // no entry in `describe` below
  place(state, 2, 'graycatbird');
  state = runPower(state, 0, origin(2), GRAY_CATBIRD, { describe: () => undefined });
  assert.deepEqual(state.seats[0].rows[habitatIndex('forest')][0].cached, [0, 0, 0, 0, 0]);
});

test('worked example 3: two describable candidates ask resolve() which one', () => {
  let state = baseState();
  place(state, 1, 'acornwoodpecker');
  place(state, 3, 'acornwoodpecker');
  place(state, 2, 'graycatbird');
  state.feeder = [1, 2, 3, 4, 0];
  const describe = () => ACORN_WOODPECKER;
  state = runPower(state, 0, origin(2), GRAY_CATBIRD,
    { resolve: (choice) => (choice.id === 'repeatTarget' ? choice.options[1] : true), describe });
  assert.deepEqual(state.seats[0].rows[habitatIndex('forest')][0].cached, [0, 0, 0, 0, 0]);
  assert.deepEqual(state.seats[0].rows[habitatIndex('forest')][2].cached, [0, 1, 0, 0, 0]);
});
