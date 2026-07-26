# Residential Unit Prompts

## `unit.{aptStudio,apt1br,apt2br,aptPenthouse}.variant{A,B,C}.vacant`

Prepend `_style-preamble.md`.

Create three deterministic vacant residential interior sprite variants for Tower Throwback.
Exact source frames: `aptStudio` `256 x 192` px, `apt1br` `384 x 192` px, `apt2br` `512 x 192` px, `aptPenthouse` `1024 x 192` px.
Subject: cheerful apartments with broad natural-light windows, warm floors, readable beds/sofas/kitchenettes, and calmer domestic silhouettes than offices.
State cues: vacant but rentable; clean daylight rooms without people.
Composition: side cutaway, larger furniture shapes, modest prop count, clear floor and ceiling edges.
Variant A: bed-forward apartment with kitchenette, plant, and warm textiles.
Variant B: sofa/living-room layout with TV/media block, kitchenette, and small dining detail.
Variant C: mixed bed/dining layout with a divider or storage block and extra plant/natural-light emphasis.
Constraints: original artwork only; no people; no legible text; no baked night lighting; windows must support transparency/runtime sky color.

## `unit.{aptStudio,apt1br,apt2br,aptPenthouse}.variant{A,B,C}.occupied`

Prepend `_style-preamble.md`.

Create matching occupied variants for every vacant residential frame above.
Exact source frames: same dimensions as the vacant variants.
Subject: same domestic layouts with warmer accents, lamps, pulled-out chairs, textiles, or small non-text clutter that implies residents are home.
State cues: occupied without drawing people; runtime people render separately.
Composition: align each occupied variant to its corresponding vacant layout so deterministic variant swaps feel stable.
Constraints: original artwork only; no people; no legible text; no baked night lighting; windows must support transparency/runtime sky color.
