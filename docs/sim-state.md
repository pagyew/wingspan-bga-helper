# The simulator state

Draft for issue #25, milestone B1. This is the interface B2 (powers), B4 (the model
of the unknown), B5 (search inside a turn) and B6 (planning) are all built on, so it
is worth arguing about before any of it is written.

Russian summary of the decisions: see the PR description.

## What already exists, and why a third shape is a risk

Two shapes are in the repository today:

| Shape | Where | Identity | Players | Purpose |
|---|---|---|---|---|
| page snapshot | `src/page/state.js` | numeric `birdId` | object keyed by BGA player id | mirror what the BGA client holds |
| evaluator input | `src/engine/evaluate.js` | string `key` | array, local player first | rank one move |

`src/engine/from-snapshot.js` reconciles them. That adapter is already a place where
bugs hide — it flattens per-type cached food into one number and it reorders players
so the local one is first, which stops making sense at three players and above.

So the plan is **not** to add a third shape. The simulator state becomes the
canonical one: `from-snapshot` targets it, and `evaluate.js` and `scoring.js` migrate
onto it during B1. `src/page/state.js` stays exactly as it is — its job is to mirror
BGA, and it must be free to follow BGA's changes.

## Six decisions

### 1. The deck is a bag, not a stack

An ordered deck would force every question about the future through a shuffle.
Instead every hidden zone is a **bag**: a sparse map from card id to a count.

```js
unseen: { 42: 1, 57: 2, ... }     // every card no one at the table has seen
```

One bag, shared. The draw pile, the cards an opponent holds, and the cards still to
be drawn are all *the same bag* seen from different angles — which is exactly what
makes B4 possible: the probability of drawing a Kingfisher is a division, not a
simulation. Sampling a concrete deck (for self-play, or for a determinization in B6)
is drawing from the bag; nothing else in the simulator changes.

### 2. Hidden information is a property of the state, not a second state type

Every hand is `{ known: bag, unknown: n }`. The local player has `unknown: 0`. An
opponent starts a two-player game with `{ known: {}, unknown: 5 }`, and the count
moves to `known` the moment he takes a card from the tray, where everyone saw it.

There is no "god state" and no "player state" — one type, and `unknown: 0` everywhere
means perfect information. Self-play and live advice run the same code, which is the
only way self-play measures anything about live advice.

### 3. No randomness inside the simulator

`apply(state, move)` is deterministic. Where an outcome is random the simulator emits
a **chance node**: `legalMoves` returns moves that carry a probability.

```js
legalMoves(state)
// -> [{ kind: 'chance', ...outcome, p: 0.31 }, ...]   when state.pending[0].chance
// -> [{ kind: 'gainFood', die: 2 }, ...]              otherwise
```

