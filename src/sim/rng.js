// A small seeded PRNG so setup() and tests are reproducible. This is the one
// place the sim touches randomness directly (docs/sim-state.md decision #3):
// apply()/legalMoves() never call it — chance is always an explicit move
// with a probability, and the caller (self-play, a replay, expectimax) is
// the one that owns an rng and decides what to do with it.

/** mulberry32 — tiny, fast, good enough for tests and self-play. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, pure — returns a new array. */
export function shuffle(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Pick one entry from a [{...,p}] chance-move list, weighted by p. */
export function sampleWeighted(moves, rng) {
  const total = moves.reduce((a, m) => a + (m.p || 0), 0);
  let r = rng() * total;
  for (const m of moves) {
    r -= m.p || 0;
    if (r <= 0) return m;
  }
  return moves[moves.length - 1];
}
