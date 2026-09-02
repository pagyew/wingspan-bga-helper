// Replays a corpus of recorded decisions through the evaluator.
//
// test/fixtures/corpus/decisions.json holds, for every turn the local player actually
// took in a recorded game: the state at the start of that turn, the move they
// made, and the final score of the game. That gives three measurements, and
// only the middle one is objective:
//
//   legality    — is the move the player actually made among the options the
//                 evaluator enumerates? A miss here is a rules bug, full stop.
//   calibration — how well V(position) predicts the game's final score. This
//                 is the number to optimise: the goal is not to agree with a
//                 human, it is to count points correctly.
//   agreement   — how often the top option is the move the human played.
//                 Informative, not a target: the human plays imperfectly.
//
// See docs/benchmarks.md for the recorded runs.
import * as M from './mat.js';
import { positionValue, evaluateTurn, WEIGHTS } from './evaluate.js';

/** A corpus decision → the shape evaluateTurn() expects. */
export function decisionToState(d) {
  return {
    round: d.round,
    cubesLeft: M.turnsInRound(d.round) - d.turnsUsedThisRound,
    goalBoard: d.goalBoard,
    goals: d.goals.map((description) => ({ description })),
    goalsBanked: [d.goalsBanked, 0],
    feeder: d.feeder,
    tray: d.tray,
    birdDeck: d.birdDeck,
    players: d.players.map((p) => ({
      ...p,
      handBirds: p.isMe ? p.handBirds : new Array(p.handBirdCount).fill(null)
    }))
  };
}

function matches(option, actual) {
  if (actual.action === 'playbird') {
    const played = actual.played[0];
    return (
      option.action.type === 'playBird' &&
      played != null &&
      option.action.bird === played.key &&
      option.action.habitat === played.habitat
    );
  }
  return option.action.type === 'row' && option.action.habitat === actual.action;
}

/**
 * @param corpus  parsed test/fixtures/corpus/decisions.json
 * @param engine  { suggest } from createEngine()
 * @param W       weights to score with
 */
export function replay(corpus, engine, W = WEIGHTS) {
  const out = {
    positions: 0, top1: 0, top2: 0, top3: 0, illegal: 0,
    squaredError: 0, misses: [], mix: {}, byAction: {}, byRound: {}
  };
  for (const game of corpus.games) {
    const target = game.finalScore[game.myName];
    for (const d of game.decisions) {
      const state = decisionToState(d);
      const result = engine.suggest(state, W);
      if (!result.options.length) continue;
      out.positions++;

      const horizon = M.turnsAfterThis(state.round, state.cubesLeft) + 1;
      const v = positionValue({ ...state, db: engine.db, bonusByKey: engine.bonusByKey }, 0, horizon, W).total;
      const err = v - target;
      out.squaredError += err * err;
      const r = (out.byRound[d.round] ??= { n: 0, sum: 0, sumSq: 0 });
      r.n++; r.sum += err; r.sumSq += err * err;

      const top = result.options[0].action;
      const topKey = top.type === 'playBird' ? 'playbird' : top.habitat;
      out.mix[topKey] = (out.mix[topKey] || 0) + 1;

      // A recorded "play a bird" whose card could not be identified tells us
      // nothing about agreement — skip it rather than count it as a miss.
      if (d.actual.action === 'playbird' && !(d.actual.played[0] && d.actual.played[0].key)) continue;
      const rank = result.options.findIndex((o) => matches(o, d.actual));
      const a = (out.byAction[d.actual.action] ??= { n: 0, top1: 0, illegal: 0 });
      a.n++;
      if (rank === 0) { out.top1++; a.top1++; }
      if (rank >= 0 && rank < 2) out.top2++;
      if (rank >= 0 && rank < 3) out.top3++;
      if (rank < 0) {
        out.illegal++; a.illegal++;
        const what = d.actual.played[0] ? `${d.actual.played[0].key}/${d.actual.played[0].habitat}` : d.actual.action;
        out.misses.push(`#${game.table} r${d.round}: ${d.actual.action} ${what}`);
      }
    }
  }
  out.rmse = Math.sqrt(out.squaredError / out.positions);
  out.rounds = Object.fromEntries(
    Object.entries(out.byRound).map(([k, x]) => [k, { n: x.n, bias: x.sum / x.n, rmse: Math.sqrt(x.sumSq / x.n) }])
  );
  return out;
}
