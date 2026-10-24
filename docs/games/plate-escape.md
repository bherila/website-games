# Plate Escape

Plate Escape is a rotatable 3D screw puzzle at `/plate-escape`. The campaign starts with
Little Cottage: four walls, two pitched roof panels, nine screws in three colors, two trays of
three, and four spare slots. There is no timer or move limit. Storage is forgiving enough to accept
every possible color order; plates still constrain which screw heads are exposed.

Level 2, Garden Workshop, adds two removable timber braces covering wall screws, twelve screws
in four colors, and only two spare slots. Removing an unmatched screw when both spares are full
ends the attempt; matching a tray remains legal with full storage. Unlimited undo restores the
overflowing screw and the entire previous board, and Retry starts fresh. There is no lives system.

The first expansion adds Village Windmill (diagonal sails covering a hub), Glasshouse
(transparent but solid covers, with three teaching spare slots), and Corner Café (a sign
covering the glass awning’s fastener). Each has twelve screws in four colors. Introductions
open on uncleared levels and can be reopened from Level guide. The visible upcoming-tray
queue helps players plan which colors to collect next. Matching is graphical: colored triangular
trays have one screw socket at each corner, with the same head marks used on the 3D screws.
Queued and stored screws use the same colored head icons. Color names remain in accessible
labels, and the title, level badge and navigation share one compact header row.

## Play

- Drag the assembly to orbit the view. Rotation buttons and Reset view also work with a keyboard.
  Orbiting changes the viewpoint; gravity stays consistent with the assembly.
- Select an exposed screw head. Heads behind a plate or facing away are unavailable. Visible
  heads have labeled, focusable 44px buttons over their projected positions.
- Screws turn and lift from their holes, then move into a matching collection tray or spare slot.
  Finishing a tray opens the next queued color and automatically collects matching stored screws.
  A lock marks a head visible through glass but still covered. Remove its cover or turn to an
  unobstructed face; covered heads cannot be unscrewed or consume storage.
- Removing all but one screw lets a panel pivot around its last support. With none, it drops out of the
  house. Screw heads face outward from all four walls and both roof slopes; walls and roof
  occlude the heads behind them, so turning the view is required. The garden and wooden floor
  remain as a permanent base.
- Undo restores the last screw, tray state and plate. Restart resets the puzzle and view.
- Clearing all plates and sorting all screws awards three stars. Reload starts a fresh puzzle
  and retains the clear. Clearing level 1 unlocks level 2. The shared level grid allows replay; no
  unfinished-board autosave is promised.

## Implementation

`level.ts` owns the released registry, outward normals, local up vectors and palette;
`villageLevels.ts` authors levels 3–5. `engine.ts`
is a pure immutable puzzle model. Authored cover prerequisites prevent axial access through
attached panels, including heads glimpsed at an oblique angle. `screwVisibility.ts` traces
nearest physical hits: glass can reveal a head visually while keeping it locked; opaque
frames and decorations still occlude it. `houseGeometry.ts` builds the gabled outlines, panel frames,
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
with the authenticated profile/level API. Levels 1–5 and the default profile are supported; active
save slots are intentionally unsupported. Game Select hydrates its progress through the common registry.

## Validation

- Pure model tests cover all 1,680 possible color orders, tray cascades, capacity, duplicate taps,
  immutable undo snapshots, support removal, workshop overflow, recovery and a winning order.
- Geometry tests verify outward panel frames, screw clearance and a shared roof ridge above both gables.
- `tests/e2e/plate-escape.spec.ts` covers actual desktop input and native Chromium touch: hidden
  heads, drag/tap separation, rotation, spare storage, undo, full completion, reload and catalog.
  The first journey checks the shared picker’s locked and starred tiles, unlocks the workshop,
  deliberately loses, undoes, retries and wins through actual visible heads. A second journey
  starts from a historical two-level save and earns the three new clears through actual input,
  checking locked glass heads, upcoming trays, overflow, undo, retry and unlocks.
- The gameplay registry includes both project/file units in the shared four CI/weekly groups.
  Page and API tests cover public access, the five-level boundary and monotonic star saves.

Earlier one- and two-level saves retain their stars and infer the next released level from
their recorded clears. Frontend progress and catalog totals derive from the released registry;
the API accepts slots 1–5 and rejects unreleased level 6.

Future work: additional authored levels, sound and haptics, and representative phone testing before making rendering-performance claims.


## Planned campaign: 30 levels

Levels 1–5 are released. Levels 6–30 below are a design plan, not playable content. The
campaign expands from a tiny village into mills, a harbor, a railway, clockworks and a festival.
Each group of five has a teaching level, practice and a final combination puzzle. Geometry
and panel arrangement provide variation between new mechanics.

