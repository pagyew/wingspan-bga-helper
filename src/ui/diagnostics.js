// Diagnostics snapshot: everything needed to answer "why didn't this read the
// position?" without opening devtools. boot.js writes it on every state update
// and on every read/eval error; the options page only reads and renders it.

export const DIAG_KEY = 'wsh.diagnostics';

export function buildDiagnostics({ snapshot, problems, dbHash, lastError }) {
  return {
    updatedAt: new Date().toISOString(),
    dbHash: dbHash || null,
    problems: problems || [],
    lastError: lastError || null,
    snapshot: snapshot || null
  };
}
