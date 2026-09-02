// The deck is a bag, not a stack (docs/sim-state.md, decision #1): a sparse
// map from card id to count. Every helper here is pure and copy-on-write —
// nothing in the sim mutates a bag in place.

export function bagCount(bag, id) {
  return bag[id] || 0;
}

export function bagTotal(bag) {
  let n = 0;
  for (const id in bag) n += bag[id];
  return n;
}

export function bagIds(bag) {
  return Object.keys(bag).map(Number).filter(id => bag[id] > 0);
}

export function addToBag(bag, id, n = 1) {
  if (n <= 0) return bag;
  const out = { ...bag };
  out[id] = (out[id] || 0) + n;
  return out;
}

export function removeFromBag(bag, id, n = 1) {
  if (n <= 0) return bag;
  const have = bag[id] || 0;
  if (have < n) throw new Error(`sim: bag underflow for id ${id} (has ${have}, wants ${n})`);
  const out = { ...bag };
  if (have === n) delete out[id];
  else out[id] = have - n;
  return out;
}

/** A bag built from a flat array of ids (duplicates become counts). */
export function bagFromList(ids) {
  const bag = {};
  for (const id of ids) bag[id] = (bag[id] || 0) + 1;
  return bag;
}

/** Flatten a bag back to a list of ids, one entry per copy. */
export function listFromBag(bag) {
  const out = [];
  for (const id of bagIds(bag)) for (let i = 0; i < bag[id]; i++) out.push(Number(id));
  return out;
}
