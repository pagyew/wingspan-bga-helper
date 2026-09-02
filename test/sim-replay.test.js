// Issue #29, narrowed — see the comment on the issue for why: the two real
// reference games (docs/reference-game.md) carry cached food and tucked
// cards, which only bird powers produce, and B1 has no powers (CLAUDE.md
// invariant 2 / roadmap.md B2). There is also no move-by-move log for either
// game yet — the B3 replay parser (issue #37) hasn't landed, and
// test/fixtures/game-*.json hold only the final tableau, not a per-turn log.
//
// test/fixtures/sim/sim-hand-log.json is a hand-authored move log instead: a
// full 4-round, 2-player game generated once by a fixed deterministic policy
// (never a random draw at decision time — see scripts/gen-sim-replay.mjs)
// from seed 555, then committed as data. It is NOT extracted from BGA. It
// exercises setup → opening deal → row actions and bird plays → deck/tray/
// feeder chance nodes → round-end goal scoring → final scoring, end to end,
// and its final score is checked against a total computed by hand from the
// log's own final tableau.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup, apply, isTerminal, finalScore } from '../src/sim/index.js';
import { mulberry32 } from '../src/sim/rng.js';
import { tableauSlots } from '../src/sim/state.js';
import { birdCard } from '../src/sim/cards.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/sim/sim-hand-log.json', import.meta.url)));

function replay() {
  const rng = mulberry32(fixture.seed);
  let state = setup({ players: fixture.players.map(id => ({ id })), goals: fixture.goals, rng });
  for (const move of fixture.log) state = apply(state, move);
  return state;
}

test('the hand-authored log replays move by move to a terminal, 4-round game', () => {
  const state = replay();
  assert.ok(isTerminal(state));
  assert.equal(state.round, 4);
});

test('final score matches a total computed independently from the same log', () => {
  const state = replay();
  const score = finalScore(state);
  const byName = Object.fromEntries(score.map(s => [s.name, s]));

  // Hand-computed from this exact log (see the fixture header): no powers
  // means birds/goals/eggs are the whole story — bonus, cached and tucked
  // are all zero by construction.
  assert.deepEqual(
    { pagyew: byName.pagyew.total, exixel: byName.exixel.total },
    { pagyew: 33, exixel: 29 }
  );

  for (const s of state.seats) {
    const row = byName[s.id];
    assert.equal(row.cached, 0, 'no power caches food in B1');
    assert.equal(row.tucked, 0, 'no power tucks a card in B1');
    assert.equal(row.bonus, 0, 'the fixture keeps a bonus card that scores 0 on this tableau');

    // Cross-check birds/eggs against the state directly, independent of the
    // scoreGame() adapter in finalScore() — a second read of the same data.
    const birdVp = tableauSlots(s).reduce((a, t) => a + birdCard(t.slot.card).vp, 0);
    const eggs = tableauSlots(s).reduce((a, t) => a + t.slot.eggs, 0);
    assert.equal(row.birds, birdVp);
    assert.equal(row.eggs, eggs);
  }
});

test('replaying the log twice from the same seed is byte-identical (apply is pure)', () => {
  const a = JSON.stringify(replay());
  const b = JSON.stringify(replay());
  assert.equal(a, b);
});
