// The canonical simulator state (docs/sim-state.md). Setup and clone only —
// legalMoves/apply live in moves.js/apply.js so this file stays about shape.
import { HABITATS, turnsInRound } from '../engine/mat.js';
import { BASE_DECK, BASE_BONUS_DECK } from './cards.js';
import { bagFromList, bagTotal } from './bag.js';
import { shuffle } from './rng.js';

export { HABITATS };

const OPENING_HAND = 5;
const OPENING_BONUS = 2;
const TRAY_SIZE = 3;

function emptyRows() {
  return HABITATS.map(() => new Array(5).fill(null));
}

/**
 * setup({ players, deck, bonusDeck, goals, goalBoard, rng }) -> state
 *
 * `players` is 2..5 entries of `{ id }` (the external, e.g. BGA, player id).
 * `deck`/`bonusDeck` are id lists (duplicates = extra copies); default to the
 * 170-card base game / all 26 bonus cards — #26: composition is always a
 * parameter, this is only the fallback. `goals` is 4 description strings
 * scoring.js's goalCounter understands. `rng` is the one place setup uses
 * randomness directly; nothing downstream does (docs/sim-state.md #3).
 *
 * Every seat starts with `hand.unknown: 0` / `bonus.unknown: 0`: setup builds
 * the perfect-information state (docs/sim-state.md #2 — "unknown: 0
 * everywhere means perfect information", the shape self-play and replay use).
 * A live-advice information set with hidden opponent hands is a view over
 * this same state, not something setup() produces.
 *
 * Simplifications documented once, here, rather than scattered as TODOs:
 *  - starting food is a fixed packet (turn-order count, round-robin type),
 *    not the food-choice sub-decision the physical rulebook has;
 *  - keeping fewer than 5 opening bird cards carries no food trade-off;
 *  - there is no "discard a hand card for +1 wild food" substitute payment.
 * None of these are scoring rules (invariant 2 does not apply to them) and
 * none are powers; they narrow the base-rule move space for B1 and are
 * candidates to tighten later if a corpus game needs it.
 */
export function setup({ players, deck = BASE_DECK, bonusDeck = BASE_BONUS_DECK, goals, goalBoard = 'green', rng }) {
  if (!rng) throw new Error('sim: setup() needs an rng');
  if (!players || players.length < 2 || players.length > 5) throw new Error('sim: 2..5 players');
  if (!goals || goals.length !== 4) throw new Error('sim: 4 round goals required');

  const shuffledDeck = shuffle(deck, rng);
  const shuffledBonus = shuffle(bonusDeck, rng);
  let deckI = 0, bonusI = 0;
  const takeBirds = n => shuffledDeck.slice(deckI, deckI += n);
  const takeBonus = n => shuffledBonus.slice(bonusI, bonusI += n);

  const seats = players.map((p, i) => ({
    id: p.id,
    food: roundRobinFood(i + 1),
    cubes: turnsInRound(1),
    hand: { known: bagFromList(takeBirds(OPENING_HAND)), unknown: 0 },
    bonus: { known: bagFromList(takeBonus(OPENING_BONUS)), unknown: 0 },
    rows: emptyRows(),
  }));

  const tray = takeBirds(TRAY_SIZE);

  const pending = [{ kind: 'discardBonus', n: 1 }, { kind: 'openingKeep' }];

  return {
    round: 1, turn: 0, active: 0, me: 0, phase: 'opening',
    goalBoard, goals: goals.map(description => ({ description, values: null })),
    unseen: bagFromList(shuffledDeck.slice(deckI)),
    deckSize: shuffledDeck.length - deckI,
    discard: {},
    tray,
    feeder: Array.from({ length: 5 }, () => Math.floor(rng() * 6)),
    bonusUnseen: bagFromList(shuffledBonus.slice(bonusI)),
    bonusDeckSize: shuffledBonus.length - bonusI,
    seats,
    pending,
  };
}

function roundRobinFood(n) {
  const food = [0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) food[i % 5]++;
  return food;
}

export function clone(state) {
  return {
    ...state,
    goals: state.goals.map(g => ({ ...g, values: g.values ? g.values.slice() : null })),
    unseen: { ...state.unseen },
    discard: { ...state.discard },
    tray: state.tray.slice(),
    feeder: state.feeder.slice(),
    bonusUnseen: { ...state.bonusUnseen },
    seats: state.seats.map(s => ({
      ...s,
      food: s.food.slice(),
      hand: { known: { ...s.hand.known }, unknown: s.hand.unknown },
      bonus: { known: { ...s.bonus.known }, unknown: s.bonus.unknown },
      rows: s.rows.map(row => row.map(slot => slot ? { ...slot, cached: slot.cached.slice() } : null)),
    })),
    pending: state.pending.map(p => ({ ...p })),
  };
}

export function habitatIndex(h) { return HABITATS.indexOf(h); }

export function birdsInHabitat(seat, h) {
  return seat.rows[habitatIndex(h)].filter(Boolean).length;
}

/** Every occupied slot as { habitat, col, slot } across a seat's whole tableau. */
export function tableauSlots(seat) {
  const out = [];
  HABITATS.forEach((h, hi) => {
    seat.rows[hi].forEach((slot, i) => {
      if (slot) out.push({ habitat: h, col: i + 1, slot });
    });
  });
  return out;
}

export function unseenTotal(state) { return bagTotal(state.unseen); }
