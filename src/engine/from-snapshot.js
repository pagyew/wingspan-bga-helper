// Adapts a live extension snapshot (src/page/state.js: collectState + the card
// database from collectCardDb) into the shape evaluate.evaluateTurn expects.
//
// The two shapes disagree on purpose — see docs/engine-port.md — and this is
// the one place that reconciles them:
//   - birds are identified by the page's numeric birdId; the evaluator wants
//     the normalized string key, so every lookup joins on the page's own
//     `identifier` field.
//   - players is an object keyed by id with an isMe flag; the evaluator wants
//     an array with the local player first.
//   - cached food is one number per bird for the evaluator, an array of five
//     (one per food type) on the page snapshot.
//   - turns left: counter_cubes disagrees with the cubes actually placed in
//     about a third of `playerNormalTurn` snapshots (see docs/benchmarks.md),
//     and the whole horizon hangs off that number, so the placed cubes win.
//   - goals of already-scored rounds: BGA keeps those points frozen in the
//     goal panel. Feeding them back as `goalsBanked` is what makes the
//     evaluator's V readable as a forecast of the final score.
// The card *stats* (vp, power text, category, …) are not taken from the page
// here — createEngine() supplies its own bundled database for those, keyed by
// the same string identifiers this file produces.

const TURNS_IN_ROUND = [8, 7, 6, 5];

/**
 * Turns left in the round, including the current one. `counter_cubes` lags
 * behind during animations; the per-habitat cube zones do not. When the two
 * disagree, trust the placed cubes — but only if they were read at all.
 */
export function turnsLeftInRound(round, player) {
  const total = TURNS_IN_ROUND[round - 1];
  const reported = player.cubesLeft;
  const placed = player.cubesPlaced || [];
  const used = placed.reduce((a, x) => a + x, 0);
  const placedWasRead = used > 0 || reported === total;
  if (total == null) return reported;
  if (!placedWasRead || used + reported === total) return reported;
  return Math.max(0, Math.min(total, total - used));
}

function birdKey(cardDb, birdId) {
  const card = cardDb && cardDb.birds && cardDb.birds[birdId];
  return card ? card.identifier : null;
}

function bonusKey(cardDb, bonusId) {
  const entries = (cardDb && cardDb.bonuscards) || {};
  const entry = Object.values(entries).find((c) => Number(c.index) === Number(bonusId));
  return entry ? entry.identifier : null;
}

function tableauEntry(cardDb, bird) {
  return {
    key: birdKey(cardDb, bird.birdId),
    habitat: bird.habitat,
    eggs: bird.eggs || 0,
    tucked: bird.tucked || 0,
    cached: (bird.cached || []).reduce((a, b) => a + b, 0)
  };
}

function playerEntry(cardDb, player) {
  const hand = (player.handBirds || []).map((id) => (id == null ? null : birdKey(cardDb, id)));
  const count = player.handBirdCount != null ? player.handBirdCount : hand.length;
  return {
    name: player.name,
    food: player.food,
    // The opponent's hand is hidden: we know its size, not its contents.
    handBirdCount: count,
    bonus: (player.handBonus || []).map((id) => bonusKey(cardDb, id)).filter(Boolean),
    handBirds: hand.length ? hand : new Array(count).fill(null),
    tableau: player.tableau.map((bird) => tableauEntry(cardDb, bird))
  };
}

/**
 * `state` is a src/page/state.js collectState() snapshot, `cardDb` is its
 * collectCardDb() companion. The result is ready for createEngine().suggest
 * once merged with db/bonusByKey (createEngine does that itself).
 */
export function fromSnapshot(state, cardDb) {
  const me = state.players[state.myId];
  const others = Object.entries(state.players)
    .filter(([id]) => id !== state.myId)
    .map(([, p]) => p);

  const order = [me, ...others];
  const ids = [state.myId, ...Object.keys(state.players).filter((id) => id !== state.myId)];
  const banked = ids.map((id) =>
    state.goals.reduce((sum, goal, i) => {
      if (i + 1 >= state.round) return sum;                    // not scored yet
      const cell = goal.standing && goal.standing[id];
      return sum + (cell ? Number(cell.score) || 0 : 0);
    }, 0)
  );

  return {
    round: state.round,
    cubesLeft: turnsLeftInRound(state.round, me),
    cubesLeftReported: me.cubesLeft,
    goalBoard: state.goalBoardType,
    goals: state.goals.map((g) => ({ description: g.description })),
    goalsBanked: banked,
    feeder: state.feeder,
    tray: state.tray.map((id) => birdKey(cardDb, id)).filter(Boolean),
    players: order.map((p) => playerEntry(cardDb, p))
  };
}
