# Reference game — the fixture the scorer must reproduce

Table **#906782034**, 2 players, base game, **green** goal board.
The replay was watched to the end and the final state was read out of the client
model (see `docs/bga-game-state.md`), then compared with BGA's own scoring.

## Expected totals

| Row | pagyew | Exixel |
|---|---:|---:|
| Birds (sum of `vp`) | **52** | **34** |
| Bonus cards | **7** (Anatomist, 5 birds) | **6** (Omnivore Expert, 3 birds) |
| Round goals | **18** | **12** |
| Eggs | **7** | **19** |
| Cached food | **2** | **8** |
| Tucked cards | **5** | **10** |
| **Total** | **91** | **89** |

## Round goals in detail

| Round | Goal | pagyew | Exixel |
|---|---|---|---|
| 1 | Eggs in bowl nests | 4 → tie → 2 | 4 → tie → 2 |
| 2 | Birds in forest | 3 → tie → 3 | 3 → tie → 3 |
| 3 | Eggs in platform nests | 6 → 1st → 6 | 2 → 2nd → 3 |
| 4 | Birds with eggs in cavity nests | 7 → 1st → 7 | 5 → 2nd → 4 |

A tie on the green board splits the place points, rounded down: `(4+1)/2 = 2`.

## Final mats

### pagyew — 13 birds

| loc | habitat | id | bird | VP | nest | eggs | tucked | cached |
|----:|---|---:|---|---:|---|---:|---:|---:|
| 9  | forest | 134 | Ruby-Crowned Kinglet | 2 | bowl | 0 | 0 | 0 |
| 10 | forest | 123 | Red-Bellied Woodpecker | 1 | cavity | 1 | 0 | 0 |
| 11 | forest | 47 | Carolina Wren | 1 | cavity | 1 | 0 | 0 |
| 12 | forest | 17 | Baltimore Oriole | 9 | star | 1 | 0 | 0 |
| 17 | grassland | 102 | Mississippi Kite | 4 | platform | 0 | 0 | 2 |
| 18 | grassland | 140 | Scissor-Tailed Flycatcher | 8 | bowl | 0 | 0 | 0 |
| 19 | grassland | 92 | House Wren | 1 | cavity | 1 | 0 | 0 |
| 20 | grassland | 29 | Black-Billed Magpie | 3 | star | 1 | 0 | 0 |
| 21 | grassland | 160 | Wild Turkey | 8 | ground | 0 | 0 | 0 |
| 25 | wetland | 42 | Bushtit | 2 | star | 1 | 5 | 0 |
| 26 | wetland | 63 | Common Yellowthroat | 1 | bowl | 0 | 0 | 0 |
| 27 | wetland | 23 | Belted Kingfisher | 4 | star | 1 | 0 | 0 |
| 28 | wetland | 118 | Prothonotary Warbler | 8 | cavity | 0 | 0 | 0 |

Bonus card: **Anatomist**. One bird card in hand, no food.

### Exixel — 9 birds

| loc | habitat | bird | VP | nest | eggs | tucked | cached |
|----:|---|---|---:|---|---:|---:|---:|
| 9  | forest | Red-Breasted Nuthatch | 2 | cavity | 3 | 0 | 4 |
| 10 | forest | Ruby-Throated Hummingbird | 4 | bowl | 2 | 0 | 0 |
| 11 | forest | Carolina Chickadee | 2 | cavity | 3 | 0 | 3 |
| 17 | grassland | Eastern Phoebe | 3 | star | 2 | 0 | 0 |
| 18 | grassland | Red-Headed Woodpecker | 4 | cavity | 2 | 0 | 1 |
| 19 | grassland | Sandhill Crane | 5 | ground | 1 | 8 | 0 |
| 25 | wetland | Tree Swallow | 3 | cavity | 2 | 2 | 0 |
| 26 | wetland | Great Blue Heron | 5 | platform | 2 | 0 | 0 |
| 27 | wetland | Black Skimmer | 6 | ground | 2 | 0 | 0 |

Bonus card: **Omnivore Expert** — not present in the model (hidden information);
known only from the end-of-game log text.

## How to use it

1. Feed the mats above to the scorer.
2. Compare all six rows. A mismatch in any row points at the corresponding part
   of the rules model.
3. Check the goals row separately — it covers both counting and place allocation
   with ties.

A second game, **#906484481** (87 : 86), covers what this one does not: two bonus
cards held by one player, the Bird Feeder / Photographer / Enclosure Builder /
Viticulturalist cards, the "Birds with eggs in platform nests" goal, a tie in
round 3, and a 12-bird mat.
