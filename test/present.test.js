import test from 'node:test';
import assert from 'node:assert/strict';
import {
  headline, statusLine, detailLine, buildView, moveName, moveWhy, adviceMoves, recordingNotes
} from '../src/ui/present.js';
import { translator } from '../src/ui/i18n.js';

const t = translator('en');
const tRu = translator('ru');

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

test('buildView defaults recording status when none is given', () => {
  const view = buildView({ state, problems: [], t, mode: 'advice', advice: null });
  assert.deepEqual(view.recording, { active: false, count: 0 });
});

test('a finished recording is announced with its snapshot count', () => {
  const view = buildView({
    state, problems: [], t, mode: 'advice', advice: null,
    recording: { active: false, count: 0 },
    recordingEvent: { reason: 'gameEnd', count: 128 }
  });
  assert.ok(view.notes.some((n) => /Game finished.*\(128\)/.test(n.text)));
});

test('recordingNotes is silent with no event', () => {
  assert.deepEqual(recordingNotes(null, t), []);
});

/** Move names quote BGA's own button labels — see CLAUDE.md, "Style". */
test('a row move is named after the habitat action, in both languages', () => {
  const action = { type: 'row', habitat: 'forest', trade: false, info: { unit: 'food', gain: 2 } };
  assert.equal(moveName(t, () => '', action), 'Forest — Gain food');
  assert.equal(moveName(tRu, () => '', action), 'Лес — Взять еду');
});

test('a play-bird move names the bird in the panel\'s own locale', () => {
  const action = { type: 'playBird', bird: 'bushtit', habitat: 'wetland' };
  const enName = (key) => (key === 'bushtit' ? 'Bushtit' : key);
  const ruName = (key) => (key === 'bushtit' ? 'Кустарница' : key);
  assert.equal(moveName(t, enName, action), 'Play a bird: Bushtit → Wetland');
  assert.equal(moveName(tRu, ruName, action), 'Сыграть птицу: Кустарница → Болото');
});

test('why explains the egg cost of playing a bird, including "none needed"', () => {
  assert.equal(moveWhy(t, { action: { type: 'playBird', eggCost: 2 } }), 'Eggs needed: 2');
  assert.equal(moveWhy(t, { action: { type: 'playBird', eggCost: 0 } }), 'No eggs needed');
});

test('why reports a row action\'s yield, marking trades', () => {
  const plain = { action: { type: 'row', trade: false, info: { unit: 'card', gain: 2 } } };
  const traded = { action: { type: 'row', trade: true, info: { unit: 'card', gain: 2 } } };
  assert.equal(moveWhy(t, plain), '+2 cards');
  assert.equal(moveWhy(t, traded), '+3 cards (with trade)');
});

test('adviceMoves takes only the top 3 ranked options and carries the raw gain as delta', () => {
  const result = {
    options: [
      { action: { type: 'row', habitat: 'forest', trade: false, info: { unit: 'food', gain: 1 } }, gain: 2.5 },
      { action: { type: 'row', habitat: 'grassland', trade: false, info: { unit: 'egg', gain: 2 } }, gain: 1.2 },
      { action: { type: 'row', habitat: 'wetland', trade: false, info: { unit: 'card', gain: 1 } }, gain: 0.8 },
      { action: { type: 'row', habitat: 'forest', trade: true, info: { unit: 'food', gain: 1 } }, gain: 0.1 }
    ]
  };
  const moves = adviceMoves(result, t, () => '');
  assert.equal(moves.length, 3);
  assert.equal(moves[0].delta, 2.5);
  assert.equal(moves[0].name, 'Forest — Gain food');
});

test('adviceMoves is empty without a result — an unwired or gated evaluator shows no hints', () => {
  assert.deepEqual(adviceMoves(null, t, () => ''), []);
});
