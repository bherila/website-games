# Plate Escape

Plate Escape is a rotatable 3D screw puzzle at `/plate-escape`. The campaign starts with
Little Cottage: four walls, two pitched roof panels, nine screws in three colors, two trays of
three, and four spare slots. There is no timer or move limit. Storage is forgiving enough that
every legal removal order wins; plates still constrain which screw heads are exposed.

Level 2, Garden Workshop, adds two removable timber braces, bolted to the gable walls on spacer
blocks and covering the wall screws behind them, twelve screws
in four colors, and only two spare slots. Removing an unmatched screw when both spares are full
ends the attempt; matching a tray remains legal with full storage. Unlimited undo restores the
overflowing screw and the entire previous board, and Retry starts fresh. There is no lives system.

The first expansion adds Village Windmill (diagonal sails covering a hub), Glasshouse
(transparent but solid covers, with three teaching spare slots), and Corner Café (a sign
covering the glass awning’s fastener). Each has twelve screws in four colors. Introductions
open on uncleared levels and can be reopened from Level guide. The visible upcoming-tray
queue helps players plan which colors to collect next. Matching is graphical: colored triangular
trays alternate upward and downward, with a recessed screw hole at each corner. A collected
screw plugs the hole with its colored head and washer. Neighboring triangles tuck together
to leave room for wider rows as more trays are introduced.
Queued and stored screws use the same colored head icons. Each color also has its own drive
mark (coral a slot, mint a cross, blue a square, amber a star) on the 3D heads, tray sockets,
the queue and spare storage, and stamped on each tray even while it is empty, so matching never
relies on color alone. The marks differ in outline, not angle, so a tilted panel cannot turn one
into another (`screwMarks.ts`). Color names remain in accessible labels, and the title, level
badge and navigation share one compact header row.

The mill group (levels 6–10) adds two rules. Shared screws run through several parts:
Waterwheel's axle pins the wheel to the front gable, Barn Doors' crossbar bolts pin each door,
and Sawmill's bolt runs through a log rack and saw guard into the back wall. Mill Loft adds
captive hinged doors and hatches, and Windmill Hill combines both under turning sails. Teaching
levels 6 and 9 have three spare slots; the others two.

The harbor (levels 11–15) leaves the village: each board is a free-standing object on its
own base. Rowing Boat is a pram dinghy afloat beside a jetty, and Lighthouse Lantern a glazed
lantern room on a stone pier. They add captive covers: the boat's bait flap drops open and hangs
over the transom screw below it, and the lantern's storm shutters slide down their rails onto the
base, each until the part it hangs on comes off. Both are teaching levels with three spare slots.
Sea Chest (on a boathouse bench) offers two routes, a hasp that drops over the front and an end
flap that drops over the end, each burying a different color. Harbor Crane (on a stone quay) has
covers that run different ways: the hook block drops straight down the tower front and the
counterweight slides down the cab's back on a slant, while one pivot bolt frees jib and cab front
together and the tower door opens clear. The cab stands on the tower's sides, so the screws the
covers land on are held by nothing else. Lightship, the harbor's assessment, combines a stern
flap, a lantern shutter that drops down the mast onto its collar, and one bolt through the mast
step and the deck that the lantern rests on. These three have two spare slots and may hold a
commitment that only shows a few moves later.

## Play

- Drag the assembly to orbit the view. Rotation buttons and Reset view also work with a keyboard.
  Orbiting changes the viewpoint; gravity stays consistent with the assembly.
- Select an exposed screw head. Heads behind a plate, facing away, or seen nearly edge-on (within
  about 10° of side-on) are unavailable. Visible
  heads have labeled, focusable 44px buttons over their projected positions.
- Screws turn and lift from their holes, then move into a matching collection tray or spare slot.
  Finishing a tray opens the next queued color and automatically collects matching stored screws.
  A lock marks a head visible through glass but still covered. Remove its cover or turn to an
  unobstructed face; covered heads cannot be unscrewed or consume storage.
- The front and back gable walls carry the roof. A gable's last screw stays in place while either
  roof slope is attached; the head shows a small roof badge, stays square rather than hanging,
  and tapping it explains why in a short hint above the rotate controls. Side walls bear nothing.
  Refused taps on covered heads and full storage use the same visible hint.
