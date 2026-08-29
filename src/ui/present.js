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

export function buildView({ state, problems, t, mode, advice }) {
  return {
    headline: headline(state, t),
    status: statusLine(state, t),
    mode,
    moves: advice && advice.length ? advice.slice(0, 3) : [],
    detail: detailLine(state, t),
    notes: [
      ...notes(state, problems, t),
      ...(state && state.myTurn && (!advice || !advice.length)
        ? [{ text: t('noAdviceYet'), kind: 'warn' }]
        : [])
    ]
  };
}
