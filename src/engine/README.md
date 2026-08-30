# Engine

The rules model: mat geometry, end-of-game scoring and the move evaluator,
ported from a verified CommonJS original — see `docs/engine-port.md` for where
it came from and what "ported correctly" meant.

Plain ESM with no dependencies, so the same files run under `node --test` and
inside the extension bundle. It does not touch the DOM or `chrome.*` — the
only things it ever sees are `createEngine()`'s own bundled card data and
whatever `from-snapshot.js` hands it.

| File | Responsibility |
|---|---|
| `mat.js` | column geometry, egg cost, row payouts |
| `scoring.js` | end-of-game scoring: birds, eggs, cached food, tucked cards, bonus cards, round goals |
| `evaluate.js` | position value and move ranking |
| `index.js` | `createEngine({ birds, bonusCards })` — assembles the card lookups the evaluator needs and returns `{ suggest, advise }` |
| `from-snapshot.js` | adapts a `src/page/state.js` snapshot (numeric bird ids, players keyed by id) into the shape `evaluate.evaluateTurn` expects (string keys, local player first) |
| `data/birds.js` | the 180-card database `createEngine()` uses by default |
| `data/bonus.js` | the 26 bonus cards `createEngine()` uses by default |

Both scoring and evaluation are verified against two complete BGA games
(91:89 and 87:86, all six scoring rows for both players) — see
`docs/reference-game.md` for the fixture that proves it, and
`test/scoring-fixtures.test.js` / `test/position.test.js` for where that
verification lives now.
