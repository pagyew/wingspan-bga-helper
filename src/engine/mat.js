/**
 * Планшет игрока. Формулы взяты из исходников BGA (modules/script/Utility.js):
 *   getColumnFromLocation(loc)           = loc & 0b111          // колонка 1..5
 *   getHabitatFromLocation(loc)          = loc >> 3             // 1 лес, 2 степь, 3 болото
 *   getActionBasePowerFromColumn(col)    = ((col - 1) >> 1) + 1 // 1,1,2,2,3
 *   getEggsRequiredFromColumn(col)       = col >> 1             // 0,1,1,2,2
 * Значения сверены с реальной партией: степь даёт base+1 яиц (2,2,3,3,4),
 * лес — base корма (1,1,2,2,3), болото — base карт (1,1,2,2,3).
 */

export const HABITATS = ['forest', 'grassland', 'wetland'];

export const locOf = (habitat, column) => (HABITATS.indexOf(habitat) + 1) * 8 + column;
export const habitatOf = loc => HABITATS[(loc >> 3) - 1];
export const columnOf = loc => loc & 0b111;

/** Колонка, в которую встанет кубик действия при n птицах в ряду. */
export const actionColumn = n => Math.min(n + 1, 5);
/** Колонка, в которую ляжет следующая птица (null — ряд заполнен). */
export const playColumn = n => (n < 5 ? n + 1 : null);

export const basePower = col => ((col - 1) >> 1) + 1;
export const eggCost = col => col >> 1;
/** На чётных колонках доступен обмен: лес — карта→корм, степь — корм→яйцо, болото — яйцо→карта. */
export const hasTrade = col => col % 2 === 0;

/** Что даёт действие ряда при n своих птицах в этом ряду. */
export function rowAction(habitat, n) {
  const col = actionColumn(n);
  const base = basePower(col);
  const trade = hasTrade(col);
  if (habitat === 'forest')
    return { habitat, column: col, gain: base, unit: 'food', trade: trade ? { pay: 'card', get: 'food', n: 1 } : null };
  if (habitat === 'grassland')
    return { habitat, column: col, gain: base + 1, unit: 'egg', trade: trade ? { pay: 'food', get: 'egg', n: 1 } : null };
  return { habitat, column: col, gain: base, unit: 'card', trade: trade ? { pay: 'egg', get: 'card', n: 1 } : null };
}

/** Сколько ходов в раунде (1..4). */
export const turnsInRound = round => [8, 7, 6, 5][round - 1];
/** Сколько ходов у игрока останется ПОСЛЕ текущего, включая будущие раунды. */
export function turnsAfterThis(round, cubesLeftThisRound) {
  let t = Math.max(0, cubesLeftThisRound - 1);
  for (let r = round + 1; r <= 4; r++) t += turnsInRound(r);
  return t;
}
