# Benchmarks

Append-only. Every row carries the date, the commit it was measured at, the sample
size and the exact command. A number without those is not a benchmark, it is a
recollection.

The corpus (B3) exists and produces the first three sections; the arena (B7)
still owes the Elo row. See docs/corpus.md for what the corpus is and why
calibration, not agreement, is the number being optimised.

## Agreement with strong players

How often the engine's top suggestion is the move the player actually made, on the
corpus of archived games (milestone B3).

| Date | Commit | Games | Turns | top-1 | top-3 | Command |
|---|---|---|---|---|---|---|
| 2026-09-02 | a28e448 + tooling | 3 | 81 | 42/81 | 61/81 | `npm run corpus` |
| 2026-09-02 | 5b74ef8 | 3 | 81 | 39/81 | 61/81 | `npm run corpus` |

The corpus is one mid-level player (74, 91, 83 points; two wins of three), so
agreement is context, not a target — see docs/corpus.md. The 42 → 39 move is
noise at this sample size; the calibration row below is what changed.

"a28e448 + tooling" means the previous evaluator measured with this branch's
corpus scripts — the tooling did not exist before, so the baseline had to be
produced by pointing it at the old `src/engine/evaluate.js`.

## Legality on the corpus

Moves the recorded player actually made that the evaluator never listed. Any
miss is a rules bug, not a difference of opinion.

| Date | Commit | Turns | Misses | Note |
|---|---|---|---|---|
| 2026-09-02 | a28e448 + tooling | 81 | 6 | 2 were birds priced "1 X or 1 Y" |
| 2026-09-02 | 5b74ef8 | 81 | 4 | all four are recorder artefacts, see docs/corpus.md |

## Final-score forecast

RMSE of `V(position)` against the game's actual final score, over every decision
point in the corpus. Bias is signed: negative means the evaluator undercounts.

| Date | Commit | Sample | RMSE | Bias r1 | Bias r2 | Bias r3 | Bias r4 | Command |
|---|---|---|---|---|---|---|---|---|
| 2026-09-02 | a28e448 + tooling | 81 | 22.9 | −32.1 | −16.3 | −10.4 | −13.7 | `npm run corpus` |
| 2026-09-02 | 5b74ef8 | 81 | 7.8 | −2.7 | −2.5 | −1.1 | −5.0 | `npm run corpus` |

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
