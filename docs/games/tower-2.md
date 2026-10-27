# Tower 2: plan (parked)

**Status: designed, not started.** This is the agreed design and an execution plan, kept here so the
work can start in a later session without repeating the discussion. Nothing below is built yet.

Tower 2 is a new game in the line of Tower Throwback. You draw the building as well as fill it: each
floor's outline (setbacks, wings, atriums) and the rooms inside it. You work isometrically, one floor at a
time. It shares Tower Throwback's engine where that fits, with its own route and saves.

## Decisions already made (2026-10-26)

| Topic | Decision |
| --- | --- |
| Control | The player shapes the shell (footprint, setbacks, wings, atriums) and lays out rooms inside it. |
| View | Isometric, one floor at a time. Floors above are cut away and floors below fade. An exterior view shows the whole tower. |
| Relation | A new game and route that shares Tower Throwback's engine where it fits. Saves are separate. |
| Platform | Desktop first, with a mouse; still playable on a phone. |
| Loop | A star-rated sandbox like Tower Throwback, plus a scenario track that teaches each layout pressure. |
| Layout pressures | All four: light and views, circulation, structure and cost, neighbours and noise. |
| Look | Tower Throwback's neo-90s management-sim style in isometric, but **more vibrant and less muted**: one bold, saturated hue per use. Overlays keep their own palette. |
| Rooms | **Modules**: each use comes in fixed sizes that snap to the plan grid, rather than free-drawn rectangles. |
| Mixed use | The same freedom as Tower Throwback: any use on any floor. A tower can stack uses, for example offices first, then a sky lobby, then residential above. |
| Progression | Stars unlock advanced versions of each use: studios lead to 1-, 2- and 3-bedroom condos, startup offices to executive offices, and so on. |
| Upgrades | Two kinds: **in place** (same footprint, applied without disturbing the plan) and **remodel** (demolish and rebuild a floor to change its layout). |
| Floor plates | A new floor inherits the floor below's outline with a single click, then can be edited. |
| Land | The site is a city block of plots. You start on one and buy neighbours as you grow, then build further buildings on them. In the sandbox the neighbouring plots are empty; a scenario may fill them with existing buildings you have to buy out. |
| Several buildings | All buildings share one economy and population, so people can live in one and work in another. A building needs a street lobby, or a sky bridge to one that has a route to the street. |
| Sky bridges | Bridges link buildings at the same floor, so one sky lobby can serve two towers. |
| Public space | Plazas and other public space raise nearby desirability, bring footfall to shops, count toward the star rating, and host events. |
| Parking | Surface parking is built beside a tower, then upgraded to an underground garage entrance with basement parking spaces. |
| Cores, risers and exits | Cores bundle elevators, a stair and a utility riser, and each spans its own range of floors (not inherited). Wet modules must sit near a riser. Every floor needs two separated exit stairs that reach the street. |
| Environment and utilities | The simulation includes utilities (electricity, water, trash) and an environmental rating. |
| Lobbies and basements | As in Tower Throwback. Street lobbies sit on the ground floor but may be split into separate entrances (twin towers). Any number of sky lobbies go on upper floors, unlocked by stars. Basements go several floors deep once excavation unlocks, for parking, plant and transit. |

## Design

### Principle: fun first, detail only where it makes a decision
Tower 2 has many systems: four pressures, modules, upgrades, land, parking, utilities and an environmental
rating. Each one earns its place only if it gives the player a decision they can see and act on. Detail that
doesn't change a decision stays out of sight. In practice:
- **It works by default.** Early on, systems look after themselves: the street grid, mains water and basic
  trash cover a small tower without any action, and the first plant needs appear only as the tower grows.
- **Systems unlock with stars**, one at a time, each with a short explanation and its own overlay. A
  one-star tower is just floors, rooms and an elevator.
- **Coarse, not granular.** Services are reckoned per floor, routes per core, plots per plot. Nothing is
  drawn or managed per unit or per pipe.
- **Warnings before penalties.** Every shortfall shows on its overlay and in the issue list before it costs
  anything, and the fix is a module to place, not a chore to repeat.
- **No upkeep chores.** Nothing needs topping up, scheduling or babysitting. A decision, once made, holds until
  the tower outgrows it.
