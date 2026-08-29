// Reads the live game model out of the BGA client.
//
// Everything here runs in the page's own world, where `gameui` exists. The game
// log is deliberately not parsed: it is localized and carries less than the
// model does. See docs/bga-game-state.md for how each field was verified.

const DICE = ['invertebrate', 'seed', 'fish', 'fruit', 'rodent', 'invertebrate|seed'];
const HABITAT = ['playbird', 'forest', 'grassland', 'wetland'];
const NEST = ['none', 'bowl', 'cavity', 'ground', 'platform', 'star'];

const value = (counter) =>
  counter && typeof counter.getValue === 'function' ? counter.getValue() : 0;

/** Hand panels carry the card id in the DOM id: handcard_bird_panel_<id>. */
function handCards(panel) {
  const cards = panel && Array.isArray(panel.cards) ? panel.cards : [];
  return cards.map((id) => String(id).split('_')).filter((parts) => parts.length >= 4);
}

/**
 * A snapshot is only worth evaluating when `stable` is true. During animations
 * BGA leaves the model half-updated: the tray can hold empty objects and
 * counters lag behind what is on screen.
 */
export function collectState(gameui) {
  const gd = gameui.gamedatas;
  const om = gameui.object_manager;
  const pm = gameui.player_manager;
  const gamestate = gd.gamestate || {};
  const me = String(gameui.player_id);

  const players = {};
  for (const [id, p] of Object.entries(pm.players)) {
    const hand = handCards(p.hand_panel);
    players[id] = {
      name: p.player_name,
      isMe: id === me,
      score: Number((gd.players[id] || {}).score) || 0,
      food: [0, 1, 2, 3, 4].map((i) => value(p['counter_food_' + i])),
      cubesLeft: value(p.counter_cubes),
      cubesPlaced: (p.habitat_cube_zones || []).map((z) =>
        z && z.getItemNumber ? z.getItemNumber() : 0
      ),
      eggs: value(p.counter_eggs),
      eggCapacity: value(p.counter_eggcapacity),
      handBirdCount: value(p.counter_card_bird),
      bonusCount: value(p.counter_card_bonus),
      // Hidden information: these are populated for the local player only.
      handBirds: hand.filter((t) => t[1] === 'bird').map((t) => Number(t[3])),
      handBonus: hand.filter((t) => t[1] === 'bonus').map((t) => Number(t[3])),
      tableau: Object.entries(p.birds || {})
        .filter(([, bird]) => bird && bird.index !== undefined)
        .map(([loc, bird]) => {
          const slot = Number(loc);
          return {
            loc: slot,
            habitat: HABITAT[slot >> 3],
            col: slot & 7,
            birdId: bird.index,
            vp: bird.vp,
            nest: NEST[bird.nesttype],
            capacity: bird.eggcapacity,
            wingspan: bird.wingspan,
            eggs: (p.egg_counts || {})[loc] || 0,
            cached: [0, 1, 2, 3, 4].map((f) => value(p['counter_cache_' + loc + '_' + f])),
            tucked: value(p['counter_tucked_' + loc]),
            powerColor: bird.powercolor,
            powerCategory: bird.powercategory
          };
        })
        .sort((a, b) => a.loc - b.loc)
    };
  }

  const stateName = gamestate.name || '';

  return {
    takenAt: Date.now(),
    stable: !/^process/.test(stateName),
    round: (om.current_round | 0) + 1, // current_round is 0-based
    state: stateName,
    activePlayer: gamestate.active_player != null ? String(gamestate.active_player) : null,
    myTurn: String(gamestate.active_player) === me,
    myId: me,
    actions: gamestate.possibleactions || [],
    tray: (om.card_tray.cards || [])
      .filter((c) => c && c.index !== undefined)
      .map((c) => c.index),
    feeder: (om.feeder.dice || []).filter((d) => d.in_feeder).map((d) => DICE[d.side]),
    birdDeck: value(om.bird_draw_counter),
    birdDiscard: value(om.bird_discard_counter),
    bonusDeck: value(om.bonus_draw_counter),
    goalBoardType: om.goal_board.goalboard_type,
    goals: (om.goal_board.goal_data || []).map((goal, i) => ({
      description: goal.description,
      standing: Object.fromEntries(
        Object.keys(pm.players).map((id) => [id, (gd.goals[id] || [])[i]])
      )
    })),
    players
  };
}

/** Everything the card database gives us that does not change during a game. */
export function collectCardDb(gameui) {
  const gd = gameui.gamedatas;
  const birds = {};
  for (const [key, b] of Object.entries(gd.birds || {})) {
    birds[key] = {
      index: b.index,
      identifier: b.identifier,
      name: b.commonname,
      nameLocal: b.commonnametr,
      set: b.set,
      vp: b.vp,
      nesttype: b.nesttype,
      eggcapacity: b.eggcapacity,
      wingspan: b.wingspan,
      habitat: b.habitat,
      food: b.food,
      totalfood: b.totalfood,
      powercolor: b.powercolor,
      powercategory: b.powercategory,
      powertext: b.powertext,
      powerflags: b.powerflags,
      bonuscards: b.bonuscards
    };
  }
  return { birds, bonuscards: gd.bonuscards || {} };
}

/** Cheap, order-independent fingerprint so the database is sent only once. */
export function fingerprint(db) {
  const keys = Object.keys(db.birds).sort();
  let h = 2166136261;
  for (const k of keys) {
    const s = k + ':' + db.birds[k].identifier;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return (h >>> 0).toString(16) + '.' + keys.length;
}

/**
 * Problems worth refusing to advise on. A wrong hint is worse than no hint,
 * so anything unexpected surfaces here instead of quietly scoring as zero.
 */
export function validateState(state, db) {
  const problems = [];
  if (!state.stable) problems.push('snapshot taken during an animation');
  if (state.tray.length && state.tray.some((id) => db && !db.birds[id]))
    problems.push('tray holds a bird id missing from the card database');
  if (state.goalBoardType && state.goalBoardType !== 'green')
    problems.push('blue goal board is not supported yet');
  for (const p of Object.values(state.players)) {
    for (const bird of p.tableau) {
      if (db && !db.birds[bird.birdId]) problems.push('unknown bird id ' + bird.birdId);
    }
  }
  return problems;
}
