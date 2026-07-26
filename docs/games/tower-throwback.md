# Tower Throwback — Product & Engineering Spec

A SimTower/Yoot Tower throwback: grow an empty lot into a landmark tower, progressing
1★ → 5★ and finally the **TOWER** rating through each map's prestige structure, with a real-time accelerated
people simulation, an income/expense economy, and procedural Web Audio SFX.

- Route: `/tower-throwback` · Catalog id: `tower-throwback` · Emoji: 🏙️
- Renderer: three.js WebGL, orthographic 2D side-view cross-section with a generated WebP atlas,
  map-specific ambience, and colored-quad fallbacks.
- Saves: single autosaved sandbox (versioned localStorage), resume on load, "New tower" reset.
- No lose condition. TOWER is a celebration, not a terminus — the sim runs indefinitely.

This document is **normative**: module implementations and tests must match the rules and numbers
here. All tuning constants are mirrored in a single `TUNING` block in `gameTypes.ts`; if code and
spec disagree, fix one to match the other in the same commit.

---

## House conventions

Follows the repo's game conventions (see `docs/games/chicks-challenge.md` for the template):
`index.tsx` → `TowerGame.tsx` (shell) → `TowerScene.tsx` (three.js mount-once, props mirrored to
refs) + pure headless `engine/` (node-jest) + `scene/` + `hud/` + `overlays/` + `audio/` +
versioned `gameProgress.ts`. Fixed-timestep loop per the hover pattern (mutable `EngineState` in a
ref, `stepEngine(state, input, dt): EngineEvent[]`, accumulator, rAF park/wake, 10 Hz HUD
snapshots). Seeded mulberry32 RNG; determinism via id-order iteration and golden event logs.

## Map extensibility

The engine consumes a `MapDefinition {id, name, lobbyAnchorFloor, buildDirection, floorRange,
horizontalBuildExclusions, disallowedItems, endgameItem, endgamePlacementFloors, spawnSources,
undergroundAllowed, excavationBelowAnchor, paletteTheme}`. `CITY_TOWER` builds from its floor-0 lobby across B10..99. `NIAGARA_FALLS`
builds in both directions from a clifftop lobby across B30..15; its axis never inverts. Placement,
catalog availability, schedules, endgame selection, and the scene palette all read the active map —
item availability = f(star, map). Niagara has no subway and the gorge below its anchor is not
charged as New York-style excavation.

Niagara defines a true horizontal Falls void at columns `189..<277`. Ordinary lobbies, slabs,
rooms, and shafts can occupy either bank but never the void. A Skybridge is the explicit exception:
it may span the complete gap when both bank endpoints are supported, after which normal walk routing
connects the two bank segments. The Observation Deck may crown the map at B30 or 15; its supported
18-tile bank side determines a stored facing and its six-tile cantilever always points toward the
Falls. While a build tool is active, a translucent one-draw guide shows both buildable banks and the
bridge-only void from this same map geometry; idle play remains scenic.

Art direction is clean-lined dimensional neo-90s management-sim illustration: readable construction
geometry with restrained perspective, bevels, side planes, highlights, material cues, and soft
shadows, modernized through smooth natural curves, polished gradients, atmospheric depth, and
contemporary lighting. Avoid pixelation, low-resolution sprites, dithering, voxel/block texture, flat
unshaded objects, and photorealism. Gameplay geometry and people remain crisp over quieter scenery.

## Star progression

Population = workers + residents + checked-in guests. Each star-up additionally requires a
successful VIP visit (see VIP system).

| Rating | Requirement | Unlocks |
|---|---|---|
| 1★ | start | Floor slab, lobby (height 1/2/3 chosen at start, permanent, may be discontinuous → twin towers), skylobby (any floor ≥5), stairs, standard/express/service elevators, office S, apt studio, restroom, shop, fastfood |
| 2★ | pop ≥ 300 + VIP | office M, apt 1BR, escalator, food court, restaurant |
| 3★ | pop ≥ 1,000 + VIP | underground B1–B10 (excavation), hotel (reception + rooms 1p/2p/suite), housekeeping, apt 2BR, movie theater, fitness center, conference center, trash room, parking ramp + spaces, subway (B10 only) |
| 4★ | pop ≥ 5,000 + VIP suite-stay | office L, skybridge, glass elevator, fancy restaurant, swimming pool, spa, security office, recycling center, medical clinic |
| 5★ | pop ≥ 10,000 + VIP suite-stay | apt 3BR penthouse, event space, the active map's prestige structure |
| TOWER | Prestige structure built at the map terminal floor (5★, adjacent to a shaft stop) | Building beyond it locked; TOWER VIP penthouse resident; sim continues indefinitely |

**Star loss** (VIP resident moves out): the lost star must be re-earned before progressing to
HIGHER stars, but placement always uses `maxStarReached` — demotion never restricts building.

## Build controls & placement previews

- The build toolbox is a compact three-column icon grid, with no parallel category-tab layer.
  Closely related variants share one family button (including offices, apartments, hotel rooms,
  elevators, dining, wellness, events, parking, and waste). Clicking or tapping a family opens an
  accessible flyout; choosing a variant selects it, while singleton icons select immediately.
  Family controls use normal disclosure and Tab behavior. Search matches individual variants even
  when they normally live inside a family. The palette stays intrinsic-height on normal screens
  and gains a bounded internal scroll region only when the viewport is too short to contain it.
- Icons are large enough to identify at a glance. Hovering or focusing an icon shows its name,
  footprint, cost, maintenance, income/capacity where applicable, placement limits, and unlock
  requirement. Locked options remain focusable for this information but cannot be placed.
