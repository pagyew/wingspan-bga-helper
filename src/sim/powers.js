// Issue #31: the effect DSL and its executor (docs/powers.md has the full
// shape and three worked examples). A power is data — `{ trigger, do }` —
// so the same description can run inside the simulator (this file) and price
// the card in the evaluator (later issue), and the two cannot drift apart.
//
// Not in scope here: wiring a trigger into legalMoves/apply's turn flow
// (row action -> brown power, playBird -> white power, ...) or attaching a
// `description` to any real card in src/engine/data/birds.js. Both are #32+:
// this module only has to run a description against a state and return the
// new one. A choice the state doesn't already determine (which food type,
// which card, whether to take an optional step) goes through `resolve()`
// rather than being guessed — invariant 2 applies to *how* a decision gets
// made, not only to unmodelled data.
import { birdCard } from './cards.js';
import { bagIds, bagTotal, addToBag, removeFromBag } from './bag.js';
import { clone, habitatIndex, tableauSlots } from './state.js';

function defaultResolve({ id, options }) {
  if (options.length === 1) return options[0];
  throw new Error(`sim/powers: choice "${id}" has ${options.length} options and no resolver was given`);
}

/**
 * runPower(state, seatIndex, origin, description, opts?) -> new state
 *
 * `origin` is the `{ habitat, col }` of the bird whose power this is — the
 * referent of "this bird" / "another bird in this habitat" in the card text.
 * `description` is `{ trigger, do }`; only `do` (an Effect or Effect[]) is
 * interpreted here — `trigger` is for whatever schedules the call.
 *
 * `opts.resolve({ id, options }) -> one of options` answers every choice the
 * state doesn't already narrow to one option: which food type, which hand
 * card, whether an optional step is taken. Omit it only when every choice in
 * the description is already forced to a single option.
 *
 * `opts.describe(birdId) -> description|undefined` looks up another bird's
 * own description, for `repeat`. Cards carry no description until #32+, so
 * the default answers `undefined` everywhere (repeat then finds nothing to
 * repeat, per the "if available" convention below — never a thrown error for
 * a target that legitimately doesn't exist).
 */
export function runPower(state, seatIndex, origin, description, opts = {}) {
  const resolve = opts.resolve || defaultResolve;
  const describe = opts.describe || (() => undefined);
  const next = clone(state);
  return runEffect(next, seatIndex, description.do, resolve, describe, { bindings: {} }, origin);
}

// --- the tree walk ---------------------------------------------------------

function runEffect(state, seat, effect, resolve, describe, ctx, origin) {
  if (Array.isArray(effect)) {
    for (const e of effect) state = runEffect(state, seat, e, resolve, describe, ctx, origin);
    return state;
  }

  if (effect.condition) {
    if (!checkCondition(state, seat, effect.condition, ctx, origin)) {
      return effect.otherwise ? runEffect(state, seat, effect.otherwise, resolve, describe, ctx, origin) : state;
    }
  }

  if (effect.target && effect.target !== 'self') {
    for (const s of seatOrder(state, seat, effect.target)) {
      state = runEffect(state, s, { ...effect, target: 'self' }, resolve, describe, ctx, origin);
    }
    return state;
  }

  let happened = true;
  if (effect.optional) {
    happened = Boolean(resolve({ id: effect.id || effect.effect, options: [true, false] }));
  }

  if (!happened) {
    return effect.otherwise ? runEffect(state, seat, effect.otherwise, resolve, describe, ctx, origin) : state;
  }

  if (effect.cost) state = runEffect(state, seat, effect.cost, resolve, describe, ctx, origin);
  state = dispatch(state, seat, effect, resolve, describe, ctx, origin);
  return effect.then ? runEffect(state, seat, effect.then, resolve, describe, ctx, origin) : state;
}

