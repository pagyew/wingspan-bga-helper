#!/usr/bin/env bash
# Put the brain-track roadmap on GitHub: milestones B1–B9, the labels they need,
# the first three milestones' tasks, and the re-homing of the issues that the
# roadmap absorbs. Safe to re-run — everything it creates is checked for first.
#
#   gh auth login                       # once, if you have not
#   bash scripts/bootstrap-roadmap.sh
#
# DRY=1 bash scripts/bootstrap-roadmap.sh   prints what it would do and changes nothing.
set -euo pipefail

OWNER="${OWNER:-pagyew}"
REPO="${REPO:-wingspan-bga-helper}"
SLUG="$OWNER/$REPO"
DRY="${DRY:-}"

cd "$(dirname "$0")/.."

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
run() { if [ -n "$DRY" ]; then echo "  would: $*"; else "$@"; fi; }

command -v gh >/dev/null || { echo "gh CLI is required: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "run 'gh auth login' first"; exit 1; }

# ---------------------------------------------------------------------- labels
say "Labels"
label() { run gh label create "$1" --color "$2" --description "$3" --force >/dev/null 2>&1 || true; }
label "simulator" "2D6A4F" "Headless rules model: state, legal moves, transitions"
label "powers"    "40916C" "Bird power descriptions and their executor"
label "search"    "1B4965" "Move search, planning, expectimax, determinization"
label "data"      "9C6644" "Replay corpus, fixtures, parsing, statistics"
label "benchmark" "BC4749" "Measured strength: arena, agreement, calibration"

# ------------------------------------------------------------------ milestones
say "Milestones"
milestone() { # title, description -> number
  local existing
  existing=$(gh api "repos/$SLUG/milestones?state=all&per_page=100" \
    --jq ".[] | select(.title==\"$1\") | .number" || true)
  if [ -n "$existing" ]; then echo "$existing"; return; fi
  if [ -n "$DRY" ]; then echo "0"; return; fi
  gh api "repos/$SLUG/milestones" -f title="$1" -f description="$2" --jq .number
}
B1=$(milestone "B1 Rules simulator"        "Whole game as data plus a pure transition function. Sub-decisions are decision nodes.")
B2=$(milestone "B2 Bird powers as data"    "An executable description of all 180 powers, replacing pricing by category.")
B3=$(milestone "B3 Game corpus"            "Archived replays to canonical move logs; the material B2 validates against and B7 learns from.")
B4=$(milestone "B4 Model of the unknown"   "Deck, feeder and opponent hand as computed distributions instead of an average bird.")
B5=$(milestone "B5 Search inside a turn"   "Expectimax over the turn tree; an answer to the dialog BGA is actually asking.")
B6=$(milestone "B6 A plan for the round"   "Exact search over your remaining turns; the output is a plan, not a move.")
B7=$(milestone "B7 Evaluation and tuning"  "Features instead of magic constants; self-play arena and Elo.")
B8=$(milestone "B8 Opponent and goals"     "Opponent modelled by policy; goal places by probability; the blue board.")
B9=$(milestone "B9 Advice and v0.2"        "The panel shows a plan with named specifics and honest confidence.")
echo "  B1..B9 = $B1 $B2 $B3 $B4 $B5 $B6 $B7 $B8 $B9"

# ---------------------------------------------------------------------- issues
say "Tasks for B1–B3 (later milestones are broken down when they are reached)"
issue() { # milestone-title, labels, title, body
  local m="$1" labels="$2" title="$3" body="$4"
  if gh issue list --repo "$SLUG" --state all --search "\"$title\" in:title" --json title \
       --jq '.[].title' 2>/dev/null | grep -Fxq "$title"; then
    echo "  = $title"; return
  fi
  if [ -n "$DRY" ]; then echo "  + $title"; return; fi
  gh issue create --repo "$SLUG" --title "$title" --body "$body" \
    --milestone "$m" --label "$labels" >/dev/null
  echo "  + $title"
}

# --- B1 ---------------------------------------------------------------------
issue "B1 Rules simulator" "simulator,engine" \
  "sim: canonical game state and a pure transition function" \
  $'`src/engine/evaluate.js` carries a simplified imitation of a turn inside `applyAction`: no deck, no triggers, no opponent. Nothing can be searched, self-played or replayed against it. Start the real thing in `src/sim/`.\n\nDefine the state — deck, tray, feeder, mats, action cubes, goals, bonus cards, discard, round, turn order, 2–5 players — and the two entry points `legalMoves(state)` and `apply(state, move, rng)`, both pure. No powers yet: a bird plays as a card with a cost and a VP value.\n\n## Done when\n\n- [ ] `legalMoves` and `apply` exist, are pure (no mutation of the argument, no module state) and have no DOM or BGA dependency\n- [ ] a game of only row actions and plain bird plays runs from setup to the last turn\n- [ ] `npm run check` stays green: no external imports under `src/`\n\n## Notes\n\nSee docs/roadmap.md, milestone B1. The state shape is the interface every later milestone builds on — worth getting reviewed before the rest of B1 lands on top of it.'

issue "B1 Rules simulator" "simulator" \
  "sim: deck, tray and feeder with the refill and reroll rules" \
  $'The tray holds three face-up cards and refills from the deck; the feeder holds five dice, rerolls when every die shows the same face, and the composition of the deck is not the base game (Swift Start promos, `set: 1`).\n\n## Done when\n\n- [ ] deck composition is a parameter, read off the page rather than assumed to be 170 cards\n- [ ] tray refill, discard pile and reshuffle-on-empty behave per the rulebook\n- [ ] the feeder reroll rule fires exactly when all five dice match, and the dual invertebrate/seed face (die face `5`) is modelled as one die that can pay either\n- [ ] unit tests cover an empty deck mid-refill and a reroll'

issue "B1 Rules simulator" "simulator" \
  "sim: the round loop, action cubes and round-end goal scoring" \
  $'Eight, seven, six and five turns; a cube removed each turn and returned at the round end; the round goal scored on the green board with places and ties.\n\n## Done when\n\n- [ ] cube counts follow 8/7/6/5 and a round ends exactly when the last player spends the last cube\n- [ ] round-goal places, including ties, match `scoreGoal()` — the simulator calls it rather than reimplementing it\n- [ ] a game ends after round 4 with a final score computed by `src/engine/scoring.js`\n- [ ] the blue board throws the same explicit error it throws today, not a zero'

issue "B1 Rules simulator" "simulator,engine" \
  "sim: sub-decisions as decision nodes" \
  $'A turn is a tree, not one action: which dice to take from the feeder, which card from the tray, which bird gets the egg, whether to use an optional power, what to discard. Today these are collapsed into greedy helpers inside `applyAction`, which is why the panel cannot advise inside a BGA dialog.\n\n## Done when\n\n- [ ] `legalMoves` returns sub-decisions as their own moves, so a turn is a sequence of `apply` calls\n- [ ] each of `playerGainFromFeeder`, `playerPowerBrown/White/Pink`, `playerDiscardBird`, `playerDiscardBonus`, `playerTakeCardSpecial`, `playerInitialDiscard` maps to a decision node with the same options the BGA client offers\n- [ ] chance is explicit: a node that depends on a die or a draw is marked as a chance node and takes `rng`'

issue "B1 Rules simulator" "simulator,data" \
  "sim: replay both reference games from their logs and match the final score" \
  $'This is the acceptance criterion of B1 and the reason the simulator is trustworthy at all.\n\n## Done when\n\n- [ ] games #906782034 (91:89) and #906484481 (87:86) replay move by move from a log\n- [ ] the final state matches `docs/reference-game.md` on all six scoring rows for both players\n- [ ] a divergence names the turn and the row it diverged at, rather than failing at the end\n\n## Notes\n\nBlocked by the log format from the B3 milestone if the logs are not already at hand; a hand-written log for one game is an acceptable start.'

issue "B1 Rules simulator" "simulator" \
  "sim: property test — 10 000 random games with invariants held" \
  $'Random play is the cheapest way to find the rule that was modelled wrong.\n\n## Done when\n\n- [ ] 10 000 random games run to completion with no exception\n- [ ] after every move: cube count is right for the round, no bird exceeds its nest egg limit, deck + tray + hands + played + discard equals the starting composition, no food count is negative\n- [ ] the suite runs in CI in under a minute (a smaller sample there is fine if the full run is one command away)'

# --- B2 ---------------------------------------------------------------------
issue "B2 Bird powers as data" "powers,engine" \
  "powers: design the effect DSL and its executor" \
  $'`powerValue()` prices a bird by category plus a handful of regexes over the English text. A strong and a weak bird in the same category cost the same — the largest single source of error in the evaluator.\n\nReplace it with a description each card carries: `{ trigger, condition, effect, target, cost, optional }`. The simulator executes it; the evaluator prices it from the same description, so the two cannot drift apart.\n\n## Done when\n\n- [ ] the DSL covers gain / lay / tuck / cache / draw / discard / repeat / choose, with targets and optional costs\n- [ ] the executor runs a description against a simulator state and returns the new state\n- [ ] the shape is documented in `docs/powers.md` with three worked examples of increasing nastiness'

issue "B2 Bird powers as data" "powers" \
  "powers: encode the brown activation powers" \
  $'The when-activated powers, the ones the row action triggers.\n\n## Done when\n\n- [ ] every brown card in `src/engine/data/birds.js` has a description\n- [ ] each has a scenario test: state before, trigger, expected state after\n- [ ] left-to-right activation order is respected by the executor'

issue "B2 Bird powers as data" "powers" \
  "powers: encode the white when-played powers" \
  $'One-shot powers that fire when the bird is played. The evaluator adds them today as a single lump `oneShot` term.\n\n## Done when\n\n- [ ] every white card has a description\n- [ ] the `oneShot` special case disappears from `evaluate.js` — the value comes from the description\n- [ ] each card has a scenario test'

issue "B2 Bird powers as data" "powers" \
  "powers: encode pink and end-of-game powers" \
  $'Pink powers fire on an opponent turn, so their value depends on player count and on how often the trigger comes up; end-of-game powers are scored once.\n\n## Done when\n\n- [ ] every pink and end-of-game card has a description\n- [ ] pink expected value is a function of player count, not the flat `pinkFactor` constant\n- [ ] each card has a scenario test'

issue "B2 Bird powers as data" "powers,engine" \
  "powers: fail loudly on an unknown power, and prove 180/180 coverage" \
  $'Invariant 2 of `CLAUDE.md`: an unknown must never score as zero. Today an unrecognised power quietly falls through to the `other` category at 0.4.\n\n## Done when\n\n- [ ] a coverage test asserts every card in the database has a description, and names the ones that do not\n- [ ] executing or pricing an undescribed power throws, with the card name in the message\n- [ ] the panel surfaces that error rather than showing a number'

issue "B2 Bird powers as data" "powers,engine" \
  "engine: price powers from the DSL instead of the category table" \
  $'With descriptions in place, `WEIGHTS.power` and the regex parsing in `powerValue()` have nothing left to do.\n\n## Done when\n\n- [ ] `powerValue` computes expected value from the description and the position, not from text\n- [ ] the category table and the regex block are deleted, not left dormant\n- [ ] on the corpus, top-1 agreement is no worse than before the change — with the number in the PR and in `docs/benchmarks.md`'

# --- B3 ---------------------------------------------------------------------
issue "B3 Game corpus" "data" \
  "corpus: parse an archived replay into a canonical move log" \
  $'The replay page carries the same notification stream the live game does. Parse it into a move log the simulator can consume — notifications, never the localised text log.\n\n## Done when\n\n- [ ] a replay id in, a JSON move log out, with every move typed and every chance outcome recorded\n- [ ] the log for game #906782034 replays through the simulator to 91:89\n- [ ] the format is documented in `docs/corpus.md`'

issue "B3 Game corpus" "data,ui" \
  "corpus: record a whole game from the panel, not one snapshot" \
  $'`src/ui/recorder.js` copies a single position. Recording the whole game is what turns a session of play into test material.\n\n## Done when\n\n- [ ] the panel can record from any point to the end of the game and export one JSON file\n- [ ] the file is a corpus move log, the same format as the replay parser produces\n- [ ] recording is off by default and visible when it is on'

issue "B3 Game corpus" "data" \
  "corpus: collect 50 games, 20 of them high-rated" \
  $'Material, not code. Games go in `test/fixtures/corpus/` as move logs rather than snapshots, so the directory stays small.\n\n## Done when\n\n- [ ] at least 50 complete games, at least 20 by high-rated players\n- [ ] every game carries its table id, date, player count and final score\n- [ ] the directory is under 20 MB, and CI runs on a named subset rather than all of it'

issue "B3 Game corpus" "data,benchmark" \
  "corpus: npm run corpus — replay everything and report divergences" \
  $'The acceptance criterion of B3 and the harness every later milestone measures against.\n\n## Done when\n\n- [ ] `npm run corpus` replays the whole corpus and prints games, turns, card coverage and divergences\n- [ ] 95% of games replay to the end with the final score matching BGA on all six rows\n- [ ] every divergence is classified, and each class has an issue — none are smoothed over\n- [ ] `npm run corpus -- --agreement` prints top-1 and top-3 agreement with the players'"'"' actual moves'

# ------------------------------------------------- issues the roadmap absorbs
say "Re-homing the issues the roadmap absorbs"
remilestone() { # issue number, milestone title
  local cur
  cur=$(gh issue view "$1" --repo "$SLUG" --json milestone --jq '.milestone.title // ""' 2>/dev/null || echo "")
  if [ "$cur" = "$2" ]; then echo "  = #$1 already in $2"; return; fi
  run gh issue edit "$1" --repo "$SLUG" --milestone "$2" >/dev/null && echo "  → #$1 to $2"
}
remilestone 8  "B8 Opponent and goals"
remilestone 9  "B5 Search inside a turn"
remilestone 10 "B5 Search inside a turn"
remilestone 13 "B7 Evaluation and tuning"
remilestone 17 "B8 Opponent and goals"

state14=$(gh issue view 14 --repo "$SLUG" --json state --jq .state 2>/dev/null || echo "")
if [ "$state14" = "OPEN" ]; then
  run gh issue close 14 --repo "$SLUG" \
    --comment "Superseded by milestone B2: all 180 powers get an executable description, so there is nothing left to hand-price. See docs/roadmap.md." \
    && echo "  × #14 closed as superseded"
else
  echo "  = #14 already closed"
fi

say "Done. Next: npm run board"
