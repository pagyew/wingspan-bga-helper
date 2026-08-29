# Reading Wingspan game state out of Board Game Arena

Worked out on an archived replay (table #906782034, 2 players, base game).
Game module: `.../games/wingspan/<ver>/wingspan.js` + `modules/script/*.js`.

## The one thing worth knowing

**Do not parse the game log.** The BGA client keeps a complete model of the game
in JavaScript objects hanging off `window.gameui`. Everything below is read
synchronously, with no DOM scraping and no localization problems.

| What | Where |
|---|---|
| Bird database (180 cards) | `gameui.gamedatas.birds` |
| Bonus cards (26) | `gameui.gamedatas.bonuscards` |
| Round goals | `gameui.object_manager.goal_board.goal_data` |
| Player state | `gameui.player_manager.players[player_id]` |
| Tray, feeder, decks | `gameui.object_manager` |
| Current state and legal actions | `gameui.gamedatas.gamestate` |
| Event stream | dojo topics |

## 1. Bird database — `gameui.gamedatas.birds`

Keys `0..179`. `set: 0` is the base game (170 cards), `set: 1` is the Swift Start
promo (10). This project targets the base game, so filter on `set === 0` — but see
the note on deck composition at the bottom.

| Field | Meaning |
|---|---|
| `index` | card id (same as the key) |
| `identifier` | `"bushtit"` — stable English key, good for joining external data |
| `commonname` / `commonnametr` | English / localized name |
| `vp` | victory points |
| `nesttype` | 0 none, 1 bowl, 2 cavity, 3 ground, 4 platform, 5 star (wild) |
| `eggcapacity` | egg capacity |
| `wingspan` | wingspan in cm (for predators) |
| `habitat` | `[forest, grassland, wetland]` booleans |
| `food` | `[invert, seed, fish, fruit, rodent, nectar, wild]` cost |
| `totalfood` | total cost |
| `powercolor` | 0 none, 1 brown, 2 pink, 3 teal, 4 white, 5 yellow |
| `powercategory` | 1 caching, 2 card draw, 3 egg laying, 4 flocking, 5 food-from-feeder, 6 food-from-supply, 7 food-related, 8 hunting/fishing, 9 other, 10 tucking |
| `powertext` | ability text |
| `powerflags` | `[predator, flocking, bonuscard]` |
| `bonuscards` | 24 booleans — which bonus cards this bird counts for. **A ready-made index; there is no need to parse bonus-card conditions yourself.** |

## 2. Constants (`modules/script/Constants.js`)

```
Sets:        ORIGINALCORE 0, SWIFTSTART 1, EUROPEAN 2, OCEANIA 3
Habitat:     PLAYBIRD 0, FOREST 1, GRASSLAND 2, WETLAND 3
Food:        INVERTEBRATE 0, SEED 1, FISH 2, FRUIT 3, RODENT 4, NECTAR 5, WILD 6
Nest:        NEST_NONE 0, BOWL 1, CAVITY 2, GROUND 3, PLATFORM 4, NEST_WILD 5
Power color: NONE 0, BROWN 1, PINK 2, TEAL 3, WHITE 4, YELLOW 5
Bonuses:     ANATOMIST 0 ... WILDLIFEGARDENER 23
Actions:     ACTION_REROLL 1, ACTION_FOODFROMFEEDER 2, ACTION_FOODFROMSUPPLY 3,
             ACTION_CACHEFROMFEEDER 4, ACTION_CACHEFROMSUPPLY 5, ACTION_LAYEGG 6,
             ACTION_FLOCKFROMDECK 8, ACTION_FLOCKFROMHAND 9, ACTION_DRAWCARD 10,
             ACTION_EGGFORWILD 12, ACTION_TRADEFOOD 13, ACTION_HUNTWINGSPAN 15,
             ACTION_DRAWBONUS 16, ACTION_CHANGEHABITAT 17, ACTION_PLAYANOTHERBIRD 18
```

## 3. Player mat — slot numbering

`player.birds` and `player.egg_counts` are keyed by **slot**:

```
loc     = habitat * 8 + column      // column = 1..5
habitat = loc >> 3                  // 1 forest, 2 grassland, 3 wetland
column  = loc & 7
```

Forest is 9–13, grassland 17–21, wetland 25–29. Verified against a real mat.

### `gameui.player_manager.players[id]`

| Field | What |
|---|---|
| `player_name`, `player_id`, `color` | identity |
| `birds` | `{loc: <bird card object>}` |
| `egg_counts` | `{loc: number of eggs}` |
| `counter_food_0..4` | player's food supply (BGA Counter, `.getValue()`) |
| `counter_cache_<loc>_<food>` | **cached food** on a specific bird (created on demand) |
| `counter_tucked_<loc>` | **tucked cards** under a specific bird |
| `counter_card_bird`, `counter_card_bonus` | cards in hand |
| `counter_cubes` | unspent action cubes |
| `counter_eggs`, `counter_eggcapacity` | eggs / total capacity |
| `habitat_cube_zones[0..3]` | cubes placed per row (`.getItemNumber()`) |
| `hand_panel.cards` | DOM ids `handcard_bird_panel_<birdIndex>` / `handcard_bonus_panel_<idx>` |
| `debugDump()` | built-in state dump — copies text to the clipboard |

### Hidden information

Hand contents are visible **only for the local player**: an opponent's
`hand_panel.cards` is empty and only the counters are available. An opponent's
bonus card is never revealed in the model, not even at the end of the game — its
name appears only in the log text. Any evaluator has to work under incomplete
information: your own cards, both mats, the tray, the feeder and the opponent's
counters are known; the rest is not.

## 4. Shared table — `gameui.object_manager`

| Field | What |
|---|---|
| `current_round` | **0-based!** 0 = round 1 … 3 = round 4 |
| `card_tray.cards` | the 3 face-up tray cards |
| `feeder.dice` | 5 dice: `{side, in_feeder}` |
| `bird_draw_counter`, `bird_discard_counter`, `bonus_draw_counter` | decks / discard |
| `goal_board.goal_data` | the 4 round goals: `{index, description, img_loc}` |
| `goal_board.goalboard_type` | `"green"` (points) or `"blue"` (places) |

### Feeder die faces

`side`: 0 invertebrate, 1 seed, 2 fish, 3 fruit, 4 rodent,
**5 = the dual face "invertebrate OR seed"** (the player chooses).

This is not nectar — there is no nectar in the base game. Confirmed in
`InteractionManager.selectDice()`: with `dice.side === 5` the client requires an
explicit `side` of 0 or 1, otherwise it errors with
"Food type not chosen for Invertebrate/Seed".

### Round-goal progress — `gamedatas.goals`

Already computed by the client; there is no need to recompute it:

```
goals[0]                  -> the 4 goal definitions
goals[<player_id>][i]     -> {value: "5", rank: "0", score: "6"}
```

`value` is the current count, `rank` the place (fractional on a tie, e.g. `0.5`),
`score` the points the goal will award. For the **current** round this is a live
forecast; for finished rounds it is the recorded result. A tie on the green board
splits the place points, rounded down: `(4+1)/2 = 2`.

## 5. State machine — `gameui.gamedatas.gamestate`

`name` plus `possibleactions` give the legal moves:

```
2  playerInitialDiscard [initialDiscardBirds|initialDiscardBonus|undoInitialDiscard]
3  playerNormalTurn     [playBird|gainFood|layEggs|drawBirds|undo]   <- the moment to advise
4  playerPowerWhite     [usePower|pass|undo]
5  playerPowerBrown     [usePower|pass|undo]
6  playerPowerPink      [usePower|pass|undo]
7  playerPowerAllPlayers[usePowerAllPlayers|pass]
8  playerDrawBirds      [drawBirds|pass|undo]
9  playerGainFromFeeder [gainFood|pass|undo]
10 playerDiscardBonus   11 playerTakeCardSpecial   12 playerDiscardBird
13 playerConfirm        30-34 processing states    99 gameEnd
```

The `process*` states are the ones to distrust: during animations the model is
half-updated — the tray can hold empty objects and counters lag behind the screen.

## 6. Events

The client subscribes to roughly 60 notifications (`NotificationManager.js`):
`gainFood`, `playBird`, `layEggs`, `setCube`, `refillTray`, `updateGoalData`,
`tuckCardFromHandPublic`, `huntWingspan`, `scoreBirds`, … (see
`src/page/collector.js` for the list this extension listens to).

In practice, do not rebuild state from an event payload — just re-read the whole
model on any event. It is cheap and it cannot drift.

## 7. What this means for the extension

- `gameui` lives in the **page context**. A content script in the isolated world
  cannot see it, so the manifest needs `world: "MAIN"`. The reverse is also true
  and equally important: `chrome.runtime` is undefined in the MAIN world, so the
  two halves have to talk over `window.postMessage`.
- URL matching: `https://boardgamearena.com/*/wingspan*` and
  `https://boardgamearena.com/archive/replay/*`. Replays are the best development
  harness — same objects, no live opponent, and you can scrub back and forth.
- The bird database is already on the page, so shipping a copy is only needed for
  data the client does not have (our own weights, for instance). Join on `identifier`.
- `bird.bonuscards[24]` removes the need to parse bonus-card conditions.
- Localization is not a problem: `identifier`, numbers and enums are language-independent.

## Verified

- The slot formula matches a real mat (3 birds in forest, 1 in grassland, 3 in wetland).
- Food and egg values read out of the model matched the on-screen player panel.
- `current_round` being 0-based was confirmed against the "Round 3" heading.
- `side === 5` is the invertebrate/seed dual face, not nectar — confirmed in
  `InteractionManager.selectDice()`.
- The replay was watched to the end: `vp`, `eggs`, `tucked` and `cached` totals read
  from the model matched BGA's own final scoring for both players (91 : 89).
  See `docs/reference-game.md`.
