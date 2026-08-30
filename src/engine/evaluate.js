/**
 * Оценщик ходов Wingspan.
 *
 * Идея: ценность позиции в «ожидаемых победных очках». Ход оценивается разницей
 *   V(позиция после хода) - V(позиция сейчас),
 * обе — на одном и том же горизонте оставшихся ходов, так что сам факт траты
 * хода в разницу не попадает и числа читаются как «сколько добавил этот ход».
 *
 * Часть слагаемых точная (очки птиц, яйца, подложенные карты, запас, бонус-карты,
 * цели раундов — считаются тем же модулем, что сверен с партией BGA),
 * часть эвристическая (во что оценивать корм, карты в руке и способности птиц) —
 * все коэффициенты собраны в WEIGHTS и предназначены для настройки.
 */

import * as M from './mat.js';
import { goalCounter, scoreGoal, parseBonusVp } from './scoring.js';

export const FOODS = ['invertebrate', 'seed', 'fish', 'fruit', 'rodent'];

export const WEIGHTS = {
  // корм и карты обесцениваются к концу партии: их не успеть потратить
  foodMin: 0.25, foodMax: 0.90, foodHorizon: 12,
  cardMin: 0.20, cardMax: 0.95, cardHorizon: 12,
  // яйцо стоит ровно 1 ПО плюс небольшая надбавка за вклад в цели и бонусы
  eggExtra: 0.15,
  // цели будущих раундов учитываем вполсилы, текущего — полностью
  futureGoal: 0.5,
  // доля ходов, приходящаяся на один ряд
  rowShare: 1 / 3,
  // розовые способности срабатывают на чужих ходах и не всегда
  pinkFactor: 0.45,
  // ценность одного срабатывания способности: по тексту, если он разобран,
  // иначе — по категории BGA (см. powerValue ниже)
  huntChance: 0.55,        // «бросьте кубики; если выпало X» — доля успеха
  sharedFactor: 0.8,       // «все игроки получают» — выгода не только наша
  eachBirdFactor: 2.2,     // «на каждой вашей птице с гнездом X» — средний охват
  bonusDraw: 2.0,          // «возьмите 2 бонус-карты, оставьте 1»
  power: (cat, c) => ({
    caching: 1.0,
    carddraw: 1.2 * c.cardVp + 0.10,
    egglaying: 1.0,
    flocking: 1.0,
    foodfromfeeder: 1.0 * c.foodVp,
    foodfromsupply: 1.1 * c.foodVp,
    foodrelated: 0.7 * c.foodVp,
    hunting: 0.8,
    other: 0.4,
    none: 0,
  }[cat] ?? 0.4),
};

/**
 * Оценка одного срабатывания способности по её тексту.
 * Возвращает null, если текст не разобран — тогда берётся оценка по категории.
 */
