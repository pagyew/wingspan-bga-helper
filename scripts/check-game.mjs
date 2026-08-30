// Ported from .engine-src/check-game.js — see docs/engine-port.md.
//
// Sverка калькулятора с реальной партией BGA.
//   node scripts/check-game.mjs test/fixtures/<файл>.json
// Фикстура — состояние, снятое collectState(), плюс ожидаемые числа из журнала.
import { readFileSync } from 'node:fs';
import birds from '../src/engine/data/birds.js';
import bonusCards from '../src/engine/data/bonus.js';
import { scoreGame, goalCounter } from '../src/engine/scoring.js';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/check-game.mjs <fixture.json>');
  process.exit(1);
}
const fx = JSON.parse(readFileSync(file, 'utf8'));

let fails = 0;
const check = (label, got, want) => {
  const ok = got === want; if (!ok) fails++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label.padEnd(40)} ${String(got).padStart(4)} / ${String(want).padStart(4)}`);
};

console.log(`\n=== ${file} — стол #${fx.table} ===`);

// цели, которые считаются по финальному планшету (обычно только цель 4-го раунда)
const enrich = p => ({
  tableau: p.tableau.map(b => {
    const ref = birds.find(x => x.key === b.key);
    if (!ref) throw new Error('нет в справочнике: ' + b.key);
    return { ...b, nest: ref.nest, vp: ref.vp, eggs: b.eggs || 0 };
  }),
  handBirdCount: p.handBirdCount || 0,
});
fx.goals.forEach((g, r) => {
  if (g.historic) return;
  const f = goalCounter(g.description);
  fx.players.forEach((p, i) => check(`цель Р${r + 1}: ${g.description}`, f(enrich(p)), g.recorded[i]));
});

const goals = fx.goals.map(g => (g.historic ? { ...g, values: g.recorded } : { description: g.description }));
const players = fx.players.map(p => ({
  name: p.name, handBirdCount: p.handBirdCount || 0, bonus: p.bonus,
  tableau: p.tableau.map(b => ({ name: b.key, habitat: b.habitat, eggs: b.eggs || 0, tucked: b.tucked || 0, cached: b.cached || 0 })),
}));
const res = scoreGame({ birds, bonusCards, goalBoard: fx.goalBoard, goals, players });

for (const r of res) {
  console.log(`\n-- ${r.name} --`);
  const want = fx.expected[r.name];
  for (const k of ['birds', 'bonus', 'goals', 'eggs', 'cached', 'tucked', 'total']) check(k, r[k], want[k]);
  console.log('   бонус:', r.bonusDetail.map(b => `${b.card} × ${b.count} = ${b.vp}`).join(', ') || '—');
  console.log('   цели :', r.goalDetail.map(g => `Р${g.round} ${g.value}шт→${g.vp}`).join('  '));
}
console.log(fails === 0 ? '\nВСЁ СОШЛОСЬ\n' : `\nРАСХОЖДЕНИЙ: ${fails}\n`);
process.exit(fails ? 1 : 0);
