# Porting the engine (milestone M2, issue #5)

The rules model already exists and was verified against two complete BGA games
before this repository was created. It has not been committed yet. This document
says exactly where it comes from and what "ported correctly" means.

## Where the source lives

In **`.engine-src/`** at the root of this repository. It is gitignored: it is the
material for the port, not part of the project. The files are the originals,
unpacked from `wingspan-helper-code.zip`, and they run as they are:

```bash
cd .engine-src && node test.js      # all five suites must print ВСЁ СОШЛОСЬ
```

That is the reference behaviour. Anything the port produces must reproduce it.

`.engine-src/package.json` sets `"type": "commonjs"` on purpose — the source is
CommonJS, this repository is ESM, and without that file Node refuses to run it.

| Source | Goes to | Notes |
|---|---|---|
| `.engine-src/mat.js` | `src/engine/mat.js` | column geometry, egg cost, row payouts |
| `.engine-src/scoring.js` | `src/engine/scoring.js` | end-of-game scoring, round goals, places, ties |
| `.engine-src/evaluate.js` | `src/engine/evaluate.js` | position value, move ranking, `WEIGHTS` |
| `.engine-src/page-state.js` | — | **do not port**; see the note below |
| `.engine-src/index.js` | `src/engine/index.js` | assembly; see the rewrite note below |
| `.engine-src/data/birds.json` | `src/engine/data/birds.json` | 180 cards, keyed by `key` |
| `.engine-src/data/bonus.json` | `src/engine/data/bonus.json` | 26 bonus cards |
| `.engine-src/data/goals_raw.json` | `src/engine/data/goals_raw.json` | goal definitions |
| `.engine-src/fixtures/*.json` | `test/fixtures/` | 91 : 89 and 87 : 86 |
| `.engine-src/test_units.js` | `test/units.test.js` | goals, places, scoring rows, power parsing |
| `.engine-src/test_evaluate.js` | `test/evaluate.test.js` | three model positions |
| `.engine-src/test_position.js` | `test/position.test.js` | real position, turn 122 of #906484481 |
| `.engine-src/check-game.js` | `scripts/check-game.mjs` | scores one fixture in detail |
| `.engine-src/test.js` | — | replaced by `npm test` |

### The snapshot shapes do not match — reconcile them

This is the one part of the port that is not mechanical, and skipping it will
produce an evaluator that silently sees an empty board.

`.engine-src/page-state.js` and this repository's `src/page/state.js` both read the
BGA client, but they emit **different shapes**, and the evaluator expects the old one:

| | `.engine-src/page-state.js` (what evaluate.js expects) | `src/page/state.js` (what the extension produces) |
|---|---|---|
| birds identified by | `key` — the normalized common name (`"bushtit"`) | `birdId` — the numeric BGA index |
| players | array, local player first | object keyed by player id, `isMe` flag |
| tableau entry | `{key, habitat, eggs, tucked, cached}` | `{loc, habitat, col, birdId, vp, nest, …}` |
| cached food | one number | array of 5 per food type |
| goal board | `goalBoard: "green" \| "blue"` | `goalBoardType` |
| turn info | `cubesLeft` at the top level | inside `players[me].cubesLeft` |

Pick one and adapt the other — do not maintain both. The straightforward route is
an adapter (`src/engine/from-snapshot.js`) that converts the extension's snapshot
into the evaluator's shape, joining on the card database that the page already
provides. Whichever you choose, `test/position.test.js` must still pass: it is the
only test that pins the evaluator to a real position.

## What has to change

The source is CommonJS; this repository is ESM (`"type": "module"`), because the
same files have to run under `node --test` and inside the esbuild bundle.

- `const x = require('./y.js')` → `import x from './y.js'` (keep the extension)
- `module.exports = { a, b }` → `export { a, b }`
- Drop `'use strict'` — modules are strict already.
- JSON: Node's import attributes are still awkward across versions. Prefer
  `data/index.js` that does `export const birds = [...]`? No — keep the JSON files
  and load them with `createRequire` **only in `index.js`**, or convert the two data
  files to `.js` modules that `export default`. Whichever you pick, `src/engine/`
  must not read the filesystem: the bundle has no `fs`, and the extension gets its
  card data off the page anyway. The filesystem load belongs in the test helper.
- `code/index.js` currently reads `data/*.json` with `fs`. Rewrite it so the data is
  injected: `createEngine({ birds, bonusCards })` returning `{ suggest, advise }`.
  That keeps `src/engine/` pure and lets the extension pass the page's own database.

Public surface to preserve:

```js
evaluate.evaluateTurn({ ...pageState, db, bonusByKey }, weights) // ranked moves
evaluate.advise(ranked, db)                                      // readable advice
evaluate.WEIGHTS                                                 // tunable coefficients
```

## Acceptance

Done when all of these hold:

1. `npm test` covers both fixtures and asserts **all six scoring rows for both
   players**: birds, bonus cards, round goals, eggs, cached food, tucked cards —
   totals 91 : 89 and 87 : 86.
2. `npm run check` still passes: no bare imports anywhere under `src/`.
3. `node scripts/check-game.mjs test/fixtures/game-906782034.json` prints the
   per-row comparison.
4. The green-board goal places, including the round-1 and round-2 ties, come out as
   `docs/reference-game.md` records them.
5. `scoreGoal()` still **throws** on a goal wording it does not recognise. Do not
   soften this into a zero while porting — the explicit failure is the feature.

## What is deliberately not solved here

- The blue goal board (issue #17): its scoring table is on the BGA server.
- Bird powers priced by category rather than individually (issue #14).
- One-move-deep search; no opponent replies.
