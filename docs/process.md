# How the work runs

Русская версия: [process.ru.md](process.ru.md).

The board is the project's memory. A session that starts cold should be able to read
[roadmap.md](roadmap.md), run `npm run board`, and know what to do next without
asking anyone. Everything below exists to keep that true.

## The loop

```
roadmap milestone ─> tasks with acceptance criteria ─> branch ─> PR ─> acceptance ─> milestone closed with a number
```

- **Milestone** — a GitHub milestone whose title and description mirror a heading in
  [roadmap.md](roadmap.md). Its `Done when` list in the roadmap is the criterion for
  closing it, and breaking the milestone into tasks does not dilute that list.
- **Task** — a GitHub issue ending in a `## Done when` block. Each item is something a
  command or a single observation answers yes or no.
- **Flow** — the `Wingspan helper` project board: Todo → In progress → In review → Done.
- **Measurement** — [benchmarks.md](benchmarks.md), append-only. Every number carries a
  date, a sample size and the commit it was measured at.

## Five invariants

1. No task without an acceptance criterion.
2. One task in progress at a time. Park a task with a comment rather than letting two run.
3. A branch and a PR per issue; the PR says `Closes #N` and answers each `Done when` item.
4. `npm test && npm run check` green before every commit. Red is a failure, not flakiness.
5. A number never moves without the measurement that moved it — arena Elo, corpus
   agreement or a timing, in the PR body and in `benchmarks.md`.

Invariant 5 is the one that makes the difference between an engine that is getting
stronger and an engine that is being fiddled with. The heuristic weights in
`src/engine/evaluate.js` are exactly the kind of thing that looks better after every
edit and gets worse over a month.

## Conventions

- Branch: `<milestone-slug>-<short-topic>`, lowercase, hyphens — `b2-power-dsl`.
- Commit: one line, imperative, scope first — `engine: price cached food by round`.
  Explain *why* when it is not obvious; never restate the diff.
- Issue title: imperative, scope first, no ticket numbers in the title.
- Labels: `engine`, `extension`, `ui`, `i18n`, `fixture`, `docs`, `good first issue`,
  `help wanted`. Add exactly the ones that are true.

The same loop, written for Claude with the exact commands, lives in
`.claude/skills/project-flow/SKILL.md`; Claude Code picks it up automatically when a
session touches milestones, issues or the board.

## Retro

Three lines per milestone, written when it closes: what took longer than expected,
what turned out to be unnecessary, what the next milestone should do differently.

<!-- newest first -->
