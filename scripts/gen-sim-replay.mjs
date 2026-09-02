// Regenerates test/fixtures/sim/sim-hand-log.json — the hand-authored move log
// used by test/sim-replay.test.js (issue #29, narrowed; see the comment on
// that issue and at the top of the test file for why it isn't one of the two
// real reference games).
//
// The policy below is fixed and deterministic: given the same seed it always
// makes the same choices, so re-running this script reproduces the exact
// same fixture. That determinism is the point — this is a committed fixture,
// not a fuzzer — so re-run it only if the sim's move shapes change.
import { writeFileSync } from 'node:fs';
import { setup, legalMoves, apply, isTerminal } from '../src/sim/index.js';
import { mulberry32 } from '../src/sim/rng.js';

const SEED = 555;
const PLAYERS = ['pagyew', 'exixel'];
const GOALS = ['Birds in the forest', 'Eggs in bowl nests', 'Total birds', 'Birds in the wetland'];

function policy(moves, turnCount) {
  if (moves[0].keep !== undefined) {
    // Opening hand: keep everything dealt.
    return moves.reduce((best, m) => (m.keep.length > best.keep.length ? m : best), moves[0]);
  }
  const playable = moves.filter(m => m.kind === 'playBird');
  if (playable.length) return playable[turnCount % playable.length];
  // No affordable bird: rotate row actions so the tableau, hand and food all
  // grow rather than farming one habitat forever.
  const wanted = ['wetland', 'grassland', 'forest'][turnCount % 3];
  return moves.find(m => m.kind === 'rowAction' && m.habitat === wanted) || moves[0];
}

const rng = mulberry32(SEED);
let state = setup({ players: PLAYERS.map(id => ({ id })), goals: GOALS, rng });
const log = [];
let steps = 0;
while (!isTerminal(state) && steps++ < 5000) {
  const move = policy(legalMoves(state), state.turn);
  log.push(move);
  state = apply(state, move);
}
if (!isTerminal(state)) throw new Error('policy did not reach a terminal state');

const path = new URL('../test/fixtures/sim/sim-hand-log.json', import.meta.url);
writeFileSync(path, JSON.stringify({ players: PLAYERS, goals: GOALS, seed: SEED, log }, null, 1) + '\n');
console.log(`wrote ${log.length} moves to ${path.pathname}`);