- Holding Shift while dragging an item lays out a rectangular grid. The modifier and selected tool
  are latched for that pointer gesture, so repeated grids behave consistently even if Shift or the
  toolbar selection changes before pointer-up. Shafts remain single-placement tools.
- The build footprint is its own foreground preview: translucent green means the footprint is
  valid, and red means it is invalid. It must remain visually distinct from all range information.
- Units with spatial effects add a separate preview behind the footprint while positioning them.
  Cyan shows beneficial service reach (the restroom's same-segment, same-floor 32-tile coverage);
  amber shows noise impact using each catalog item's horizontal radius and the normative
  same-floor/±2-floor propagation below. This range preview disappears when placement ends and
  never replaces or recolors the green/red build footprint.

## Item roster & balance table

Starting funds **$2,000,000**. Sizes are tiles × storeys (1 storey unless noted). Income/maint per
game-day unless noted. This table is transcribed into `engine/catalog.ts` — the catalog is the
single source of truth at runtime; this table is normative for its values.

| Item | Size | Cost | Income | Maint | Capacity / Notes |
|---|---|---|---|---|---|
| Slab / excavation | 1 | $50 / $500 | — | — | prerequisite layer for everything |
| Lobby (per tile) | 1×h | $300×h | — | $5 | floor 0 only; height 1/2/3 fixed at new-game |
| Skylobby (per tile, min width 12) | 1 | $1,500 | — | $15 | floor ≥ 5; express transfer point |
| Skybridge (per tile) | 1 | $4,000 | — | $10 | 4★; merges tower segments |
| Stairs | 2×1 | $5,000 | — | $10 | people walk ≤4 floors via stairs |
| Escalator | 4×1 | $12,000 | — | $50 | commercial floors only |
| Standard elevator | w2 | $50,000 + $5,000/floor | — | $200/car | reach ≤30 floors; car cap 20; max 6 cars; +car $40,000 |
| Express elevator | w3 | $200,000 + $10,000/floor | — | $500/car | ≤5 stops; car cap 40; max 4 cars; +car $40,000 |
| Service elevator | w2 | $80,000 + $5,000/floor | — | $150/car | all floors; car cap 10; max 4 cars; staff/trash only |
| Glass elevator | w2 exterior | $150,000 + $8,000/floor | — | $400/car | 4★; exterior facade column; car cap 15; max 2 cars; scenic eval boost |
| Office S / M / L | 6 / 9 / 12 | $20k / $40k / $80k | $400 / $900 / $2,000 rent | — | 4 / 8 / 16 workers; a same-floor restroom lifts eval (comfort drag when far/absent, not a hard block) |
| Apt studio / 1BR / 2BR / penthouse | 4 / 6 / 8 / 16 | $15k / $25k / $40k / $150k | $200 / $350 / $600 / $2,500 rent | — | 2 / 3 / 5 / 6 residents |
| Restroom | 4 | $10,000 | — | $100 | serves offices within 32 tiles, same segment |
| Shop / FastFood | 8 / 12 | $30k / $50k | $15 / $10 per customer | $150 / $250 | fastfood noisy near residences |
| Food court | 16 | $80,000 | $8/customer | $400 | mass lunch capacity |
| Restaurant / Fancy restaurant | 10 / 12 | $60k / $120k | $25 / $60 per diner | $300 / $500 | dinner traffic; fancy is VIP-relevant |
| Movie theater | 20×2 | $200,000 | $20/ticket | $800 | evening/weekend anchor; cost cut in Phase 13 to satisfy the 90-day payback invariant |
| Fitness center | 12 | $70,000 | $10/visit | $300 | 3★; eval boost nearby apt/hotel |
| Swimming pool | 20×2 | $200,000 | $8/visit | $700 | 4★; VIP-relevant |
| Spa | 12 | $150,000 | $40/visit | $500 | 4★; VIP-relevant |
| Conference center | 24×2 | $300,000 | $15/attendee | $800 | 3★; office-oriented tower-wide boon |
| Event space / ballroom | 30×2 | $500,000 | ~$5,000/event | $1,000 | 5★; hotel-oriented |
| Hotel reception | 10 | $50,000 | — | $300 | must be within 3 tiles of a shaft stop |
| Hotel 1p / 2p / suite | 4 / 6 / 10 | $20k / $35k / $100k | $350 / $600 / $1,800 per occupied night | $20 ea | dirty after checkout until housekeeping cleans; rates raised in Phase 13 to satisfy the 90-day payback invariant |
| Housekeeping | 8 | $30,000 | — | $200 | staff ride service elevators only |
| Trash room | 6 | $25,000 | — | $100 | holds 120 trash; overflow tanks nearby eval |
| Recycling center | 20 (underground) | $150,000 | — | $400 | trash-chain endpoint; halves trash accumulation |
| Parking ramp | 6×1 per basement floor | $30,000 | — | $100 | chainable B1→B10; each parking floor needs ramp access |
| Parking space | 2×1 (underground) | $3,000 | — | $10 | stall on ramp-served floor |
| Subway station | 30 (B10 only) | $300,000 | — | $500 | injects commuters/shoppers |
| Security office | 10 | $50,000 | — | $300 | incident response radius + passive eval boost |
| Medical clinic | 12 | $80,000 | — | $300 | eval boost |
| Cathedral | 30×2 | $1,000,000 | — | — | New York TOWER structure at floor 99; locks building above |
| Observation Deck | 24×2 | $1,000,000 | — | — | Niagara TOWER structure at B30 or 15; 18 tiles supported on a bank, 6 cantilevered into the Falls void |

**Upgrade paths** (`upgradePaths {from, to|grade, cost, starRequired}`, footprint preserved,
applied from the inspect panel): fastfood → restaurant ($40k, 2★) → fancy restaurant ($80k, 4★);
hotel room standard → luxury grade ($30k 1p / $50k 2p / $80k suite, 4★; +60% nightly rate,
attracts high/VIP guests); trash room → recycling trash room ($60k, 4★; halves haul cost).

---

# Normative rules & numbers

Everything below is the authoritative tuning. `gameTypes.ts` carries these in one `TUNING` block.

## Time & simulation

| Constant | Value |
|---|---|
| Fixed timestep `DT` | 1/60 s real; `MAX_SUBSTEPS` 5 |
| Clock rate | 1 real second = 2 game-minutes at 1× (speeds ⏸ / 1× / 2× / 4× / 8× / 16×) |
| Person tick | 8 Hz · HUD snapshot 10 Hz |
| `MAX_ACTIVE_PEOPLE` | 2,000 (overflow journeys deferred, never dropped) |
| Week | 7 game-days; days 6–7 are the weekend |
| Day phases | night 22:00–06:00 · morningRush 06:00–09:30 · day 09:30–11:30 · lunch 11:30–13:30 · afternoon 13:30–17:00 · eveningRush 17:00–19:00 · evening 19:00–22:00 |
| Grid | `GRID_WIDTH` 375 tiles × floors −10..99; `ADJACENCY_TILES` 3 |
| Movement (game-min rates) | walk 60 tiles · stairs 2 floors · escalator 4 floors · elevator car 10 floors; door open/close 4 game-sec each side of the dwell |
| Wait stat | `Shaft.stats.avgWaitGameMin` = EMA (α 0.1) of wait sampled at each boarding |

## Eval formula (unit desirability, 0–100)

```
eval(unit) = clamp(0, 100,
    60                                        // base
  + amenityBonus                              // sum of in-range amenity bonuses, cap +20
  + landmarkBonus                             // +5 near the active map's reachable, operational masterpiece
  + fallsViewBonus                            // Niagara only: +5 for an unblocked lateral view toward the Falls void
  + affinityBonus                             // +5 if ≥3 units of same kind-group on the floor
  + superLobbyBonus                           // tower-wide: 0 / +3 / +6 for lobby height 1/2/3
  + glassBonus                                // +3 if within 8 tiles of a glass elevator column
  + liveWorkBonus                             // residential only: +4 while occupied office seats ≥ 25% of tower residents (live near work)
  − noisePenalty                              // see noise model, cap 30
  − congestionPenalty                         // avgWaitGameMin at nearest serving stop × 1.5, cap 25
  − trashPenalty                              // 10 if trash overflow within 16 tiles
  − dirtyPenalty                              // hotel rooms: 15 while dirty
  − incidentPenalty                           // 10 while explosion/fire-damaged and for 3 game-days after repair
  − parkingPenalty                            // offices only: 5 while a parking shortfall persists (3★+)
  − infestationPenalty                        // 10 when roach-adjacent to an infested unit
  + requestBonus )                            // tower-wide +3 while a fulfilled tenant request glows
```

Amenity bonuses (in range = within 20 tiles / 6 floors on the same segment, or ≤1 elevator leg):
fitness +4 · pool +4 · spa +4 · medical clinic +3 · security office +3. Tower-wide when built:
conference center +5 (offices only) · event space +5 (hotel rooms only).

The active map's standing Cathedral or Observation Deck grants nearby reachable occupiable units a
separate +5 `landmarkBonus` within 20 tiles / 6 floors. Niagara income units within 30 lateral tiles
of either Falls bank receive +5 `fallsViewBonus` when no same-floor non-structure unit blocks the
line toward the void. Both factors are explicit in the Eval inspector and remain subject to the
overall 0–100 clamp.

**Leasability thresholds** by rent tier: low ≥ 35 · avg ≥ 50 · high ≥ 65. A unit below its
threshold cannot lease; an occupied unit below threshold for 3 consecutive daily settlements is
at move-out risk (see below).

## Noise model

| Source | Level | Radius (tiles) |
|---|---|---|
| FastFood | 12 | 8 |
| Shop | 6 | 6 |
| Food court | 14 | 10 |
| Restaurant | 10 | 8 |
| Fancy restaurant | 8 | 8 |
| Movie theater | 16 | 12 |
| Event space | 18 | 14 |
| Escalator | 8 | 5 |
| Fitness center | 10 | 8 |
| Lobby/skylobby crowd | up to 10 (∝ traffic) — deferred, not simulated in v1 | 6 |

Propagation: same floor 100% · one floor away 50% · two floors away 25% · beyond two floors none.
Noise therefore travels horizontally and bleeds vertically with distance.
`noisePenalty = sensitivity × Σ_sources max(0, level × (1 − dist/radius))`, cap 30.
Sensitivity: **apartments ×2.0 · hotel rooms ×1.0** (the classic 240px vs 120px rule) ·
offices ×0.5 · commerce/services ×0.

## Patience, stress marks, move-out

Queue patience by income tier (game-minutes): low 120 · med 90 · high 60 · vip 40.
Rent-tier tolerance multiplier — applies to patience AND the stress-mark threshold:
low rent ×1.5 · avg ×1.0 · high ×0.7.

- Patience expiry → person tints red, reroutes or abandons; +1 stress mark on their tenant unit.
- **Route severance → immediate move-out**: when a structure change (demolition, disabling an
  elevator stop) leaves an occupied office/apartment/hotel room with no route to a ground lobby,
  its tenants vacate IMMEDIATELY with `vacancyReason: 'noRoute'` — they don't wait for a daily or
  weekly settlement. VIP homes are exempt (VIP move-outs go through the VIP satisfaction system).
- Weekly settlement (end of day 7): a unit vacates if stress marks that week ≥ `ceil(3 ×
  toleranceMultiplier)` OR it spent ≥3 consecutive days below its leasability threshold.
  `vacancyReason` = dominant cause ("elevator too crowded", "too noisy", "no restroom nearby",
  "rent too high", "no route to lobby", "hotel room dirty / no reception"). Marks reset weekly.

## Spawn schedules & rates

- **Office workers**: capacity arrives 07:00–09:30 uniformly (weekdays); lunch trip probability
  0.7/worker in the lunch phase; depart 17:00–19:00. Offices closed weekends.
- **Residents**: 80% depart 07:00–09:00 weekdays, return 17:30–19:30; weekend errand trip
  probability 0.5/resident, 10:00–20:00.
- **Exogenous shoppers**: per game-hour 10:00–21:00, `N = (2 + star) × commerceCount^0.7`,
  ×1.5 weekends. Sources: street lobby 70% / subway 30% (100% street if no subway).
  Income mix of exogenous visitors: low 50% · med 35% · high 15%.
- **Hotel guests**: nightly occupancy target = `totalRooms × min(0.9, 0.4 + 0.05×star +
  0.2×avgHotelEval/100)`; check-in 18:00–22:00, checkout 07:00–09:00 (room turns dirty at
  checkout). Rooms operate only while a hotel reception exists; luxury-grade rooms accept
  high-tier guests only and bill ×1.6 nightly. Housekeepers dispatch after checkout via
  service elevators only (4 concurrent per housekeeping unit, 30 game-min per clean); dirty
  rooms are skipped for check-in until cleaned.
- **Affordability gates**: fastfood/food court = all tiers; shop/restaurant/theater/fitness =
  med+; fancy restaurant/spa/luxury rooms = high+; VIP = everything.
- **Interior activity art** is presentation-only: weekday offices show workers from the first
  arrival through the last departure, commerce shows patrons only while visitors dwell there,
  restrooms show daytime activity, and occupied residences/hotel rooms switch from awake interiors
  to sleeping interiors overnight. These frame choices do not create people or affect the sim.

## Elevator SCAN policy

- Per shaft: collective control. A car serves calls in its travel direction until none remain
  ahead (SCAN), then reverses if calls exist behind, else idles. An idle car returns to its
  **home floor** (if programmed) after 5 idle game-minutes.
- **Direction-matched stops**: a moving car opens its doors only where a passenger alights or a
  hall call in its continuing direction waits. Opposite-direction calls ahead are never
  intermediate stops — when they are the only work ahead, the car rides to the **farthest** such
  call, reverses there, and sweeps back boarding floor by floor (the classic morning down-peak:
  climb to the top call, collect on the way down).
- **Full-car express**: a car at capacity receives no hall-call assignments — it serves only its
  passengers' destinations until seats free up. The scene marks such cars with an `F` badge.
- **Hall-call assignment**: candidate cars = stop-enabled, capacity-available, moving toward the
  call or idle. Cost = distance in floors. An idle car wins over a moving car only if it is ≥
  `idleAnswerThreshold` floors closer (0–15, default 3). Ties → lowest car index.
- **Direction priority** acts in the two places it is observable (a uniform per-call assignment
  bonus would shift every candidate equally and change nothing): (a) an idle car choosing among
  multiple waiting calls applies a 3-floor cost bonus to calls in the favored direction; (b)
  **idle repositioning** — an empty idle car drifts to the shaft's lowest enabled stop under
  `expressToTop` (the classic morning return-to-lobby) or its highest under `expressToBottom`;
  `balanced` = no bias.
- **Boarding**: FIFO per floor+direction queue; board to capacity; passengers left behind rejoin
  the queue head with patience reduced 25%.
- **Stop controls**: enabled landings show their shared floor number on the shaft. A plain shaft
  click toggles that landing and still selects the shaft; disabled candidate landings keep a dim
  plate without a number.
- **Queue presentation**: up to 20 waiting people line up from the shaft door toward the side with
  more floor space, above room and occupancy-bar art; longer queues add an overflow badge. Slot
  gliding is presentation-only and never changes engine order or timing.
- **Programs**: two per shaft — WD (weekday) and WE (weekend) — each with a per-phase direction
  priority (morningRush / day+lunch+afternoon / eveningRush / evening+night slots).
  `doorDwellSec` (game-seconds doors stay open, 0–30, default 8). Per-car home floors.
- **Shaft resize**: with no build tool selected, drag the machinery cap one floor above or below a
  shaft to set that end's absolute floor. Added floors cost the shaft's per-floor rate; removed
  floors refund at the demolition rate. Stops are re-derived, at least one enabled stop must
  remain, cars clamp into the new span, and journeys using removed landings re-plan immediately.
- **Determinism**: shafts iterate by ascending id, cars by index, queues FIFO; elevator logic
  consumes NO rng. Defaults are sensible so casual players can ignore programming entirely.

## Golden-log acceptance scenarios (Phase 4 gate)

- **GL-1 morning rush, balanced**: one standard shaft floors 0–10, 2 cars, 12 workers spawned at
  fixed times at the lobby targeting floors 3/5/7 → assert the exact assignment/pickup/dropoff
  event sequence.
- **GL-2 program bias**: same setup, WD morningRush = `expressToTop` → assert the changed sequence.
- **GL-3 idle threshold**: cars at floor 8 (idle) and 0→6 (moving); hall call at 7. Threshold 3 →
  idle car answers; threshold 15 → moving car answers. Assert both.
- **GL-4 same-seed identity**: midgame scenario stepped 10 game-hours twice with seed 12345 →
  event logs byte-identical.

## VIP scoring rubric

Visit score starts at 100; success threshold **≥ 70**.

| Event during visit | Delta |
|---|---|
| Elevator wait beyond 5 game-min (per leg) | −3 per extra game-minute |
| No route to a required destination | auto-fail |
| Noise exposure event (in a zone with noisePenalty ≥ 15; a venue's own noise is expected ambiance — exempt when the zone's dominant source is the unit being visited) | −10 each |
| Hotel room dirty at check-in (4★/5★ visits need a clean vacant suite; none → auto-fail) | −20 |
| Trash overflow within 16 tiles of the VIP's path | −10 |
| Distinct amenity visited (fancy restaurant, spa, pool, fitness, theater) | +5 each, cap +15 |

Success → star-up + cash bonus + golden move-in (studio / 1BR / 2BR / 2BR / penthouse per level).
Fail → complaint report (top deductions listed) + 3-game-day cooldown, then the visit re-arms.
**Resident VIP satisfaction**: starts 80; weekly delta = +5 if their unit's eval ≥ 70 else −10;
additional −5 in any week their unit takes ≥2 stress marks. Below 40 → move-out → star loss.

## Incidents

- **Bomb threat**: daily 09:00 check (weekdays), `P = min(0.004 × star + pop/500,000, 0.03)`.
  Choice: pay ransom `$50,000 × star`, or security sweep taking `30 + 4 × coverageDistance`
  game-min, where coverageDistance = |Δfloors| + Δtiles/10 from the nearest security office. No
  security office → ransom or a 25% explosion risk. A threat ignored for 60 game-minutes
  auto-resolves down the same 25% risk path. Explosion: 12-tile span on the threat floor
  goes offline; repair $2,000/tile. Offline explosion-damaged units render a deterministic
  per-tile **blown-up** overlay until repaired.
- **Fire**: daily from 4★ onward. Tower ignition probability is
  `min(1, fire.baseDailyP × riskWeight)`, where each kitchen contributes `kitchenWeight`, each
  already-damaged unit contributes `damagedWeight`, and every other occupied unit contributes
  1. A successful roll picks one unit by those same weights in id order. The nearest online
  security office responds in `30 + 4 × coverageDistance` game-minutes, using the bomb-sweep
  distance `|Δfloors| + Δtiles/10`. Until response, flames spread every 15 game-minutes to units
  with horizontally touching footprints on the same floor. Response extinguishes the fire;
  burned units go offline, vacate, and render deterministic per-tile **burned-down** overlays.
  Without an online security office, the whole contiguous slab segment burns before the fire
  self-extinguishes. Fire repairs cost $2,500/tile through the normal repair command and retain
  the 3-game-day post-repair incident eval penalty.
- **Cockroach infestation**: daily per food unit with eval < 40, `P = 0.05` to spawn. Spread:
  each infested unit infects each adjacent unit (same floor within 6 tiles, or directly
  above/below) with `P = 0.15`/day. Infested units earn $0 and give neighbors −10 eval. Clear by
  demolition (normal refund) or pest control $5,000/unit.
- **Tenant requests**: at most one active; generated Mondays 08:00 from the largest real deficit
  (missing food near offices, no parking for hotel, no express at scale, missing restroom).
  Fulfil within 7 game-days → $25,000 (posted as a positive `incident.cost` ledger entry —
  the signed convention keeps the whole incident story on one line) + tower-wide +3 eval for 7 days.

All incident rolls use the single seeded rng stream in fixed id-order — deterministic per seed.

New disasters do not begin until the tower has reached 4★, when security offices become eligible;
a later star loss does not revoke that eligibility. The Save / Load settings include a mid-game
**Disasters** option. Turning it off prevents new
bomb threats, fires, and infestation spawns; incidents already active continue resolving. The
disabled guard runs before every ignition/spawn rng call, so an incident-free disabled tower
consumes zero disaster rng draws. Legacy saves default this option to on.

## Hotel & trash constants

| Rule | Value |
|---|---|
| Housekeeper clean time | 30 game-min per room; 4 concurrent staff per housekeeping unit |
| Luxury room rate | ×1.6 nightly; accepts high-tier guests only (VIP in Phase 10) |
| Trash generation | 1 unit per occupant per day, settled at midnight into the NEAREST trash room |
| Trash room capacity | 120 units; recycling-grade room or a recycling center halves accumulation (×0.5) |
| Trash haul | rooms empty daily at 04:00 (2 staff haul journeys per room via service elevators, to the recycling center when one exists, else to street); overflow only when a day's generation exceeds capacity |
| Overflow effect | a full trash room flags `trashOverflow`; units within 16 tiles on the same floor take the −10 eval penalty; no trash room in the tower → no overflow mechanic (item class unlocks at 3★) |
| Parking shortfall gate | the −5 office eval penalty applies only once parking is unlocked (maxStarReached ≥ 3) |

## Commerce traffic constants

| Rule | Value |
|---|---|
| Evening diners | per game-hour (on the half-hour) 17:00–21:00: `3 × (1 + star) × restaurantCount^0.7` (restaurants + fancy; affordability gates apply), ~40 game-min dwell |
| Theater showtimes | 19:00 & 21:00 daily + 14:00 weekend matinee; crowd = `20 + 10 × star` (med+ tiers), split evenly across theaters, 90 game-min dwell |
| Amenity visits | planned daily at 08:30 per resident/guest: fitness P 0.1 (med+) · pool P 0.08 (med+) · spa P 0.05 (high+), first hit wins; residents visit 17:00–20:00, hotel guests 09:00–11:00, 45 game-min dwell with return |
| Conference | weekdays: two batches (09:00, 13:00) of `ceil(15 × star / 2)` med/high visitors; income per attendee on arrival |
| Event space | weekends 18:00: $5,000 posted per event space ('events.income') + 30 high-tier visitors routed to it, 120 game-min dwell; one event per space per weekend day |
| Upgrades | in-place from the inspect panel; footprint PRESERVED even where catalog widths differ; charged as construction; income/noise/affinity follow the new kind immediately |

## Economy constants

| Rule | Value |
|---|---|
| Rent tier multipliers | low ×0.8 · avg ×1.0 · high ×1.25 of catalog rent |
| Tenant tier mix by rent | low rent → 70% low / 30% med · avg → 20/60/20 low/med/high · high → 30% med / 70% high |
| Rent/maintenance settlement | daily at midnight; per-visit sales and construction post immediately |
| Loan | $100,000 increments; repayment 5% of outstanding principal per game-day, interest-free, as a ledger line item; offered automatically whenever funds would go below zero; refinance indefinitely |
| Starting funds | $2,000,000 |
| Star-up bonus | $100,000 × new star level |
| VIP visit bonus | success $50,000 × star · fail $10,000 |
| Demolition refund | 50% of build cost |
| Foot-traffic pass-by | walking past a shop/fastfood on the same floor: purchase P = 0.15 / 0.10, credited at 50% of the item's per-customer income |
| Parking demand | 1 space per hotel suite + 1 per 4 offices; car-commuter share of med/high workers = min(1, spaces/demand); shortfall arrives at street lobby with −5 office eval while it persists |
| Balance invariant | every income item pays back its build cost within 90 game-days at target occupancy (tested) |

## Routing rules

- Nodes = floor segments (maximal walkable runs per floor). Twin towers are separate segments
  until a skybridge merges them.
- Edges: shaft stops, stairs (people willing ≤4 floors), escalators (commercial floors),
  skybridges.
- **Max 2 elevator legs per journey** (one transfer — the classic manual rule); stairs/escalator
  legs don't count. Route cache keyed by segment pair, invalidated on `structureVersion`.
- Units with no route to a ground lobby get `flags.noRoute` and cannot lease.

---

## Persistence

Keys `bwh.tower-throwback.progress.v1` (catalog milestones: started/2★/3★/4★/5★/TOWER → the
game-select card shows milestone progress out of 6) and `bwh.tower-throwback.sandbox.v1`
(v2 snapshot: mapId, seed and exact RNG state, clock, funds, loans, lobbyHeight, star/maxStar, disaster
options, milestones, vips, units[] incl. rentTier/vacancyReason/damageKind, shafts[] incl. programming
and passengers, in-flight people, active incidents/requests, ledgers, pending loan work, and
consequence-bearing engine auxiliary state). Derived grid, routing, and rendering caches rebuild on
load. Autosave runs at midnight settlement and on `visibilitychange`/unmount. V1 snapshots migrate
in memory; malformed or unknown future versions are rejected without overwriting stored bytes.

Import also re-checks each save against its map's *current* geometry — floor range, endgame
placement floors, and horizontal build exclusions. That is deliberately stricter than a pure
schema check: a save is only loadable if the same layout would still be placeable today. The
practical consequence is that widening a map's void invalidates saves that built inside it. Adding
Niagara's Falls void did exactly that to pre-void Niagara saves holding units or shafts in columns
`189..<277`; they are dropped rather than migrated, and the tower restarts.

## Classic strategy affordances

Each traditional SimTower tip maps to a real mechanic: super lobbies (tower-wide eval/stress
bonus) · foot-traffic pass-by sales · one-transfer max (makes skylobby-every-≈15-floors emerge) ·
parking ratios · like-with-like floor affinity · noise isolation with apartments 2× hotel
sensitivity · stores near lobbies (spawn-point traffic) · express-to-parking · spread security
offices (coverage distance = response time) · elevator programming (WD/WE, home floors —
odd/even car trick works) · tenant requests as soft tutorial.

## HUD overlays & build UX

- **Issue badges are always visible** (yellow warning / red critical pips per unit, from
  `unitIssues`) — problems like infestation, no-route, dirty rooms, and trash overflow are never
  hidden behind a toggle.
- The overlay toggle (shortcut `O` cycles) offers **None / Noise / Congestion / Eval**:
  - *Noise* / *Congestion* — the heatmap fields from `engine/heatmaps.ts`.
  - *Eval* — per-unit desirability tint over every income-bearing unit: **red** when vacant /
    not operating, else a **yellow→green** ramp by cached `evalScore`
    (`t = clamp((eval − 35) / 50, 0, 1)`).
- A car at capacity shows an **`F` badge** riding the cabin (see Elevator SCAN policy).
- **Bulk build**: holding **Shift** while dragging with an item tool stamps a grid — columns
  tile by the item's width, floors step by its storeys (per-tile items place one full-width row
  per floor). Cells are enqueued bottom-to-top so stacked slab rows support each other; invalid
  cells reject individually with toasts.