- **Depth for those who want it.** The inspector and overlays show the numbers for players who like to
  optimise; nobody needs them to play well.

Each new system in this plan should pass one test: in a five-minute session, does it create at least one
interesting choice, and does it ask for no repeated busywork? If not, simplify it or cut it.

### The loop
1. **Shape the shell.** Paint a floor's footprint on the site grid; each floor inherits the one below. Step it back, cantilever it out, or leave a void for an atrium.
2. **Place cores.** Elevator and stair shafts run through a range of floors. They are the only way between floors, and they take floor area on every floor they pass.
3. **Lay out rooms.** Draw rooms and choose each one's use. Corridors connect doors to cores. A room's score comes from its light, its walk to a core and its neighbours.
4. **Watch it run.** People keep schedules, ride the cores and walk the corridors, as in Tower Throwback. Bad plans show as queues, empty units and complaints.
5. **Rise.** Population and satisfaction earn stars, which unlock uses, taller cores and bigger plates.

### The four pressures
Each one is a rule the player can see as an overlay, and each costs something elsewhere.

| Pressure | Rule (first draft; tune in the prototype) |
| --- | --- |
| Light and views | `daylight(tile)` = tiles to the nearest glass edge or atrium, capped at 6 (1 tile = 3 m). Views add a bonus by height and facing, and lose it behind a taller neighbour. |
| Circulation | `walk(room)` = path length from door to core on the corridor graph. Cores use Tower Throwback's capacity and queue model, including load-aware routing. |
| Structure and cost | A tile is supported if the floor below has it, or it lies within cantilever reach of a supported tile on a column line. Reach grows with stars. Cost scales with area, height and unsupported span. |
| Neighbours and noise | `adjacency(useA, useB, direction)` gives −2 to +2, including the rooms directly above and below. |

### Mixed use and stacking
Any floor can hold any use, as in Tower Throwback, subject to the four pressures. The ground floor may have
several street entrances, and basements below it hold parking, plant and transit once excavation unlocks. A typical growth path: a
podium of shops at street level, office floors above, then a **sky lobby** floor where residents and hotel
guests change cores, then residential or hotel floors on top. Sky lobbies arrive with stars, as in
Tower Throwback, and make tall mixed-use towers work: they break long elevator runs and give each use its own
cores. Neighbour rules make stacking order a real decision (flats above a restaurant complain; offices above
a hotel disturb it).

### Modules, upgrades and remodelling
Rooms are **modules**: each use comes in fixed footprints that snap to the grid, each with a door edge that
must meet a corridor. A floor plan is a set of placed modules plus corridors and cores.

Stars unlock advanced modules for each use:

| Use | Starting module | Unlocked by stars |
| --- | --- | --- |
| Residential | Studio | 1-bedroom, 2-bedroom and 3-bedroom condos |
| Office | Startup office | Standard office, then executive office |
| Hotel | Single room | Double, then suite |
| Retail | Kiosk | Shop, then flagship store |
| Food | Café | Restaurant, then rooftop or view restaurant |

Upgrades come in two kinds:
- **In place:** same footprint, applied while tenants stay, for example a finish grade, fittings, or a studio
  refitted as a larger-rent studio. These work like Tower Throwback's existing upgrade paths
  (`UPGRADE_PATHS`).
- **Remodel:** changing a floor's layout, for example merging two studios into a 2-bedroom condo, or turning
  startup offices into an executive suite. The floor's tenants move out, it is demolished and rebuilt, and it
  takes build time and cost before it re-leases. It's a planned investment, not a free swap.

### Land, several buildings and sky bridges
The site is a city block divided into plots. You start on one; neighbouring plots go on sale as you grow,
gated by stars and priced by plot. Plots differ:
- a corner plot has two street frontages;
- one faces a park or river and has views;
- one has a height limit;
- one sits over a rail cutting, so columns are restricted.

So the decision is whether to build tall on the land you have or buy sideways. In the **sandbox**,
neighbouring plots are **empty**. A **scenario** may instead fill them with existing low-rise buildings that
shade you and block views, so buying one and demolishing or replacing it has a purpose beyond room.

Each building has its own cores; all buildings share one economy and population. People may live in one
building and work in another, so commuting between buildings becomes part of circulation: a walk across the
ground plaza, or a sky bridge.

