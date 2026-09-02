// legalMoves(state) / apply(state, move) — the pure transition function
// (docs/sim-state.md). No powers (CLAUDE.md invariant 2 / roadmap B2): a
// bird is a card with a cost, a VP value, a nest type, an egg limit and a
// habitat mask, and playing it never triggers anything beyond that.
//
// A turn is a stack of pending decisions (`state.pending`): legalMoves
// answers `pending[0]` when the stack isn't empty, or offers the row actions
// and playable birds when it is. `apply` pops what it resolves and may push
// more — a multi-card draw pushes one `gainFromFeeder`/`placeEgg`/
// `takeTrayCard` frame with a counter, not one frame per card.
//
// No randomness inside apply/legalMoves (docs/sim-state.md #3): a feeder
// reroll or a deck draw is a `pending` whose moves are `{ kind: 'chance', p }`
// options — apply just resolves whichever chance option it's handed.
//
// Deliberately out of scope for B1 (documented once, here, not scattered):
//  - the optional column-2/4 trades (card→food, food→egg, egg→card) —
//    narrows the move space, not a scoring rule or a power;
//  - discarding a hand card in lieu of 1 wild food when playing a bird.
// Both are candidates for a follow-up once the corpus (B3) shows they
// change which move looks best.
import { HABITATS, playColumn, eggCost, turnsInRound, rowAction as matRowAction } from '../engine/mat.js';
import { scoreGame, goalCounter } from '../engine/scoring.js';
import { birdCard, bonusCard, BIRDS, BONUS_CARDS } from './cards.js';
import { bagIds, bagCount, addToBag, removeFromBag, bagTotal } from './bag.js';
import { foodPayments, chooseAllocations, spendFood } from './pay.js';
import { clone, habitatIndex, birdsInHabitat, tableauSlots } from './state.js';

export { setup, clone } from './state.js';

export function isTerminal(state) {
  return state.phase === 'terminal';
}

// --- top level: no pending, a seat is choosing its action ------------------

function subsets(ids) {
  const out = [];
  const n = ids.length;
  for (let mask = 0; mask < (1 << n); mask++) {
    const keep = [];
    for (let i = 0; i < n; i++) if (mask & (1 << i)) keep.push(ids[i]);
    out.push(keep);
  }
  return out;
}

function eggSources(seat) {
  return tableauSlots(seat).filter(s => s.slot.eggs > 0);
}

function playBirdMoves(state) {
  const seat = state.seats[state.active];
  const moves = [];
  const handIds = bagIds(seat.hand.known);
  const sources = eggSources(seat);
  for (const birdId of handIds) {
    const card = birdCard(birdId);
    HABITATS.forEach((habitat, hi) => {
      if (!card.habitat[hi]) return;
      const n = birdsInHabitat(seat, habitat);
      const col = playColumn(n);
      if (col == null) return;
      const need = eggCost(col);
      const eggAllocs = need === 0
        ? [[]]
        : chooseAllocations(sources.map(s => s.slot.eggs), need)
            .map(alloc => alloc.map((k, i) => ({ ...sources[i], n: k })).filter(x => x.n > 0));
      if (need > 0 && eggAllocs.length === 0) return; // not enough eggs anywhere
      const payments = foodPayments(seat.food, card);
      if (payments.length === 0) return;
      for (const food of payments) {
        for (const eggsFrom of eggAllocs) {
          moves.push({ kind: 'playBird', bird: birdId, habitat, food, eggsFrom });
        }
      }
    });
  }
  return moves;
}

function topLevelMoves(state) {
  const moves = HABITATS.map(habitat => ({ kind: 'rowAction', habitat }));
  return moves.concat(playBirdMoves(state));
}

// --- pending decisions -------------------------------------------------

function feederFaceOptions(face) {
  return face === 5 ? [0, 1] : [face];
}

function deckAvailable(state) {
  return state.deckSize > 0 || bagTotal(state.discard) > 0;
}

function chanceDrawMoves(state, pendingKind) {
  const pool = state.deckSize > 0 ? state.unseen : state.discard;
  const total = bagTotal(pool);
  if (total === 0) return [];
  return bagIds(pool).map(id => ({ kind: 'chance', pending: pendingKind, card: id, p: bagCount(pool, id) / total }));
}

