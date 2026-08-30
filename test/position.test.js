// Ported from .engine-src/test_position.js — see docs/engine-port.md.
//
// A real position, table #906484481, turn 122. In the actual game pagyew made
// exactly the move the evaluator ranks first here: moves the action cube to
// grassland and lays 3 eggs. This is the acceptance test for milestone M2:
// "Grassland — lay 3 eggs" must come out on top.
//
// .engine-src/test_position.js also exercised .engine-src/page-state.js's
// validateState() against this position. That function is deliberately not
// ported (docs/engine-port.md) — src/page/state.js has its own validateState
// for the extension's live snapshot shape, covered in test/state.test.js and
// test/from-snapshot.test.js — so only the evaluator assertions carry over.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../src/engine/index.js';
import { fromSnapshot } from '../src/engine/from-snapshot.js';
import { adviceMoves } from '../src/ui/present.js';
import { translator } from '../src/ui/i18n.js';

const engine = createEngine();
const H = { F: 'forest', G: 'grassland', W: 'wetland' };
const tab = (s) => s.split(';').map((x) => {
  const [key, h, e, t, c] = x.split(':');
  return { key, habitat: H[h], eggs: +e, tucked: +t, cached: +c };
});

const state = {
  round: 3, cubesLeft: 2, goalBoard: 'green',
  goals: [
    { description: 'Eggs on birds in wetland' },
    { description: 'Eggs in bowl nests' },
    { description: 'Birds with eggs in platform nests' },
    { description: 'Birds with eggs in cavity nests' }
  ],
  feeder: ['fish', 'fish'],
  tray: ['kingrail'], // the other tray slots were empty at the moment of the snapshot
  players: [
    { name: 'pagyew', bonus: ['birdfeeder', 'photographer'], handBirdCount: 4,
      handBirds: ['paintedbunting', 'bobolink', 'blackneckedstilt', 'chippingsparrow'],
      food: [2, 3, 1, 0, 1],
      tableau: tab('mourningdove:F:0:0:0;bluegraygnatcatcher:F:0:0:0;coopershawk:F:0:2:0;redeyedvireo:F:0:0:0;americanwoodcock:F:0:0:0;savannahsparrow:G:0:0:0;commongrackle:G:0:1:0;roseatespoonbill:W:0:0:0') },
    { name: 'GubbyBear', bonus: [], handBirdCount: 5, handBirds: [null, null, null, null, null],
      food: [3, 0, 0, 0, 0],
      tableau: tab('easternkingbird:F:0:0:0;rubycrownedkinglet:F:0:0:0;northernflicker:F:0:0:0;bellsvireo:G:0:0:0;brownheadedcowbird:G:0:0:0;americanoystercatcher:W:0:0:0;bushtit:W:2:6:0;ruddyduck:W:1:0:0;ringbilledgull:W:0:1:0') }
  ]
};

test('turn 122 of #906484481: options are enumerated and finite', () => {
  const r = engine.suggest(state);
  assert.ok(r.options.length >= 4, `expected at least 4 options, got ${r.options.length}`);
  assert.ok(r.options.every((o) => Number.isFinite(o.gain)));
});

test('forest is full — playing a bird there is impossible', () => {
  assert.equal(state.players[0].tableau.filter((b) => b.habitat === 'forest').length, 5);
});

test('no eggs on the tableau — nothing to pay the egg cost with', () => {
  assert.ok(state.players[0].tableau.every((b) => b.eggs === 0));
});

test('playing a bird is correctly unavailable (forest full, no eggs to pay elsewhere)', () => {
  const r = engine.suggest(state);
  assert.ok(!r.options.some((o) => o.action.type === 'playBird'));
});

test('the top suggestion matches what the player actually did: grassland, 3 eggs', () => {
  const r = engine.suggest(state);
  const best = r.options[0];
  assert.equal(best.action.type, 'row');
  assert.equal(best.action.habitat, 'grassland');
  assert.equal(best.action.info.gain, 3);
});

// Issue #6's own acceptance criterion is about the *panel's* rendering, not
// just evaluateTurn() — so this repeats the position through the real
// extension pipeline: a src/page/state.js-shaped snapshot, fromSnapshot(),
// then the same adviceMoves() boot.js hands to the panel.
test('wired through the panel: the top move reads "Grassland — Lay eggs" (#6)', () => {
  let nextBirdId = 1;
  const birdIds = new Map();
  const idOf = (key) => {
    if (!birdIds.has(key)) birdIds.set(key, nextBirdId++);
    return birdIds.get(key);
  };
  let nextBonusId = 0;
  const bonusIds = new Map();
  const bonusIdOf = (key) => {
    if (!bonusIds.has(key)) bonusIds.set(key, nextBonusId++);
    return bonusIds.get(key);
  };

  const asSlots = (tableau) => tableau.map((b) => ({
    birdId: idOf(b.key), habitat: b.habitat, eggs: b.eggs, tucked: b.tucked, cached: [b.cached, 0, 0, 0, 0]
  }));

  const cardDb = { birds: {}, bonuscards: {} };
  for (const p of state.players) {
    for (const b of p.tableau) cardDb.birds[idOf(b.key)] = { index: idOf(b.key), identifier: b.key, name: b.key };
    for (const key of p.handBirds) if (key) cardDb.birds[idOf(key)] = { index: idOf(key), identifier: key, name: key };
  }
  for (const key of state.tray) cardDb.birds[idOf(key)] = { index: idOf(key), identifier: key, name: key };
  for (const key of state.players[0].bonus) {
    cardDb.bonuscards[bonusIdOf(key)] = { index: bonusIdOf(key), identifier: key, name: key };
  }

  const liveSnapshot = {
    myId: '1',
    round: state.round,
    stable: true,
    myTurn: true,
    goalBoardType: state.goalBoard,
    goals: state.goals,
    feeder: state.feeder,
    tray: state.tray.map(idOf),
    players: {
      1: {
        name: state.players[0].name, isMe: true, cubesLeft: state.cubesLeft,
        food: state.players[0].food,
        handBirds: state.players[0].handBirds.map(idOf),
        handBonus: state.players[0].bonus.map(bonusIdOf),
        tableau: asSlots(state.players[0].tableau)
      },
      2: {
        name: state.players[1].name, isMe: false, cubesLeft: 2,
        food: state.players[1].food,
        handBirds: state.players[1].handBirds.map(() => null),
        handBonus: [],
        tableau: asSlots(state.players[1].tableau)
      }
    }
  };

  const input = fromSnapshot(liveSnapshot, cardDb);
  const result = engine.suggest(input);
  const moves = adviceMoves(result, translator('en'), (key) => key);

  assert.equal(moves[0].name, 'Grassland — Lay eggs');
  assert.equal(moves[0].why, '+3 eggs');
  assert.ok(moves[0].delta > 0);

  const movesRu = adviceMoves(result, translator('ru'), (key) => key);
  assert.equal(movesRu[0].name, 'Степь — Положить яйца');
});