- A shared screw shows its shank between the parts it pins, and it counts toward each of them:
  taking it out can release several parts at once. It waits, like a gable's last screw, until
  nothing still rests on a part it would release, except parts it releases too: the waterwheel's
  axle goes once the wheel's own screw is out, and wheel and gable let go together. The hint
  names the part being held up, for example "Front gable wall is holding up the waterwheel."
- A hinged door or hatch with no screws left swings open on its hinge (with a creak) and stays
  attached, covering nothing; it falls only when the wall it hangs on does.
- A captive cover is different: a drop flap or a shutter on a rail that, once its screws are out,
  falls open or slides down (with a rattle) and lies over the heads below it. Those heads stay
  covered until the part it hangs on (its host) comes off, and the cover goes with it. A dashed
  outline shows where each captive cover will come to rest while it is still screwed shut. The hint
  for a head under one names it and its host, for example "The bait flap is hanging over that
  screw. It comes away with the stern batten."
- Parts that fall into the harbor splash and sink; a part lying flat, such as the boat's seat,
  drops onto whatever is below and fades there.
- The windmill sails (levels 3 and 10) and the waterwheel turn slowly, once every 20–24
  seconds, carrying their screws. They ease to a stop within half a second whenever the player
  reaches for the board (a press, drag, scroll, key, mouse movement over it, or keyboard focus on
  a screw) and resume after four idle seconds, so no one aims at a moving head. Nothing turns
  under reduced motion, and a Pause motion button beside the view controls stops them
  (`bwh.plate-escape.still.v1`). The angle is decoration, not puzzle state: covers are authored,
  a turning cover covers at every angle, and a released part falls from wherever it was.
- Removing all but one screw lets a panel pivot around its last support. With none, it falls:
  walls tip outward about their bottom edge, roof slopes slide down the pitch and off the eave,
  and raised covers drop. Parts land on the deck or lawn rather than passing through it, slide
  off the garden's edge and fade. Screw heads face outward from all four walls and both roof
  slopes; walls and roof occlude the heads behind them, so turning the view is required. The
  garden and wooden floor remain as a permanent base.
- Synthesized sounds mark unscrewing, a screw seating in a tray or spare slot, a filled tray, a
  locked head, a part letting go and landing, overflow, undo and a win. The footer's sound toggle
  persists (`bwh.plate-escape.muted.v1`). The chrome follows the site's light and dark theme.
- Undo restores the last screw, tray state and plate. Restart resets the puzzle and view.
- Clearing all plates and sorting all screws awards three stars. Reload starts a fresh puzzle
  and retains the clear. Clearing level 1 unlocks level 2. The shared level grid allows replay; no
  unfinished-board autosave is promised.

## Implementation

`level.ts` owns the released registry, outward normals, local up vectors and palette;
`villageLevels.ts` authors levels 3–5, `millLevels.ts` levels 6–10 and `harborLevels.ts` levels
11–15. `stage.ts` describes each level's permanent base (garden, jetty, pier, workbench, quay,
sea): the surfaces parts
land on, where water is, and where the camera looks. `engine.ts`
is a pure immutable puzzle model. `screwLock()` reports why a head cannot move yet: an authored
cover prerequisite prevents axial access through attached panels, including heads glimpsed at an
oblique angle, and a plate's `restsOn` supports keep their last screw while it is attached. A
screw's `through` list names the plates behind its head that it also pins (`heldPlates()`), so
every plate counts every screw that holds it; a bearing lock exempts parts the same screw
releases and names the supporting plate. `panelState()` reports a plate as pinned, open (a hinged
or railed panel with no screws, still on its `host`) or gone; `Screw.coveredWhenOpen` names the
captive panels that cover a head while open, and an open panel never bears on its host.
`Plate.outline` gives a shaped panel its polygon, and `Plate.rail` a shutter's downhill travel.
`Plate.hinge` marks a captive panel and
`PuzzleLevel.rotor` a decorative turning group; neither changes the puzzle model. `screwVisibility.ts` traces
nearest physical hits: glass can reveal a head visually while keeping it locked; opaque
frames and decorations still occlude it. `houseGeometry.ts` builds the gabled outlines, panel frames,
windows, door, tiled roof, trim and garden, plus the mill parts (a disc waterwheel, planked doors
with hinge straps, beams, a riveted saw guard, an end-on woodpile) and each shared screw's shank
(`throughShafts`). Architectural details are attached to their removable
panel rather than left floating when it falls.
`PlateEscapeScene.tsx` uses Three.js and OrbitControls, with authored support pivots. Falls come
from `plateMotion.ts`, a pure function of time since release that integrates gravity in fixed
1/120 s substeps against the level's ground heights (water is not ground), rather than a general rigid-body simulation;
the scene reports fall, swing and landing events for sound. `plateMotion.ts` also owns the hinge's
open pose, rotor poses and the rotor's stop/start easing, all pure functions. A nearest-hit raycast against plates
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
with the authenticated profile/level API. Levels 1–15 and the default profile are supported; active
save slots are intentionally unsupported. Game Select hydrates its progress through the common registry.

