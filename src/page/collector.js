// MAIN-world entry point.
//
// This script can see `gameui`; it cannot see `chrome.*`. It reads the game
// model, and posts snapshots over window.postMessage for the ISOLATED-world UI
// to evaluate. It never writes to the page and never patches a BGA function:
// staying read-only is both the point of the tool and the reason it survives
// BGA client updates.

import { PAGE_SOURCE, UI_SOURCE, MSG, accepts, post } from '../shared/protocol.js';
import { collectState, collectCardDb, fingerprint } from './state.js';

const DEBOUNCE_MS = 300;
const HEARTBEAT_MS = 1000;

// Notifications the BGA client publishes on dojo topics. We do not rebuild the
// state from an event's payload — we just re-read the whole model, which is
// cheap and cannot drift.
const TOPICS = [
  'gainFood', 'rollAllDice', 'rollDiceNotInFeeder', 'cacheFood', 'foodFromSupply',
  'setCube', 'moveCube', 'playBird', 'layEggs', 'discardEgg', 'changeHabitat',
  'drawBirdFromTray', 'drawBirdsPrivate', 'drawBirdsPublic', 'refillTray',
  'discardTray', 'reshuffleDeck', 'tuckCardFromHandPublic', 'tuckCardFromHandPrivate',
  'tuckCardFromDeck', 'huntWingspan', 'moveBonusPrivate', 'moveBonusPublic',
  'mustDiscardBird', 'discard', 'reorderHand', 'changeFirstPlayer', 'noAction',
  'resetPlayerCubes', 'updateArgs', 'updateBonusData', 'updateGoalData',
  'initialDiscardBirds', 'initialDiscardBonus', 'initialDiscardPublic',
  'undoInitialDiscard', 'newSavePoint'
];

let seq = 0;
let dbSent = false;
let dbHash = null;
let timer = null;
let lastPulse = '';

const gameui = () => window.gameui;

function ready() {
  const g = gameui();
  return Boolean(g && g.gamedatas && g.gamedatas.birds && g.object_manager && g.player_manager);
}

/** A few counters that change on every meaningful action — the heartbeat's diff. */
function pulse() {
  const g = gameui();
  try {
    const gs = g.gamedatas.gamestate || {};
    const players = Object.values(g.player_manager.players);
    return [
      gs.name, gs.active_player, g.object_manager.current_round,
      ...players.map((p) => (p.counter_cubes ? p.counter_cubes.getValue() : 0)),
      ...players.map((p) => (p.counter_eggs ? p.counter_eggs.getValue() : 0))
    ].join('|');
  } catch {
    return 'unreadable';
  }
}

function send(force = false) {
  const g = gameui();
  if (!g) return;
  try {
    const state = collectState(g);
    const payload = { seq: ++seq, state };
    if (!dbSent || force) {
      const db = collectCardDb(g);
      dbHash = fingerprint(db);
      payload.db = db;
      payload.dbHash = dbHash;
      dbSent = true;
    } else {
      payload.dbHash = dbHash;
    }
    post(PAGE_SOURCE, MSG.STATE, payload);
  } catch (error) {
    // A BGA client update is the likely cause. Say so instead of guessing:
    // a wrong hint is worse than an honest "I could not read the position".
    post(PAGE_SOURCE, MSG.ERROR, {
      where: 'collectState',
      message: String((error && error.message) || error)
    });
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => send(), DEBOUNCE_MS);
}

function start() {
  const g = gameui();

  if (g.game_name && g.game_name !== 'wingspan') return; // not our game
  post(PAGE_SOURCE, MSG.HELLO, { game: g.game_name || 'wingspan' });

  if (window.dojo && typeof window.dojo.subscribe === 'function') {
    for (const topic of TOPICS) {
      try {
        window.dojo.subscribe(topic, schedule);
      } catch {
        /* a topic this game version does not publish — the heartbeat covers it */
      }
    }
  }

  // Belt and braces. If a BGA update renames the notifications above, the
  // subscriptions go quiet without any error, and a stuck panel looks like a
  // bug in us. The heartbeat notices the change anyway.
  setInterval(() => {
    const now = pulse();
    if (now !== lastPulse) {
      lastPulse = now;
      schedule();
    }
  }, HEARTBEAT_MS);

  window.addEventListener('message', (event) => {
    if (!accepts(event, UI_SOURCE)) return;
    if (event.data.type === MSG.PULL) send();
    if (event.data.type === MSG.NEED_DB) send(true);
  });

  send();
}

(function waitForGame() {
  if (ready()) {
    start();
    return;
  }
  setTimeout(waitForGame, 400);
})();
