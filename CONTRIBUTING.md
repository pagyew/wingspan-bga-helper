# Contributing

Thanks for looking. A few things worth knowing before you open a pull request.

## Ground rules

**The extension stays read-only.** It may read the page, subscribe to
notifications and draw its own panel. It must never click, drag, submit a move, or
patch a BGA function. This is not only an ethical line — it is also why the thing
keeps working across BGA client updates.

**A wrong hint is worse than no hint.** When something cannot be read or a rule is
not modelled, say so in the panel. Never let an unknown quietly score as zero.
`validateState()` exists for exactly this.

## Getting set up

```bash
npm install
npm test           # node --test — no browser needed
npm run build      # -> dist/
npm run check      # manifest sanity checks
```

Load `dist/` at `chrome://extensions` with developer mode on. Then open an
archived Wingspan replay — that is the development harness: real objects, no
opponent, and you can scrub back and forth. Use a Chrome profile that is not
signed in to the account you play ranked games on.

## Fixtures are the most useful contribution

Click **Copy snapshot** in the panel at the end of a game, save the JSON under
`test/fixtures/`, and add a test that asserts the six scoring rows against BGA's
own final tally. Two games are covered so far. Still missing, in order of value:

1. a game on the **blue** goal board (unsupported today — its scoring table lives
   on the server, not in the client);
2. games with 3–5 players;
3. any goal wording the scorer does not recognise. It throws on an unknown
   formulation by design, so a crash here is a useful bug report, not a nuisance.

## Style

Plain ESM, no dependencies in `src/engine/` — the same files run under Node and in
the bundle. Two-space indent, no semicolon-free experiments, and comments that say
*why* rather than restate the code.

Commit messages: imperative mood, one line, scope first where it helps
(`collector: fall back to the heartbeat when a topic is missing`).