## CI wiring

Paths-filter output `tower` (game dir, `_shared`, blade, feature test, jest configs) →
`tower-tests` job → `pnpm run test:ci:tower-throwback`; aggregate gate includes it.
`simulation.slow.test.ts` runs only with `JEST_INCLUDE_SLOW_TESTS=1`.

## As-built deviations

Small, deliberate gaps between this spec and the shipped v1 sim:

- **Lobby/skylobby crowd noise** is not simulated (needs live traffic density; deferred).
- **Elevator queue FIFO** is approximated by person-id order (ids grow with spawn
  time); true arrival stamps would need a Person field.
- **Escalators' "commercial floors only"** placement restriction is not enforced —
  they place anywhere a slab exists.
- **Congestion sampling** measures REAL queued minutes per boarding (the earlier
  patience-derived estimate over-counted the left-behind ×0.75 patience chop).
- **Engine stepping** interleaves elevator service with the 8 Hz person ticks so
  large real-time steps (CI soak chunks, hitchy frames) cannot starve queues.

## Appendix: TUNING reference

Machine-checked by `engine/__tests__/balance.test.ts` — every TUNING leaf key
must appear below with its CURRENT value (JSON-encoded). Change a constant and
this table in the same commit; the test fails otherwise.

| Key | Value |
|---|---|
| `time.dt` | `0.016666666666666666` |
| `time.maxSubsteps` | `5` |
| `time.gameMinutesPerRealSecond` | `2` |
| `time.personTickHz` | `8` |
| `time.hudHz` | `10` |
| `people.maxActive` | `2000` |
| `people.patienceByTier.low` | `120` |
| `people.patienceByTier.med` | `90` |
| `people.patienceByTier.high` | `60` |
| `people.patienceByTier.vip` | `40` |
| `people.reboardPatienceFactor` | `0.75` |
| `people.stairsMaxFloors` | `4` |
| `people.visitorTierMix.low` | `0.5` |
| `people.visitorTierMix.med` | `0.35` |
| `people.visitorTierMix.high` | `0.15` |
| `movement.walkTilesPerGameMin` | `60` |
| `movement.stairsFloorsPerGameMin` | `2` |
| `movement.escalatorFloorsPerGameMin` | `4` |
| `movement.carFloorsPerGameMin` | `10` |
| `movement.doorCycleSec` | `4` |
| `rent.incomeMultiplier.low` | `0.8` |
| `rent.incomeMultiplier.avg` | `1` |
| `rent.incomeMultiplier.high` | `1.25` |
| `rent.toleranceMultiplier.low` | `1.5` |
| `rent.toleranceMultiplier.avg` | `1` |
| `rent.toleranceMultiplier.high` | `0.7` |
| `rent.leasabilityThreshold.low` | `35` |
| `rent.leasabilityThreshold.avg` | `50` |
| `rent.leasabilityThreshold.high` | `65` |
| `rent.tenantTierMix.low.low` | `0.7` |
| `rent.tenantTierMix.low.med` | `0.3` |
| `rent.tenantTierMix.low.high` | `0` |
| `rent.tenantTierMix.avg.low` | `0.2` |
| `rent.tenantTierMix.avg.med` | `0.6` |
| `rent.tenantTierMix.avg.high` | `0.2` |
| `rent.tenantTierMix.high.low` | `0` |
| `rent.tenantTierMix.high.med` | `0.3` |
| `rent.tenantTierMix.high.high` | `0.7` |
| `clinic.copayMultiplier.low` | `0.5` |
| `clinic.copayMultiplier.avg` | `1` |
| `clinic.copayMultiplier.high` | `2` |
| `clinic.copayReachFloors.low` | `30` |
| `clinic.copayReachFloors.avg` | `20` |
| `clinic.copayReachFloors.high` | `12` |
| `clinic.workerDailyP` | `0.03` |
| `clinic.residentDailyP` | `0.03` |
| `clinic.workerWindow.start` | `540` |
| `clinic.workerWindow.end` | `1020` |
| `clinic.residentWindow.start` | `1020` |
| `clinic.residentWindow.end` | `1260` |
| `clinic.dwellMin` | `40` |
| `evalWeights.base` | `60` |
| `evalWeights.amenityCap` | `20` |
| `evalWeights.amenityRadiusTiles` | `20` |
| `evalWeights.amenityRadiusFloors` | `6` |
| `evalWeights.landmarkBonus` | `5` |
| `evalWeights.landmarkRadiusTiles` | `20` |
| `evalWeights.landmarkRadiusFloors` | `6` |
| `evalWeights.fallsViewBonus` | `5` |
| `evalWeights.fallsViewRadiusTiles` | `30` |
| `evalWeights.affinityBonus` | `5` |
| `evalWeights.affinityMinUnits` | `3` |
| `evalWeights.superLobbyBonus` | `[0,0,3,6]` |
| `evalWeights.glassBonus` | `3` |
| `evalWeights.glassRadiusTiles` | `8` |
| `evalWeights.liveWorkBonus` | `4` |
| `evalWeights.liveWorkMinJobShare` | `0.25` |
| `evalWeights.congestionFactor` | `1` |
| `evalWeights.congestionCap` | `25` |
| `evalWeights.restroomComfortPenalty` | `12` |
| `evalWeights.restroomComfortFreeTiles` | `12` |
| `evalWeights.trashPenalty` | `10` |
| `evalWeights.trashRadiusTiles` | `16` |
| `evalWeights.dirtyPenalty` | `15` |
| `evalWeights.incidentPenalty` | `10` |
| `evalWeights.incidentPenaltyDays` | `3` |
| `evalWeights.noiseCap` | `30` |
| `noise.floorPropagation` | `[1,0.5,0.25]` |
| `stress.weeklyMarksBase` | `3` |
| `stress.lowEvalRiskDays` | `3` |
| `elevators.idleAnswerDefault` | `3` |
| `elevators.idleAnswerMax` | `15` |
| `elevators.doorDwellDefaultSec` | `8` |
| `elevators.doorDwellMaxSec` | `30` |
| `elevators.idleReturnHomeMin` | `5` |
| `elevators.priorityCostBonusFloors` | `3` |
| `elevators.waitGraceMin` | `5` |
| `elevators.waitStatEma` | `0.1` |
| `elevators.idleWaitDecayPerPass` | `0.34` |
| `spawn.shopperBasePerHour` | `2` |
| `spawn.shopperCommerceExponent` | `0.7` |
| `spawn.weekendShopperFactor` | `1.5` |
| `spawn.lunchTripP` | `0.7` |
| `spawn.residentCommuteShare` | `0.8` |
| `spawn.weekendErrandP` | `0.5` |
| `spawn.subwayShare` | `0.3` |
| `spawn.hotelOccBase` | `0.4` |
| `spawn.hotelOccPerStar` | `0.05` |
| `spawn.hotelOccEvalFactor` | `0.2` |
| `spawn.hotelOccMax` | `0.9` |
| `hotel.cleanMinutes` | `30` |
| `hotel.housekeepersPerUnit` | `4` |
| `hotel.luxuryRateFactor` | `1.6` |
| `hotel.luxuryMinTier` | `"high"` |
| `trash.perOccupantPerDay` | `1` |
| `trash.trashRoomCapacity` | `120` |
| `trash.recyclingHaulFactor` | `0.5` |
| `trash.haulersPerTrashRoom` | `2` |
| `commerce.eveningDinerBasePerHour` | `3` |
| `commerce.theaterShowtimeMinutes` | `[1140,1260]` |
| `commerce.weekendMatineeMinute` | `840` |
| `commerce.theaterBatchBase` | `20` |
| `commerce.theaterBatchPerStar` | `10` |
| `commerce.fitnessDailyP` | `0.1` |
| `commerce.poolDailyP` | `0.08` |
| `commerce.spaDailyP` | `0.05` |
| `commerce.conferenceAttendeesPerStar` | `15` |
| `commerce.eventMinute` | `1080` |
| `commerce.eventIncome` | `5000` |
| `commerce.eventVisitors` | `30` |
| `vip.successThreshold` | `70` |
| `vip.waitPenaltyPerMin` | `3` |
| `vip.noiseExposurePenalty` | `10` |
| `vip.noiseExposureThreshold` | `15` |
| `vip.dirtyRoomPenalty` | `20` |
| `vip.trashSightPenalty` | `10` |
| `vip.amenityBonus` | `5` |
| `vip.amenityBonusCap` | `15` |
| `vip.cooldownDays` | `3` |
| `vip.residentStart` | `80` |
| `vip.residentGoodWeekDelta` | `5` |
| `vip.residentBadWeekDelta` | `-10` |
| `vip.residentStressWeekDelta` | `-5` |
| `vip.residentEvalGood` | `70` |
| `vip.moveOutBelow` | `40` |
| `economy.startingFunds` | `2000000` |
| `economy.starUpBonusPerStar` | `100000` |
| `economy.vipSuccessBonusPerStar` | `50000` |
| `economy.vipFailBonus` | `10000` |
| `economy.demolitionRefundRate` | `0.5` |
| `economy.loanIncrement` | `100000` |
| `economy.loanDailyRepayRate` | `0.05` |
| `economy.passByShopP` | `0.15` |
| `economy.passByFastFoodP` | `0.1` |
| `economy.passByIncomeFactor` | `0.5` |
| `economy.paybackInvariantDays` | `90` |
| `economy.ledgerHistoryDays` | `30` |
| `parking.spacesPerSuite` | `1` |
| `parking.officesPerSpace` | `4` |
| `parking.shortfallOfficeEvalPenalty` | `5` |
| `stars.popThresholds.2` | `300` |
| `stars.popThresholds.3` | `1000` |
| `stars.popThresholds.4` | `5000` |
| `stars.popThresholds.5` | `10000` |
| `stars.undergroundStar` | `3` |
| `incidents.bombPPerStar` | `0.004` |
| `incidents.bombPopDivisor` | `500000` |
| `incidents.bombPCap` | `0.03` |
| `incidents.ransomPerStar` | `50000` |
| `incidents.sweepBaseMin` | `30` |
| `incidents.sweepPerCoverageMin` | `4` |
| `incidents.noSecurityExplosionP` | `0.25` |
| `incidents.explosionSpanTiles` | `12` |
| `incidents.repairCostPerTile` | `2000` |
| `incidents.fire.baseDailyP` | `0.00002` |
| `incidents.fire.kitchenWeight` | `4` |
| `incidents.fire.damagedWeight` | `2` |
| `incidents.fire.spreadIntervalGameMin` | `15` |
| `incidents.fire.repairPerTile` | `2500` |
| `incidents.fire.starGate` | `4` |
| `incidents.fire.dispatchBase` | `3000` |
| `incidents.fire.dispatchPerUnit` | `1500` |
| `incidents.roachSpawnP` | `0.05` |
| `incidents.roachEvalThreshold` | `40` |
| `incidents.roachSpreadP` | `0.15` |
| `incidents.roachAdjacencyTiles` | `6` |
| `incidents.roachNeighborEvalPenalty` | `10` |
| `incidents.pestControlCost` | `5000` |
| `incidents.requestWindowDays` | `7` |
| `incidents.requestReward` | `25000` |
| `incidents.requestEvalBonus` | `3` |
| `incidents.requestEvalBonusDays` | `7` |
| `routing.maxElevatorLegs` | `2` |
| `grid.adjacencyTiles` | `3` |
| `grid.restroomRangeTiles` | `32` |
| `grid.skylobbyMinWidth` | `12` |
| `grid.skylobbyMinFloor` | `5` |

## Out of scope (v1)

Seasonal cosmetics (Santa) · loan interest · condos (apartments' recurring rent preferred by
design).
