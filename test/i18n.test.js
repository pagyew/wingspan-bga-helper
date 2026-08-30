// Issue #7: "every string the panel can show exists in ru and en, and a
// missing key is visible in tests rather than falling through silently."
// translator() itself falls back en -> key name if a lookup misses, which
// keeps a typo visible on screen but not in CI — this test is what makes a
// one-sided key addition fail the build instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { translator, SUPPORTED } from '../src/ui/i18n.js';

const source = readFileSync(fileURLToPath(new URL('../src/ui/i18n.js', import.meta.url)), 'utf8');

function dictKeys(locale) {
  const braceLine = source.indexOf(`  ${locale}: {`);
  const start = source.indexOf('\n', braceLine) + 1; // skip the "en: {" line itself
  const end = source.indexOf('\n  }', start);
  const body = source.slice(start, end);
  return [...body.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]);
}

test('ru and en support the same two locales', () => {
  assert.deepEqual(SUPPORTED.slice().sort(), ['en', 'ru']);
});

test('every key defined in en also exists in ru, and vice versa', () => {
  const en = new Set(dictKeys('en'));
  const ru = new Set(dictKeys('ru'));
  const onlyEn = [...en].filter((k) => !ru.has(k));
  const onlyRu = [...ru].filter((k) => !en.has(k));
  assert.deepEqual(onlyEn, [], 'keys present in en but missing from ru');
  assert.deepEqual(onlyRu, [], 'keys present in ru but missing from en');
});

test('action names quote BGA\'s own buttons, in both languages', () => {
  const en = translator('en');
  const ru = translator('ru');
  assert.equal(en('actionPlayBird'), 'Play a bird');
  assert.equal(en('actionGainFood'), 'Gain food');
  assert.equal(en('actionLayEggs'), 'Lay eggs');
  assert.equal(en('actionDrawCards'), 'Draw bird cards');
  assert.equal(ru('actionPlayBird'), 'Сыграть птицу');
  assert.equal(ru('actionGainFood'), 'Взять еду');
  assert.equal(ru('actionLayEggs'), 'Положить яйца');
  assert.equal(ru('actionDrawCards'), 'Взять карты птиц');
});
