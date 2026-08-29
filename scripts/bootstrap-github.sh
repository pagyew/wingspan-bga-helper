#!/usr/bin/env bash
# One-shot setup: create the GitHub repository, push, and fill in labels,
# milestones, issues and a project board. Safe to re-run — everything it creates
# is checked for first.
#
#   gh auth login          # once, if you have not
#   bash scripts/bootstrap-github.sh
#
set -euo pipefail

OWNER="${OWNER:-pagyew}"
REPO="${REPO:-wingspan-bga-helper}"
SLUG="$OWNER/$REPO"
DESC="Chrome extension that reads a live Wingspan game on Board Game Arena and suggests the strongest next move. Read-only."

cd "$(dirname "$0")/.."

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

command -v gh >/dev/null || { echo "gh CLI is required: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "run 'gh auth login' first"; exit 1; }

# ---------------------------------------------------------------- license text
if grep -q "belongs in this file" LICENSE 2>/dev/null; then
  say "Fetching the GPL-3.0 text"
  curl -fsSL -o LICENSE https://www.gnu.org/licenses/gpl-3.0.txt \
    || echo "could not fetch it — download https://www.gnu.org/licenses/gpl-3.0.txt into LICENSE by hand"
fi

# ------------------------------------------------------------------ first push
say "Creating $SLUG"
if gh repo view "$SLUG" >/dev/null 2>&1; then
  echo "repository already exists — skipping creation"
else
  gh repo create "$SLUG" --public --description "$DESC" --disable-wiki
fi

git rev-parse --git-dir >/dev/null 2>&1 || git init
git symbolic-ref HEAD refs/heads/main 2>/dev/null || git branch -M main
git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$SLUG.git"

git add -A
git diff --cached --quiet || git commit -m "Initial commit: MV3 skeleton, state reader, bilingual panel, docs"
git push -u origin main

gh repo edit "$SLUG" --add-topic chrome-extension --add-topic boardgamearena \
  --add-topic wingspan --add-topic manifest-v3 --add-topic board-games >/dev/null

# ---------------------------------------------------------------------- labels
say "Labels"
label() {
  gh label create "$1" --color "$2" --description "$3" --force >/dev/null 2>&1 || true
}
label "engine"     "5B8C5A" "Rules model, scoring, evaluation"
label "extension"  "3F6E9E" "Manifest, content scripts, bridge"
label "ui"         "8C6BB1" "Panel, options, presentation"
label "i18n"       "B08968" "Russian and English strings"
label "fixture"    "C9A227" "Recorded games used as test data"
label "docs"       "6E7B8B" "Documentation"
label "good first issue" "7057FF" "A small, self-contained place to start"
label "help wanted" "008672" "Needs a game or a pair of eyes we do not have"

# ------------------------------------------------------------------ milestones
say "Milestones"
milestone() { # title, description
  local existing
  existing=$(gh api "repos/$SLUG/milestones?state=all" --jq ".[] | select(.title==\"$1\") | .number" || true)
  if [ -n "$existing" ]; then echo "$existing"; return; fi
  gh api "repos/$SLUG/milestones" -f title="$1" -f description="$2" --jq .number
}
M0=$(milestone "M0 Skeleton"      "Manifest, two worlds, postMessage bridge, panel shell.")
M1=$(milestone "M1 Live state"    "collectState, validateState, stable flag, subscriptions plus heartbeat.")
M2=$(milestone "M2 Advice"        "Engine ported and wired in; top three moves with a VP delta.")
M3=$(milestone "M3 Watch mode"    "Evaluation on the opponent's turn, and advice for sub-decisions.")
M4=$(milestone "M4 Debug loop"    "Snapshot to fixture in one click; diagnostics.")
M5=$(milestone "M5 Weights"       "Tune evaluate.WEIGHTS against archived games and measure agreement.")
M6=$(milestone "M6 Release"       "Options, hotkey, icons, packaging, v0.1.0.")

# ---------------------------------------------------------------------- issues
say "Issues"
issue() { # milestone-number, labels, title, body
  local m="$1" labels="$2" title="$3" body="$4"
  if gh issue list --repo "$SLUG" --state all --search "\"$title\" in:title" --json title \
       --jq '.[].title' | grep -Fxq "$title"; then
    echo "  = $title"; return
  fi
  gh issue create --repo "$SLUG" --title "$title" --body "$body" \
    --milestone "$(gh api repos/$SLUG/milestones/$m --jq .title)" \
    --label "$labels" >/dev/null
  echo "  + $title"
}

issue "$M0" "ui,good first issue" \
  "Design real extension icons" \
  $'The 16/48/128 PNGs in `icons/` are generated placeholders — a flat disc, no bird.\n\nDone when: a recognisable icon reads at 16px in a crowded toolbar, in both light and dark Chrome themes.'

issue "$M1" "extension" \
  "Verify the state reader across a full replay" \
  $'Scrub replay #906782034 from the first turn to the last with the panel open.\n\nDone when: the panel updates on every turn, no snapshot contains an `undefined` tray entry, and the round number tracks the heading. Note anything the reader misses in this issue rather than fixing it silently.'

issue "$M1" "extension" \
  "Confirm both page shapes: game iframe and standalone document" \
  $'The game is sometimes the content of `#gameIframe` on `tableview?table=…` and sometimes a document of its own at `/<ver>/wingspan?table=…`.\n\nDone when: the panel appears exactly once in both, and never in a frame without `gameui`.'

issue "$M1" "fixture" \
  "Add the two reference games as fixtures" \
  $'Games #906782034 (91:89) and #906484481 (87:86) are described in `docs/reference-game.md` but are not in `test/fixtures/` yet.\n\nDone when: both load as JSON in a test that asserts all six scoring rows for both players.'

issue "$M2" "engine" \
  "Port mat, scoring and evaluate into src/engine" \
  $'The modules exist and were verified against two finished games before this repository — see `docs/reference-game.md`. They need to land here as plain ESM with no dependencies, running under `node --test` and inside the bundle.\n\nDone when: `npm test` covers the six scoring rows of both reference games.'

issue "$M2" "engine,ui" \
  "Wire the evaluator into the panel and render the top three moves" \
  $'`buildView` already accepts an `advice` array of `{ name, why, delta }`; `boot.js` passes `null`.\n\nDone when: on turn 122 of game #906484481 the first suggestion is "Grassland — lay 3 eggs", which is what the player actually did.'

issue "$M2" "i18n" \
  "Name every action the way BGA names it, in both languages" \
  $'A hint should read as an instruction the player can act on, which means quoting BGA button labels exactly: "Положить яйца" / "Lay eggs", "Взять еду" / "Gain food", "Взять карты птиц" / "Draw bird cards", "Сыграть птицу" / "Play a bird".\n\nDone when: every string the panel can show exists in `ru` and `en`, and a missing key is visible in tests rather than falling through silently.'

issue "$M3" "ui,engine" \
  "Watch mode: evaluate on the opponent's turn" \
  $'Show position value, goal standings for both players, what the opponent can still reach with the cubes they have left, and what to prepare for.\n\nDone when: goal progress in the panel matches `gamedatas.goals` throughout a replay.'

issue "$M3" "engine" \
  "Advise on sub-decisions, not just whole turns" \
  $'A player is more often at a dialog inside a turn than choosing the turn itself: `playerGainFromFeeder`, `playerPowerBrown/White/Pink`, `playerDiscardBird`, `playerTakeCardSpecial`.\n\nDone when: in each of those states the panel answers the question on screen instead of the general one.'

issue "$M3" "engine" \
  "Opening hand: which cards, bonus card and food to keep" \
  $'`playerInitialDiscard` is one decision, and by leverage it is worth more than any single mid-game turn.\n\nDone when: the panel ranks the keep/discard combinations with an explanation of the trade.'

issue "$M4" "ui" \
  "Turn Copy snapshot into a fixture pipeline" \
  $'The button already puts the position on the clipboard. Missing: a documented path from clipboard to a file under `test/fixtures/` that a check script reads.\n\nDone when: a snapshot from a live game passes the scorer check unedited. This blocks M5 — there is nothing to tune weights against until this is one click.'

issue "$M4" "ui" \
  "Diagnostics view in the options page" \
  $'Show the last snapshot, `validateState` output, the card-database fingerprint and the last error.\n\nDone when: a "could not read the position" report can be diagnosed without opening devtools.'

issue "$M5" "engine" \
  "Measure agreement with a strong player's actual moves" \
  $'Replay archived games, evaluate every position, record whether the played move was the top suggestion (top-1) or in the top three.\n\nDone when: a script prints both rates over a set of replays, so weight changes can be judged instead of argued about.'

issue "$M5" "engine" \
  "Price the highest-impact bird powers by hand" \
  $'Abilities are currently valued by category, so a strong and a weak bird in the same category price identically. This is the largest source of error in the evaluator.\n\nDone when: the 20–30 powers that most often decide a game have individual values, and the agreement metric above improves.'

issue "$M6" "extension" \
  "Cut v0.1.0 and verify the release zip" \
  $'Tag `v0.1.0`, let the release workflow build and publish the zip.\n\nDone when: the artifact installs into a clean Chrome profile via `chrome://extensions` and the panel comes up on a replay.'

issue "$M6" "docs" \
  "Add a screenshot or short clip of the panel to both READMEs" \
  $'Done when: a reader can tell what the extension looks like without installing it.'

issue "$M2" "engine,help wanted" \
  "Support the blue goal board" \
  $'Its scoring table lives on BGA'"'"'s server, not in the client, so it cannot be read the way everything else is. `scoreGoal()` raises an explicit error rather than guessing.\n\nDone when: a finished game on the blue board is available as a fixture and the place-to-points mapping is confirmed against it. **A recorded blue-board game is what unblocks this.**'

# --------------------------------------------------------------------- project
say "Project board"
if gh project list --owner "$OWNER" >/dev/null 2>&1; then
  NUM=$(gh project list --owner "$OWNER" --format json \
        --jq '.projects[] | select(.title=="Wingspan Helper") | .number' 2>/dev/null || true)
  if [ -z "$NUM" ]; then
    NUM=$(gh project create --owner "$OWNER" --title "Wingspan Helper" --format json --jq .number)
  fi
  gh issue list --repo "$SLUG" --state open --limit 100 --json url --jq '.[].url' | while read -r url; do
    gh project item-add "$NUM" --owner "$OWNER" --url "$url" >/dev/null 2>&1 || true
  done
  echo "board: https://github.com/users/$OWNER/projects/$NUM"
else
  cat <<'NOTE'
The token is missing the `project` scope, so the board was skipped. To add it:

    gh auth refresh -s project,read:project
    bash scripts/bootstrap-github.sh      # re-run; everything else is idempotent
NOTE
fi

say "Done"
echo "https://github.com/$SLUG"
