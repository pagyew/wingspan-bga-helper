// Full-game recorder — the devtool that turns a live game into raw material
// for tuning the engine. Pure logic only: boot.js owns chrome.storage, the
// download and the panel wiring, so this stays testable under node --test
// like state.js and present.js.

export function extractTableId(href) {
  try {
    return new URL(href).searchParams.get('table');
  } catch {
    return null;
  }
}

export function createRecording({ tableId, url }) {
  return {
    formatVersion: 1,
    tableId: tableId || null,
    url,
    startedAt: new Date().toISOString(),
    endedAt: null,
    stoppedReason: null,
    db: null,
    dbHash: null,
    entries: []
  };
}

export function appendState(recording, state, seq, problems = []) {
  recording.entries.push({ t: Date.now(), seq: seq ?? null, type: 'state', state, problems });
  return recording;
}

export function appendError(recording, error, seq) {
  recording.entries.push({ t: Date.now(), seq: seq ?? null, type: 'error', error });
  return recording;
}

export function finish(recording, reason) {
  recording.endedAt = new Date().toISOString();
  recording.stoppedReason = reason;
  return recording;
}

/** `gameEnd` is state 99 in the BGA state machine — see docs/bga-game-state.md. */
export function isFinished(state) {
  return Boolean(state) && state.state === 'gameEnd';
}

export function countStates(recording) {
  return recording ? recording.entries.filter((e) => e.type === 'state').length : 0;
}

export function fileName(recording) {
  const stamp = (recording.endedAt || recording.startedAt).replace(/[:.]/g, '-');
  return `wingspan-recording-${recording.tableId || 'unknown'}-${stamp}.json`;
}
