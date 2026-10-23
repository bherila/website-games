# Plate Escape

Plate Escape is a rotatable 3D screw puzzle at `/plate-escape`. The campaign starts with
Little Cottage: four walls, two pitched roof panels, nine screws in three colors, two trays of
three, and four spare slots. There is no timer or move limit. Storage is forgiving enough to accept
every possible color order; plates still constrain which screw heads are exposed.

Level 2, Garden Workshop, adds two removable timber braces covering wall screws, twelve screws
in four colors, and only two spare slots. Removing an unmatched screw when both spares are full
ends the attempt; matching a tray remains legal with full storage. Unlimited undo restores the
overflowing screw and the entire previous board, and Retry starts fresh. There is no lives system.

## Play

- Drag the assembly to orbit the view. Rotation buttons and Reset view also work with a keyboard.
  Orbiting changes the viewpoint; gravity stays consistent with the assembly.
- Select an exposed screw head. Heads behind a plate or facing away are unavailable. Visible
  heads have labeled, focusable 44px buttons over their projected positions.
- Screws turn and lift from their holes, then move into a matching collection tray or spare slot.
  Finishing a tray opens the next color and automatically collects matching stored screws.
- Removing all but one screw lets a panel pivot around its last support. With none, it drops out of the
  house. Screw heads face outward from all four walls and both roof slopes; walls and roof
  occlude the heads behind them, so turning the view is required. The garden and wooden floor
  remain as a permanent base.
- Undo restores the last screw, tray state and plate. Restart resets the puzzle and view.
- Clearing all plates and sorting all screws awards three stars. Reload starts a fresh puzzle
  and retains the clear. Clearing level 1 unlocks level 2. The shared level grid allows replay; no
  unfinished-board autosave is promised.

## Implementation

`level.ts` owns the authored panels, outward normals, local up vectors and palette; `engine.ts`
is a pure immutable puzzle model. `houseGeometry.ts` builds the gabled outlines, panel frames,
windows, door, tiled roof, trim and garden. Architectural details are attached to their removable
panel rather than left floating when it falls.
`PlateEscapeScene.tsx` uses Three.js and OrbitControls, with authored support pivots and gravity-like
fall animations rather than a general rigid-body simulation. A nearest-hit raycast against plates
and screw meshes determines which heads can be selected. The view owns no progression state.
`PlateEscapeGame.tsx` owns undo snapshots, controls, collection UI and completion. Panel totals
come from the level definition. The campaign uses the shared `LevelSelectGrid` for locks, stars,
next-level highlighting and the All Games link. The Levels control unmounts the active scene
and returns to that grid; choosing a level starts a fresh attempt. Existing level-1 stars are
retained after the cottage redesign.

The React scene disposes geometry, materials, controls, WebGL resources, animation frames, resize
observers, shadow maps and listeners on restart/unmount. The 512px sun shadow is refreshed
while screws or panels animate and reused while the house is still. Context loss shows a recovery action. Device pixel ratio
is capped at 1.5; automated browser profiles use DPR 1 for functional input coverage, not a device
performance benchmark.

The game uses the shared star-progress codec (`bwh.plate-escape.progress.v1` anonymously), registered
with the authenticated profile/level API. Levels 1–2 and the default profile are supported; active
save slots are intentionally unsupported. Game Select hydrates its progress through the common registry.

## Validation

- Pure model tests cover all 1,680 possible color orders, tray cascades, capacity, duplicate taps,
  immutable undo snapshots, support removal, workshop overflow, recovery and a winning order.
- Geometry tests verify outward panel frames, screw clearance and a shared roof ridge above both gables.
- `tests/e2e/plate-escape.spec.ts` covers actual desktop input and native Chromium touch: hidden
  heads, drag/tap separation, rotation, spare storage, undo, full completion, reload and catalog.
  The same journey checks the shared picker’s locked and starred tiles, unlocks the workshop,
  deliberately loses, undoes, retries and wins through actual visible heads.
- The gameplay registry includes both project/file units in the shared four CI/weekly groups.
  Page and API tests cover public access, the two-level boundary and monotonic star saves.

Earlier one-level saves retain their stars and unlock the workshop from the existing cottage clear.

Future work: additional authored levels, sound and haptics, and representative phone testing before making rendering-performance claims.
