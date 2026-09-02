# gh cookbook for this repository

`SLUG=pagyew/wingspan-bga-helper`. Everything here is idempotent or read-only unless
it says otherwise.

## Board and status

```bash
npm run board                                    # the summary this repo prints
gh issue list  --repo $SLUG --milestone "B1 Rules simulator" --state open
gh issue list  --repo $SLUG --assignee @me --state open
gh pr list     --repo $SLUG --state open
gh pr checks   <N> --repo $SLUG                  # CI on a PR
gh run list    --repo $SLUG --limit 5            # CI on main
```

## Milestones

```bash
# list, with counts
gh api "repos/$SLUG/milestones?state=all" \
  --jq '.[] | "\(.number)  \(.title)  open=\(.open_issues) closed=\(.closed_issues)"'

# create (idempotent guard first)
gh api "repos/$SLUG/milestones" -f title="B4 Model of the unknown" \
  -f description="Deck, feeder and opponent hand as computed distributions."

# rename or re-describe
gh api "repos/$SLUG/milestones/<n>" -X PATCH -f description="…"

# close / reopen
gh api "repos/$SLUG/milestones/<n>" -X PATCH -f state=closed
gh api "repos/$SLUG/milestones/<n>" -X PATCH -f state=open
```

## Issues

```bash
# duplicate check before creating
gh issue list --repo $SLUG --state all --search '"<title>" in:title' --json title --jq '.[].title'

# move between milestones
gh issue edit <N> --repo $SLUG --milestone "B5 Search inside a turn"

# labels
gh issue edit <N> --repo $SLUG --add-label engine --remove-label ui

# close with a reason that stays readable a year later
gh issue close <N> --repo $SLUG --comment "Superseded by #M: B2 encodes all 180 powers, so hand-pricing is unnecessary."

# reopen
gh issue reopen <N> --repo $SLUG
```

## Project board

```bash
gh project list --owner pagyew
gh project item-list <number> --owner pagyew --format json
gh project item-add  <number> --owner pagyew --url https://github.com/$SLUG/issues/<N>
```

Board columns: **Todo → In progress → In review → Done**. Moving a card is not a
substitute for the issue state: an issue in "Done" that is still open is a bug in
the board, and `npm run board` reports it.

## Releases

```bash
npm run release          # bumps the version, tags, pushes; release.yml publishes the zip
gh release list --repo $SLUG
```

## Bulk operations that are worth guarding

Relabelling or re-milestoning several issues at once is a loop over `gh issue edit`.
Print the list first and get it confirmed — an accidental bulk edit is tedious to
reverse and pollutes every issue's timeline.

```bash
for n in 8 9 10; do
  echo "#$n -> B5"
done
# then, only after the list is confirmed:
# for n in 8 9 10; do gh issue edit $n --repo $SLUG --milestone "B5 Search inside a turn"; done
```
