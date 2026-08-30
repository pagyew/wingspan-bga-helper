// Assembly: card lookups + evaluator. No fs — the bundle has none, and the
// extension gets its own card data off the page anyway (see from-snapshot.js).
// Node tests and the esbuild bundle both get their data the same way: as a
// plain ES module, not a filesystem read.

import { evaluateTurn, advise as adviseText, WEIGHTS } from './evaluate.js';
import defaultBirds from './data/birds.js';
import defaultBonusCards from './data/bonus.js';

/** State-with-moves → ranked options, given a fixed card database. */
export function createEngine({ birds = defaultBirds, bonusCards = defaultBonusCards } = {}) {
  const db = Object.fromEntries(birds.map(b => [b.key, b]));
  const bonusByKey = Object.fromEntries(bonusCards.map(b => [b.key, b]));

  function suggest(pageState, weights = WEIGHTS) {
    return evaluateTurn({ ...pageState, db, bonusByKey }, weights);
  }

  function advise(pageState, weights = WEIGHTS) {
    return adviseText(suggest(pageState, weights), db);
  }

  return { db, bonusByKey, suggest, advise };
}

export { WEIGHTS };