### Campaign rules

- Keep two active trays, three screws per color, unlimited undo, instant retry and no timer,
  lives or paid recovery. Overflow remains the loss condition. A matching screw is always
  accepted when spare storage is full. Failure does not award or erase stars.
- Levels 3–17 target four colors / twelve screws. Level 18 teaches a fifth color with its own
  distinct head mark; levels 18–30 target five colors / fifteen screws. Keep one batch per
  color, rather than adding repeated tray batches in this campaign.
- Target two spare slots for established rules. Teaching levels 4, 6, 9, 12, 16, 18 and 21 use
  three slots to make room for learning. From level 26, start with two slots and let releasing
  a visible staging rack add a third for that attempt. These are authoring targets: a solver
  and playtesting must prove each arrangement before its numbers are locked.
- Show the upcoming tray-color queue before increasing complexity beyond level 2. Queue order
  is authored and visible, with color names and head marks. Losses should follow choices the
  player can understand, without hidden random tray changes.
- Add one rule at a time. Explain it with a short, replayable introduction and a visible
  mechanical cue: linked washers, hinge pins, rails, a collar handle or a counterweight cord.
  Late levels combine at most three support/movement systems on one board.
- Camera orbit and inspecting parts remain free. Rotating a puzzle collar is also free;
  Undo continues to restore the last screw-removal snapshot, including the collar alignment,
  moving parts, tray state and any unlocked storage. Retry restores the entire authored board.
- Preserve the toy-diorama style and a readable phone silhouette. Target at most twelve
  removable panels and fifteen screws per board. Night scenes keep screws and colors bright;
  darkness is atmosphere, not a visibility penalty. Rendering performance still needs real
  phone measurements before making device-performance claims.

### Level sequence

| Level | Structure | Main decision / mechanic |
| --- | --- | --- |
| 1 | Little Cottage — released | Learn orbiting, color trays and falling walls with forgiving storage: 3 colors, 9 screws, 4 spares. |
| 2 | Garden Workshop — released | Timber braces hide wall screws; 4 colors, 12 screws and 2 spares introduce overflow, undo and retry. |
| 3 | Village Windmill — released | Diagonal blades overlap the central housing. Choose which blade to remove to expose a needed color; retain level 2’s rules. |
| 4 | Glasshouse — released | Introduce transparent covers: screws can be seen through glass but remain covered until the glass panel is released. Show a clear blocked-head cue. |
| 5 | Corner Café — released | A roof, sign and glass awning combine opaque and transparent layers. First assessment of planning reveals around the whole building. |
| 6 | Waterwheel | Introduce shared screws: one clearly marked fastener supports two aligned plates. Its removal can release both. |
| 7 | Barn Doors | Shared fasteners cross an outer frame and inner door. Choose a door to open while preserving access to useful colors. |
| 8 | Sawmill | Several shared supports create a short release chain. Predict which panels will leave after the last common fastener. |
| 9 | Mill Loft | Introduce captive hinged panels. Removing their last screw swings them to a fixed open position, revealing the next layer. |
| 10 | Windmill Hill | Combine shared fasteners, hinged doors and overlapping blades. No new rule; conclude the mill group. |
| 11 | Boathouse | Practice hinged covers across front and side faces, with useful colors behind different doors. Rotation and reveal order both matter. |
| 12 | Lighthouse Lantern | Introduce rail-guided panels. Unfastened panels slide to an authored stop instead of falling, exposing screws along the lantern housing. |
| 13 | Signal Shack | A sliding cover exposes the supports for a hinged panel. Read a two-stage opening sequence before spending spare slots. |
| 14 | Storm Shutters | Rails on different faces move covers in different directions. Plan which face to open first using the visible tray queue. |
| 15 | Harbor Beacon | Combine shared supports, sliders and hinged access panels around a compact lighthouse. Harbor assessment with several safe opening orders. |
| 16 | Toy Engine | Introduce a manually turnable collar. Its cutouts align with screw heads at discrete stops; clear controls distinguish collar rotation from camera orbit. |
| 17 | Railway Carriage | A collar reveals shared wheel-housing screws. Practice alignment and support order without another new rule. |
| 18 | Station Clock | Introduce the fifth color with a unique head mark and an extra teaching spare. Familiar clock-face alignment makes the new color easy to inspect. |
| 19 | Rail Bridge | Collars expose screws that release sliding sleeves. Compare two opening routes and their storage costs. |
| 20 | Central Station | Choose between engine and carriage sections using the same trays. Combine collars, hinges and shared supports as the railway assessment. |
| 21 | Clockmaker’s Lift | Introduce linked counterweights. Releasing a visible weight drives another part to a fixed position and opens access; there is no timing challenge. |
| 22 | Water Tower | Practice two clearly connected weight/cover pairs on different faces. Releasing the right pair exposes the needed color first. |
| 23 | Drawbridge | A counterweight opens a hinged bridge section. Plan the release before taking screws from the next layer. |
| 24 | Observatory | Collar alignment and a counterweighted hatch expose different layers of the same housing. Use free inspection to choose an order. |
| 25 | Clockwork Town Hall | Combine counterweights, sliders and shared fasteners. Clockworks assessment with a readable dependency chain and no new rule. |
| 26 | Festival Workbench | Introduce a releasable staging rack. Freeing its marked cover adds one spare slot for this attempt; decide whether to open it early. |
| 27 | Canal Market | The staging rack is behind a sliding sign. Balance the cost of reaching extra storage against collecting the next tray color directly. |
| 28 | Music Pavilion | Shared roof supports and a collar offer two routes to the staging rack. The pavilion is untimed; there is no rhythm-input rule. |
| 29 | Night Train | Multiple small sections share storage. Use familiar collar, slider and shared-support rules, with a rack route and clear night-scene lighting. |
| 30 | Grand Festival Hall | Final assessment: a rotating clock collar, linked counterweight hatch and shared roof supports around one coherent hall, with an optional early rack route. No surprise final mechanic. |