The driver decides what to do with them: self-play samples by `p`, expectimax (B5)
takes the expectation, a replay (#29) picks the outcome the log records. Randomness
in `apply` would make all three different code paths and make a search result
irreproducible.

**This contradicts #25's wording, which says `apply(state, move, rng)`.** Per
`docs/process.md` the criterion gets amended in the issue with the reason, not
quietly dropped.

### 4. A turn is a stack of pending decisions

```js
pending: [{ kind: 'gainFromFeeder', n: 2, from: [0,0,3,5,5] }, { kind: 'brownChain', row: 'forest', at: 2 }]
```

`legalMoves` answers `pending[0]`, or offers the three row actions and the playable
birds when the stack is empty. `apply` pops it and may push more — a brown power that
lets you choose a bird pushes a `choose` decision of its own.

This is what makes the panel able to answer the dialog BGA is actually showing: each
`pending` kind maps to a BGA game state name.

| `pending.kind` | BGA state |
|---|---|
| `gainFromFeeder` | `playerGainFromFeeder` |
| `usePower` | `playerPowerBrown` / `White` / `Pink` |
| `discardBird` / `discardBonus` | `playerDiscardBird` / `playerDiscardBonus` |
| `takeTrayCard` | `playerTakeCardSpecial` |
| `placeEgg` | part of `playerLayEggs` |
| `openingKeep` | `playerInitialDiscard` |

### 5. Seats are seats

`seats[0..n-1]` in table order, with `state.me` naming the perspective. The
evaluator's "local player first" reordering goes away. Anything that depends on turn
order — pink powers, the goal race, who takes the last die — needs the real order.

### 6. Cards live outside the state

A frozen card table module-side; the state holds integer ids only. Nothing in the hot
path holds a string, and `clone(state)` copies numbers and small maps. Zones are
copy-on-write: `apply` returns a new state that shares every seat and zone it did not
touch.

## The shape

```js
const state = {
  round: 1,            // 1..4
  turn: 0,             // turns taken this round by the active seat
  active: 0,           // seat index
  me: 0,               // whose information set this is
  goalBoard: 'green',  // 'green' | 'blue'  (blue still throws — invariant 2)
  goals: [12, 4, 9, 1],// goal ids, one per round

  unseen: { 42: 1, 57: 2 },   // bag: everything nobody has seen
  deckSize: 96,               // how many of `unseen` are in the draw pile
  discard: { 13: 1 },         // bag, face up, known to all
  tray: [42, 57, 88],         // face up
  feeder: [0, 0, 3, 5, 5],    // die faces present; 5 = invertebrate|seed

  bonusUnseen: { 3: 1, 7: 1 },
  bonusDeckSize: 18,

  seats: [{
    id: '93712',                 // BGA player id, for joining back to the page
    food: [0, 2, 1, 0, 0],       // invertebrate, seed, fish, fruit, rodent
    cubes: 8,
    hand:      { known: { 42: 1 }, unknown: 0 },
    bonus:     { known: { 3: 1 },  unknown: 0 },
    rows: [                      // forest, grassland, wetland
      [{ card: 118, eggs: 2, tucked: 0, cached: [0,0,0,0,0] }, null, null, null, null],
      [null, null, null, null, null],
      [null, null, null, null, null]
    ]
  }],

  pending: []          // empty = the seat is choosing its action
};
```

Notes on the fields that are easy to get wrong:

- `feeder` is the dice **present in the feeder**, not five entries. Face `5` is the
  dual invertebrate/seed die and can pay either — one die, two options, never both.
- `cached` stays per food type. The page counts it that way and the adapter's
  flattening loses information a bonus card can care about.
- `rows` is fixed at five slots so a column index is a position, not a count. Column
  `n` is `rows[h][n-1]`; `mat.js` already owns the arithmetic and keeps owning it.
- `deckSize` is separate from `unseen` because unseen cards are also in opponents'
  hands. `deckSize + Σ seats[i].hand.unknown === Σ unseen` is an invariant, and #30
  checks it after every move.

## The API

```js
import { setup, legalMoves, apply, isTerminal, clone } from '../src/sim/index.js';

setup({ players, deck, goals, goalBoard, rng }) -> state
legalMoves(state)      -> Move[]        // a chance node's moves carry `p`
apply(state, move)     -> state         // pure, deterministic, structural sharing
isTerminal(state)      -> boolean
clone(state)           -> state         // explicit; nothing deep-copies implicitly
```

Scoring is not part of this: `src/engine/scoring.js` is verified against two real
games and the simulator calls it rather than reimplementing it.

Powers are not part of this either. Until B2 lands, a bird is a card with a cost, a
VP value, a nest type, an egg limit and a habitat mask; its power is inert and the
simulator says so out loud rather than silently playing a bird as if it had none.

## Open questions

1. **Where the sim lives.** `src/sim/` next to `src/engine/`, or `src/engine/sim/`?
   The import check treats both the same; this is about whether "engine" ends up
   meaning the rules or the judgement. Proposal: `src/sim/` for the rules,
   `src/engine/` keeps the judgement.
2. **How far `evaluate.js` migrates during B1.** Options: migrate it in #25 (one big
   change, the adapter dies at once), or keep both shapes until B5 and delete the old
   one there. Proposal: migrate in B1 — two shapes surviving into B5 is how the
   adapter's bugs get inherited by the search.
3. **Nectar and the expansions.** Out of scope, but the food array is the one field
   that would have to grow. Fixing it at five now costs a migration later; making it
   variable-length now costs clarity today. Proposal: five, and say so here.
