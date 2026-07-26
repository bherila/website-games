# Directional call-site census

Required by the Niagara Falls epic (#1676). Every literal expression that
`engine/mapGeometry.ts` is meant to replace, enumerated from a grep of the whole
game directory, with a disposition for each.

**Status: 21 of 21 converted** (sub-issue 2). Sub-issue 1 introduced the helpers
and proved them equivalent; sub-issue 2 converted every rule call site.

The original census said 19. It was **wrong** — it missed two sites, and the
ESLint guard added in sub-issue 2 found them (`schedules.ts:434`, `:468`,
`source.floor !== 0` standing in for "isn't the street entrance"). They are now
items 20 and 21. Recorded rather than quietly corrected: a hand-built census is
itself a thing that can be incomplete, which is exactly why the automated guard
exists alongside it.

`grep -rnE "floor(Lo|Hi)?\s*(===|<|>|<=|>=)\s*0\b" --include=*.ts --include=*.tsx`
plus targeted greps for `-10`, `99`, `FLOOR_MIN`, `FLOOR_MAX`, and comparisons
against `cathedral.floor` / `skylobbyMinFloor`.

## Converted (21)

| # | Site | Expression | Replace with |
|---|---|---|---|
| 1 | `engine/placement.ts:114` | `cmd.floor === 0` (groundOnly) | `isAnchorFloor` |
| 2 | `engine/placement.ts:116` | `cmd.floor < 0` (undergroundOnly) | `isExcavated` |
| 3 | `engine/placement.ts:118` | `cmd.floor === -10` (b10Only) | `=== excavationExtreme(map)` |
| 4 | `engine/placement.ts:120` | `cmd.floor === 99` (floor99) | `=== terminalFloor(map)` |
| 5 | `engine/placement.ts:125` | `cmd.floor >= 0` (default rule) | `isOnBuildSide` |
| 6 | `engine/placement.ts:137` | `cmd.floor === 0` (free anchor) | `isAnchorFloor` |
| 7 | `engine/placement.ts:140` | `floor > 0 ? floor - 1 : floor + 1` | `supportFloorFor` |
| 8 | `engine/placement.ts:148` | `floor > 0 ? 'below' : 'above'` (message) | direction-aware copy |
| 9 | `engine/placement.ts:107` | `cmd.floor < TUNING.grid.skylobbyMinFloor` | `meetsMinimumDepth` |
| 10 | `engine/placement.ts:230` | `fp.floorLo < 0` (underground allowed) | `isExcavated` |
| 11 | `engine/placement.ts:233` | `fp.floorLo < 0` (3★ gate) | `isExcavated` |
| 12 | `engine/placement.ts:247` | `fp.floorLo > cathedral.floor` (lockout) | `isBeyond` |
| 13 | `engine/placement.ts:278` | `floor < 0` (excavation cost) | `isExcavated` |
| 14 | `engine/placement.ts:353` | `cmd.bottomFloor < 0` (shaft, underground allowed) | `isExcavated` |
| 15 | `engine/placement.ts:356` | `cmd.bottomFloor < 0` (shaft, 3★ gate) | `isExcavated` |
| 16 | `engine/placement.ts:570` | `unit.floor >= 0` (demolition dependents, outward) | depth-relative |
| 17 | `engine/placement.ts:573` | `unit.floor <= 0` (demolition dependents, inward) | depth-relative |
| 18 | `floorLabels.ts:3` | `floor < 0 ? 'B…' : String(floor)` | `floorLabelFor` — **15 call sites**, signature change |
| 19 | `hud/InspectPanel.tsx:81` | `unit.floor < 0` (excavation cost, duplicate of #13) | `isExcavated` |
| 20 | `engine/schedules.ts:434` | `source.floor !== 0` (street-entrance test) | `isAnchorFloor` — **missed by the original census** |
| 21 | `engine/schedules.ts:468` | `source.floor !== 0` (street-entrance test) | `isAnchorFloor` — **missed by the original census** |

Note #13 and #19 are the same rule written twice. Converting one without the
other reintroduces the drift, so they moved together.

Items 3, 4, and 8 changed user-visible copy as a necessary consequence: the
subway message now reads "may only be placed on floor **B10**" rather than
"floor −10", because a map-relative message must use the map's own label
(a falls map cannot say "−10"). B10 is also what the floor navigator and
inspector already show, so this is more consistent, not less.

## Deliberately left absolute (23)

`FLOOR_MIN` / `FLOOR_MAX` serve **two different roles**, and only one of them is
map-relative. These are the storage role: the typed-array grid is allocated
across `FLOOR_MIN..FLOOR_MAX` and every map lives inside that single array. They
are global by construction and must not become map-relative.

- `engine/grid.ts:46,53,158,244` — bounds check, flat index, segment scan, exported bounds
- `engine/heatmaps.ts:104,168` — field indexing, mirrors `tileIndex`
- `scene/heatmapLayer.ts:106` — row → floor for the instanced mesh
- `scene/placementRange.ts:65` — range-tile bounds
- `scene/sceneController.ts:295` — pick/hit-test bounds
- `scene/structureMesh.ts:152,153` — world backdrop extent
- `gameProgress.ts:67` — `MAX_ENTITY_COUNT` allocation ceiling
- `gameProgress.ts:1168` — `isFloor` storage-range validation
- `gameProgress.ts:1434` — cathedral overhang exemption, `> FLOOR_MAX` (storage clamp)
- `engine/placement.ts:153` — `Math.min(fp.floorHi, FLOOR_MAX)` storage clamp
- `engine/maps.ts:34` — CITY_TOWER's own range *is* the global range; coincidence, not a rule

## Already map-relative — no action (4)

- `engine/placement.ts:214,217` — bounds already read `map.floorRange`
- `engine/placement.ts:347` — shaft bounds already read `map.floorRange`
- `engine/people.ts:32`, `engine/routing.ts:306` — already read `map.lobbyAnchorFloor`

## Should become map-relative but are NOT geometry (3)

These read the global range where they should read `map.floorRange`. They are
listed so they are not lost, but they belong to the camera/HUD sub-issue rather
than to the geometry helpers.

- `scene/camera.ts:176` — `goToFloor` clamps to global, not the map's range
- `hud/FloorNavigator.tsx:26,29,34,38,92,95,109,114,115,146` — the whole strip is
  built on global `FLOOR_MIN`/`FLOOR_MAX`
- `gameProgress.ts:1168` — `isFloor` validates against the global range rather
  than the save's own map range (tightening is optional; listed for completeness)

## Accounting

| Category | Count |
|---|---|
| Converted | 21 |
| Deliberately absolute (storage role) | 23 |
| Already map-relative | 4 |
| Deferred to camera/HUD sub-issue | 3 |
| **Total directional hits found** | **51** |

## Enforcement

Converting once is not enough — the next person to add a rule will reach for
`floor < 0`, and a passing test suite will not notice. `eslint.config.js` now
carries a `no-restricted-syntax` block scoped to the rule modules
(`placement.ts`, `schedules.ts`, `stars.ts`, `routing.ts`, `people.ts`) that
rejects floor-vs-zero comparisons and the literals `99` / `-10`.

It is deliberately NOT applied to `grid.ts` / `heatmaps.ts`: their
FLOOR_MIN/FLOOR_MAX use is the storage role above, which must stay global.

Verified to fire by reintroducing `cmd.floor === 0` and confirming the lint
error, then reverting.

## Addendum — Niagara Falls (sub-issue 6)

Building the falls map surfaced two things the census did not anticipate.

**`buildDirection: 'down'` is not needed.** Niagara builds BOTH ways from a
clifftop lobby — 15 storeys up, 30 down — so it is structurally the same shape
as CITY_TOWER with different bounds. The axis never inverts, so no floor-label,
camera, or support-rule inversion is required. The `getMap` guard against
`'down'` maps stays: it now guards a case nothing needs, which is the right
state for an unimplemented feature.

**`FLOOR_MIN` had to widen, and that is the storage/playable split made real.**
The grid is a single typed array spanning `FLOOR_MIN..FLOOR_MAX`; B30 simply did
not exist in the world. `FLOOR_MIN` moved -10 → -30, and `CITY_TOWER.floorRange`
was pinned to literal `{ min: -10, max: 99 }` rather than tracking the globals —
otherwise widening the world for one map would silently deepen another map's
excavation limit.

That forced two entries out of the "deferred to camera/HUD" list and into this
work, because leaving them would have shipped a real regression: `goToFloor` and
the `FloorNavigator` strip both read the global range, so a New York player would
have got a navigator spanning 20 basement floors the city can never build. Both
now take the map's range.

Remaining deferred: `gameProgress.ts:1168` (`isFloor` validates against the
global range rather than the save's own map range — optional tightening).

**Also split during this work:** `isExcavated` became two concepts.
`isBelowAnchor` is geometric and drives `undergroundOnly` items (parking,
recycling); `isExcavated` is economic and drives the star gate and pricing.
Collapsing them would have left every `undergroundOnly` item unplaceable on
Niagara with no error explaining why.