function pendingMoves(state, p) {
  const seat = state.seats[state.active];
  switch (p.kind) {
    case 'discardBonus':
      return bagIds(seat.bonus.known).map(id => ({ kind: 'discardBonus', discard: id }));

    // Not reached by any B1 base rule (no powers, no card-for-food
    // substitution) — implemented and tested directly per the #28 mapping
    // to playerDiscardBird, ready for whatever B2 power needs it.
    case 'discardBird': {
      const ids = bagIds(seat.hand.known);
      if (!ids.length) return [{ kind: 'discardBird', skip: true }];
      return ids.map(id => ({ kind: 'discardBird', discard: id }));
    }

    case 'openingKeep':
      return subsets(bagIds(seat.hand.known)).map(keep => ({ kind: 'openingKeep', keep }));

    case 'gainFromFeeder':
      return state.feeder
        .map((face, die) => ({ face, die }))
        .filter(d => d.face != null)
        .flatMap(({ face, die }) => feederFaceOptions(face).map(as => ({ kind: 'gainFromFeeder', die, as })));

    case 'feederRefill': {
      const slot = p.slots[0];
      return [0, 1, 2, 3, 4, 5].map(face => ({ kind: 'chance', pending: 'feederRefill', slot, face, p: 1 / 6 }));
    }

    case 'placeEgg': {
      const targets = tableauSlots(seat).filter(s => s.slot.eggs < birdCard(s.slot.card).eggLimit);
      if (!targets.length) return [{ kind: 'placeEgg', skip: true }];
      return targets.map(t => ({ kind: 'placeEgg', habitat: t.habitat, col: t.col }));
    }

    case 'takeTrayCard': {
      const moves = state.tray
        .map((card, slot) => ({ card, slot }))
        .filter(t => t.card != null)
        .map(t => ({ kind: 'takeTrayCard', from: 'tray', slot: t.slot, card: t.card }));
      if (deckAvailable(state)) moves.push({ kind: 'takeTrayCard', from: 'deck' });
      return moves;
    }

    case 'drawBlind':
      return chanceDrawMoves(state, 'drawBlind');

    case 'trayRefill':
      return chanceDrawMoves(state, 'trayRefill');

    default:
      throw new Error('sim: unknown pending kind ' + p.kind);
  }
}

export function legalMoves(state) {
  if (state.pending.length) return pendingMoves(state, state.pending[0]);
  if (isTerminal(state)) return [];
  return topLevelMoves(state);
}

// --- apply ---------------------------------------------------------------

function popPending(state) {
  state.pending = state.pending.slice(1);
}

function decrementFront(state) {
  const [front, ...rest] = state.pending;
  const n = front.n - 1;
  state.pending = n > 0 ? [{ ...front, n }, ...rest] : rest;
}

function reshuffleIfNeeded(state) {
  if (state.deckSize <= 0 && bagTotal(state.discard) > 0) {
    for (const id of bagIds(state.discard)) state.unseen = addToBag(state.unseen, Number(id), bagCount(state.discard, id));
    state.deckSize = bagTotal(state.unseen);
    state.discard = {};
  }
}

function drawOneFromDeck(state, id) {
  reshuffleIfNeeded(state);
  if (state.deckSize <= 0) {
    state.discard = removeFromBag(state.discard, id, 1);
  } else {
    state.unseen = removeFromBag(state.unseen, id, 1);
    state.deckSize -= 1;
  }
  return id;
}

function applyPending(state, move) {
  const p = state.pending[0];
  const seat = state.seats[state.active];

  if (p.kind === 'discardBonus') {
    seat.bonus.known = removeFromBag(seat.bonus.known, move.discard, 1);
    state.bonusUnseen = addToBag(state.bonusUnseen, move.discard, 1);
    state.bonusDeckSize += 1;
    popPending(state);
    return afterPendingSettled(state);
  }

  if (p.kind === 'discardBird') {
    if (!move.skip) {
      seat.hand.known = removeFromBag(seat.hand.known, move.discard, 1);
      state.discard = addToBag(state.discard, move.discard, 1);
    }
    decrementFront(state);
    return afterPendingSettled(state);
  }

  if (p.kind === 'openingKeep') {
    const dealt = bagIds(seat.hand.known);
    const discard = dealt.filter(id => !move.keep.includes(id));
    for (const id of discard) {
      seat.hand.known = removeFromBag(seat.hand.known, id, 1);
      state.unseen = addToBag(state.unseen, id, 1);
      state.deckSize += 1;
    }
    popPending(state);
    return afterPendingSettled(state);
  }

  if (p.kind === 'gainFromFeeder') {
    seat.food = seat.food.map((n, i) => (i === move.as ? n + 1 : n));
    state.feeder[move.die] = null;
    decrementFront(state);
    if (!state.pending.length || state.pending[0].kind !== 'gainFromFeeder') {
      const empty = state.feeder.map((f, i) => (f == null ? i : -1)).filter(i => i >= 0);
      if (empty.length) state.pending = [{ kind: 'feederRefill', slots: empty }, ...state.pending];
    }
    return afterPendingSettled(state);
  }

  if (p.kind === 'feederRefill') {
    state.feeder[move.slot] = move.face;
    const rest = p.slots.slice(1);
    if (rest.length) {
      state.pending = [{ kind: 'feederRefill', slots: rest }, ...state.pending.slice(1)];
    } else {
      popPending(state);
      const faces = state.feeder;
      if (faces.every(f => f === faces[0])) {
        state.pending = [{ kind: 'feederRefill', slots: [0, 1, 2, 3, 4] }, ...state.pending];
      }
    }
    return afterPendingSettled(state);
  }

  if (p.kind === 'placeEgg') {
    if (!move.skip) {
      const row = seat.rows[habitatIndex(move.habitat)];
      row[move.col - 1] = { ...row[move.col - 1], eggs: row[move.col - 1].eggs + 1 };
    }
    decrementFront(state);
    return afterPendingSettled(state);
  }

  if (p.kind === 'takeTrayCard') {
    if (move.from === 'tray') {
      seat.hand.known = addToBag(seat.hand.known, move.card, 1);
      state.tray[move.slot] = null;
      decrementFront(state);
      if (deckAvailable(state)) {
        state.pending = [{ kind: 'trayRefill', slot: move.slot }, ...state.pending];
      }
    } else {
      decrementFront(state);
      state.pending = [{ kind: 'drawBlind' }, ...state.pending];
    }
    return afterPendingSettled(state);
  }

  if (p.kind === 'drawBlind' && move.kind === 'chance') {
    const id = drawOneFromDeck(state, move.card);
    seat.hand.known = addToBag(seat.hand.known, id, 1);
    popPending(state);
    return afterPendingSettled(state);
  }

  if (p.kind === 'trayRefill' && move.kind === 'chance') {
    const id = drawOneFromDeck(state, move.card);
    state.tray[p.slot] = id;
    popPending(state);
    return afterPendingSettled(state);
  }

  throw new Error('sim: no handler for pending ' + p.kind + ' / move ' + JSON.stringify(move));
}

