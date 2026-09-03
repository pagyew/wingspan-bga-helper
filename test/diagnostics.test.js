import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiagnostics, DIAG_KEY } from '../src/ui/diagnostics.js';

test('DIAG_KEY is stable — the options page reads exactly this storage key', () => {
  assert.equal(DIAG_KEY, 'wsh.diagnostics');
});

test('buildDiagnostics defaults an empty state to nulls, not undefined', () => {
  const d = buildDiagnostics({});
  assert.equal(d.dbHash, null);
  assert.deepEqual(d.problems, []);
  assert.equal(d.lastError, null);
  assert.equal(d.snapshot, null);
  assert.equal(typeof d.updatedAt, 'string');
});

test('buildDiagnostics passes the snapshot, problems, fingerprint and error through unchanged', () => {
  const snapshot = { round: 3, stable: true };
  const problems = ['blue goal board is not supported yet'];
  const lastError = { where: 'evaluate', message: 'boom', at: 123 };
  const d = buildDiagnostics({ snapshot, problems, dbHash: 'abc.180', lastError });
  assert.equal(d.snapshot, snapshot);
  assert.equal(d.problems, problems);
  assert.equal(d.dbHash, 'abc.180');
  assert.equal(d.lastError, lastError);
});