function dispatch(state, seat, effect, resolve, describe, ctx, origin) {
  switch (effect.effect) {
    case 'gain': return runGain(state, seat, effect, resolve, ctx);
    case 'lay': return runLay(state, seat, effect, resolve, origin);
    case 'tuck': return runTuck(state, seat, effect, resolve, ctx, origin);
    case 'cache': return runCache(state, seat, effect, ctx, origin);
    case 'draw': return runDraw(state, seat, effect, resolve, ctx);
    case 'discard': return runDiscard(state, seat, effect, resolve, ctx, origin);
    case 'repeat': return runRepeat(state, seat, effect, resolve, describe, origin);
    case 'choose': return runChoose(state, seat, effect, resolve, describe, ctx, origin);
    default: throw new Error('sim/powers: unknown effect "' + effect.effect + '"');
  }
}

function seatOrder(state, seat, mode) {
  const n = state.seats.length;
  if (mode === 'each') return Array.from({ length: n }, (_, k) => (seat + k) % n);
  if (mode === 'others') return Array.from({ length: n - 1 }, (_, k) => (seat + 1 + k) % n);
  throw new Error('sim/powers: unknown target "' + mode + '"');
}

// --- conditions --------------------------------------------------------

function checkCondition(state, seat, cond, ctx, origin) {
  switch (cond.check) {
    case 'handNotEmpty': return bagTotal(state.seats[seat].hand.known) > 0;
    case 'feederHasFoodType': return feederFoodTypes(state.feeder).has(cond.type);
    case 'anyBirdMatches': return matchingSlots(state, seat, cond.filter || {}, origin).length > 0;
    case 'ref': {
      const id = ctx.bindings[cond.from];
      if (id == null) return false;
      return compare(birdCard(id)[cond.prop], cond.cmp, cond.value);
    }
    default: throw new Error('sim/powers: unknown condition "' + cond.check + '"');
  }
}

function compare(a, cmp, b) {
  switch (cmp) {
    case 'lt': return a < b;
    case 'lte': return a <= b;
    case 'gt': return a > b;
    case 'gte': return a >= b;
    case 'eq': return a === b;
    default: throw new Error('sim/powers: unknown comparator "' + cmp + '"');
  }
}

// --- feeder: face -> food type, mirrors sim/engine.js's feederFaceOptions ---
// (face 5 is the invertebrate/seed dual face — CLAUDE.md "things that will bite you").

function feederFaceGivesType(face, type) {
  return face === 5 ? type === 0 || type === 1 : face === type;
}

function feederFoodTypes(feeder) {
  const set = new Set();
  for (const f of feeder) {
    if (f == null) continue;
    if (f === 5) { set.add(0); set.add(1); } else set.add(f);
  }
  return set;
}

// --- targets -------------------------------------------------------------

function matchingSlots(state, seat, filter, origin) {
  return tableauSlots(state.seats[seat]).filter((t) => {
    if (filter.excludeSelf && origin && t.habitat === origin.habitat && t.col === origin.col) return false;
    if (filter.habitat === 'same' && origin && t.habitat !== origin.habitat) return false;
    if (filter.color && birdCard(t.slot.card).color !== filter.color) return false;
    if (filter.nest && birdCard(t.slot.card).nest !== filter.nest) return false;
    if (filter.minEggs && t.slot.eggs < filter.minEggs) return false;
    return true;
  });
}

// --- deck access: same reshuffle-then-draw rule as sim/engine.js, kept
// local rather than imported since this module resolves "which card" through
// `resolve()` instead of a chance move (docs/powers.md, "why draw here is
// not a chance node"). ---

function peekOneFromDeck(state, resolve, id) {
  if (state.deckSize <= 0 && bagTotal(state.discard) > 0) {
    for (const cardId of bagIds(state.discard)) state.unseen = addToBag(state.unseen, cardId, state.discard[cardId]);
    state.deckSize = bagTotal(state.unseen);
    state.discard = {};
  }
  const pool = state.deckSize > 0 ? state.unseen : state.discard;
  const ids = bagIds(pool);
  if (!ids.length) return null;
  const chosen = ids.length === 1 ? ids[0] : resolve({ id, options: ids });
  if (state.deckSize > 0) { state.unseen = removeFromBag(state.unseen, chosen, 1); state.deckSize -= 1; }
  else state.discard = removeFromBag(state.discard, chosen, 1);
  return chosen;
}

