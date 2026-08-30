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
