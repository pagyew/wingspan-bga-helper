# The power effect DSL

Issue #31, milestone B2. `src/sim/powers.js` implements what's here; every example
below is also a passing test in `test/sim-powers.test.js` — a mismatch between this
document and that file is a bug in one of them.

## Why data, not code

`src/engine/evaluate.js` prices a bird's power today by its `category` string plus a
handful of regexes over the English text (`docs/roadmap.md`, B2). A strong and a weak
bird in the same category cost the same — the largest single source of error in the
evaluator. The fix is to describe what a power *does*, once, as data: the simulator
executes the description to find out what happens, and (once B2's pricing lands, a
later issue) the evaluator reads the same description to price it. The two cannot
drift apart because there is only one description.

Attaching a description to each of the 180 real cards is `#32`–`#35`; this issue is
only the shape of a description and the function that runs one.

## The shape

A power is:

```js
{ trigger: 'brown' | 'white' | 'pink' | 'endOfGame', do: Effect | Effect[] }
```

`trigger` says when the power fires — the row action for `brown`, playing the bird
for `white`, another player's turn for `pink`. Nothing in this module reads
`trigger`; it is for whatever schedules the call (wiring a trigger into the turn
flow is also later work — see "What this issue does not do" below). `do` is what
`runPower` interprets.

An **Effect** is one step:

```js
{
  effect: 'gain' | 'lay' | 'tuck' | 'cache' | 'draw' | 'discard' | 'repeat' | 'choose',
  target: 'self' | 'each' | 'others',   // who performs it — default 'self'
  optional: boolean,                     // ask the player whether to take this step
  condition: Condition,                  // skip the step (and any `then`, `cost`) unless true
  cost: Effect,                          // runs first, only once the step is known to happen
  otherwise: Effect | Effect[],          // runs instead, when optional/condition says no
  then: Effect | Effect[],               // runs afterwards, only if this step happened
  // ...plus fields specific to `effect` — see the verbs below.
}
```

`condition`, `optional`, `then` and `otherwise` are the same shape at every verb, so
"gain 1 seed, if available, then optionally cache it" and "look at a card, then tuck
or discard it depending on what it is" are both one `Effect` tree, not special cases.

A **Condition** is a small, named check — enough for the base game's own text, not a
general expression language:

