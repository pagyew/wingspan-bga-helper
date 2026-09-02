#!/usr/bin/env node
// Turns raw recorder dumps into test/fixtures/corpus/decisions.json (milestone B3).
//
//   node scripts/make-corpus.mjs ~/Downloads/wingspan-recordings [out.json]
//
// A recorder dump (src/ui/recorder.js) is a few megabytes of snapshots — far
// too much to keep in the repository, and most of it is animation frames. What
// the engine needs is one row per decision: the state at the start of a turn
// the local player took, the move they actually made, and the final score of
// the game. That is what this produces, keyed by the same bird/bonus
// identifiers src/engine/data uses, so the corpus stays readable on its own.
//
// Two things are worth knowing about the raw dumps:
//   - counter_cubes lags, the per-habitat cube zones do not, so turns used are
//     counted from cubesPlaced (see src/engine/from-snapshot.js);
//   - the first stable snapshot of a turn still has the resources unspent; the
//     last one does not. Bird plays are therefore matched to turns by order of
//     appearance on the mat, not by diffing one snapshot against another.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { parseBonusVp, goalCounter } from '../src/engine/scoring.js';

const here = dirname(fileURLToPath(import.meta.url));
const ACTIONS = ['playbird', 'forest', 'grassland', 'wetland'];
const TURNS_IN_ROUND = [8, 7, 6, 5];
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// Bonus cards whose count depends on the mat, not on the bird's own printing.
const STATE_BONUS = {
  breedingmanager: (p) => p.tableau.filter((b) => b.eggs >= 4).length,
  oologist: (p) => p.tableau.filter((b) => b.eggs >= 1).length,
  visionaryleader: (p) => p.handBirdCount || 0,
  ecologist: (p) => Math.min(...['forest', 'grassland', 'wetland'].map((h) => p.tableau.filter((b) => b.habitat === h).length))
};

/** BGA's own card tables, indexed the way the recorder dumped them. */
function buildIndex(db) {
  const byBirdId = {};
  for (const bird of Object.values(db.birds)) byBirdId[bird.index] = bird.identifier;
  const byBonusId = {};
  for (const card of db.bonuscards) byBonusId[card.index] = card.identifier;
  const bonusVp = {};
  for (const card of db.bonuscards) bonusVp[card.identifier] = card.vp;
  return { byBirdId, byBonusId, bonusVp };
}

function snapshotToState(snapshot, ix) {
  const me = snapshot.myId;
  const ids = [me, ...Object.keys(snapshot.players).filter((id) => id !== me)];
  return {
    round: snapshot.round,
    goalBoard: snapshot.goalBoardType,
    goals: snapshot.goals,
    feeder: snapshot.feeder || [],
    tray: (snapshot.tray || []).map((id) => ix.byBirdId[id]).filter(Boolean),
    birdDeck: snapshot.birdDeck,
    players: ids.map((id) => {
      const p = snapshot.players[id];
      const isMe = id === me;
      return {
        id, name: p.name, isMe,
        food: p.food.slice(0, 5),
        handBirdCount: p.handBirdCount,
        handBirds: isMe ? (p.handBirds || []).map((i) => ix.byBirdId[i] || null) : [],
        bonus: isMe ? (p.handBonus || []).map((i) => ix.byBonusId[i]).filter(Boolean) : [],
        tableau: (p.tableau || []).map((b) => ({
          key: ix.byBirdId[b.birdId] || null,
          habitat: b.habitat,
          eggs: b.eggs || 0,
          tucked: b.tucked || 0,
          cached: sum(b.cached || [])
        }))
      };
    })
  };
}

/** Turn boundaries come from the action cubes; they are the one reliable clock. */
function extractTurns(recording, ix) {
  const me = recording.entries[0].state.myId;
  const turns = [];
  let previous = null, pending = null;
  for (const entry of recording.entries) {
    const player = entry.state.players[me];
    if (!player) continue;
    const placed = player.cubesPlaced.slice();
    if (previous) {
      const which = placed.findIndex((v, i) => v > previous[i]);
      if (which >= 0 && pending) {
        turns.push({ seq: entry.seq, action: ACTIONS[which], snapshot: pending, round: pending.round });
        pending = null;
      }
    }
    previous = placed;
    // The first stable snapshot of a turn is the one where nothing is spent yet.
    if (entry.state.myTurn && entry.state.state === 'playerNormalTurn' && !pending) pending = entry.state;
  }
  // Birds appear on the mat in the order they were played, so the n-th "play a
  // bird" turn gets the n-th new slot. A turn left without one is a recorder
  // hiccup (a cube counted twice) and is dropped from the agreement figures.
  const seen = new Set(), appeared = [];
  for (const entry of recording.entries) {
    for (const bird of (entry.state.players[me] || {}).tableau || []) {
      if (seen.has(bird.loc)) continue;
      seen.add(bird.loc);
      appeared.push({ seq: entry.seq, key: ix.byBirdId[bird.birdId] || null, habitat: bird.habitat });
    }
  }
  const plays = turns.filter((t) => t.action === 'playbird');
  for (const t of turns) t.played = [];
  for (const bird of appeared) {
    let target = null;
    for (const t of plays) if (t.seq <= bird.seq && !t.played.length) target = t;
    if (target) target.played.push({ key: bird.key, habitat: bird.habitat });
  }
  return turns;
}

