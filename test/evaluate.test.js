// Ported from .engine-src/test_evaluate.js — see docs/engine-port.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/engine/index.js';

const k = (name) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const engine = createEngine();

const GOALS = [
  { description: 'Eggs in bowl nests' },
  { description: 'Birds in forest' },
  { description: 'Eggs in platform nests' },
  { description: 'Birds with eggs in cavity nests' }
];

function pos(over = {}) {
  return {
    goalBoard: 'green', goals: GOALS,
    round: 3, cubesLeft: 6,
    feeder: ['fish', 'fruit', 'invertebrate', 'seed', 'rodent'],
    tray: [k('Dickcissel'), k('Baltimore Oriole'), k('Wild Turkey')],
    players: [
      { name: 'me', food: [1, 1, 1, 1, 0], bonus: ['anatomist'],
        handBirds: [k('House Wren'), k('Black-Billed Magpie'), k('Prothonotary Warbler')],
        tableau: [
          { key: k('Ruby-Crowned Kinglet'), habitat: 'forest', eggs: 0 },
          { key: k('Red-Bellied Woodpecker'), habitat: 'forest', eggs: 1 },
          { key: k('Carolina Wren'), habitat: 'forest', eggs: 0 },
          { key: k('Mississippi Kite'), habitat: 'grassland', eggs: 0 },
          { key: k('Bushtit'), habitat: 'wetland', eggs: 1, tucked: 3 },
          { key: k('Common Yellowthroat'), habitat: 'wetland', eggs: 0 },
          { key: k('Belted Kingfisher'), habitat: 'wetland', eggs: 1 }
        ] },
      { name: 'opp', food: [1, 0, 0, 0, 1], bonus: [], handBirds: [null, null],
        tableau: [
          { key: k('Red-Breasted Nuthatch'), habitat: 'forest', eggs: 2, cached: 3 },
          { key: k('Ruby-Throated Hummingbird'), habitat: 'forest', eggs: 1 },
          { key: k('Eastern Phoebe'), habitat: 'grassland', eggs: 2 },
          { key: k('Tree Swallow'), habitat: 'wetland', eggs: 1, tucked: 2 }
        ] }
    ],
    ...over
  };
}

test('position: round 3, 6 cubes, 3 cards in hand', () => {
  const r = engine.suggest(pos());
  assert.ok(r.options.length >= 6, `expected at least one row + play option per habitat, got ${r.options.length}`);
  assert.ok(r.options.every((o) => Number.isFinite(o.gain)), 'every option must have a finite gain');
});

test('the last turn of the game: eggs beat cards', () => {
  const last = engine.suggest(pos({ round: 4, cubesLeft: 1 }));
  const cardsLast = last.options.find((o) => o.action.type === 'row' && o.action.habitat === 'wetland');
  const eggsLast = last.options.find((o) => o.action.type === 'row' && o.action.habitat === 'grassland' && !o.action.trade);
  assert.ok(eggsLast.gain > cardsLast.gain, `eggs ${eggsLast.gain} should beat cards ${cardsLast.gain}`);
  assert.ok(cardsLast.gain < 1.0, `cards should be nearly worthless, got ${cardsLast.gain}`);
});

test('the start of the game: food beats eggs on an empty tableau', () => {
  const early = engine.suggest(pos({
    round: 1, cubesLeft: 8,
    players: [
      { name: 'me', food: [0, 0, 0, 0, 0], bonus: ['anatomist'],
        handBirds: [k('House Wren'), k('Bushtit'), k('Wild Turkey')], tableau: [] },
      { name: 'opp', food: [0, 0, 0, 0, 0], bonus: [], handBirds: [null, null], tableau: [] }
    ]
  }));
  const eggsEarly = early.options.find((o) => o.action.type === 'row' && o.action.habitat === 'grassland' && !o.action.trade);
  const foodEarly = early.options.find((o) => o.action.type === 'row' && o.action.habitat === 'forest' && !o.action.trade);
  assert.ok(foodEarly.gain > eggsEarly.gain, `food ${foodEarly.gain} should beat eggs ${eggsEarly.gain} early on`);
  assert.ok(eggsEarly.note.join().includes('отложено: 0'), 'no eggs on the tableau means none can be laid');
});
