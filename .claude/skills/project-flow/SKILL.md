---
name: project-flow
description: Run this repository's milestone → issue → branch → PR → acceptance loop on GitHub. Use when planning or breaking down a milestone (B1–B9 brain track, M0–M6 extension track), filing an issue, deciding what to work on next, taking a task into work, opening or reviewing a PR, checking the board, or closing a milestone. Triggers on "что дальше", "разложи веху", "заведи задачу", "возьми в работу", "прими работу", "покажи доску", "закрой веху", "next task", "break down a milestone", "file an issue", "start work", "accept this".
---

# Project flow

The board is the project's memory. This skill keeps it accurate, so that a session
that starts cold can read `docs/roadmap.md`, run `npm run board`, and know exactly
what to do next without asking.

## Where the truth lives

| Thing | Where | Rule |
|---|---|---|
| Why the project exists, what "done" means overall | `docs/roadmap.md` (+ `.ru`) | changes only by an explicit decision, recorded in a PR |
| A milestone | GitHub milestone `B1 …` / `M0 …` | title and description mirror the roadmap heading |
| A task | GitHub issue | exactly one acceptance criterion block |
| Flow and WIP | GitHub Project board `Wingspan helper` | Todo / In progress / In review / Done |
| Measured strength | `docs/benchmarks.md` | append-only; every number carries a date, a sample size and a commit |
| How the work runs | this skill and `docs/process.md` | |

## Five invariants. Breaking one means the process is not being followed.

1. **No task without an acceptance criterion.** Every issue ends with a
   `## Done when` block whose items a command or a single observation answers yes or
   no. "Improve the evaluator" is not a task. "`npm run arena` prints ≥ +100 Elo over
   `WEIGHTS` on 1000 games" is.
2. **One task in progress at a time.** Take the next one only after the current one
   is merged or explicitly parked with a comment saying why.
3. **A branch and a PR per issue.** `git commit` on `main` is a mistake. The PR body
   says `Closes #N` and answers each `Done when` item.
4. **`npm test && npm run check` green before every commit.** A red run is a failure,
   never "flaky".
5. **A number never moves without the measurement that moved it.** Any change to
   weights, search or evaluation carries an arena or corpus number in the PR, and the
   same number lands in `docs/benchmarks.md`.

## Procedures

`gh` must be authenticated (`gh auth status`). Repo slug: `pagyew/wingspan-bga-helper`.

### A. Break a milestone into tasks

Asked as "разложи B2", "what goes into B5", or when a milestone has no open issues.

1. Read that milestone's section in `docs/roadmap.md`. Its `Done when` list is the
   milestone's acceptance criterion — it does not get diluted during breakdown.
2. Propose tasks so that: each is one or two days of work; each is independently
   verifiable; together they satisfy the milestone criterion and nothing more.
   Prefer four to eight tasks. More than ten means the milestone is really two.
3. Show the list to the user with each task's acceptance criterion **before** filing
   anything. Filing eight wrong issues is expensive to undo.
4. File them with procedure B, in dependency order, and note blockers with
   "Blocked by #N" in the body.

### B. File an issue

```bash
gh issue create --repo pagyew/wingspan-bga-helper \
  --title "<imperative, scope first, no ticket number>" \
  --milestone "B2 Bird powers as data" \
  --label engine \
  --body "$(cat <<'BODY'
<Two to five sentences: what is wrong or missing now, and why it matters.
Point at the file or the failing behaviour by name.>

## Done when

- [ ] <verifiable item — a command, a test name, or an observation with a yes/no answer>
- [ ] <…>

## Notes

<Optional: the approach if it is non-obvious, links to docs/roadmap.md sections,
"Blocked by #N".>
BODY
)"
```

Check for a duplicate first:
`gh issue list --repo pagyew/wingspan-bga-helper --state all --search "\"<title>\" in:title"`.

Labels in use: `engine`, `extension`, `ui`, `i18n`, `fixture`, `docs`,
`good first issue`, `help wanted`. Add exactly the ones that are true.

### C. Pick what to work on next

```bash
npm run board          # milestones, progress, WIP, and the ready queue
```

Choose from the **earliest open milestone** whose blockers are cleared. Inside a
milestone prefer the task that unblocks the most others. If everything in it is
blocked, say so and name the blocker rather than starting something from a later
milestone — a milestone half-done in three places is the failure mode this process
exists to prevent.

### D. Take a task into work

```bash
gh issue edit  <N> --repo pagyew/wingspan-bga-helper --add-assignee @me
gh issue comment <N> --repo pagyew/wingspan-bga-helper --body "Taking this on. Plan: <two lines>"
git checkout main && git pull
git checkout -b <b2-power-dsl>          # milestone-slug, lowercase, hyphens
```

Then work in small commits, `scope: imperative summary` on one line, running
`npm test && npm run check` before each. Commit messages explain *why* a change was
made when it is not obvious; they never restate the diff.

### E. Hand the task in

```bash
npm test && npm run check && npm run build
git push -u origin HEAD
gh pr create --repo pagyew/wingspan-bga-helper --fill-first --body "$(cat <<'BODY'
Closes #N.

<What changed, in two or three sentences.>

## Done when — checked

- [x] <criterion from the issue> — <how it was verified: command, output, number>
- [x] <…>

## Measurement

<Arena Elo / corpus agreement / timing, with the sample size. Omit only if the
change cannot move any measured number, and say so explicitly.>
BODY
)"
```

Acceptance is against the issue's `Done when` list, item by item. An item that
cannot be checked is not waved through: either the work is not finished, or the
criterion was wrong and gets amended in the issue with a comment saying why.

### F. Close a milestone

Only when every issue in it is closed **and** the milestone's roadmap criterion is
met and measured.

1. Run the milestone's own acceptance commands and paste the output into the
   milestone-closing issue or PR.
2. Append the numbers to `docs/benchmarks.md`.
3. `gh api repos/pagyew/wingspan-bga-helper/milestones/<n> -X PATCH -f state=closed`
4. Write three lines in `docs/process.md` under "Retro": what took longer than
   expected, what turned out to be unnecessary, what the next milestone should do
   differently. Three lines, not a page.

## Working with the user

Ask before filing a batch of issues, before changing a roadmap milestone's scope, and
before dropping an existing issue. Do not ask before assigning yourself a task the
user has just pointed at, before creating a branch, or before running tests.

Report progress as the board sees it — "B2: 3 of 7 closed, #24 in review" — not as a
narrative of what you did.

See `references/gh-cookbook.md` for the less common commands (milestones, project
board columns, bulk relabelling, reopening).
