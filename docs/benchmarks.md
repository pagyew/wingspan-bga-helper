# Benchmarks

Append-only. Every row carries the date, the commit it was measured at, the sample
size and the exact command. A number without those is not a benchmark, it is a
recollection.

Nothing is measured yet: the corpus (B3) and the arena (B7) are what produce these
rows. The table below fixes the shape so the first measurement has somewhere to land.

## Agreement with strong players

How often the engine's top suggestion is the move the player actually made, on the
corpus of archived games (milestone B3).

| Date | Commit | Games | Turns | top-1 | top-3 | Command |
|---|---|---|---|---|---|---|
| — | — | — | — | — | — | `npm run corpus -- --agreement` |

## Self-play Elo

Relative strength of two engine configurations against each other (milestone B7).
Elo is meaningless without the opponent it was measured against — always name it.

| Date | Commit | Opponent | Games | Elo ± CI | Command |
|---|---|---|---|---|---|
| — | — | — | — | — | `npm run arena` |

## Response time

Measured on the corpus, on the machine named in the row — timings do not transfer.

| Date | Commit | Depth | Median | p95 | Machine |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

## Calibration

Brier score of the opponent-hand model (B4) and of the win-probability evaluation (B8).

| Date | Commit | Model | Sample | Brier | Baseline |
|---|---|---|---|---|---|
| — | — | — | — | — | — |