### Mechanic contracts and implementation order

1. **Implemented for levels 3–5:** the visible tray queue, data-driven introductions and a level
   definition suitable for themed structures. Locks, stars and navigation stay in the shared
   `LevelSelectGrid`. Transparent covers need to distinguish seeing a head from being able
   to reach it; decorative transparency must not make the selection ray pass through it.
2. **Before level 6:** replace the one-screw/one-plate relationship with a support graph.
   A screw can anchor multiple aligned panels, and every panel derives its remaining supports
   from that graph. Shared screws need a stable world position and a clear visual identity.
   Releasing the outer plate must not carry away a screw still needed by an inner plate.
3. **Before levels 9–15:** add authored motion rules for hinges and rails. A captive panel
   enters its authored open state when its fasteners are gone; its fixed hinge or rail does not
   need dismantling. The renderer animates toward that state and delays newly exposed targets
   until actual geometry clears them. It does not decide progression or run a general rigid-body
   simulation. Open positions must leave all required remaining heads reachable.
4. **Before level 16:** store discrete collar poses in puzzle state, provide touch and keyboard
   rotation controls, and raycast against the actual current pose. Camera orientation remains
   outside the puzzle model. Collar poses belong in screw-removal undo snapshots.
5. **At level 18:** add the fifth named color and distinct mark consistently to heads, trays,
   storage, instructions and accessible labels. Five colors still mean two active trays.
6. **Before level 21:** add authored counterweight dependencies with fixed end positions.
   Keep dependencies acyclic and test both motion and undo. There are no timed windows,
   speed requirements or outcomes determined by frame rate.
7. **Before level 26:** derive spare capacity from whether the staging rack has been released.
   Restoring an earlier snapshot restores its capacity and stored screws together. The extra
   slot resets on retry and is never a permanent purchase or consumable.

Build and validate in batches: 3–5, 6–10, 11–15, 16–20, 21–25, then 26–30. Only released
levels enter the runtime registry, progress totals, catalog and API save boundary. Do not
raise those limits to 30 or show playable placeholder tiles merely because the plan has 30 rows.
Existing level-1 and level-2 stars must survive each campaign expansion.

### Acceptance gate for each planned level

- Prove at least one winning trace and one deliberate overflow trace. The solver must model
  support, access and part poses; color-order enumeration alone is not an occlusion proof.
  Geometry checks and browser playback must validate the solver’s authored access assumptions
  against real facing and nearest-hit selection rays.
- Exercise the mechanic’s introduction, a normal win, overflow, full-storage matching, undo
  after loss, retry and returning through the shared picker. Failures must not award stars.
  Keep a solution achievable without using undo; retaining undo makes exploration forgiving.
- Check that required screws cannot disappear inside a moving part or leave the reachable
  board because of an animation. Players can inspect and align parts without spending storage.
  A held or moving panel must not obscure a head while its click target remains available.
- Run actual desktop and native-touch input through the authored solution. Use milestone levels
  for the heavier complete regression journeys, with pure-model and geometry coverage for every
  level. Keep the gameplay selector’s project/file coverage complete when adding browser specs.
- Preserve progress across reload and batch upgrades, keep unshipped API slots invalid, and
  preserve the existing stars/unlock semantics. Every completed level still awards three stars;
  undo and retry do not introduce a new scoring penalty.
