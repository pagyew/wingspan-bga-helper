#!/usr/bin/env node
// Turns a "Copy snapshot" clipboard dump into a test/fixtures/game-<table>.json
// skeleton that scripts/check-game.mjs and test/scoring-fixtures.test.js can read.
// See docs/fixture-pipeline.md for the full path from a live game to a fixture.
//
//   node scripts/snapshot-to-fixture.mjs <snapshot.json> [out.json]
//
// The snapshot only carries what gameui exposes. Two things it can never carry,
// and this script leaves flagged rather than guessed (invariant 2):
//   - an opponent's bonus card — BGA never puts it in the model, win or lose,
//     only in the (unparsed) log text; see docs/bga-game-state.md, "Hidden
//     information".
//   - `expected`, the six-row total BGA itself displays at game end. That is the
//     one independent number this fixture exists to check scoreGame() against —
//     recomputing it from this same snapshot would just check scoreGame() against
//     itself.
import { readFileSync, writeFileSync } from 'node:fs';

const NEEDS_ENTRY = '<fill in by hand>';

export function snapshotToFixture(dump) {
  const { table, state, db } = dump;
  if (!state || !db) {
    throw new Error('snapshot is missing state or db — copy it again with a build that includes both');
  }

  // db.bonuscards isn't guaranteed indexed by id (see scripts/make-corpus.mjs), so
  // build the lookup the same way that script does rather than assume array position.
  const bonusById = {};
  for (const card of Object.values(db.bonuscards)) bonusById[card.index] = card.identifier;

  const ids = [state.myId, ...Object.keys(state.players).filter((id) => id !== state.myId)];
  const players = ids.map((id) => {
    const p = state.players[id];
    return {
      name: p.name,
      handBirdCount: p.handBirdCount || 0,
      bonus: p.isMe
        ? p.handBonus.map((idx) => bonusById[idx]).filter(Boolean)
        : [NEEDS_ENTRY],
      tableau: p.tableau.map((b) => {
        const bird = db.birds[b.birdId];
        const cached = (b.cached || []).reduce((a, x) => a + x, 0);
        const out = { habitat: b.habitat, eggs: b.eggs || 0, key: bird ? bird.identifier : NEEDS_ENTRY };
        if (cached) out.cached = cached;
        if (b.tucked) out.tucked = b.tucked;
        return out;
      })
    };
  });

  // The round currently in progress is recomputed live from the final mat by
  // scoring-fixtures.test.js (goalCounter), not trusted from `recorded` — same
  // convention as the two hand-built reference fixtures.
  const goals = state.goals.map((g, i) => ({
    description: g.description,
    recorded: ids.map((id) => Number((g.standing[id] || {}).value) || 0),
    historic: i !== state.round - 1
  }));

  // BGA already computes the VP each goal awards (`score`) — no need to guess it.
  const expectedGoalVp = Object.fromEntries(
    players.map((p, i) => [p.name, state.goals.map((g) => Number((g.standing[ids[i]] || {}).score) || 0)])
  );

  const expected = Object.fromEntries(
    players.map((p) => [
      p.name,
      { birds: null, bonus: null, goals: null, eggs: null, cached: null, tucked: null, total: null }
    ])
  );

  return {
    table: table ? Number(table) : null,
    source: 'built by scripts/snapshot-to-fixture.mjs from a live "Copy snapshot" dump',
    goalBoard: state.goalBoardType,
    goals,
    players,
    expected,
    expectedGoalVp
  };
}

function report(fixture) {
  console.log('Still needs, by hand, from BGA\'s own end-of-game score screen:');
  console.log('  - `expected`: the six-row total for each player');
  if (fixture.players.some((p) => p.bonus.includes(NEEDS_ENTRY)))
    console.log('  - an opponent\'s bonus card (never in the model — read it off the game log)');
  if (fixture.players.some((p) => p.tableau.some((b) => b.key === NEEDS_ENTRY)))
    console.log('  - a bird id missing from the card database in this dump (stale db?)');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const inFile = process.argv[2];
  if (!inFile) {
    console.error('usage: node scripts/snapshot-to-fixture.mjs <snapshot.json> [out.json]');
    process.exit(1);
  }
  const dump = JSON.parse(readFileSync(inFile, 'utf8'));
  const fixture = snapshotToFixture(dump);
  const outFile = process.argv[3] || `test/fixtures/game-${fixture.table ?? 'unknown'}.json`;
  writeFileSync(outFile, JSON.stringify(fixture, null, 2) + '\n');
  console.log(`wrote ${outFile}`);
  report(fixture);
}
