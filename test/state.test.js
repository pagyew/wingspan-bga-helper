import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, validateState } from '../src/page/state.js';

const db = { birds: { 42: { identifier: 'bushtit' }, 17: { identifier: 'baltimore_oriole' } } };

test('fingerprint is stable and order independent', () => {
  const other = { birds: { 17: { identifier: 'baltimore_oriole' }, 42: { identifier: 'bushtit' } } };
  assert.equal(fingerprint(db), fingerprint(other));
});

test('fingerprint changes when the card set changes', () => {
  const bigger = { birds: { ...db.birds, 99: { identifier: 'wild_turkey' } } };
  assert.notEqual(fingerprint(db), fingerprint(bigger));
});

test('an unknown bird id is a reported problem, not a silent zero', () => {
  const state = {
    stable: true, tray: [999], goalBoardType: 'green',
    players: { 1: { tableau: [{ birdId: 42 }] } }
  };
  const problems = validateState(state, db);
  assert.ok(problems.some((p) => /card database/.test(p)));
});

test('a snapshot taken mid-animation is refused', () => {
  const state = { stable: false, tray: [], goalBoardType: 'green', players: {} };
  assert.ok(validateState(state, db).some((p) => /animation/.test(p)));
});
