// Ported from .engine-src/check-game.js — see docs/engine-port.md.
//
// Each fixture is a final mat read straight out of the BGA client model
// (docs/bga-game-state.md), plus the totals BGA's own scoring produced. This
// is the acceptance test for the port: both fixtures must reproduce all six
// scoring rows, for both players — see docs/reference-game.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import birds from '../src/engine/data/birds.js';
import bonusCards from '../src/engine/data/bonus.js';
import { scoreGame, goalCounter } from '../src/engine/scoring.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, 'fixtures');
const fixtureFiles = readdirSync(fixturesDir).filter((f) => f.endsWith('.json')).sort();

const ROWS = ['birds', 'bonus', 'goals', 'eggs', 'cached', 'tucked', 'total'];

// Goals recorded for already-finished rounds are taken as-is; the one live
// round (not yet `historic`) is recomputed from the final mat, same as the
// evaluator would from a live snapshot.
function enrich(player) {
  return {
    tableau: player.tableau.map((b) => {
      const ref = birds.find((x) => x.key === b.key);
      if (!ref) throw new Error('не в справочнике: ' + b.key);
      return { ...b, nest: ref.nest, vp: ref.vp, eggs: b.eggs || 0 };
    }),
    handBirdCount: player.handBirdCount || 0
  };
}

for (const file of fixtureFiles) {
  const fx = JSON.parse(readFileSync(join(fixturesDir, file), 'utf8'));

  test(`${file}: recomputed live-round goal counts match the recorded ones`, () => {
    fx.goals.forEach((g, r) => {
      if (g.historic) return;
      const count = goalCounter(g.description);
      fx.players.forEach((p, i) => {
        assert.equal(count(enrich(p)), g.recorded[i], `round ${r + 1} (${g.description}), player ${p.name}`);
      });
    });
  });

  test(`${file}: all six scoring rows match BGA's own totals for every player`, () => {
    const goals = fx.goals.map((g) => (g.historic ? { ...g, values: g.recorded } : { description: g.description }));
    const players = fx.players.map((p) => ({
      name: p.name, handBirdCount: p.handBirdCount || 0, bonus: p.bonus,
      tableau: p.tableau.map((b) => ({
        name: b.key, habitat: b.habitat, eggs: b.eggs || 0, tucked: b.tucked || 0, cached: b.cached || 0
      }))
    }));
    const results = scoreGame({ birds, bonusCards, goalBoard: fx.goalBoard, goals, players });

    for (const r of results) {
      const want = fx.expected[r.name];
      for (const row of ROWS) assert.equal(r[row], want[row], `${file} ${r.name}.${row}`);
    }
  });
}
