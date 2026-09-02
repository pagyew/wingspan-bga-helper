# Roadmap: from an advisor to an engine

Russian original, and the longer one: [roadmap.ru.md](roadmap.ru.md).
The extension plan ([plan.md](plan.md)) still stands — it is about the panel and
the bridge. This document is about the brain.

## The goal

An engine that plays Wingspan at a strong player's level and can explain the move.
Not "this action scores more", but: take *this* card and here is why, take *these*
dice for the birds in your hand, put the egg on *that* bird, here is what it adds
up to by the end of the round, and here is what you are giving up.

The line does not move: **the extension only reads**. The engine can play a whole
game, but it plays it against a simulator and archived replays. In a live game it
advises. No clicking, ever — invariant 1 in `CLAUDE.md`.

## Why no neural network

Wingspan is unusually convenient for a classical approach:

- **The scoring function is exact and short.** Six rows, microseconds to compute,
  already verified against two real games. That is a result, not an estimate.
- **The horizon is small.** 8+7+6+5 = 26 turns per player for the whole game, at
  most eight inside a round. Your own tree to the end of the round enumerates whole.
- **Interaction is weak.** The opponent reaches you through the tray, the feeder,
  the round-goal race and pink powers — and almost nowhere else. So exact search
  over your own turns does the heavy lifting, and the opponent model is needed in
  four specific places.
- **The unknown is describable.** The deck composition is readable off the page,
  seen cards subtract from it, the feeder is five dice with known faces. These are
  distributions you compute, not guess.

A network would be solving position evaluation. We already have the exact part of
it (the score) plus a small heuristic layer (engine and resources), which a dozen
features and self-play tuning cover. The result is also explainable, which matters
more for an advisor than raw strength.

## Where we are, and what blocks us

`src/engine/evaluate.js` ranks moves by `V(after) − V(before)` on one horizon. It
works, and it already matched a strong player's move on turn 122 of game #906484481.
Five things block it from here, and each one is a milestone.

| # | Blocker | Symptom |
|---|---|---|
| 1 | No rules simulator. `applyAction` is a simplified imitation inside the evaluator: no deck, no triggers, no opponent | cannot search, cannot self-play, cannot replay a real log |
| 2 | Powers are priced by category plus a few regexes | a strong and a weak bird in one category cost the same — the largest error |
| 3 | An unknown card is a fixed "average bird", `vp: 3` | drawing is worth the same regardless of what has already left the deck |
| 4 | One-turn horizon, greedy sub-decisions | cannot say "take this card so you can play it next turn" |
| 5 | Weights set by judgement, nothing measures them | no way to know whether a change helped |

## Milestones

The brain track runs alongside the extension track M0–M6 and does not replace it.

```
B1 simulator ──┬─> B2 powers ──┬─> B5 turn search ─> B6 round plan ─┬─> B8 opponent ─> B9 release
               │               │                                    │
               └─> B3 corpus ──┴─> B4 unknown model ────────────────┴─> B7 evaluation and tuning
```

### B1 — Rules simulator

The whole game as data and a pure transition function. Everything else stands on it.

State: deck (composition known, order not), tray, feeder (5 dice, faces, the reroll
rule), mats, action cubes, goals, bonus cards, discard, round and turn order, 2–5
players. `legalMoves(state)` and `apply(state, move, rng)` cover every phase,
including **sub-decisions as their own decision nodes**: which dice, which tray card,
which bird gets the egg, whether to use an optional power, what to discard. A turn is
a decision tree, not a single action — that is exactly what today's `applyAction`
flattens away, and why the panel cannot advise inside a dialog. No DOM, no BGA:
plain ESM, no dependencies.

Done when: both reference games replay from their logs and the final state matches
`docs/reference-game.md` on all six rows for both players; 10 000 random games run to
the end with no exception and no invariant violation (cube count, nest egg limit,
deck composition balance, non-negative food); `npm run check` still passes.

### B2 — Bird powers as data

Replace "priced by category" with an executable description of every card.
An effect DSL — `{ trigger, condition, effect, target, cost, optional }` — with
triggers for play (white), row activation (brown), the opponent's turn (pink) and
end of game. All 180 cards encoded; an undescribed card is an **explicit error**,
never `other` (invariant 2). The simulator executes those descriptions and the
evaluator prices them from the same source, so the two cannot drift.

Done when: coverage is 180/180 and an unknown power throws; every card has at least
one scenario test (state before → trigger → state after); replaying the B3 corpus
matches the BGA client's state after every power activation. Closes #14 — instead of
hand-pricing 20–30 cards we get all 180 with no hand-tuned coefficients.

### B3 — Game corpus

The machine that produces material for validation and tuning. Without it B2 has
nothing to validate against and B7 has nothing to learn from.

A parser from an archived BGA replay to a canonical move log (notifications, not the
localised text log). The panel's `Copy snapshot` (`src/ui/recorder.js`) grows into
recording a whole game rather than one position. At least 50 games, 20 of them by
high-rated players, kept in `test/fixtures/corpus/` as logs rather than snapshots.