// --- verbs -----------------------------------------------------------------

function runGain(state, seat, effect, resolve, ctx) {
  if (effect.resource !== 'food') {
    throw new Error('sim/powers: gain only covers resource: "food" — eggs use "lay", cards use "draw"');
  }
  const seatObj = state.seats[seat];
  const source = effect.source || 'feeder';
  let type = effect.foodType;

  if (source === 'feeder') {
    const available = feederFoodTypes(state.feeder);
    if (type == null) {
      const options = [...available];
      if (!options.length) return state; // "if available"
      type = options.length === 1 ? options[0] : resolve({ id: effect.id || 'foodType', options });
    } else if (!available.has(type)) {
      return state;
    }
    const die = state.feeder.findIndex((f) => f != null && feederFaceGivesType(f, type));
    state.feeder[die] = null;
  } else if (source !== 'supply') {
    throw new Error('sim/powers: unknown gain source "' + source + '"');
  }
  if (type == null) throw new Error('sim/powers: gain from "supply" needs a foodType');

  seatObj.food = seatObj.food.map((n, i) => (i === type ? n + 1 : n));
  ctx.gained = { resource: 'food', type };
  return state;
}

function runLay(state, seat, effect, resolve, origin) {
  const seatObj = state.seats[seat];
  const amount = effect.amount ?? 1;
  for (let i = 0; i < amount; i++) {
    const targets = layTargets(seatObj, effect.onto, origin);
    if (!targets.length) break;
    const t = targets.length === 1 ? targets[0] : resolve({ id: effect.id || 'layTarget', options: targets });
    const row = seatObj.rows[habitatIndex(t.habitat)];
    row[t.col - 1] = { ...row[t.col - 1], eggs: row[t.col - 1].eggs + 1 };
  }
  return state;
}

function layTargets(seatObj, onto, origin) {
  if (onto === 'self' || !onto) return [{ habitat: origin.habitat, col: origin.col }];
  return tableauSlots(seatObj)
    .filter((t) => t.slot.eggs < birdCard(t.slot.card).eggLimit)
    .filter((t) => !onto.nest || birdCard(t.slot.card).nest === onto.nest)
    .map((t) => ({ habitat: t.habitat, col: t.col }));
}

function runTuck(state, seat, effect, resolve, ctx, origin) {
  const seatObj = state.seats[seat];
  let cardId;
  if (effect.from) {
    cardId = ctx.bindings[effect.from];
    if (cardId == null) return state; // nothing was bound (e.g. the deck ran dry)
  } else {
    const ids = bagIds(seatObj.hand.known);
    if (!ids.length) return state;
    cardId = ids.length === 1 ? ids[0] : resolve({ id: effect.id || 'tuckCard', options: ids });
    seatObj.hand.known = removeFromBag(seatObj.hand.known, cardId, 1);
  }
  const { habitat, col } = onto1(effect.onto, origin);
  const row = seatObj.rows[habitatIndex(habitat)];
  row[col - 1] = { ...row[col - 1], tucked: row[col - 1].tucked + 1 };
  return state;
}

function onto1(onto, origin) {
  if (onto === 'self' || !onto) return origin;
  throw new Error('sim/powers: tuck/cache only support onto: "self" for now');
}

function runCache(state, seat, effect, ctx, origin) {
  const seatObj = state.seats[seat];
  const type = effect.foodType ?? (ctx.gained && ctx.gained.resource === 'food' ? ctx.gained.type : null);
  if (type == null) throw new Error('sim/powers: cache needs a foodType, or a preceding gain to reference');
  if (!seatObj.food[type]) return state; // nothing to cache
  const { habitat, col } = onto1(effect.onto, origin);
  seatObj.food = seatObj.food.map((n, i) => (i === type ? n - 1 : n));
  const row = seatObj.rows[habitatIndex(habitat)];
  const cached = row[col - 1].cached.slice();
  cached[type] += 1;
  row[col - 1] = { ...row[col - 1], cached };
  return state;
}

