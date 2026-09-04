# From a live game to a fixture

`test/fixtures/game-*.json` is the acceptance test for the scorer (see
`test/scoring-fixtures.test.js` and `docs/reference-game.md`): a final mat read
straight out of the model, plus the six-row total BGA's own scoring produced, for
both players. Building one used to mean transcribing every field by hand. This is
the one-click-plus-two-fields path instead.

1. In a finished game (or an archived replay scrubbed to the end), click **Copy
   snapshot**. Paste the clipboard into a file, e.g. `snap.json`.
2. `node scripts/snapshot-to-fixture.mjs snap.json` — writes
   `test/fixtures/game-<table>.json` from `state`/`db` in the dump: `goals`
   (description, per-player raw count, `historic`), `players` (name, hand size,
   tableau with habitat/eggs/cached/tucked/key), and `expectedGoalVp` (the VP each
   goal awarded, already computed by BGA).
3. Fill in, by hand, the two things the model genuinely does not have:
   - `expected` — the six-row total for each player, read off BGA's own
     end-of-game score screen. This is the number the fixture exists to check
     `scoreGame()` against; computing it from the same snapshot would only check
     the code against itself (invariant 2 — a number is either read or reported
     missing, never guessed).
   - an opponent's bonus card, if the script left `"<fill in by hand>"` in their
     `bonus` array. BGA never puts an opponent's bonus card in the model, win or
     lose — only in the log text (`docs/bga-game-state.md`, "Hidden information").
     Your own bonus cards resolve automatically.
4. `node scripts/check-game.mjs test/fixtures/game-<table>.json` — prints the
   per-row comparison. `npm test` picks the fixture up automatically from there on
   (`test/scoring-fixtures.test.js` reads every file in `test/fixtures/`).

A snapshot copied by a build older than this pipeline only carries `dbHash`, not
the card database itself (`db`) — re-copy it after updating.