Done when: 95% of the corpus replays to the end with the final score matching BGA on
all six rows; every divergence is classified and filed rather than smoothed over;
`npm run corpus` prints games, turns, card coverage and divergences.

### B4 — Model of the unknown

Three sources of uncertainty, each computed rather than guessed. **The deck**:
composition off the page minus tray, played, discarded and your hand → a distribution
over what is left, so the value of a draw is an expectation over it instead of a
constant. **The feeder**: five dice, known faces, the reroll rule — the distribution
of available food after a refill is exact. **The opponent's hand**: Bayesian update
from observable actions — taken from the tray means known, taken from the deck means
a distribution, a bird played subtracts.

Done when: predicting the opponent's next played card beats a uniform baseline on the
corpus, with the Brier score recorded in `docs/benchmarks.md`; the expected value of a
draw matches brute-force enumeration on synthetic positions; a dedicated test proves
the model uses only information visible to the player.

### B5 — Search inside a turn

A turn is a tree: row action → brown triggers left to right → a sub-decision at each
step → chance nodes (dice roll, deck draw). Expectimax over it, chance nodes from the
B4 distributions, with pruning and a hash cache. The engine answers the question the
BGA dialog is actually asking — `playerGainFromFeeder` (which dice),
`playerPowerBrown/White/Pink` (whether, and on which bird), `playerDiscardBird` /
`playerDiscardBonus` (what to lose), `playerTakeCardSpecial` (which tray card),
`playerInitialDiscard` (the opening hand) — not the general "what should I do".

Done when: every state in that table gets an answer and an unfamiliar one gets an
honest "I don't know"; median response under 300 ms and p95 under 1 s on the corpus;
the opening-hand decision measures no worse than the human's in self-play. Closes
#9 and #10.

### B6 — A plan for the round

The point of the whole exercise. Exact search over **your** remaining turns in the
round (iterative deepening plus beam), with feeder and tray expectations from B4.
The opponent enters where he actually interferes: the goal race, a tray card, feeder
dice, pink powers. Determinization (PIMC) or ISMCTS on top if the measurement shows
beam falls short. The output is not a best move but a **plan**: "Wetland — draw the
Kingfisher now; play it into the forest, column 3, next turn; second place on the
round goal, +11 VP."

Done when: a four-turn plan computes in under 2 s; top-1 agreement with strong
players' actual moves on the corpus improves over B5, with the absolute numbers
recorded in `docs/benchmarks.md` at the first measurement; in self-play the planning
version beats the non-planning one in at least 60% of 500 games, confidence interval
stated.

### B7 — Evaluation function and tuning

Features instead of magic constants: the food and card exchange rate by phase, row
capacity, bonus-card potential, distance to each goal, the opponent's tempo. A linear
model on win probability (gradient boosting only if linear proves insufficient),
fitted on the corpus and on self-play. A self-play arena with an Elo rating, run as a
regression on every PR that touches weights.

Done when: `npm run arena` plays N games and prints Elo with a confidence interval;
the new evaluation is +100 Elo over the current `WEIGHTS` heuristic over 1000 games;
no weight change merges without an arena number in the PR description. Closes #13.

### B8 — Opponent and goals

The opponent is modelled by the same policy on a shorter horizon rather than by an
average bird. The value of a place in a round goal is computed through the probability
of holding it, not through the current standing. The blue goal board (#17) needs one
game played on it to capture the scoring table, which does not exist in the client.
Watch mode evaluates on the opponent's turn and tracks both players' goal progress.

Done when: 2, 3, 4 and 5 player games run the arena without failures and Elo is
measured per player count; opponent position evaluation is calibrated — predicted win
probability matches the observed one by decile on the corpus; the blue board is either
supported or shown as an explicit banner, never as a silently lower score. Closes #8
and #17.

### B9 — Advice worth the name, and v0.2

The panel shows a plan, not a line: the move now, what it leads to, what it costs.
Specifics by name — the tray card, the dice faces, the bird under the egg. Confidence:
the gap to the alternative and the spread across determinizations. Everything
approximate is labelled (invariant 2). The README carries honest numbers: top-1/top-3
agreement, Elo, average score.

Done when: the reference replay runs first turn to last with the panel keeping up and
no unlabelled "unknown"; three live practice games run by hand; v0.2.0 is built and
installs from the zip on a clean profile.

## What happens to the existing issues

| Issue | Fate |
|---|---|
| #8 Watch mode | folded into B8 |
| #9 Sub-decisions | folded into B5 |
| #10 Opening hand | folded into B5 |
| #13 Measure agreement | folded into B7 |
| #14 Price bird powers by hand | **dropped** — B2 covers it entirely, without hand-set prices |
| #17 Blue goal board | folded into B8 |

The remaining M0–M6 issues stand: they are about the extension, not the brain.

## How the work runs

The process lives in `.claude/skills/project-flow/SKILL.md` and in
[docs/process.md](process.md): milestone → tasks with an acceptance criterion →
branch → PR → acceptance against that criterion → milestone closed with a measurement.

The rule the whole thing exists to enforce: **every task has an acceptance criterion
that a command or an observation answers yes or no.** A task without one is not filed.
