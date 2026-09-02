// Cards live outside the state (docs/sim-state.md, decision #6): a frozen table
// module-side, the state holds integer ids only. These ids are the sim's own —
// assigned by position in src/engine/data/{birds,bonus}.js — and are NOT BGA's
// numeric birdId; joining to a live page snapshot is from-snapshot.js's job,
// not this module's.
import birds from '../engine/data/birds.js';
import bonusCards from '../engine/data/bonus.js';

export const BIRDS = Object.freeze(birds.map((b, id) => Object.freeze({ id, ...b })));
export const BONUS_CARDS = Object.freeze(bonusCards.map((b, id) => Object.freeze({ id, ...b })));

const birdIdByKey = new Map(BIRDS.map(b => [b.key, b.id]));
const bonusIdByKey = new Map(BONUS_CARDS.map(b => [b.key, b.id]));

export function birdCard(id) {
  const c = BIRDS[id];
  if (!c) throw new Error('sim: unknown bird id ' + id);
  return c;
}

export function bonusCard(id) {
  const c = BONUS_CARDS[id];
  if (!c) throw new Error('sim: unknown bonus id ' + id);
  return c;
}

export function birdIdOf(key) {
  const id = birdIdByKey.get(key);
  if (id == null) throw new Error('sim: unknown bird key ' + key);
  return id;
}

export function bonusIdOf(key) {
  const id = bonusIdByKey.get(key);
  if (id == null) throw new Error('sim: unknown bonus key ' + key);
  return id;
}

// Default deck composition: the 170 base-game birds, Swift Start promos
// excluded. #26: composition is a parameter everywhere else — setup() takes
// its own `deck` and only falls back to this when the caller omits one.
export const BASE_DECK = Object.freeze(BIRDS.filter(b => !b.swiftStart).map(b => b.id));
export const ALL_BIRD_IDS = Object.freeze(BIRDS.map(b => b.id));
export const BASE_BONUS_DECK = Object.freeze(BONUS_CARDS.map(b => b.id));
