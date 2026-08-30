// Ported from .engine-src/test_units.js — see docs/engine-port.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import birds from '../src/engine/data/birds.js';
import bonusCards from '../src/engine/data/bonus.js';
import { scoreGoal, goalCounter, parseBonusVp } from '../src/engine/scoring.js';
import { powerValue, WEIGHTS, rates } from '../src/engine/evaluate.js';

test('card database integrity', () => {
  assert.equal(birds.length, 180);
  assert.equal(birds.filter((b) => !b.swiftStart).length, 170);
  assert.equal(bonusCards.length, 26);

  const nests = [...new Set(birds.map((b) => b.nest))].sort();
  assert.deepEqual(nests, ['bowl', 'cavity', 'ground', 'none', 'platform', 'star']);

  const keys = new Set(bonusCards.map((b) => b.key));
  const orphan = [...new Set(birds.flatMap((b) => b.bonus))].filter((k) => !keys.has(k));
  assert.deepEqual(orphan, []);

  assert.equal(birds.filter((b) => !Number.isInteger(b.vp)).length, 0);
});

test('every bonus-card score string parses to a non-negative integer function', () => {
  for (const c of bonusCards) {
    const f = parseBonusVp(c.vp);
    for (let n = 0; n <= 15; n++) {
      const v = f(n);
      assert.ok(Number.isInteger(v) && v >= 0, `${c.key}: n=${n} -> ${v}`);
    }
  }
});

test('bonus-card score parsing — specific tables', () => {
  assert.equal(parseBonusVp('2 to 3 birds: 3; 4+ birds: 7')(3), 3);
  assert.equal(parseBonusVp('2 to 3 birds: 3; 4+ birds: 7')(5), 7);
  assert.equal(parseBonusVp('2 to 3 birds: 3; 4+ birds: 7')(1), 0);
  assert.equal(parseBonusVp('3 to 4 birds: 4; 5 birds: 8')(5), 8);
  assert.equal(parseBonusVp('3 to 4 birds: 4; 5 birds: 8')(6), 0);
  assert.equal(parseBonusVp('2 per bird')(4), 8);
});

test('round-goal counters', () => {
  const P = (t) => ({ tableau: t, handBirdCount: 0 });
  const b = (habitat, nest, eggs) => ({ habitat, nest, eggs });
  const mat = P([
    b('forest', 'bowl', 2), b('forest', 'star', 1), b('forest', 'cavity', 0),
    b('grassland', 'ground', 3), b('grassland', 'platform', 0),
    b('wetland', 'bowl', 0), b('wetland', 'star', 4)
  ]);

  assert.equal(goalCounter('Eggs in bowl nests')(mat), 7, 'star nest counts as any nest');
  assert.equal(goalCounter('Eggs in cavity nests')(mat), 5);
  assert.equal(goalCounter('Eggs in ground nests')(mat), 8);
  assert.equal(goalCounter('Eggs in platform nests')(mat), 5);
  assert.equal(goalCounter('Birds in forest')(mat), 3);
  assert.equal(goalCounter('Birds in wetland')(mat), 2);
  assert.equal(goalCounter('Eggs in grassland')(mat), 3);
  assert.equal(goalCounter('Eggs on birds in wetland')(mat), 4, 'BGA phrasing');
  assert.equal(goalCounter('Eggs on birds in forest')(mat), 3);
  assert.equal(goalCounter('Birds with eggs in bowl nests')(mat), 3);
  assert.equal(goalCounter('Birds with eggs in ground nests')(mat), 3);
  assert.equal(goalCounter('Total birds')(mat), 7);
  assert.equal(goalCounter('Sets of eggs in all 3 habitats')(mat), 3);
  assert.throws(() => goalCounter('Nonsense goal'));
});

test('bird-power text parsing', () => {
  const c = rates(12, WEIGHTS);
  const pv = (power, extra = {}) => +powerValue({ power, ...extra }, c, WEIGHTS).toFixed(2);
  const round2 = (x) => +x.toFixed(2);

  assert.equal(pv(''), 0);
  assert.equal(pv('Lay 1 [egg] on any bird.'), 1);
  assert.equal(pv('Lay 1 [egg] on each of your birds with a [cavity] nest.'), round2(WEIGHTS.eachBirdFactor));
  assert.ok(pv('Discard 1 [seed] to tuck 2 [card] from the deck behind this bird.') > 1);
  assert.equal(pv('Tuck 1 [card] from your hand behind this bird. If you do, draw 1 [card].'), 1);
  assert.equal(
    pv('Roll all dice not in birdfeeder. If any are [rodent], cache 1 [rodent] from the supply on this bird.'),
    round2(WEIGHTS.huntChance)
  );
  assert.equal(pv('Discard 1 [egg] from any of your other birds to gain 1 [wild] from the supply.'), 0,
    'a costly, optional power never scores negative');
  assert.equal(pv('All players gain 1 [fruit] from the supply.'), round2(c.foodVp * WEIGHTS.sharedFactor));
  assert.equal(pv('Draw 2 new bonus cards and keep 1.'), round2(WEIGHTS.bonusDraw));
  assert.equal(
    powerValue(
      { power: 'If this bird is to the right of all other birds in its habitat, move it to another habitat.' },
      c, WEIGHTS
    ),
    null,
    'unparsed text falls back to category scoring'
  );
});

test('scoreGoal — green board place allocation', () => {
  assert.deepEqual(scoreGoal([5, 2], 0, 'green'), [4, 1]);
  assert.deepEqual(scoreGoal([4, 4], 0, 'green'), [2, 2], 'tie for 1st splits, rounded down');
  assert.deepEqual(scoreGoal([3, 3], 1, 'green'), [3, 3]);
  assert.deepEqual(scoreGoal([7, 5], 3, 'green'), [7, 4]);
  assert.deepEqual(scoreGoal([3, 0], 0, 'green'), [4, 0], 'zero does not take a place');
  assert.deepEqual(scoreGoal([0, 0], 0, 'green'), [0, 0]);
  assert.deepEqual(scoreGoal([5, 3, 1], 2, 'green'), [6, 3, 2]);
  assert.deepEqual(scoreGoal([5, 5, 1], 2, 'green'), [4, 4, 2], 'tie for 1st, 3 players');
  assert.deepEqual(scoreGoal([5, 3, 3], 2, 'green'), [6, 2, 2], 'tie for 2nd, 3 players');
  assert.throws(() => scoreGoal([1, 2], 0, 'blue'), /синее поле/, 'the blue board is explicitly unsupported');
});
