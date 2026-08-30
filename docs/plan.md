# Roadmap

Russian original: [plan.ru.md](plan.ru.md).

## Decisions already made

| Question | Answer |
|---|---|
| UI shape | a floating overlay panel on the BGA page |
| When it computes | automatically, plus a watch mode that also runs on the opponent's turn |
| What it shows | the top three moves with a VP delta and one line of reasoning each |
| Distribution | built from source, zipped by CI, published on GitHub Releases — not the Web Store |
| Languages | Russian and English, following the BGA page language by default |

## Architecture

`gameui` is an object belonging to the **page**, not to the extension. A content
script in the isolated world cannot see it. The reverse is true too and matters
just as much: `chrome.runtime` is undefined in the MAIN world, so the script that
can read the game cannot talk to the extension. Everything else follows from that.

```
┌─ boardgamearena.com tab ────────────────────────────────────────────┐
│                                                                     │
│  MAIN world                          ISOLATED world                 │
│  ──────────                          ──────────────                 │
│  sees gameui, dojo                   sees chrome.*                  │
│  no chrome.*                         no gameui                      │
│                                                                     │
│  src/page/collector.js               src/ui/boot.js                 │
│   • collectState()                    • engine: mat/scoring/evaluate│
│   • dojo subscriptions                • panel in a shadow root      │
│   • 1 s heartbeat fallback            • settings, weight profiles   │
│           │                                    ▲                    │
│           └────── window.postMessage ──────────┘                    │
└─────────────────────────────────────────────────────────────────────┘
                              │ chrome.runtime (settings and the hotkey only)
                              ▼
                        src/sw.js — deliberately thin
```

The engine evaluates in the ISOLATED world rather than in MAIN, so no extension
code lands in the page's globals, `chrome.storage` is available for weights, and
only a JSON snapshot crosses the boundary.

**Frames.** The game is sometimes the content of `#gameIframe` on
`tableview?table=…` and sometimes a document of its own at `/<ver>/wingspan?table=…`.
Both content scripts therefore run with `all_frames: true`, and only the frame
where `gameui` was found renders a panel.

**Two event sources, both needed.** Dojo notifications are the fast path. A 1-second
heartbeat that diffs a handful of counters is the insurance: if a BGA update renames
a notification, the subscriptions go quiet with no error, and a stuck panel looks
like our bug. On top of both: a 300 ms debounce, and no evaluation at all while the
game state name starts with `process` — during animations the model is half-updated.

Nothing in the page is patched or written to. Staying read-only is both the point
of the tool and the main reason it survives client updates.

## Milestones

| # | Milestone | Done when |
|---|---|---|
| **M0** | Skeleton: manifest, two worlds, bridge, panel | on a replay the panel reads "Round 3 · pagyew 34 : Exixel 29" |
| **M1** | Live state: `collectState`, `validateState`, `stable`, subscriptions + heartbeat | scrubbing a replay end to end updates the panel every turn with no `undefined` in the tray |
| **M2** | Advice: engine wired in, top three moves, localized action names | on turn 122 of game #906484481 the top move is "Grassland — lay 3 eggs", matching the archived game |
| **M3** | Watch mode and sub-decisions | the panel tracks goal progress matching `gamedatas.goals`, and answers the feeder-dice dialog |
| **M4** | Debug loop: "copy snapshot" produces a fixture | a snapshot from a live game passes the scorer check unedited |
| **M5** | Tune `evaluate.WEIGHTS` on archived games | top-1 / top-3 agreement with a strong player's actual move is measured, and improves |
| **M6** | Polish: options, hotkey, icons, README, packaging | installs from the release zip into a clean profile via `chrome://extensions` |

M4 comes before M5 on purpose: there is nothing to tune weights against until
turning a live game into a fixture is a single click.

**Game recorder.** A second, bulk form of M4: the panel's **Start recording**
button captures every snapshot of a whole game and downloads one JSON file when
`gamestate.name` reaches `gameEnd`, or on a manual stop. `src/ui/recorder.js` holds
the (pure, tested) recording shape; `boot.js` wires it to storage so a reload
mid-game resumes rather than loses the session. Meant for handing a finished game
to an LLM for analysis, not just for fixtures.

## Sub-decisions

A player is more often standing at a dialog inside a turn than choosing the turn
itself. The state machine names these directly, so the panel can answer the
question actually on screen:

| State | Question | What the panel should say |
|---|---|---|
| `playerGainFromFeeder` | which dice to take | food matched to the cards in hand |
| `playerPowerBrown/White/Pink` | use the ability | whether, and on which bird |
| `playerDiscardBird` / `playerDiscardBonus` | what to discard | smallest VP loss |
| `playerTakeCardSpecial` | which tray card | by contribution to the position |
| `playerInitialDiscard` | the opening hand | the single highest-leverage decision in the game |

## Known limits

- **The blue goal board is not supported.** Its scoring table lives on the BGA
  server, not in the client. The panel says so rather than reporting a low number.
- **Bird abilities are scored by category, not by text.** Within a category a strong
  and a weak bird price the same — the largest source of error inside the engine.
- **Hidden information**: an opponent's hand and bonus card are modelled as an
  average bird, so the opponent's side of any evaluation is systematically less
  precise than your own. The panel labels this.
- **One move deep.** Opponent replies and chained activations are not searched.
- **Deck composition is not a constant.** The reference game's deck held 175 cards:
  170 base plus part of the Swift Start promo, which BGA marks `set: 1`. Read the
  composition off the page instead of assuming.

## Risks

**BGA's terms of use.** They prohibit using "devices or software other than those
provided by BGA" to extract or modify site content. This extension fits that
description whether or not it clicks anything. Practical consequence, worth
accepting deliberately: replays and casual games are the safe ground, ranked games
against people are a risk to the account, and this does not belong in the Chrome
Web Store. No auto-clicking, ever — that is what separates an advisor from a bot,
in substance and in consequence.

**A BGA client update** breaks state reading. Mitigated by try/catch on every read,
`validateState` on every snapshot, an explicit "could not read the position" instead
of a wrong hint, the heartbeat catching renamed notifications, and fixtures pinning
the format in tests.

**Page CSP applies to the MAIN-world script.** No `eval`, no injected inline code
in the collector.

**Performance**: enumerating every row and every playable bird on each event.
Mitigated by the debounce, a cache keyed on a state hash, and evaluating only stable
snapshots. If it ever shows, move the evaluator into a Web Worker — not the service
worker, which MV3 evicts.