**Sky bridges** link two buildings at the same floor. Both ends must be supported, and the span limit grows
with stars; Tower Throwback's Niagara skybridge already works this way, merging the walk routes on both sides.
A building needs a street lobby **or** a bridge to a building with a route to the street, so a residential tower
can be reached only through a sky lobby and a bridge. Bridges cast a little shade on what lies below them.

Light ties this together: your own second tower shades your first. Spacing buildings, keeping a plaza open
between them, and stepping back upper floors all buy daylight and views back.

### Plazas and public space
Ground plazas on unbuilt plot area, and terraces on setback roofs. All four of these effects are wanted:
- **Desirability:** a bonus for units within walking distance, falling off with distance (like Tower
  Throwback's amenity term).
- **Footfall:** shops and cafés facing a plaza earn more.
- **Stars:** public space counts toward the star rating, or a VIP's checklist, so a tower can't rate highly
  without it.
- **Events:** plazas host markets or concerts that draw visitors, like Tower Throwback's event spaces.

They cost land that isn't leased, plus upkeep.

### Parking
**Surface parking** is built on open plot area beside a tower, cheap and early. Later it upgrades to an
**underground garage**: a ramp entrance at ground level, plus parking spaces on basement floors. That frees the
surface for a plaza or another building. It follows Tower Throwback's parking model (ramp-served basement
floors, demand from offices and hotel suites), with the surface lot as a new first step.

### Cores, risers and exit stairs
These three are one family: vertical modules that each span **their own range of floors** and take the same
footprint on every floor in that range. Floors outside the range are free. Inheriting a floor plate copies the
outline only; it never extends a core, riser or stair. A core's range is set on purpose (see below).

For example, a high-rise elevator bank serving floors 15–30 starts at the floor-15 sky lobby. It needs only an
elevator **machine/pit room** on floor 14, directly beneath its lowest stop. Floors 1–13 below that are free
for anything, and the low-rise bank that brings people up to the sky lobby is a separate core with its own
range, such as 0–15.

**Cores** are the backbone. A core holds an elevator bank (1–4 cars, local or express), a stair, and a utility
riser for power, water and drains. Where cores go decides walking distances, how sky lobbies split the tower
(express cores run to a sky lobby, local cores serve above it), and how much area each floor gives up.
A service core carries trash and housekeeping. Standalone elevators stay possible as a premium option, such
as glass elevators in an atrium.

**Risers and wet modules.** Modules that need plumbing (bathrooms in condos and hotel rooms, kitchens,
restaurants, restrooms, fitness rooms) are **wet** and must sit within a few tiles of a riser. Dry modules
(offices, shops, storage) go anywhere. While placing a wet module, the reachable area is shaded, like the
light overlay. A wet module out of reach simply can't be placed; there's no hidden penalty. A **standalone
riser** is a small, cheap shaft with no elevator. When a wing grows too far from the core, the choice is a riser
(cheap, but a long walk to the elevators remains) or a second core (expensive, but it fixes both).

**Exit stairs.** Unlike elevators, an exit stair must **reach a street exit**: it runs down to the ground or a
podium roof that leads out. It may change position at a transfer floor along a protected corridor, but it can't
simply end. So a stair inside a 15–30 elevator core counts as an exit only if it continues down, or connects at
floor 15 to a stair that does. Every occupied floor needs a route to **two separated exit stairs** within a set walking
distance. Stairs in cores count, and a **standalone exit stair** is a small, cheap module for wings and
far corners. The two exits must be apart, so two stairs in one core count once. An egress overlay shades tiles
by distance to the nearest exits. A floor short of exits shows the warning while you build and **can't lease
until it complies**: one clear rule, not a degrading score. Exits also matter in fires (Tower Throwback's
incidents): a floor with good exits evacuates faster and loses less. This is the classic reason a tall,
deep or long floor plate needs a second core, a scissor stair, or a stair at each end of a wing.

### Placing cores across floors
The isometric view shows one floor, but a core spans many. Placing one must stay easy in that view:
- **Place on the current floor, then stretch.** Drop the core's footprint on the floor you're on, then drag
  handles to set its top and bottom floors. Page Up/Down with a modifier moves the nearer end one floor; on a
  phone, steppers do the same.