function afterPendingSettled(state) {
  if (state.pending.length) return state;
  if (state.phase === 'opening') return advanceOpening(state);
  return endOfTurn(state);
}

function advanceOpening(state) {
  if (state.active + 1 < state.seats.length) {
    state.active += 1;
    state.pending = [{ kind: 'discardBonus', n: 1 }, { kind: 'openingKeep' }];
  } else {
    state.phase = 'playing';
    state.active = 0;
    state.pending = [];
  }
  return state;
}

function endOfTurn(state) {
  state.turn += 1;
  const n = state.seats.length;
  let next = -1;
  for (let k = 1; k <= n; k++) {
    const i = (state.active + k) % n;
    if (state.seats[i].cubes > 0) { next = i; break; }
  }
  if (next === -1) return endOfRound(state);
  state.active = next;
  return state;
}

function playerGoalShape(seat) {
  return {
    tableau: tableauSlots(seat).map(({ habitat, slot }) => ({
      habitat, eggs: slot.eggs, nest: birdCard(slot.card).nest,
    })),
  };
}

function endOfRound(state) {
  const desc = state.goals[state.round - 1].description;
  const values = state.seats.map(s => goalCounter(desc)(playerGoalShape(s)));
  state.goals[state.round - 1].values = values;

  if (state.round >= 4) {
    state.phase = 'terminal';
    return state;
  }
  state.round += 1;
  state.turn = 0;
  state.active = 0;
  state.seats.forEach(s => { s.cubes = turnsInRound(state.round); });
  return state;
}

function applyPlayBird(state, move) {
  const seat = state.seats[state.active];
  seat.cubes -= 1;
  seat.hand.known = removeFromBag(seat.hand.known, move.bird, 1);
  seat.food = spendFood(seat.food, move.food);
  for (const src of move.eggsFrom) {
    const row = seat.rows[habitatIndex(src.habitat)];
    row[src.col - 1] = { ...row[src.col - 1], eggs: row[src.col - 1].eggs - src.n };
  }
  const n = birdsInHabitat(seat, move.habitat);
  const col = playColumn(n);
  const row = seat.rows[habitatIndex(move.habitat)];
  row[col - 1] = { card: move.bird, eggs: 0, tucked: 0, cached: [0, 0, 0, 0, 0] };
  return endOfTurn(state);
}

function applyRowAction(state, move) {
  const seat = state.seats[state.active];
  seat.cubes -= 1;
  const n = birdsInHabitat(seat, move.habitat);
  const { gain, unit } = matRowAction(move.habitat, n);
  if (unit === 'food') state.pending = [{ kind: 'gainFromFeeder', n: gain }];
  else if (unit === 'egg') state.pending = [{ kind: 'placeEgg', n: gain }];
  else state.pending = [{ kind: 'takeTrayCard', n: gain }];
  return state;
}

export function apply(state, move) {
  const next = clone(state);
  if (next.pending.length) return applyPending(next, move);
  if (move.kind === 'rowAction') return applyRowAction(next, move);
  if (move.kind === 'playBird') return applyPlayBird(next, move);
  throw new Error('sim: unrecognized top-level move ' + JSON.stringify(move));
}

/** Final score, all six rows per seat — src/engine/scoring.js does the math. */
export function finalScore(state) {
  const players = state.seats.map(s => ({
    name: String(s.id),
    tableau: tableauSlots(s).map(({ habitat, slot }) => ({
      name: birdCard(slot.card).name, habitat, eggs: slot.eggs, tucked: slot.tucked,
      cached: slot.cached.reduce((a, b) => a + b, 0),
    })),
    bonus: bagIds(s.bonus.known).map(id => bonusCard(id).key),
  }));
  return scoreGame({ birds: BIRDS, bonusCards: BONUS_CARDS, players, goals: state.goals, goalBoard: state.goalBoard });
}