## Validation

- An exhaustive solver (`__tests__/puzzleSolver.ts`) explores every reachable board of each
  released level through the real engine. It proves each level winnable with no soft-locks and
  keeps each within an authored band for the chance that uniformly random legal play wins (a
  regression check: it counts tempting wrong taps, not hidden commitments). It proves that every
  legal order wins the tutorial, that no board leaves a roof over a released gable, and that the
  bearing rule constrains every level. From every reachable board short of overflow, the assembly
  must still be finishable with unlimited storage, so no move sets a mechanical trap that a later
  overflow would hide; `solverGates.test.ts` keeps such a trap, built from today's rules, that
  the older checks passed. On teaching levels (1, 4, 6, 9, 11, 12) no move short of overflowing may doom
  the board; elsewhere a doomed board must overflow within four more removals (13–15 use this). The solver also
  reports the win chance of collecting whenever a tray is open, the smallest share of safe moves
  that keep a win, and the fewest spares a win needs. Levels 1–12 are winnable from every board
  short of overflow, by that simple policy, and without using a spare. From level 13 a move may
  commit to a loss (shown within four removals), and Harbor Crane and Lightship each need one
  spare to win.
  Each level with captive covers must reach a board that can still win where an open cover is the
  only thing in the way of some head.
  Each level with shared screws must reach a lock that would vanish if every screw held one
  plate, and a move that releases two plates at once. (Turning sharing off cannot make a level
  unsolvable, since it only removes locks, so this is the necessity gate for shared screws.) The
  authored win and overflow traces in `campaignFixtures.ts` were generated from it. The solver
  assumes every uncovered head is reachable by orbiting; geometry tests and browser journeys
  check access.
- Pure model tests cover tray cascades, capacity, duplicate taps, immutable undo snapshots,
  support removal, bearing locks, shared-screw counting and release, a drop flap and a railed
  shutter covering and then freeing the screws below them, workshop overflow, recovery and a
  winning order. Every captive panel names an ordinary host, and no cover lies over a screw that
  holds its own host.
- Geometry tests verify outward panel frames, screw clearance, a shared roof ridge above both
  gables, that every authored cover intersects its screw's access ray, and that cover spacers reach
  the wall without crossing any head's access ray. Nothing but a screw's authored covers stands over
  its head. Shared-screw shanks reach the deepest plate without crossing another head's ray and
  cross each pinned plate inside it; an open captive panel sits in front of its host and crosses
  the access ray of exactly the heads that list it in `coveredWhenOpen`, so ordinary hinged doors
  block none; a shaped panel holds each head, rim included; turning covers cover at every angle,
  and no other head facing a rotor lies under its sweep. Motion tests check, on each level's own
  stage, that every part lands without passing through the ground, never jumps between frames, and
  falls clear (or, lying flat, comes to rest), that a rotor stops within half a second, and that a
  hinge turns about its edge.
- `tests/e2e/plate-escape.spec.ts` covers actual desktop input and native Chromium touch: hidden
  heads, drag/tap separation, rotation, spare storage, undo, full completion, reload and catalog.
  The first journey checks the shared picker’s locked and starred tiles, unlocks the workshop,
  deliberately loses, undoes, retries and wins through actual visible heads, tapping the front
  gable's bearing screw on the way to check its hint. A second journey
  starts from a historical two-level save and earns the three new clears through actual input,
  checking locked glass heads, upcoming trays, overflow, undo, retry and unlocks. A third plays
  levels 6–10 under reduced motion, losing and winning each and tapping the held waterwheel axle
  for its hint, and ends on the harbor's introduction. A fourth plays levels 11–15, checking that
  the dropped bait flap, storm shutter and counterweight leave no button on the head they cover
  and that undo lifts the flap back. A fifth checks that the sails turn, stop when reached for, resume when left
  alone, and stay paused (also after reload) with Pause motion.
