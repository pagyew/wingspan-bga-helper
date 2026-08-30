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
// The card *stats* (vp, power text, category, …) are not taken from the page
// here — createEngine() supplies its own bundled database for those, keyed by
// the same string identifiers this file produces.

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
  return {
    name: player.name,
    food: player.food,
    bonus: (player.handBonus || []).map((id) => bonusKey(cardDb, id)).filter(Boolean),
    handBirds: (player.handBirds || []).map((id) => (id == null ? null : birdKey(cardDb, id))),
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

  return {
    round: state.round,
    cubesLeft: me.cubesLeft,
    goalBoard: state.goalBoardType,
    goals: state.goals.map((g) => ({ description: g.description })),
    feeder: state.feeder,
    tray: state.tray.map((id) => birdKey(cardDb, id)).filter(Boolean),
    players: [me, ...others].map((p) => playerEntry(cardDb, p))
  };
}
