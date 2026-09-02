# Wingspan Helper (BGA)

[![CI](https://github.com/pagyew/wingspan-bga-helper/actions/workflows/ci.yml/badge.svg)](https://github.com/pagyew/wingspan-bga-helper/actions/workflows/ci.yml)
[![License: GPL v3](https://img.shields.io/badge/license-GPL--3.0-blue.svg)](LICENSE)

*Читать по-русски: [README.ru.md](README.ru.md)*

A Chrome extension that reads a game of **Wingspan** on
[Board Game Arena](https://boardgamearena.com) and tells you which move is worth
the most victory points — and why.

It reads the position; it never plays it. No clicking, no dragging, no submitting.

---

## Why read the state instead of looking at it

A screenshot of a Wingspan mat is slow to take and hard to parse: eggs are 12-pixel
blobs and the page scrolls while you think. None of that is necessary. The BGA
client keeps the whole game in JavaScript objects on the page — exact food counts,
exact egg placement, exact card costs, and BGA's own live calculation of round-goal
standings. The extension reads those objects directly.

Working that out took a full pass through the client's source and two complete
replays. The findings are written up in
[docs/bga-game-state.md](docs/bga-game-state.md) — useful on its own if you are
building anything else for BGA.

## Status

Early, and honest about it. The bridge, the state reader and the evaluator all work:
the panel ranks the moves available right now and says by how much each one is ahead.
What it does not yet do is think past this turn — which is the whole of
[docs/roadmap.md](docs/roadmap.md), a nine-milestone path from a one-move advisor to
an engine that plans a round, names the card to take and the bird to put the egg on,
and can be measured against real games. [docs/plan.md](docs/plan.md) covers the
extension itself; [docs/process.md](docs/process.md) covers how the work runs.

What already exists:

- MAIN/ISOLATED content-script bridge over `window.postMessage`
- a state reader verified against two finished games
- an overlay panel in a shadow root, draggable, bilingual (ru / en)
- notification subscriptions plus a heartbeat that survives a BGA rename
- `validateState`, so a snapshot taken mid-animation is refused rather than scored

The scoring and evaluation modules were verified against two finished games — all six
scoring rows for both players (91 : 89 and 87 : 86) — before this repository existed,
and now live in `src/engine/`. That verified scoring is the floor everything else is
built on: the engine's guesses are labelled as guesses, and its arithmetic is not.

## Before you install it

Board Game Arena's terms of use prohibit using "devices or software other than
those provided by BGA" to extract or modify site content. **This extension fits
that description**, even though it only reads and never acts.

Read that as it is meant: replays, solo games and casual games are the ground this
was built for. Using it in a ranked game against a person puts your account at
risk, and that is your call to make, not the tool's. It is deliberately not
published to the Chrome Web Store, and it will never click for you — that line is
what separates an advisor from a bot, both in substance and in consequence.

## Install

From a release:

1. Download `wingspan-bga-helper-<version>.zip` from
   [Releases](https://github.com/pagyew/wingspan-bga-helper/releases) and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**.
3. **Load unpacked** → pick the unzipped folder.

Requires Chrome 111 or newer: the manifest declares a content script with
`world: "MAIN"`, which is what makes `gameui` reachable at all.

From source:

```bash
npm install
npm run build      # -> dist/
npm test
```

Then load `dist/` as an unpacked extension.

## How it works

`gameui` belongs to the page, not to the extension, so a content script in the
isolated world cannot see it. The reverse is equally true: `chrome.runtime` is
undefined in the MAIN world. Two scripts, two worlds, one `postMessage` bridge:

| Script | World | Sees | Does |
|---|---|---|---|
| `src/page/collector.js` | `MAIN` | `gameui`, `dojo` | reads the model, posts snapshots |
| `src/ui/boot.js` | `ISOLATED` | `chrome.*` | evaluates, draws the panel, stores settings |

Both run with `all_frames: true` — the game is sometimes inside `#gameIframe` and
sometimes a document of its own — and only the frame that actually has `gameui`
draws a panel.

## Development

Archived replays are the harness: the same objects as a live game, no opponent, and
you can scrub back and forth. Open any Wingspan replay with the extension loaded and
the panel comes up.

```bash
npm run watch      # rebuild on change
npm test           # node --test, no browser needed
npm run check      # manifest sanity: worlds, all_frames, match patterns
npm run package    # dist/ -> a zip ready for chrome://extensions
```

The panel's **Copy snapshot** button puts the current position on the clipboard as
JSON. That is how a live game becomes a test fixture.

**Start recording** captures every snapshot for a whole game and downloads it as
one JSON file when the game reaches `gameEnd` (or when you stop it manually) — a
bulk version of the same idea, meant for handing a finished game to an LLM for
analysis rather than hand-picking one fixture.

### Cutting a release

```bash
npm run release -- patch   # or: minor / major
```

This must run on an up-to-date, clean `main`. It runs `check` and `test`, bumps
`package.json` with `npm version`, and pushes the commit and tag. The pushed tag
triggers `.github/workflows/release.yml`, which builds, packages and publishes
`wingspan-bga-helper-<version>.zip` as a GitHub Release.

## Language

The panel follows the language of the BGA page, because it quotes BGA's own button
names — a hint should read as an instruction you can act on. Override it in the
extension options if you prefer.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
The most valuable contribution right now is finished games as fixtures, especially
on the **blue** goal board, which is not supported yet because its scoring table
lives on BGA's server rather than in the client.

## License

[GPL-3.0-or-later](LICENSE).

Wingspan is a game by Elizabeth Hargrave, published by Stonemaier Games. This is an
unofficial, non-commercial fan project with no affiliation to Stonemaier Games or to
Board Game Arena. No card text or artwork is redistributed here: the extension reads
the data the BGA client has already loaded into the page.