- The gameplay registry includes both project/file units in the shared four CI/weekly groups.
  Page and API tests cover public access, the fifteen-level boundary and monotonic star saves.

Earlier one- and two-level saves retain their stars and infer the next released level from
their recorded clears. Frontend progress and catalog totals derive from the released registry;
the API accepts slots 1–15 and rejects unreleased level 16.

Future work: additional authored levels, haptics, and representative phone testing before making rendering-performance claims.


## Planned campaign: 30 levels

Levels 1–15 are released. Levels 16–30 below are a design plan, not playable content. The
campaign expands from a tiny village and its mill into a harbor, a railway, clockworks and a
festival. Each group of five has a teaching level, practice and a final combination puzzle.
Geometry and panel arrangement provide variation between new mechanics.

Levels 1–10 are buildings sharing the cottage shell. From level 11 each board is a free-standing
object or machine on its own base (a jetty, a workbench, a station platform): a boat, a lantern,
a music box, a clock. The puzzle model already describes any assembly through supports, covers
and shared screws. The renderer needs a parts kit beyond flat panels (the waterwheel's disc is
the first; drums and curved panels follow), a ground for each level instead of the garden, so
parts land on the right surfaces (`groundAt` per level), and one general fall in place of the
wall and roof cases. Each object needs its own art, where the houses reused one shell.

### Campaign rules

- Keep two active trays, three screws per color, unlimited undo, instant retry and no timer,
  lives or paid recovery. Overflow remains the loss condition. A matching screw is always
  accepted when spare storage is full. Failure does not award or erase stars.
- Levels 3–17 target four colors / twelve screws. Level 18 teaches a fifth color with its own
  distinct head mark; levels 18–30 target five colors / fifteen screws. Keep one batch per
  color, rather than adding repeated tray batches in this campaign.
