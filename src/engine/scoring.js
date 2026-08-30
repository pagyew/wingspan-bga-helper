/**
 * Wingspan (BGA, базовая игра) — подсчёт очков.
 * Работает и в Node (тесты), и в контент-скрипте расширения.
 */

const HABITATS = ['forest', 'grassland', 'wetland'];
export const FOODS = ['invertebrate', 'seed', 'fish', 'fruit', 'rodent'];

// Зелёное поле целей: очки за место по раундам. 1-е и 2-е места сверены
// с реальной партией BGA (4/1, 5/2, 6/3, 7/4); 3-е и 4-е — по правилам.
export const GREEN_BOARD = [
  [4, 1, 0, 0],
  [5, 2, 1, 0],
  [6, 3, 2, 0],
  [7, 4, 3, 0],
];

// --- разбор строки очков бонус-карты -------------------------------------
// "2 per bird" | "2 to 3 birds: 3; 4+ birds: 7" | "3 to 4 birds: 4; 5 birds: 8"
export function parseBonusVp(spec) {
  const per = /^(\d+)\s+per\s+bird$/i.exec(String(spec).trim());
  if (per) { const k = +per[1]; return n => n * k; }

  const clauses = String(spec).split(';').map(s => s.trim()).filter(Boolean).map(c => {
    const m = /^(\d+)(?:\s*(?:to|-)\s*(\d+))?\s*\+?\s*birds?\s*:\s*(\d+)$/i.exec(c);
    if (!m) throw new Error('не разобрана строка очков бонуса: ' + JSON.stringify(c));
    const lo = +m[1];
    const open = /\+/.test(c);
    const hi = m[2] ? +m[2] : (open ? Infinity : lo);
    return { lo, hi, vp: +m[3] };
  });
  return n => {
    let best = 0;
    for (const c of clauses) if (n >= c.lo && n <= c.hi) best = Math.max(best, c.vp);
    return best;
  };
}

// --- условия бонус-карт, зависящие от состояния, а не от самой карты ------
const STATE_BONUS = {
  breedingmanager: p => p.tableau.filter(b => b.eggs >= 4).length,
  oologist:        p => p.tableau.filter(b => b.eggs >= 1).length,
  visionaryleader: p => p.handBirdCount || 0,
  ecologist: p => Math.min(...HABITATS.map(h => p.tableau.filter(b => b.habitat === h).length)),
};

// --- цели раундов --------------------------------------------------------
// Гнездо-звезда (star / wild) считается как любой тип гнезда.
const nestMatches = (birdNest, want) => birdNest === want || birdNest === 'star' || birdNest === 'wild';

export function goalCounter(description) {
  const d = String(description).trim().toLowerCase();
  let m;

  if ((m = /^birds? with eggs? in (\w+) nests?$/.exec(d)))
    return p => p.tableau.filter(b => b.eggs > 0 && nestMatches(b.nest, m[1])).length;

  if ((m = /^eggs? in (\w+) nests?$/.exec(d)))
    return p => p.tableau.filter(b => nestMatches(b.nest, m[1])).reduce((a, b) => a + b.eggs, 0);

  if ((m = /^birds? in (?:the )?(forest|grassland|wetland)$/.exec(d)))
    return p => p.tableau.filter(b => b.habitat === m[1]).length;

  // BGA формулирует эту цель как "Eggs on birds in wetland"; держим оба варианта
  if ((m = /^eggs?(?: on birds?)? in (?:the )?(forest|grassland|wetland)$/.exec(d)))
    return p => p.tableau.filter(b => b.habitat === m[1]).reduce((a, b) => a + b.eggs, 0);

  if (/^total birds?$/.test(d)) return p => p.tableau.length;

  if (/sets? of eggs/.test(d))
    return p => Math.min(...HABITATS.map(h =>
      p.tableau.filter(b => b.habitat === h).reduce((a, b) => a + b.eggs, 0)));

  throw new Error('неизвестная цель раунда: ' + JSON.stringify(description));
}

/**
 * Раздать очки за одну цель. values — количества по игрокам.
 * Игроки с нулём не занимают мест. Ничья — сумма очков занятых мест,
 * делённая поровну с округлением вниз.
 */
export function scoreGoal(values, round, boardType) {
  if (boardType !== 'green') {
    throw new Error('синее поле целей ещё не реализовано (нужна партия на нём для сверки)');
  }
  const table = GREEN_BOARD[round];
  const out = values.map(() => 0);
  const idx = values.map((_, i) => i).filter(i => values[i] > 0);
  idx.sort((a, b) => values[b] - values[a]);

  let place = 0, i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && values[idx[j + 1]] === values[idx[i]]) j++;
    const tied = j - i + 1;
    let pot = 0;
    for (let k = 0; k < tied; k++) pot += table[place + k] || 0;
    const each = Math.floor(pot / tied);
    for (let k = i; k <= j; k++) out[idx[k]] = each;
    place += tied;
    i = j + 1;
  }
  return out;
}

// --- основной подсчёт ----------------------------------------------------
export function scoreGame(state) {
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const byKey = new Map(state.birds.map(b => [b.key, b]));
  const bonusByKey = new Map(state.bonusCards.map(b => [b.key, b]));

  const players = state.players.map(p => ({
    ...p,
    tableau: p.tableau.map(b => {
      const ref = byKey.get(norm(b.name));
      if (!ref) throw new Error('птица не найдена в справочнике: ' + b.name);
      return {
        name: ref.name, habitat: b.habitat,
        eggs: b.eggs || 0, tucked: b.tucked || 0, cached: b.cached || 0,
        vp: ref.vp, nest: ref.nest, bonus: ref.bonus,
      };
    }),
  }));

  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

  const goalValues = state.goals.map(g => g.values || players.map(goalCounter(g.description)));
  const goalScores = state.goals.map((g, r) => scoreGoal(goalValues[r], r, state.goalBoard));

  return players.map((p, pi) => {
    const birds = sum(p.tableau, b => b.vp);
    const eggs = sum(p.tableau, b => b.eggs);
    const cached = sum(p.tableau, b => b.cached);
    const tucked = sum(p.tableau, b => b.tucked);

    const bonusDetail = (p.bonus || []).map(key => {
      const card = bonusByKey.get(key);
      if (!card) throw new Error('бонус-карта не найдена: ' + key);
      const count = STATE_BONUS[key]
        ? STATE_BONUS[key](p)
        : p.tableau.filter(b => b.bonus.includes(key)).length;
      return { card: card.name, key, count, vp: parseBonusVp(card.vp)(count) };
    });
    const bonus = sum(bonusDetail, b => b.vp);
    const goals = sum(goalScores, g => g[pi]);

    return {
      name: p.name, birds, bonus, goals, eggs, cached, tucked,
      total: birds + bonus + goals + eggs + cached + tucked,
      bonusDetail,
      goalDetail: state.goals.map((g, r) => ({
        round: r + 1, goal: g.description, value: goalValues[r][pi], vp: goalScores[r][pi],
      })),
    };
  });
}

export { HABITATS };
