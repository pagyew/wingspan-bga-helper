# Working on this repository

A Chrome extension (MV3) that reads a live game of Wingspan on Board Game Arena
and suggests the strongest next move. Read the READMEs for what it is;
this file is about how to work on it.

## Three invariants. Break any of them and the change is wrong.

1. **Read-only.** The extension may read the page, subscribe to notifications and
   draw its own panel. It must never click, drag, submit a move, or patch a BGA
   function. This is the line between an advisor and a bot, and it is also why the
   thing keeps working across BGA client updates.
2. **Never score an unknown as zero.** If a rule is not modelled or a value cannot
   be read, say so in the panel and in the return value. `validateState()` and the
   explicit throw in `scoreGoal()` exist for this. A wrong hint is worse than no hint.
3. **Two worlds, one bridge.** `gameui` exists only in the MAIN world; `chrome.*`
   exists only in the ISOLATED world. Neither script can do the other's job. All
   traffic goes through `window.postMessage` with the guards in
   `src/shared/protocol.js`. Do not try to shortcut this.

## Layout

```
manifest.json          source of truth; build.mjs copies it into dist/
src/page/collector.js  MAIN world: subscriptions, heartbeat, posts snapshots
src/page/state.js      collectState / validateState / card-db fingerprint
src/shared/protocol.js message names, version, origin guards
src/ui/boot.js         ISOLATED world: receives snapshots, drives the panel
src/ui/present.js      pure state -> view model (this is where tests live)
src/ui/panel.js        shadow-root panel; owns no game logic
src/ui/i18n.js         ru / en strings; follows the BGA page language
src/engine/            rules model: mat, scoring, evaluate (see docs/engine-port.md)
.engine-src/           the verified CommonJS original, gitignored — material for that port
test/                  node --test, no browser
scripts/               manifest and import-graph checks, packaging, bootstrap, board
.claude/skills/        project-flow: how milestones, issues and PRs are run here
```

The engine is ported and wired into the panel (milestone M2). What it does today
is rank single moves by `V(after) - V(before)`; what it is meant to become is in
`docs/roadmap.md` — a rules simulator, powers as data, a model of the unknown, and
search over a whole round. Read that before adding anything to `src/engine/`: several
of its constants are scheduled for deletion, not for tuning.

## Commands

```bash
npm install
npm test        # node --test test/*.test.js
npm run check   # manifest sanity + import graph (src/ must stay dependency-free)
npm run build   # esbuild -> dist/
npm run watch   # rebuild on change
npm run package # dist/ -> zip for chrome://extensions
npm run release # bump version, tag, push -> triggers release.yml to publish the zip
npm run board   # milestones, what is in progress, what is ready to pick up
```

Run `npm test && npm run check` before every commit. CI runs both on Node 20 and 22
plus the build; a red build is not "flaky", it is a real failure.

## How to test a change to reading or advising

Archived BGA replays are the harness — real objects, no opponent, scrubbable.
Load `dist/` at `chrome://extensions` with developer mode on, open a Wingspan
replay, and watch the panel. Replay **#906782034** is the reference game;
`docs/reference-game.md` has its final state and the exact six-row scoring the
engine must reproduce (91 : 89).

Do not add a browser dependency to the test suite. Anything worth asserting should
be expressible against a snapshot, which is why `Copy snapshot` exists.

## Where this is going, and how work is run

`docs/roadmap.md` holds the milestones B1-B9 that take this from a one-move advisor to
an engine that plans a round. `docs/process.md` holds the loop that gets there:
milestone -> tasks with an acceptance criterion -> branch -> PR -> acceptance -> a
number in `docs/benchmarks.md`. Two rules from it are worth repeating here because
they bite inside the code:

- **No task without an acceptance criterion** that a command answers yes or no.
- **A number never moves without the measurement that moved it.** Any change to
  weights, search or evaluation carries an arena or corpus number in the PR. The
  heuristic weights are exactly the thing that looks better after every edit and is
  worse a month later.

`.claude/skills/project-flow/SKILL.md` has the exact commands.

## Style

- Plain ESM, two-space indent, no dependencies in `src/` (the import check enforces it).
- Comments explain *why*, never restate the code. If a line encodes a rule that was
  verified against a real game, say which game.
- Commit messages: imperative, one line, scope first —
  `collector: fall back to the heartbeat when a topic is missing`.
- Every user-visible string exists in both `ru` and `en`. Action names quote BGA's
  own button labels so a hint reads as an instruction.

## Things that will bite you

- Content scripts are classic scripts: `import` does not work in them. That is what
  `build.mjs` (esbuild, IIFE) is for. Keep `src/` ESM anyway so Node can test it.
- Page CSP applies to the MAIN-world script. No `eval`, no injected inline code.
- MV3 evicts the service worker. It holds no state; it only relays the hotkey.
- During BGA animations the model is half-updated. Never evaluate a snapshot whose
  state name starts with `process` — `collectState` reports this as `stable: false`.
- `object_manager.current_round` is 0-based. Feeder die face `5` is the
  invertebrate/seed dual face, not nectar.
- BGA's deck is not exactly the base game: it can include Swift Start promos
  (`set: 1`). Read the composition off the page rather than assuming 170 cards.
