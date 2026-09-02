# The corpus

`test/fixtures/corpus/decisions.json` holds, for every turn the local player took in a
recorded game: the state at the start of that turn, the move they actually
made, and the final score of the game. Three games, 81 rows, 120 KB.

Rebuild it from raw recorder dumps:

```
node scripts/make-corpus.mjs ~/Downloads/wingspan-recordings
```

Measure the evaluator against it:

```
npm run corpus                                   the three measurements
npm run corpus -- --sweep playShare 0.2 0.9 0.05 one weight, swept
npm run corpus -- --regret                       how far the human's move ranked
```

## Why not just "agree with the human"

The obvious measure — how often the top suggestion is the move the player made —
is the weakest of the three. The recorded player is decent, not strong: 74, 91
and 83 points, winning two of the three games. Fitting the engine to reproduce
those moves would fit it to their mistakes as well.

The measure worth optimising is **calibration**: how well `V(position)` predicts
the final score of the game. It is checkable against a fact, it does not care
whether the human played well, and an evaluator that predicts the score
correctly ranks moves correctly by construction. The `goalsBanked` field exists
for this: without the points already scored for closed rounds, `V` is "how much
more will accumulate", which cannot be compared to anything.

**Legality** is not a measure at all, it is an assertion. If the move a player
actually made is not among the options we enumerate, we have a rules bug. This
is how the "or"-priced birds were found.

## What the recordings verified

The recorder dumps BGA's own goal table alongside the game state — values and
points per player at every moment. That turns one final position into 1536 live
comparisons:

- `scoreGoal` — points per place on the green board: **1536 of 1536 correct**,
  including ties.
- `goalCounter` — the value of each of ten goal types: 82 disagreements out of
  1536, and in quiescent snapshots only 6 of 716. All six are BGA lagging: its
  goal panel updates at the end of a turn, so right after "lay 4 eggs" it still
  shows the old number. In every case our count is the right one.
- Full end-of-game scoring reproduced BGA's total for #908320715 exactly (74).

## Known gaps

**Four legality misses remain.** In two of the three games the recorder
double-counted an action cube once, which shifts one decision snapshot by a
turn. They are visible because the bird played is not even in hand at the
snapshot. `test/corpus.test.js` allows exactly four; a fifth means a real bug.

**The engine almost never suggests "gain food"** — 2 of 81 positions, where the
human took the forest row 12 times. The human's forest turns rank a median
1.9 VP below the top option. Either those twelve moves cost about 20 points the
final scores do not show, or food is still undervalued. Tightening `resSlack`
to 3 reverses the picture — forest agreement goes to 7/12 and the action mix
matches the human's — but the final-score forecast degrades from 7.8 to 12.7
RMSE. Three games cannot settle it; more recordings, ideally against stronger
opponents, can.

**Weights are fitted on one player's three games.** Leave-one-game-out
cross-validation improves RMSE from 9.9 to 9.1, but the chosen weights swing
between folds (`playShare` 0.52…0.79, `rowFocus` 1.5…3.0) and on one fold the
fit makes the held-out game worse. Only changes where all three folds agreed on
the direction were taken. This is the argument for growing the corpus before
touching the weights again.

**One player, one board.** All three games are two-player, green goal board,
same local player. The blue board is still unimplemented and untested.