/** Final score, exact for the local player; the opponent's bonus cards are hidden. */
function finalScores(recording, ix, birdsByKey) {
  const last = recording.entries[recording.entries.length - 1].state;
  const state = snapshotToState(last, ix);
  const out = {};
  for (const p of state.players) {
    const mat = p.tableau.map((b) => ({ ...birdsByKey[b.key], ...b }));
    const goals = sum(state.goals.map((g) => Number(g.standing[p.id].score) || 0));
    const bonus = sum(p.bonus.map((key) => {
      const counted = STATE_BONUS[key]
        ? STATE_BONUS[key]({ tableau: mat, handBirdCount: p.handBirdCount })
        : mat.filter((b) => (b.bonus || []).includes(key)).length;
      return parseBonusVp(ix.bonusVp[key])(counted);
    }));
    out[p.name] = sum(mat.map((b) => b.vp)) + sum(mat.map((b) => b.eggs))
      + sum(mat.map((b) => b.tucked)) + sum(mat.map((b) => b.cached)) + goals + bonus;
  }
  return out;
}

function birdsFromDump(db) {
  const NEST = ['none', 'bowl', 'cavity', 'ground', 'platform', 'star'];
  const byEnum = {};
  for (const c of db.bonuscards) if (c.ENUM !== undefined) byEnum[c.ENUM] = c.identifier;
  const out = {};
  for (const b of Object.values(db.birds)) {
    out[b.identifier] = {
      key: b.identifier, vp: b.vp, nest: NEST[b.nesttype], eggLimit: b.eggcapacity,
      bonus: b.bonuscards.map((on, i) => (on ? byEnum[i] : null)).filter(Boolean)
    };
  }
  return out;
}

export function makeCorpus(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => join(dir, f));
  const games = [];
  for (const file of files) {
    const recording = JSON.parse(readFileSync(file, 'utf8'));
    if (!recording.entries || !recording.db) { console.warn('skipped, not a recording:', file); continue; }
    const ix = buildIndex(recording.db);
    const birdsByKey = birdsFromDump(recording.db);
    const me = recording.entries[0].state.myId;
    const myName = recording.entries[0].state.players[me].name;
    const decisions = [];
    for (const turn of extractTurns(recording, ix)) {
      const state = snapshotToState(turn.snapshot, ix);
      if (state.players.some((p) => p.tableau.some((b) => !b.key))) continue;
      const used = sum(turn.snapshot.players[me].cubesPlaced);
      decisions.push({
        round: state.round,
        turnsUsedThisRound: used,
        cubesLeftReported: turn.snapshot.players[me].cubesLeft,
        goalBoard: state.goalBoard,
        goals: state.goals.map((g) => g.description),
        goalsBanked: state.goals.reduce((a, g, r) =>
          a + (r + 1 < state.round ? Number(g.standing[me].score) || 0 : 0), 0),
        feeder: state.feeder, tray: state.tray, birdDeck: state.birdDeck,
        players: state.players.map(({ id, ...rest }) => rest),
        actual: { action: turn.action, played: turn.played }
      });
    }
    games.push({
      table: recording.tableId, url: recording.url,
      goalBoard: recording.entries[0].state.goalBoardType,
      finalScore: finalScores(recording, ix, birdsByKey),
      myName, decisions
    });
  }
  return { note: 'Decision points from recorded BGA games: the state at the start of a turn, the move actually made, and the final score. Bird and bonus keys match src/engine/data.', games };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) { console.error('usage: node scripts/make-corpus.mjs <dir-with-recordings> [out.json]'); process.exit(1); }
  const out = process.argv[3] || join(here, '../test/fixtures/corpus/decisions.json');
  const corpus = makeCorpus(resolve(dir));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(corpus));
  const n = corpus.games.reduce((a, g) => a + g.decisions.length, 0);
  console.log(`${corpus.games.length} games, ${n} decisions → ${out}`);
  // goalCounter is imported so the corpus and the engine stay on one definition
  // of every round goal; a dump with an unknown goal must fail loudly here.
  for (const g of corpus.games) for (const d of g.decisions) d.goals.forEach((x) => goalCounter(x));
}
