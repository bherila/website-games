# Office Unit Prompts

## `unit.{officeS,officeM,officeL}.variant{A,B,C}.vacant`

Prepend `_style-preamble.md`.

Create three deterministic vacant office interior sprite variants for Tower Throwback.
Exact source frames: `officeS` `384 x 192` px, `officeM` `576 x 192` px, `officeL` `768 x 192` px.
Subject: bright office suites with the current big/tall window rhythm, broad readable furniture silhouettes, and generous daylight.
State cues: vacant but rentable; slightly calmer than occupied without feeling dark.
Composition: side cutaway, large glass panes, clear floor and ceiling edges.
Variant A: open desk bullpen with monitors, low partitions, chairs, and a central plant.
Variant B: conference/collaboration layout with one large table, a wall board shape, chairs, and a side plant.
Variant C: corner-office/lounge layout with one desk, sofa, filing/storage block, and a plant.
Constraints: original artwork only; no people; no legible text; no baked night lighting; windows must support transparency/runtime sky color.

## `unit.{officeS,officeM,officeL}.variant{A,B,C}.occupied`

Prepend `_style-preamble.md`.

Create matching occupied variants for every vacant office frame above.
Exact source frames: same dimensions as the vacant variants.
Subject: same office language with active monitors, warmer accents, lamps or chair positions that imply use, and daylight still dominant.
State cues: occupied without drawing people; runtime people render separately.
Composition: align each occupied variant to its corresponding vacant layout so deterministic variant swaps feel stable.
Constraints: original artwork only; no people; no legible text; no baked night lighting; windows must support transparency/runtime sky color.