export function powerValue(bird, c, W) {
  const t = String(bird.power || '').toLowerCase();
  if (!t) return 0;
  const n = re => { const m = re.exec(t); return m ? parseInt(m[1], 10) : null; };
  let v = 0, hit = false;
  const add = (x) => { v += x; hit = true; };

  let k;
  if ((k = n(/lay (\d+) \[egg\]/))) add(k * (/on each of your birds/.test(t) ? W.eachBirdFactor : 1));
  if ((k = n(/tuck (\d+) \[card\]/))) {
    add(k);
    if (/tuck \d+ \[card\] from your hand/.test(t)) v -= c.cardVp;   // карта уходит из руки
  }
  if ((k = n(/cache (\d+) \[/))) add(k);
  if ((k = n(/draw (\d+) \[card\]/))) add(k * c.cardVp);
  if (/draw \[card\] equal to the number of players/.test(t)) add(1.2 * c.cardVp);
  if ((k = n(/gain (\d+) \[/))) add(k * c.foodVp);
  if (/gain all \[/.test(t)) add(2 * c.foodVp);
  if (/bonus cards? and keep/.test(t)) add(W.bonusDraw);

  if (!hit) return null;

  if (/if any are \[/.test(t)) v *= W.huntChance;      // охота через бросок кубиков
  if (/if available/.test(t)) v *= 0.85;
  if (/all players|each player/.test(t)) v *= W.sharedFactor;

  if ((k = n(/discard (\d+) \[egg\]/))) v -= k;
  if ((k = n(/discard (\d+) \[card\]/))) v -= k * c.cardVp;
  if (/discard \d+ \[(seed|fish|fruit|rodent|invertebrate|wild)\]/.test(t)) v -= c.foodVp;

  // способность с издержками почти всегда необязательная — от неё можно отказаться,
  // поэтому в минус она птицу не тянет
  return Math.max(0, v);
}

const clone = o => JSON.parse(JSON.stringify(o));
const sum = a => a.reduce((x, y) => x + y, 0);

export function rates(turnsLeft, W) {
  const t = Math.max(0, turnsLeft);
  const f = Math.min(1, t / W.foodHorizon), c = Math.min(1, t / W.cardHorizon);
  return {
    foodVp: W.foodMin + (W.foodMax - W.foodMin) * f,
    cardVp: W.cardMin + (W.cardMax - W.cardMin) * c,
  };
}

// ------------------------------------------------------------------ точная часть
function exactValue(state, pi, W) {
  const db = state.db, P = state.players[pi];
  const t = P.tableau.map(b => {
    if (!db[b.key]) throw new Error('птица не найдена в справочнике: ' + b.key);
    return { ...db[b.key], ...b };
  });

  const birds = sum(t.map(b => b.vp));
  const eggs = sum(t.map(b => b.eggs || 0));
  const tucked = sum(t.map(b => b.tucked || 0));
  const cached = sum(t.map(b => b.cached || 0));

  const asPlayer = p => ({
    tableau: p.tableau.map(b => ({ ...db[b.key], ...b, eggs: b.eggs || 0 })),
    handBirdCount: p.handBirds ? p.handBirds.length : (p.handBirdCount || 0),
  });

  let goals = 0;
  state.goals.forEach((g, r) => {
    const round = r + 1;
    if (round < state.round) return;              // уже отыграно — константа
    const weight = round === state.round ? 1 : W.futureGoal;
    const values = state.players.map(p => goalCounter(g.description)(asPlayer(p)));
    goals += scoreGoal(values, r, state.goalBoard)[pi] * weight;
  });

  const bonus = sum((P.bonus || []).map(key => {
    const card = state.bonusByKey[key];
    if (!card) return 0;
    const STATE = {
      breedingmanager: p => p.tableau.filter(b => b.eggs >= 4).length,
      oologist: p => p.tableau.filter(b => b.eggs >= 1).length,
      visionaryleader: p => p.handBirdCount,
      ecologist: p => Math.min(...M.HABITATS.map(h => p.tableau.filter(b => b.habitat === h).length)),
    };
    const pl = asPlayer(P);
    const n = STATE[key] ? STATE[key](pl) : pl.tableau.filter(b => (b.bonus || []).includes(key)).length;
    return parseBonusVp(card.vp)(n);
  }));

  return { birds, eggs, tucked, cached, goals, bonus, total: birds + eggs + tucked + cached + goals + bonus };
}

// ------------------------------------------------------- эвристическая часть
function engineValue(state, pi, turnsLeft, W) {
  const db = state.db, P = state.players[pi];
  const c = rates(turnsLeft, W);
  const uses = Math.max(0, turnsLeft) * W.rowShare;
  const unit = { food: c.foodVp, egg: 1 + W.eggExtra, card: c.cardVp };

  let rows = 0, powers = 0;
  for (const h of M.HABITATS) {
    const inRow = P.tableau.filter(b => b.habitat === h);
    const ra = M.rowAction(h, inRow.length);
    rows += uses * ra.gain * unit[ra.unit];
    for (const b of inRow) {
      const ref = db[b.key];
      if (!ref) continue;
      const est = powerValue(ref, c, W);
      const v = est === null ? W.power(ref.category, c) : est;
      if (ref.color === 'brown') powers += uses * v;
      else if (ref.color === 'pink') powers += turnsLeft * (state.players.length - 1) * W.pinkFactor * v;
    }
  }
  const resources = sum(P.food) * c.foodVp
    + (P.handBirds ? P.handBirds.length : P.handBirdCount || 0) * c.cardVp;

  return { rows, powers, resources, total: rows + powers + resources };
}

export function positionValue(state, pi, turnsLeft, W = WEIGHTS) {
  const e = exactValue(state, pi, W);
  const g = engineValue(state, pi, turnsLeft, W);
  return { total: e.total + g.total, exact: e, engine: g };
}

// ------------------------------------------------------------------- действия
const freeSlots = (P, h) => 5 - P.tableau.filter(b => b.habitat === h).length;

function canPay(food, cost, wild) {
  const left = food.slice();
  for (let i = 0; i < 5; i++) { if (left[i] < cost[i]) return null; left[i] -= cost[i]; }
  if (sum(left) < wild) return null;
  return left;
}

/** Оплата: сперва точные типы, «любой» корм берём из самого многочисленного. */
function payFood(food, cost, wild) {
  const left = canPay(food, cost, wild);
  if (!left) return null;
  for (let k = 0; k < wild; k++) {
    let best = -1;
    for (let i = 0; i < 5; i++) if (left[i] > 0 && (best < 0 || left[i] > left[best])) best = i;
    left[best]--;
  }
  return left;
}

/** Разложить n яиц по птицам жадно: каждое — туда, где позиция дороже. */
function layEggs(state, pi, n, turnsLeft, W) {
  const db = state.db;
  for (let k = 0; k < n; k++) {
    let bestIdx = -1, bestVal = -Infinity;
    state.players[pi].tableau.forEach((b, i) => {
      const cap = db[b.key].eggLimit;
      if ((b.eggs || 0) >= cap) return;
      b.eggs = (b.eggs || 0) + 1;
      const v = positionValue(state, pi, turnsLeft, W).total;
      b.eggs--;
      if (v > bestVal) { bestVal = v; bestIdx = i; }
    });
    if (bestIdx < 0) return k;                       // класть больше некуда
    const b = state.players[pi].tableau[bestIdx];
    b.eggs = (b.eggs || 0) + 1;
  }
  return n;
}

/** Снять n яиц с наименьшими потерями. */
function removeEggs(state, pi, n, turnsLeft, W) {
  for (let k = 0; k < n; k++) {
    let bestIdx = -1, bestVal = -Infinity;
    state.players[pi].tableau.forEach((b, i) => {
      if (!(b.eggs > 0)) return;
      b.eggs--;
      const v = positionValue(state, pi, turnsLeft, W).total;
      b.eggs++;
      if (v > bestVal) { bestVal = v; bestIdx = i; }
    });
    if (bestIdx < 0) return false;
    state.players[pi].tableau[bestIdx].eggs--;
  }
  return true;
}

/** Какой корм взять из кормушки: тот, которого больше всего не хватает на руках. */
function pickFood(state, pi, n) {
  const db = state.db, P = state.players[pi];
  const need = [0, 0, 0, 0, 0];
  for (const key of P.handBirds || []) {
    const b = db[key]; if (!b) continue;
    for (let i = 0; i < 5; i++) need[i] += Math.max(0, b.food[i] - P.food[i]);
  }
  const avail = [0, 0, 0, 0, 0];
  for (const face of state.feeder) {
    if (face.includes('|')) face.split('|').forEach(f => { avail[FOODS.indexOf(f)] += 0.5; });
    else if (FOODS.includes(face)) avail[FOODS.indexOf(face)]++;
  }
  const got = [0, 0, 0, 0, 0];
  for (let k = 0; k < n; k++) {
    let best = -1, bestScore = -Infinity;
    for (let i = 0; i < 5; i++) {
      if (avail[i] - got[i] < 0.5) continue;
      const s = need[i] * 10 + avail[i];
      if (s > bestScore) { bestScore = s; best = i; }
    }
    if (best < 0) break;
    got[best]++;
  }
  return got;
}

export function enumerateActions(state, pi) {
  const db = state.db, P = state.players[pi], out = [];
  for (const h of M.HABITATS) {
    const n = P.tableau.filter(b => b.habitat === h).length;
    const ra = M.rowAction(h, n);
    out.push({ type: 'row', habitat: h, trade: false, info: ra });
    if (ra.trade) out.push({ type: 'row', habitat: h, trade: true, info: ra });
  }
  for (const key of P.handBirds || []) {
    const b = db[key]; if (!b) continue;
    M.HABITATS.forEach((h, hi) => {
      if (!b.habitat[hi] || freeSlots(P, h) <= 0) return;
      const col = M.playColumn(P.tableau.filter(x => x.habitat === h).length);
      const eggs = M.eggCost(col);
      if (!canPay(P.food, b.food, b.foodWild)) return;
      if (sum(P.tableau.map(x => x.eggs || 0)) < eggs) return;
      out.push({ type: 'playBird', bird: key, habitat: h, column: col, eggCost: eggs, info: b });
    });
  }
  return out;
}

export function applyAction(state, pi, action, turnsLeft, W) {
  const s = clone(state); s.db = state.db; s.bonusByKey = state.bonusByKey;
  const P = s.players[pi], db = s.db;
  const note = [];

  if (action.type === 'row') {
    const ra = action.info;
    if (ra.unit === 'food') {
      let n = ra.gain;
      if (action.trade && (P.handBirds || []).length > 0) {
        P.handBirds.pop(); n += 1; note.push('сбросив карту, +1 корм');
      }
      const got = pickFood(s, pi, n);
      got.forEach((k, i) => { P.food[i] += k; });
      note.push('корм: ' + got.map((k, i) => k ? `${k}×${FOODS[i]}` : '').filter(Boolean).join(', '));
    } else if (ra.unit === 'egg') {
      let n = ra.gain;
      if (action.trade && sum(P.food) > 0) {
        const i = P.food.findIndex(x => x > 0); P.food[i]--; n += 1;
        note.push('сбросив корм, +1 яйцо');
      }
      const laid = layEggs(s, pi, n, turnsLeft, W);
      note.push(`яиц отложено: ${laid}`);
    } else {
      let n = ra.gain;
      if (action.trade && sum(P.tableau.map(b => b.eggs || 0)) > 0) {
        removeEggs(s, pi, 1, turnsLeft, W); n += 1; note.push('отдав яйцо, +1 карта');
      }
      const trayBest = (s.tray || []).slice()
        .sort((a, b) => (db[b] ? db[b].vp : 0) - (db[a] ? db[a].vp : 0));
      for (let k = 0; k < n; k++) {
        if (trayBest[k]) { P.handBirds.push(trayBest[k]); s.tray = s.tray.filter(x => x !== trayBest[k]); }
        else P.handBirds.push(null);               // из колоды — карта неизвестна
      }
      note.push(`карт взято: ${n}`);
    }
  } else {
    const b = db[action.bird];
    P.food = payFood(P.food, b.food, b.foodWild);
    if (action.eggCost) removeEggs(s, pi, action.eggCost, turnsLeft, W);
    P.handBirds = P.handBirds.filter((k, i) => !(k === action.bird && P.handBirds.indexOf(action.bird) === i));
    P.tableau.push({ key: action.bird, habitat: action.habitat, eggs: 0, tucked: 0, cached: 0 });
    note.push(`колонка ${action.column}` + (action.eggCost ? `, отдано яиц: ${action.eggCost}` : ', яйца не нужны'));
    if (b.color === 'white') note.push('одноразовая способность при розыгрыше');
  }
  return { state: s, note };
}

// неизвестная карта из колоды: усреднённая птица
function withUnknownCards(state) {
  const s = state;
  const avg = { key: '__unknown__', name: 'карта из колоды', vp: 3, nest: 'none', eggLimit: 2,
    wingspan: 50, habitat: [true, true, true], food: [1, 1, 0, 0, 0], foodWild: 0, totalFood: 2,
    color: 'none', category: 'none', bonus: [] };
  s.db.__unknown__ = avg;
  for (const p of s.players) p.handBirds = (p.handBirds || []).map(k => k === null ? '__unknown__' : k);
  return s;
}

/** Главная функция: вернуть ходы, отсортированные по ожидаемому приросту очков. */
export function evaluateTurn(input, W = WEIGHTS) {
  const state = clone(input);
  state.db = input.db; state.bonusByKey = input.bonusByKey;
  const pi = 0;
  const turnsNow = M.turnsAfterThis(state.round, state.cubesLeft) + 1;
  // Базу считаем на том же горизонте, что и позиции после хода: ход тратится
  // в любом варианте, поэтому его стоимость не должна попадать в разницу.
  const before = positionValue(state, pi, turnsNow - 1, W);

  const c = rates(turnsNow - 1, W);
  const options = enumerateActions(state, pi).map(action => {
    const { state: after, note } = applyAction(state, pi, action, turnsNow - 1, W);
    withUnknownCards(after);
    const v = positionValue(after, pi, turnsNow - 1, W);
    // Белая способность срабатывает один раз при розыгрыше — в оценке позиции
    // её нет, добавляем отдельным слагаемым.
    let oneShot = 0;
    if (action.type === 'playBird') {
      const b = state.db[action.bird];
      if (b.color === 'white') {
        const est = powerValue(b, c, W);
        oneShot = est === null ? W.power(b.category, c) : est;
      }
    }
    return {
      action, note, oneShot: +oneShot.toFixed(3),
      gain: +(v.total - before.total + oneShot).toFixed(3),
      after: v, label: describe(action, state.db),
    };
  });

  options.sort((a, b) => b.gain - a.gain);
  return { before, options, turnsLeft: turnsNow };
}

function describe(a, db) {
  const RU = { forest: 'Лес (корм)', grassland: 'Степь (яйца)', wetland: 'Болото (карты)' };
  if (a.type === 'row') return `${RU[a.habitat]}: ${a.info.gain} ${{ food: 'корма', egg: 'яиц', card: 'карт' }[a.info.unit]}` + (a.trade ? ' + обмен' : '');
  return `Сыграть птицу: ${db[a.bird].name} → ${RU[a.habitat].split(' ')[0]}`;
}

/** Короткая рекомендация словами. */
export function advise(result, db, top = 3) {
  const best = result.options[0];
  if (!best) return 'Ходов нет.';
  const lines = [`Лучший ход: ${best.label}  (+${best.gain.toFixed(2)} ПО)`];
  if (best.note.length) lines.push('  ' + best.note.join('; '));
  const rest = result.options.slice(1, top);
  if (rest.length) lines.push('Альтернативы: ' + rest.map(o => `${o.label} (+${o.gain.toFixed(2)})`).join(' · '));
  const margin = rest.length ? best.gain - rest[0].gain : Infinity;
  if (margin < 0.5) lines.push('  Разрыв невелик — вариант близок к равноценному.');
  return lines.join('\n');
}
