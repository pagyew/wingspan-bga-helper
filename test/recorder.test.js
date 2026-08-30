import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractTableId, createRecording, appendState, appendError,
  finish, isFinished, countStates, fileName
} from '../src/ui/recorder.js';

test('extractTableId reads the table query param', () => {
  assert.equal(extractTableId('https://boardgamearena.com/8/wingspan?table=906782034'), '906782034');
});

test('extractTableId returns null when there is no table param or the URL is bad', () => {
  assert.equal(extractTableId('https://boardgamearena.com/8/wingspan'), null);
  assert.equal(extractTableId('not a url'), null);
});

test('createRecording starts empty and stamps the start time', () => {
  const rec = createRecording({ tableId: '123', url: 'https://x' });
  assert.equal(rec.tableId, '123');
  assert.equal(rec.entries.length, 0);
  assert.equal(rec.endedAt, null);
  assert.ok(rec.startedAt);
});

test('createRecording falls back to null when no table id is known', () => {
  const rec = createRecording({ tableId: null, url: 'https://x' });
  assert.equal(rec.tableId, null);
});

test('appendState and appendError push typed entries', () => {
  const rec = createRecording({ tableId: '123', url: 'https://x' });
  appendState(rec, { state: 'playerNormalTurn' }, 1, ['blue goal board is not supported yet']);
  appendError(rec, { where: 'collectState', message: 'boom' }, 2);
  assert.equal(rec.entries.length, 2);
  assert.equal(rec.entries[0].type, 'state');
  assert.deepEqual(rec.entries[0].problems, ['blue goal board is not supported yet']);
  assert.equal(rec.entries[1].type, 'error');
  assert.equal(rec.entries[1].error.message, 'boom');
});

test('countStates ignores error entries and tolerates null', () => {
  const rec = createRecording({ tableId: '123', url: 'https://x' });
  appendState(rec, { state: 'a' });
  appendError(rec, { where: 'x', message: 'y' });
  appendState(rec, { state: 'b' });
  assert.equal(countStates(rec), 2);
  assert.equal(countStates(null), 0);
});

test('isFinished only fires on the gameEnd state', () => {
  assert.equal(isFinished({ state: 'gameEnd' }), true);
  assert.equal(isFinished({ state: 'playerNormalTurn' }), false);
  assert.equal(isFinished(null), false);
});

test('finish stamps an end time and the stop reason', () => {
  const rec = createRecording({ tableId: '123', url: 'https://x' });
  finish(rec, 'gameEnd');
  assert.equal(rec.stoppedReason, 'gameEnd');
  assert.ok(rec.endedAt);
});

test('fileName is stable and carries the table id', () => {
  const rec = createRecording({ tableId: '906782034', url: 'https://x' });
  finish(rec, 'gameEnd');
  assert.match(fileName(rec), /^wingspan-recording-906782034-.+\.json$/);
});

test('fileName falls back to "unknown" without a table id', () => {
  const rec = createRecording({ tableId: null, url: 'https://x' });
  assert.match(fileName(rec), /^wingspan-recording-unknown-.+\.json$/);
});