function runDraw(state, seat, effect, resolve, ctx) {
  const seatObj = state.seats[seat];
  const amount = effect.amount ?? 1;
  const source = effect.source || 'deck';
  for (let i = 0; i < amount; i++) {
    let id;
    if (source === 'tray') {
      const filled = state.tray.map((card, slot) => ({ card, slot })).filter((t) => t.card != null);
      if (!filled.length) break;
      const pick = filled.length === 1 ? filled[0] : resolve({ id: effect.id || 'trayCard', options: filled });
      id = pick.card;
      state.tray[pick.slot] = null;
    } else if (source === 'deck') {
      id = peekOneFromDeck(state, resolve, effect.id || (effect.as ? effect.as + ':deck' : 'drawCard'));
      if (id == null) break;
    } else {
      throw new Error('sim/powers: unknown draw source "' + source + '"');
    }
    if (effect.peek) {
      ctx.bindings[effect.as || 'peeked'] = id;
    } else {
      seatObj.hand.known = addToBag(seatObj.hand.known, id, 1);
    }
  }
  return state;
}

function runDiscard(state, seat, effect, resolve, ctx, origin) {
  if (effect.resource === 'egg') return runDiscardEgg(state, seat, effect, resolve, origin);
  if (effect.resource !== 'card') {
    throw new Error('sim/powers: discard covers resource: "card" or "egg" for now');
  }
  let id;
  if (effect.from) {
    id = ctx.bindings[effect.from];
    if (id == null) return state;
  } else {
    const seatObj = state.seats[seat];
    const ids = bagIds(seatObj.hand.known);
    if (!ids.length) return state;
    id = ids.length === 1 ? ids[0] : resolve({ id: effect.id || 'discardCard', options: ids });
    seatObj.hand.known = removeFromBag(seatObj.hand.known, id, 1);
  }
  state.discard = addToBag(state.discard, id, 1);
  return state;
}

/** Removes one egg from a tableau bird — "discard 1 [egg]" as a cost, e.g. Killdeer. */
function runDiscardEgg(state, seat, effect, resolve, origin) {
  const seatObj = state.seats[seat];
  const targets = matchingSlots(state, seat, effect.filter || {}, origin).filter((t) => t.slot.eggs > 0);
  if (!targets.length) return state; // nothing to pay with — the step this costs is skipped by its caller
  const t = targets.length === 1 ? targets[0] : resolve({ id: effect.id || 'discardEggFrom', options: targets });
  const row = seatObj.rows[habitatIndex(t.habitat)];
  row[t.col - 1] = { ...row[t.col - 1], eggs: row[t.col - 1].eggs - 1 };
  return state;
}

function runRepeat(state, seat, effect, resolve, describe, origin) {
  if (effect.of !== 'anotherBirdPower') {
    throw new Error('sim/powers: repeat only supports of: "anotherBirdPower" for now');
  }
  const candidates = matchingSlots(state, seat, effect.filter || {}, origin)
    .map((t) => ({ ...t, description: describe(t.slot.card) }))
    .filter((t) => t.description); // no description to repeat is "nothing eligible", not an error
  if (!candidates.length) return state;
  const chosen = candidates.length === 1
    ? candidates[0]
    : resolve({ id: effect.id || 'repeatTarget', options: candidates });
  return runEffect(state, seat, chosen.description.do, resolve, describe, { bindings: {} },
    { habitat: chosen.habitat, col: chosen.col });
}

function runChoose(state, seat, effect, resolve, describe, ctx, origin) {
  if (!effect.options || !effect.options.length) throw new Error('sim/powers: choose needs options');
  const idx = effect.options.length === 1
    ? 0
    : resolve({ id: effect.id || 'choose', options: effect.options.map((_, i) => i) });
  return runEffect(state, seat, effect.options[idx], resolve, describe, ctx, origin);
}