| `check` | True when |
|---|---|
| `handNotEmpty` | the acting seat holds at least one card |
| `feederHasFoodType` | some die on the feeder currently shows `type` (face 5 counts as both invertebrate and seed — CLAUDE.md, "things that will bite you") |
| `anyBirdMatches` | `filter` (see below) matches at least one of the seat's own tableau slots |
| `ref` | a bound card (see `draw`'s `peek`) has `prop` `cmp` (`lt`/`lte`/`gt`/`gte`/`eq`) `value` |

A **target filter** (used by `repeat`'s candidate search, `lay`'s "any eligible
bird", and `condition: { check: 'anyBirdMatches' }`) narrows tableau slots by
`habitat: 'same'` (as the power's own bird), `color`, `nest`, `minEggs`, and
`excludeSelf`.

A **cost** is an ordinary Effect that runs before the step it is attached to, once
that step is already known to happen (its own `condition`/`optional` have already
said yes) — Killdeer, brown: "Discard 1 [egg] to draw 2 [card]":

```js
{
  effect: 'draw', source: 'deck', amount: 2,
  condition: { check: 'anyBirdMatches', filter: { minEggs: 1 } },
  cost: { effect: 'discard', resource: 'egg' },
}
```

The `condition` is what makes this "discard 1 egg to draw 2 cards" rather than
"draw 2 cards, and also discard an egg if you have one": with no egg anywhere on the
tableau the whole step — cost and effect both — never runs, and `resolve()` is never
asked to pick which bird loses the egg.

## The verbs

| Verb | Does | Key fields |
|---|---|---|
| `gain` | Add food to the seat | `resource: 'food'` (only food — eggs are `lay`, cards are `draw`), `source: 'feeder' \| 'supply'`, `foodType` (omit to ask `resolve()` among what's available) |
| `lay` | Add an egg to a tableau bird | `onto: 'self' \| { nest }`, `amount` |
| `tuck` | Move a card behind a bird, face down | `onto: 'self'`, `from` (a name bound by an earlier `draw { peek: true }`, or omit to take from hand) |
| `cache` | Move food from the seat onto a bird | `onto: 'self'`, `foodType` (omit to reuse the type from the `gain` this is chained after) |
| `draw` | Add a card to hand, or look without adding | `source: 'deck' \| 'tray'`, `amount`, `peek: true` + `as: '<name>'` to look instead of taking |
| `discard` | Send a card to the discard pile | `resource: 'card'`, `from` (a bound name, or omit to take from hand) |
| `repeat` | Run another bird's own `do` | `of: 'anotherBirdPower'`, `filter` |
| `choose` | Run exactly one of several branches | `options: Effect[][]` |

A choice the state doesn't already narrow to one answer — which food type, which
hand card, which tray card, whether an optional step is taken, which candidate a
`repeat`/`choose` picks — goes through `opts.resolve({ id, options }) -> one of
options`. `runPower` never guesses one (invariant 2 in `CLAUDE.md` is about
unmodelled *data*, but the same instinct applies to *decisions*): omitting `resolve`
is only safe when every choice in the description already has one legal option, and
`runPower` throws by naming the choice and its options otherwise.

## The executor

```js
import { runPower } from '../src/sim/powers.js';

const next = runPower(state, seatIndex, origin, description, { resolve, describe });
```

- `origin` is `{ habitat, col }` — the tableau slot of the bird whose power this is.
  It is what "this bird" and "another bird in this habitat" mean in the card text.
- `resolve` answers choices, as above.
- `describe(birdId) -> description | undefined` looks up another bird's own
  description, for `repeat`. Since no real card carries a description until `#32`+,
  the default answers `undefined` for everything, so `repeat` simply finds nothing
  to repeat rather than throwing — a target existing on the board but not yet
  encoded is not the same as an unknown power (invariant 2), and will stop being
  silent the moment `#32`–`#35` land.

`runPower` clones the state once and returns the new one, the same contract
`apply()` has in `src/sim/engine.js`.

## What this issue does not do

- **No card in `src/engine/data/birds.js` carries a `description` yet.** The three
  examples below are written out here and in the test file; encoding all 180 is
  `#32` (brown), `#33` (white), `#34` (pink and end-of-game), with `#35` proving
  180/180 coverage.
- **No trigger is wired into `src/sim/engine.js`'s turn flow.** A row action does
  not yet call a brown power, playing a bird does not yet call a white one. That
  wiring needs the encoded cards from `#32`–`#34` to be worth doing.
- **The evaluator does not price from descriptions yet.** That is `#36`, once the
  DSL has real cards to read.
- **`repeat`'s `of` only supports `'anotherBirdPower'`.** The base game has no
  power that repeats a *specific* fixed effect rather than another bird's whole
  power, so a literal-effect form was not worth designing yet.
- **`draw` never becomes a chance node.** `src/sim/engine.js` treats a deck draw as
  a `pending` frame whose legal moves are the deck's own probabilities
  (`docs/sim-state.md`, decision #3), so two identical calls can draw different
  cards depending on what a real player chooses. A power's `draw`/`peek` instead
  asks `resolve()` which card comes up — correct for testing the DSL against a
  chosen card, but the eventual trigger wiring (`#32`+) will need to turn that
  choice into a real chance move the same way the base actions already do, not
  leave it as a resolver question.

## Three worked examples, increasing nastiness

### 1. Acorn Woodpecker (brown) — a gain with an optional follow-up

> Gain 1 [seed] from the birdfeeder, if available. You may cache it on this bird.

```js
{
  trigger: 'brown',
  do: {
    effect: 'gain', resource: 'food', source: 'feeder', foodType: 1, // 1 = seed
    condition: { check: 'feederHasFoodType', type: 1 },
    then: { effect: 'cache', onto: 'self', optional: true },
  },
}
```

The `condition` covers "if available" — no seed on the feeder, and the whole step
(gain *and* the optional cache) is skipped without ever asking `resolve()`. When a
seed is available, `gain` takes a die of type 1 off the feeder into the seat's food,
then `then` runs the optional `cache`: `resolve()` says yes or no, and `cache`
(with no `foodType` of its own) reuses the type from the `gain` it followed.

### 2. Barred Owl (brown) — a look, a condition on what was seen, and a branch

> Look at a card from the deck. If less than 75cm, tuck it behind this bird. If not,
> discard it.

```js
{
  trigger: 'brown',
  do: {
    effect: 'draw', source: 'deck', peek: true, as: 'peeked',
    then: {
      effect: 'tuck', onto: 'self', from: 'peeked',
      condition: { check: 'ref', from: 'peeked', prop: 'wingspan', cmp: 'lt', value: 75 },
      otherwise: { effect: 'discard', resource: 'card', from: 'peeked' },
    },
  },
}
```

`draw { peek: true, as: 'peeked' }` takes the top card off the deck (reshuffling the
discard pile first if the deck is empty, exactly like a real draw) without adding it
to hand, and binds it under the name `peeked`. The `then` step reads that binding
twice: once in its own `condition` (the card's `wingspan`, a real field on every bird
record), and once as `from` in whichever branch runs. `ref` is the one condition
that looks at something other than the live state — a card the power itself just
looked at.

### 3. Gray Catbird (brown) — repeating a whole other power

> Repeat a brown power on another bird in this habitat.

```js
{
  trigger: 'brown',
  do: {
    effect: 'repeat', of: 'anotherBirdPower',
    filter: { habitat: 'same', color: 'brown', excludeSelf: true },
  },
}
```

`repeat` searches the acting seat's own tableau for slots matching `filter` — brown,
sharing the Catbird's habitat, not the Catbird itself — and asks `describe()` for
each candidate's own description. A neighbour that doesn't have one yet (every real
bird, today) is simply not a candidate; the step no-ops rather than throwing, per
"What this issue does not do" above. Exactly one describable candidate runs
automatically; more than one asks `resolve()` which. Either way, the chosen bird's
own `do` runs with `origin` set to *that* bird's slot — "this bird" inside the
repeated power means the target, not the Catbird, which is why the test for this
example checks that the resulting cache lands on the repeated bird and not on the
Catbird itself.