- Target two spare slots for established rules. Teaching levels 4, 6, 9, 11, 12, 16, 18 and 21,
  and the busier railway levels 17, 19 and 20, use three slots. From level 26, start with two slots and let releasing
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
| 6 | Waterwheel — released | Introduce shared screws: the axle pins the turning wheel to the gable, and both let go together once the wheel's own screw is out. The wheel covers the sluice gate. |
| 7 | Barn Doors — released | Crossbar bolts pin each door behind it. Choose a door to open while preserving access to useful colors. |
| 8 | Sawmill — released | One bolt runs through a log rack and saw guard into the back wall: a short release chain. Predict which parts leave after the last common fastener. |
| 9 | Mill Loft — released | Introduce captive hinged panels. Removing their last screw swings them to a fixed open position, revealing the next layer. |
| 10 | Windmill Hill — released | Combine shared fasteners, a hinged door and turning sails pinned by one hub. No new rule; conclude the mill group. |
| 11 | Rowing Boat — released | Afloat beside a jetty. Introduce captive covers: the bait flap on the stern batten drops open over the transom screw, previewed before release, and comes away with the batten. Teaching level, three spares. |
| 12 | Lighthouse Lantern — released | Introduce rails: a storm shutter drops down its rail onto the base, covering the screw there until its glass face comes off. Teaching level, three spares. |
| 13 | Sea Chest — released | Two routes: a hasp drops down its staple over the front, or an end flap drops over the end, each burying a different color. A route can commit to a loss that shows within four moves. |
| 14 | Harbor Crane — released | Rails on opposite faces move covers in different directions (straight down the front, slantwise down the cab's back); one pivot bolt frees jib and cab front together; the tower door opens clear. The first level that needs a spare. |
| 15 | Lightship — released | Harbor assessment: a stern flap, a lantern shutter that drops down the mast, and one bolt through the mast step and deck that the lantern rests on. |
| 16 | Toy Steam Engine | Introduce dials: one large dial with a visible stop-pin screw; take the pin and the dial turns, showing the heads behind its window one at a time. Teaching level, three spares. |
| 17 | Music Box | A two-window dial shows two heads per stop; the lid opens clear so the dial is the only new consequence. Three spares. |
| 18 | Station Clock | Introduce Pearl, the fifth color, with a hex-socket mark and an extra teaching spare. |
| 19 | Signal Box | Two separate selector dials and a railed shutter; which selector to work first decides which colors arrive early. Three spares. |
| 20 | Locomotive | Railway assessment: engine or tender first, with a coupling pin through both drawbars. Three spares. |
| 21 | Cuckoo Clock | Introduce linked counterweights (pinecone weights). Releasing a visible weight drives another part to a fixed position and opens access; there is no timing challenge. |
| 22 | Lift Cage | Practice two clearly connected weight/cover pairs on different faces. Releasing the right pair exposes the needed color first. |
| 23 | Drawbridge | A counterweight opens a hinged bridge section. Plan the release before taking screws from the next layer. |
| 24 | Gramophone | Collar alignment and a counterweighted hatch expose different layers of the same housing. Use free inspection to choose an order. |
| 25 | Clockwork Robot | Combine counterweights, sliders and shared fasteners. Clockworks assessment with a readable dependency chain and no new rule. |
| 26 | Carousel | Introduce a releasable staging rack. Freeing its marked cover adds one spare slot for this attempt; decide whether to open it early. |
| 27 | Balloon Basket | The staging rack is behind a sliding sign. Balance the cost of reaching extra storage against collecting the next tray color directly. |
| 28 | Puppet Theater | Shared frame supports and a collar offer two routes to the staging rack. The theater is untimed; there is no rhythm-input rule. |
| 29 | Ferris Wheel | Multiple small cars share storage. Use familiar collar, slider and shared-support rules, with a rack route and clear night-scene lighting. |
| 30 | Festival Float | Final assessment: a rotating clock collar, linked counterweight hatch and shared canopy supports around one coherent float, with an optional early rack route. No surprise final mechanic. |

### Mechanic contracts and implementation order

1. **Implemented for levels 3–5:** the visible tray queue, data-driven introductions and a level
   definition suitable for themed structures. Locks, stars and navigation stay in the shared
   `LevelSelectGrid`. Transparent covers need to distinguish seeing a head from being able
   to reach it; decorative transparency must not make the selection ray pass through it.
2. **Implemented for levels 6–10:** replace the one-screw/one-plate relationship with a support graph.
   A screw can anchor multiple aligned panels, and every panel derives its remaining supports
   from that graph. Shared screws need a stable world position and a clear visual identity.
   Releasing the outer plate must not carry away a screw still needed by an inner plate.
3. **Hinges implemented for levels 9–10; captive covers and rails implemented for 11–12:** ordinary
   hinged doors open clear and cover nothing. A captive cover (a drop flap on a catch, or a
   shutter at the foot of a rail) is a distinct panel that, once open, covers the heads it lands
   on until its explicitly named host comes off. Panels have three states (pinned, open but
   captive, gone); an open cover travels with its host and never bears on it, and a screw that
   frees cover and host together creates no cover in between. Each cover's resting place is shown
   before release. The structural gate above must hold.
4. **Before level 16:** store discrete dial stops in puzzle state, make every turn an undo step,
   provide button and keyboard controls that step one stop at a time, and raycast against the
   actual pose. The first dial is held by a stop-pin screw; whether a head in the window jams a
   dial is decided on an unreleased test board, since it can deadlock against the bearing rule.
   No concentric dials. The solver becomes a graph search over removals and turns, with win
   chances solved across cycles and stops reachable without a removal grouped for scoring.
5. **At level 18:** add Pearl and its hex mark consistently to heads, trays, storage,
   instructions and accessible labels. Five colors still mean two active trays.
6. **Before level 21:** add authored counterweight dependencies with fixed end positions.
   Keep dependencies acyclic and test both motion and undo. There are no timed windows,
   speed requirements or outcomes determined by frame rate.
7. **Before level 26:** derive spare capacity from whether the staging rack has been released.
   Restoring an earlier snapshot restores its capacity and stored screws together. The extra
   slot resets on retry and is never a permanent purchase or consumable.

Build and validate in batches: 3–5, 6–10, then 11–12 (checked on a phone before authoring
13–15), a dial test board, 16–20, 21–25 and 26–30. Only released
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
