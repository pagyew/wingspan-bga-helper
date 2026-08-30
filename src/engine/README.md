# Engine

This is where the rules model goes: mat geometry, end-of-game scoring and the
move evaluator, as described in `docs/plan.md` (milestone M2).

**The code already exists and is verified — it just has not been committed yet.**
`docs/engine-port.md` says where it lives, what has to change on the way in, and
what counts as a correct port. Read that before writing anything here.

The engine is plain ESM with no dependencies, so the same files run under
`node --test` and inside the extension bundle. It must not touch the DOM or
`chrome.*` — the only thing it ever sees is a snapshot produced by
`src/page/state.js`.

Planned modules:

| File | Responsibility |
|---|---|
| `mat.js` | column geometry, egg cost, row payouts |
| `scoring.js` | end-of-game scoring: birds, eggs, cached food, tucked cards, bonus cards, round goals |
| `evaluate.js` | position value and move ranking |
| `data/birds.json` | fallback card database (the live one is read off the page) |
| `data/bonus.json` | fallback bonus-card database |

Both scoring and evaluation were already verified against two complete BGA
games (91:89 and 87:86, all six scoring rows for both players) before this
repository existed — see `docs/reference-game.md` for the fixture that proves it.
