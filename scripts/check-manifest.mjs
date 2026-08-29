// Catches the manifest mistakes that cost the most time: a content script that
// silently never runs, or a permission that quietly went missing.

import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));

assert.equal(manifest.manifest_version, 3, 'MV2 is not accepted by Chrome any more');
assert.ok(manifest.minimum_chrome_version, 'world:"MAIN" needs a minimum_chrome_version');

const worlds = manifest.content_scripts.map((cs) => cs.world);
assert.ok(worlds.includes('MAIN'), 'no MAIN-world script: gameui would be invisible');
assert.ok(worlds.includes('ISOLATED'), 'no ISOLATED-world script: chrome.* would be invisible');

for (const cs of manifest.content_scripts) {
  assert.equal(cs.all_frames, true, 'the game can live in an iframe — all_frames must be true');
  assert.ok(cs.matches.some((m) => m.startsWith('https://boardgamearena.com/')),
    'bare boardgamearena.com must be matched explicitly, not only *.boardgamearena.com');
  assert.ok(cs.matches.some((m) => m.includes('/archive/replay/')),
    'replays are the development harness — keep them matched');
}

console.log('manifest ok');
