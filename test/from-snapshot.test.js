// The one part of the port that is not mechanical (docs/engine-port.md):
// src/page/state.js and the evaluator disagree on how a bird is identified,
// how players are shaped and how cached food is counted. This is the test for
// the adapter that reconciles them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fromSnapshot } from '../src/engine/from-snapshot.js';

const cardDb = {
  birds: {
    100: { index: 100, identifier: 'bushtit', name: 'Bushtit', nameLocal: 'Кустарница' },
    200: { index: 200, identifier: 'baltimoreoriole', name: 'Baltimore Oriole', nameLocal: 'Балтиморская иволга' },
    300: { index: 300, identifier: 'wildturkey', name: 'Wild Turkey', nameLocal: 'Дикая индейка' }
  },
  bonuscards: {
    0: { index: 0, identifier: 'anatomist', name: 'Anatomist' },
    1: { index: 1, identifier: 'birdfeeder', name: 'Bird Feeder' }
  }
};

const state = {
  myId: '1',
  round: 2,
  goalBoardType: 'green',
  goals: [
    { description: 'Birds in forest', standing: { 1: { value: '2', score: '4' } } }
  ],
  feeder: ['fish', 'fish'],
  tray: [300, 999], // 999: a bird id the card database does not know about
  players: {
    1: {
      name: 'Me', isMe: true, cubesLeft: 5, food: [1, 2, 0, 0, 1],
      handBirds: [200, 999],
      handBonus: [0],
      tableau: [
        { birdId: 100, habitat: 'wetland', eggs: 1, tucked: 2, cached: [1, 0, 0, 2, 0] }
      ]
    },
    2: {
      name: 'Opp', isMe: false, cubesLeft: 4, food: [0, 0, 0, 0, 0],
      handBirds: [null, null],
      handBonus: [],
      tableau: []
    }
  }
};

test('maps numeric birdIds to the evaluator\'s string keys via the card database', () => {
  const out = fromSnapshot(state, cardDb);
  assert.equal(out.players[0].tableau[0].key, 'bushtit');
  assert.equal(out.players[0].handBirds[0], 'baltimoreoriole');
});

test('puts the local player first regardless of object key order', () => {
  const out = fromSnapshot(state, cardDb);
  assert.equal(out.players[0].name, 'Me');
  assert.equal(out.players[1].name, 'Opp');
});

test('sums per-food-type cached arrays into the single number the evaluator expects', () => {
  const out = fromSnapshot(state, cardDb);
  assert.equal(out.players[0].tableau[0].cached, 3);
});

test('translates held bonus-card ids to keys, and drops unknown tray/hand ids rather than guessing', () => {
  const out = fromSnapshot(state, cardDb);
  assert.deepEqual(out.players[0].bonus, ['anatomist']);
  assert.deepEqual(out.tray, ['wildturkey']); // 999 dropped, not silently kept as a fake move
  assert.equal(out.players[0].handBirds[1], null); // unknown id -> null, same as "not yet revealed"
});

test('preserves opponent hand nulls (hidden information) and pulls cubesLeft from the local player', () => {
  const out = fromSnapshot(state, cardDb);
  assert.deepEqual(out.players[1].handBirds, [null, null]);
  assert.equal(out.cubesLeft, 5);
});

test('carries round, goal board and feeder straight through', () => {
  const out = fromSnapshot(state, cardDb);
  assert.equal(out.round, 2);
  assert.equal(out.goalBoard, 'green');
  assert.deepEqual(out.goals, [{ description: 'Birds in forest' }]);
  assert.deepEqual(out.feeder, ['fish', 'fish']);
});