- **A stack strip beside the view.** While a core is selected, a narrow elevation strip at the screen edge shows
  every floor of the tower as a row. The core's range is a bar with draggable ends, and its stops are dots you
  can toggle per floor (as in Tower Throwback's stop editing). Floors the core can't reach, because no plate is
  there or something is in the way, are marked, and the reason shows on hover or tap.
- **Ghosts on other floors.** On floors inside a core's range, its footprint shows as a reserved outline even
  before those floors are built. On the floor beneath its lowest stop, the required machine/pit room shows as a
  ghost until it's placed. You can't build over either by accident.
- **Section view.** A toggle swings the camera to a vertical cut through the selected core, a side view much like
  Tower Throwback's. It shows the whole stack, its stops and the sky lobby transfers at once. It's the best
  place to plan elevator zoning, and it's a nod to the first game.
- **Placement checks before you commit:** the footprint fits on every floor in range, the pit/machine room
  floor is free, the stops include at least one lobby or sky lobby, and exit stairs reach the street.
  Problems show on the ghost, before any money is spent.

### Environment and utilities
Utilities make the building's services visible and give height a cost, without asking the player to draw pipes.
Plant rooms are modules; **risers run up the cores**, so a plant room serves every floor its core reaches,
within a range. Coverage shows as an overlay, like light and walking distance.

| Utility | How it works | What goes wrong |
| --- | --- | --- |
| Electricity | The street grid connection has a capacity that grows with upgrades. Substations or plant rooms extend supply up the tower; rooftop and setback solar adds to it; backup generators cover outages. | Demand beyond capacity causes brownouts: units lose desirability, and elevators slow or stop. |
| Water | Mains pressure reaches only so high, so booster pumps and break tanks are needed every so many floors, and a rooftop tank serves the top. | Floors above their pump's reach have low pressure, a desirability penalty and complaints. |
| Trash | Tower Throwback's trash chain (trash rooms, housekeeping, recycling) carries over, now with collection by core and service elevator. | Overflow brings dirt and pests, as in Tower Throwback. |

**Demand follows people.** Each use already keeps its own schedule in Tower Throwback's simulation, so utility
demand comes from who is in, hour by hour, not from a flat number per room:
- offices peak through the working day;
- flats peak in the morning and evening;
- hotels peak at morning and evening showers, all week;
- restaurants peak at meals, fitness at the start and end of the day.

A mixed-use tower therefore has a flatter load than a single-use one, which is another reason to mix uses.

**Battery storage.** Battery rooms (plant modules) charge from solar or cheap off-peak grid power and discharge
at the peak. They lower the peak the grid connection must carry, cut the energy bill, and keep essentials such
as elevators and lights running through a brownout. They're the alternative to paying for a bigger grid
connection.

**Hot water.** Hot water is its own load, served by water heaters or heat pumps in plant rooms with storage
tanks, and sized for each use's demand:

| Use | Hot-water demand |
| --- | --- |
| Hotel room | High, with morning and evening peaks every day |
| Flat / condo | Medium, with morning and evening peaks |
| Fitness centre | High at opening and after work |
| Restaurant | Medium, around meals |
| Office | Low |

Undersized heating or storage means cold showers at the peak: a desirability hit, felt most by hotel guests,
whose reviews count. Heat pumps and heat recovery (for example from plant or a data room) cost more but raise the
environmental rating.

Plant tends to gather on **mechanical floors** every 15–20 floors, which is where sky lobbies want to be too. That
gives a natural rhythm to a tall tower and a real choice about what shares those floors.

**Environmental rating.** A tower-wide score from energy (including peak demand and how much storage and solar
cover it), hot and cold water use per occupant, trash recycled, public
and green space, and daylight (good daylight cuts lighting energy, so the light pressure pays twice). Green
roofs and terraces on setbacks, solar, efficient plant and recycling raise it. It feeds desirability (some
tenants pay a premium for a green building), counts toward the higher star ratings, and can set scenario
goals ("a net-zero office").

Keep it coarse and legible: **service is worked out per floor, never per unit.** A floor is either inside a
plant room's reach through its core or it isn't. There's no pipe, duct or cable drawing and no routing to
individual units. A unit's use only sets how much it draws. No hidden failure either. Every shortfall shows on its overlay and in the
issue list before it bites, as Tower Throwback's issue badges do.

### Floor plates
A new floor copies the outline of the floor below with a single click (**Inherit floor below**), then can be
edited: step it back, extend it as a cantilever, or cut an atrium. Copying the modules too is a possible
later convenience; the shell is what must be one click.

### Starting uses

| Use | Wants | Tolerates | Dislikes nearby |
| --- | --- | --- | --- |
| Office | Daylight, a short walk to a core | Some depth, noise by day | Restaurants on the same floor |
| Flat | Daylight, views, quiet | Longer walks | Shops and restaurants directly below |
| Hotel room | Views, a short walk to a core | Small rooms | Plant rooms, offices above |
| Shop | Ground-floor or atrium frontage, footfall | No daylight | Nothing in particular |
| Restaurant | Views or a terrace, footfall | Depth | Flats directly above |
| Storage / plant | Nothing | A dark interior | Is disliked by most uses |

### Scenarios (each teaches one pressure)

| Scenario | Brief | Teaches |
| --- | --- | --- |
| Corner Plot | Twelve flats on a small corner site, all with daylight | Daylight depth |
| Two Cores | An office slab where no desk is more than 20 m from a core | Circulation |
| Over the Station | Build above a rail cutting with columns allowed only on two lines | Structure and cantilevers |
| Mixed Block | Shops, a restaurant, offices and flats with no complaints | Neighbours and stacking |
| Light Well | A deep inherited footprint with a satisfaction target | Atriums and setbacks |

### Camera and controls
- **Desktop:** drag to paint a footprint or a room, click to select, right-drag to pan. Page Up/Down changes floor, Q/E rotate the view in 90° steps, and a key cycles the light, walk, structure and mood overlays.
- **Phone:** one finger edits with the active tool, two fingers pan and zoom. A floor stepper sits at the edge, and a Draw/Move toggle prevents accidental edits.

## What carries over from Tower Throwback

From the Tower Throwback review of 2026-10-26 (issue #5, PRs #173, #176, #178). The engine is pure and
deterministic, with no DOM or three.js imports, so most of the work is in the geometry seam and the renderer.

### Reusable almost unchanged

| Area | Files / functions | Notes |
|---|---|---|
| Deterministic loop | `engine/engine.ts` `stepEngine`, `effectiveSpeed`, the person-tick interleave; `TowerScene.tsx` fixed-timestep, rAF park/wake | Geometry-free. Keep the "commands in, events out" contract. |
| RNG and determinism tests | `engine/rng.ts`; `engine/__tests__/determinism.test.ts`, `starProgressionScenario.ts`, golden-log style | Carry the id-order iteration rule over unchanged. |
| Clock and phases | `engine/clock.ts` `advanceClock`, `phaseOf`, `isWeekend` | As is. |
| Economy and loans | `engine/economy.ts` `accrue`, `postImmediate`, `requestSpend`, `settleMidnight`, `acceptLoan`, `normalizeLoanOffer` | Only the maintenance and rent loops read the catalog. |
| Stars, milestones, VIP rubric | `engine/stars.ts` `populationOf`, `applyStarUp`, `applyStarLoss`; `engine/vip.ts` scoring and the visit state machine | VIP routes go through `findRoute`, so they inherit the 2D routing. |
| Elevator SCAN | `engine/elevators.ts` `stepElevators`, hall-call assignment, programs, home floors | Purely vertical. A shaft's column becomes a footprint instead of an `x`, but the policy is unchanged. |
| Schedules and spawn rates | `engine/schedules.ts` `stepSchedules` (office, resident, shopper, diner, theater, conference, event, hotel) | Only the spawn positions are geometric (`people.streetEntrance`). |
| Hotel, trash, parking, incident state machines | `engine/hotel.ts`, `trash.ts`, `parking.ts`, `incidents.ts` (bomb choice and ransom, fire response timing, repair cost) | Their "nearest" and "adjacent" helpers need 2D distances (see below). |
| Save infrastructure | `gameProgress.ts` versioned `SavedSandbox`, `migrateSandboxPayload`, runtime snapshots (`snapshot*Runtime`); `saveHealth.ts`, `useDirtyAutosave.ts`, `dirtyCommands.ts` (exhaustive over `EngineCommand`), `cloudSync.ts`, `useCloudSaveSync.ts`, `saveBudget.ts` | Reuse the pattern and the code. Write a new schema with compact encoding or compression from day one (finding 8). |
| Cloud API | `app/Http/Controllers/Api/TowerSaveController.php`, `app/Models/TowerSaveSlot.php`, `StoreTowerSaveRequest` | The payload is opaque and the lease model is generic. Add a game key or a sibling table, and a wire version. |
| HUD shell | `hud/TopBar`, `FinancialsPanel`, `Toasts`, `ToastHistoryDrawer`, `IncidentBanner`, `TenantRequestCard`, `LoanDialog`, `TowerIssuesNavigator`, `TowerInventory`, `GettingStarted`, `SpeedControls`, `BuildPalette` (family flyouts, search, tooltips), `overlays/SaveLoadOverlay`, `NewGameOverlay`, `dialogFocus`, `blockingModals` | Mostly reusable. They read `HudSnapshot` and catalog defs. |
| Catalog schema and balance invariants | `engine/catalog.ts` `ItemDef` (cost, maintenance, income, capacity, noise, affinity, star gate), `UPGRADE_PATHS`; the `TUNING` block and the spec-table check in `balance.test.ts` | Footprints change from `width × storeys` to `w × d × h`, and rotation is new. |
| Map / build-direction model | `engine/maps.ts` `MapDefinition`; `engine/mapGeometry.ts` `supportFloorFor`, `outwardNeighbour`, `inwardNeighbour`, `isExcavated`, `buildStep`, `floorLabelFor` | Already handles building up and down from an anchor floor (Niagara builds both ways). |

### Must change: the geometry seam

| Today (1D cutaway) | Tower 2 (2D plan per floor) | Where |
|---|---|---|
| `Unit {floor, x, width, storeys}` | `{floor, x, y, w, d, h, rotation}` plus a door or entrance tile | `gameTypes.ts`, `placement.ts` `newUnit`, `itemFootprint` |
| Grid layers indexed `(floor, x)` over `GRID_WIDTH` 375 | `(floor, x, y)`. At 64×64 that is about 450k cells per layer across 110 floors, still fine as typed arrays | `engine/grid.ts` `tileIndex`, `rebuildGrid`, `createGridLayers` |
| Walkability = "a slab is here"; a floor's walkable areas are horizontal runs (`floorSegments`) | Walkable floor or corridor tiles. A unit is reachable only through its door. Walkable areas become flood-filled connected regions; walk legs become tile paths (A* or a corridor graph) | `grid.floorSegments`/`getSegments`; `routing.ts` `searchPath`, `materialize`; `people.ts` walk legs (`fromX`/`toX` become point lists) |
| Every "distance" is a 1D tile gap (`tileGap`) | 2D distance, or path distance on the floor | `occupancy.ts` `amenityTerm`, `landmarkTerm`, `affinityTerm`, `trashTerm`, `restroomComfortTerm`/`nearestRestroomGap`; `heatmaps.ts` `noiseExposureAt` and its fields; `incidents.ts` adjacency (fire spread "horizontally touching", roaches "within 6 tiles"); `parking.ts` and `hotel.ts` "near a shaft stop" checks; `grid.nearestShaftStopDistance` |
| Placement rules: support beneath, overlap in x, shafts span floors | Rectangle overlap, per-tile support, the door must open onto a walkable tile, shafts and stairs are footprints with a facing | `placement.ts` `validateItemPlacement`, `validateShaftPlacement`, `computeShaftStops` (fix findings 1 and 10 there first) |
| Falls void = an x-range exclusion | 2D exclusion polygons or masks per floor | `mapGeometry.ts` `intersectingBuildExclusion`, `horizontalBuildRegions` |

**Suggested approach.** First move the 1D distance and adjacency helpers in Tower Throwback behind a small `TowerGeometry` interface, for example `segmentOf`, `distance(a, b)`, `adjacent(unit)`, `footprintCells(unit)`, `nearestStop(...)`. Prove with the golden logs and the completed-tower fixture that the output stays byte-identical. Then Tower 2 supplies a 2D implementation and shares everything listed under "Reusable".

The O(n²) eval scans (finding 9) get worse in 2D, so a spatial index per floor belongs in that shared core.

### Must change: rendering and input

- **Camera and picking.** `scene/camera.ts` (`createCameraRig`, `panByPixels`, `zoomBy`) and `sceneController.screenToTile` assume an orthographic side view where screen `y` is the floor. Isometric needs:
  - a rotated orthographic camera;
  - picking by casting a ray against the active floor's plane;
  - a cutaway: hide or ghost floors above the active one and dim those below;
  - depth sorting for sprites.

  The floor navigator (`hud/FloorNavigator.tsx`) becomes the main control, not an aid.
- **Art.** `scene/structureMesh.ts` (merged z-layer quads), `scene/styleGateArt.ts` and the generated side-view atlas manifest don't carry over. Tower 2 needs isometric tiles: floors, walls with cutaway variants, room interiors and props.
- **What does carry over** is the scene architecture:
  - the mount-once `TowerScene` with refs;
  - `dynamicPools.ts` (instanced fixed-cap pools with presentation-only glide);
  - heatmaps, which get simpler as per-floor 2D textures;
  - issue badges;
  - the `contextLoss` and disposal helpers;
  - the `visualTestMode` harness and the draw-call budget spec (add a large-tower scenario, finding 14).
- **Touch input** also carries over: `scene/touchGestures.ts` and the shift-drag grid builder.

## Execution plan

Run the steps in order. Steps 2–3 and step 4 can proceed in parallel once step 1 is done.

1. **Precondition.** Tower Throwback's open engine work has merged: #176 (save compression and the linear
   08:00 pass) and #178 (congestion, staggered re-leasing, load-aware routing). Tower 2 shares that engine.
2. **Geometry seam in Tower Throwback.** Move the 1-D distance and adjacency helpers listed above behind a
   small `TowerGeometry` interface: `segmentOf`, `distance(a, b)`, `adjacent(unit)`, `footprintCells(unit)`,
   `nearestStop(...)`. The golden logs and the completed-tower fixture must stay byte-identical. There is
   no player-visible change. Put the per-floor spatial index (from #176) behind the same interface.
3. **Shared engine module.** Move the parts in "Reusable almost unchanged" into a game-neutral module, for
   example `resources/js/games/_shared/tower-engine/`, that both games import. Tower Throwback's suites, golden
   logs and e2e must pass unchanged after each move.
4. **First playable prototype**, at an unlisted route like the Plate Escape lab boards. It answers one
   question: is drawing floors fun? Scope:
   - one site, six floors, footprint painting with inheritance, setbacks and one atrium;
   - modules for four uses (studio, startup office, shop, café), placed against drawn corridors, and one core type;
   - "Inherit floor below" for plates;
   - floor stepping and the isometric cutaway view, on desktop and a phone;
   - light and walk overlays computed live;
   - a handful of people walking from the lobby to rooms through cores and corridors.

   It leaves out the economy and stars. It needs a new Vite entrypoint, Blade shell and route; follow
   AGENTS.md and the per-game CI wiring used by earlier games.
5. **Playtest, then decide** the economy, tenants, scenarios and simulation depth for the first real slice.
   Plazas fit straight into the existing scoring and belong in that first slice; trash carries over from
   Tower Throwback. Electricity, water and the environmental rating come next, since plant rooms and risers
   change how floors are planned. Buying land, several buildings,
   sky bridges and the surface-to-underground parking upgrade come after it, with a "Twin Towers" scenario to
   teach them.

Suggested split for parallel agents: one on steps 2–3 (in the Tower Throwback code), one on step 4 (new code
only). The coordinator merges step 2 first.

## Open questions, with recommendations (not yet confirmed)

| Question | Recommendation |
| --- | --- |
| Corridors drawn, or implied by a corridor spine? | Drawn, since circulation is one of the four pressures; modules place against them |
| Simulation as detailed as Tower Throwback's? | Keep its people model, but cap the crowd |
| Plan size and people limit? | 40×40 tiles per floor and about 1,500 people, to stay smooth on phones |
| Do utilities ever fail outright (blackouts, burst pipes), or only degrade? | Only degrade, with warnings first; outright failures, if any, belong in Tower Throwback-style incidents |
| Share the engine, or copy it? | Share, through steps 2–3, so fixes reach both games |
