import test from 'node:test';
import assert from 'node:assert/strict';
import { snapshotToFixture } from '../scripts/snapshot-to-fixture.mjs';

// A small, hand-built dump in the exact shape onSnapshot() in boot.js now
// produces: {table, state: collectState() output, db: collectCardDb() output}.
// Two goals in the array, standing for rounds 1 and 2 — round defaults to the
// second (last) one, so index 0 is historic and index 1 is the live round.
function dump({ round = 2 } = {}) {
  return {
    table: '906782034',
    state: {
      myId: '1',
      round,
      goalBoardType: 'green',
      goals: [
        { description: 'Eggs in bowl nests', standing: { 1: { value: '4', score: '2' }, 2: { value: '4', score: '2' } } },
        { description: 'Birds with eggs in cavity nests', standing: { 1: { value: '2', score: '6' }, 2: { value: '1', score: '3' } } }
      ],
      players: {
        1: {
          name: 'pagyew',
          isMe: true,
          handBirdCount: 1,
          handBonus: [0],
          tableau: [
            { birdId: 12, habitat: 'forest', eggs: 1, tucked: 0, cached: [0, 0, 0, 0, 0] },
            { birdId: 42, habitat: 'wetland', eggs: 1, tucked: 5, cached: [0, 0, 0, 0, 0] }
          ]
        },
        2: {
          name: 'Exixel',
          isMe: false,
          handBirdCount: 0,
          handBonus: [],
          tableau: [
            { birdId: 9, habitat: 'forest', eggs: 3, tucked: 0, cached: [4, 0, 0, 0, 0] }
          ]
        }
      }
    },
    db: {
      birds: {
        12: { index: 12, identifier: 'baltimoreoriole' },
        42: { index: 42, identifier: 'bushtit' },
        9: { index: 9, identifier: 'redbreastednuthatch' }
      },
      // Not guaranteed indexed by id — exercise the lookup-by-.index path.
      bonuscards: [{ index: 0, identifier: 'anatomist' }, { index: 1, identifier: 'omnivorespecialist' }]
    }
  };
}

test('snapshotToFixture: table, goal board and per-round goal values come straight from the model', () => {
  const fx = snapshotToFixture(dump());
  assert.equal(fx.table, 906782034);
  assert.equal(fx.goalBoard, 'green');
  assert.deepEqual(fx.goals[0], { description: 'Eggs in bowl nests', recorded: [4, 4], historic: true });
  assert.deepEqual(fx.goals[1], { description: 'Birds with eggs in cavity nests', recorded: [2, 1], historic: false });
});

test('snapshotToFixture: only the current round is left live (historic: false)', () => {
  const fx = snapshotToFixture(dump({ round: 1 }));
  assert.equal(fx.goals[0].historic, false);
  assert.equal(fx.goals[1].historic, true);
});

test('snapshotToFixture: expectedGoalVp is read from the model, not recomputed', () => {
  const fx = snapshotToFixture(dump());
  assert.deepEqual(fx.expectedGoalVp, { pagyew: [2, 6], Exixel: [2, 3] });
});

test('snapshotToFixture: players are ordered me-first, tableau keys resolved, zero cached/tucked omitted', () => {
  const fx = snapshotToFixture(dump());
  assert.equal(fx.players[0].name, 'pagyew');
  assert.equal(fx.players[1].name, 'Exixel');
  assert.deepEqual(fx.players[0].tableau, [
    { habitat: 'forest', eggs: 1, key: 'baltimoreoriole' },
    { habitat: 'wetland', eggs: 1, tucked: 5, key: 'bushtit' }
  ]);
  assert.deepEqual(fx.players[1].tableau, [{ habitat: 'forest', eggs: 3, cached: 4, key: 'redbreastednuthatch' }]);
});

test('snapshotToFixture: the local player\'s bonus cards resolve; an opponent\'s is flagged, never guessed', () => {
  const fx = snapshotToFixture(dump());
  assert.deepEqual(fx.players[0].bonus, ['anatomist']);
  assert.deepEqual(fx.players[1].bonus, ['<fill in by hand>']);
});

test('snapshotToFixture: expected is left null for every row — the one number this fixture must check against', () => {
  const fx = snapshotToFixture(dump());
  for (const p of fx.players) {
    for (const row of ['birds', 'bonus', 'goals', 'eggs', 'cached', 'tucked', 'total']) {
      assert.equal(fx.expected[p.name][row], null);
    }
  }
});
