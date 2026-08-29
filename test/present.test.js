import test from 'node:test';
import assert from 'node:assert/strict';
import { headline, statusLine, detailLine, buildView } from '../src/ui/present.js';
import { translator } from '../src/ui/i18n.js';

const t = translator('en');

/** Trimmed shape of a real snapshot — see docs/reference-game.md. */
const state = {
  round: 3,
  myId: '1',
  myTurn: true,
  stable: true,
  goals: [
    { description: 'Eggs in bowl nests', standing: { 1: { value: '4', rank: '0.5', score: '2' } } },
    { description: 'Birds in forest', standing: { 1: { value: '3', rank: '0.5', score: '3' } } },
    { description: 'Eggs in platform nests', standing: { 1: { value: '6', rank: '0', score: '6' } } },
    { description: 'Birds with eggs in cavity nests', standing: { 1: { value: '7', rank: '0', score: '7' } } }
  ],
  players: {
    1: { name: 'pagyew', isMe: true, score: 34, cubesLeft: 2, handBirdCount: 8, food: [1, 0, 2, 2, 0] },
    2: { name: 'Exixel', isMe: false, score: 29, cubesLeft: 3, handBirdCount: 5, food: [0, 1, 0, 0, 2] }
  }
};

test('headline puts the local player first', () => {
  assert.equal(headline(state, t), 'Round 3 · pagyew 34 : Exixel 29');
});

test('status shows remaining cubes on my turn', () => {
  assert.equal(statusLine(state, t), '2 cubes left');
});

test('status names the opponent turn', () => {
  assert.match(statusLine({ ...state, myTurn: false }, t), /Opponent is thinking/);
});

test('detail reports the goal of the current round, not the first one', () => {
  assert.match(detailLine(state, t), /Eggs in platform nests 6 → 6/);
});

test('an unstable snapshot is flagged rather than scored', () => {
  const view = buildView({ state: { ...state, stable: false }, problems: [], t, mode: 'advice', advice: null });
  assert.ok(view.notes.some((n) => /Animation in progress/.test(n.text)));
});

test('the blue goal board is reported, never silently zeroed', () => {
  const view = buildView({
    state, problems: ['blue goal board is not supported yet'], t, mode: 'advice', advice: null
  });
  assert.ok(view.notes.some((n) => /Blue goal board/.test(n.text)));
});
