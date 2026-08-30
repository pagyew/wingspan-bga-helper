// Pure state -> view model. No DOM, no chrome.*, so Node can test it.

/** Names the way BGA's own buttons name them, so a hint maps onto the screen. */
export function habitatLabel(t, habitat) {
  return t(habitat === 'forest' ? 'forest' : habitat === 'grassland' ? 'grassland' : 'wetland');
}

export function headline(state, t) {
  if (!state) return t('waiting');
  const me = state.players[state.myId];
  const others = Object.values(state.players).filter((p) => !p.isMe);
  const scores = [me, ...others].filter(Boolean).map((p) => `${p.name} ${p.score}`).join(' : ');
  return `${t('round')} ${state.round} · ${scores}`;
}

export function statusLine(state, t) {
  if (!state) return '';
  const me = state.players[state.myId];
  const cubes = me ? `${me.cubesLeft} ${t('cubesLeft')}` : '';
  if (!state.myTurn) return [t('notYourTurn'), cubes].filter(Boolean).join(' · ');
  return cubes;
}

export function notes(state, problems, t) {
  const out = [];
  if (!state) return out;
  if (!state.stable) out.push({ text: t('unstable'), kind: 'warn' });
  for (const problem of problems || []) {
    if (problem.includes('blue goal board')) out.push({ text: t('blueGoalBoard'), kind: 'warn' });
    else out.push({ text: problem, kind: 'warn' });
  }
  return out;
}

export function detailLine(state, t) {
  if (!state) return '';
  const parts = [];
  const current = state.goals[state.round - 1];
  if (current) {
    const mine = current.standing?.[state.myId];
    const value = mine ? `${mine.value} → ${mine.score}` : '—';
    parts.push(`${t('goals')}: ${current.description} ${value}`);
  }
  const opponent = Object.values(state.players).find((p) => !p.isMe);
  if (opponent) {
    parts.push(
      `${t('opponent')}: ${opponent.cubesLeft} ▪ ${opponent.handBirdCount} 🂠 ${opponent.food.reduce((a, b) => a + b, 0)} 🍽`
    );
  }
  return parts.join('\n');
}

const ROW_ACTION_KEY = { food: 'actionGainFood', egg: 'actionLayEggs', card: 'actionDrawCards' };
const ROW_UNIT_KEY = { food: 'unitFood', egg: 'unitEgg', card: 'unitCard' };

/** Names a move the way BGA's own buttons name it, so a hint reads as an instruction. */
export function moveName(t, birdName, action) {
  if (action.type === 'playBird') {
    return `${t('actionPlayBird')}: ${birdName(action.bird)} → ${habitatLabel(t, action.habitat)}`;
  }
  return `${habitatLabel(t, action.habitat)} — ${t(ROW_ACTION_KEY[action.info.unit])}`;
}

/** One-line rationale for a move: what it costs or what it yields. */
export function moveWhy(t, option) {
  const a = option.action;
  if (a.type === 'playBird') {
    return a.eggCost ? `${t('eggsNeeded')}: ${a.eggCost}` : t('noEggsNeeded');
  }
  const amount = a.info.gain + (a.trade ? 1 : 0);
  const unit = t(ROW_UNIT_KEY[a.info.unit]);
  return a.trade ? `+${amount} ${unit} (${t('tradeApplied')})` : `+${amount} ${unit}`;
}

/**
 * Evaluator ranking -> the panel's move list.
 * @param {object|null} result       return value of createEngine().suggest()
 * @param {(key: string) => string} birdName  key -> display name in the panel's own locale
 */
export function adviceMoves(result, t, birdName) {
  if (!result || !result.options) return [];
  return result.options.slice(0, 3).map((option) => ({
    name: moveName(t, birdName, option.action),
    why: moveWhy(t, option),
    delta: option.gain
  }));
}

/** A one-off toast for the notes list: recording started/stopped/resumed. */
export function recordingNotes(event, t) {
  if (!event) return [];
  const label =
    event.reason === 'gameEnd' ? t('recordingAutoSaved') :
    event.reason === 'resumed' ? t('recordingResumed') :
    t('recordingSaved');
  return [{ text: `${label} (${event.count})`, kind: 'ok' }];
}

export function buildView({ state, problems, t, mode, advice, recording, recordingEvent }) {
  return {
    headline: headline(state, t),
    status: statusLine(state, t),
    mode,
    moves: advice && advice.length ? advice.slice(0, 3) : [],
    detail: detailLine(state, t),
    recording: recording || { active: false, count: 0 },
    notes: [
      ...notes(state, problems, t),
      ...recordingNotes(recordingEvent, t),
      ...(state && state.myTurn && (!advice || !advice.length)
        ? [{ text: t('noAdviceYet'), kind: 'warn' }]
        : [])
    ]
  };
}
