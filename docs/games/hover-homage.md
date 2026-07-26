# Hover (Homage)

Hover is a first-person 3D hovercraft capture-the-flag game mounted at `/games/hover` — an homage to the
Windows 95 pack-in *Hover!*. The player pilots a hovercraft through maze arenas collecting **blue flags**
while a rival drone (the classic pale saucer wrapped in glowing blue rings) races to collect the **red
flags**. Signature UI from the original is reproduced: a **rear-view mirror** top-center, score and flag
status along the top, and a **minimap** plus cockpit dashboard along the bottom. Visual direction is
vibrant and smooth-shaded, deliberately *not* pixelated/retro.

This document is the as-built implementation specification plus the learnings/gotchas from building it
(PRs #1471, #1474, #1475). It is written to be handed to coding agents iterating on Hover or designing
future games. Sections are normative unless marked "tuning" or "future".

## House conventions (must follow)

- **Reference implementations:** `resources/js/games/hover/` is now itself the reference for
  fullscreen/first-person games; `resources/js/games/cars/` remains the reference for the
  scene-host lifecycle it was derived from.
- **Stack:** `three` only — **no cannon-es**; Hover uses custom deterministic 2D physics (see below).
  React 19, TypeScript strict (`noUncheckedIndexedAccess` — index access returns `T | undefined`),
  Tailwind for HUD/overlays.
- **Mount chain:** `routes/web.php` (`games.hover`) → `resources/views/games/hover.blade.php` extends
  `layouts.game` (navbar-less, exactly 100vh) with `<div id="hover-game-root">` →
  `resources/js/games/hover/index.tsx` registered in `vite.config.ts` `laravel({ input: [...] })`.
- **Shell:** **NOT** `PortraitGameShell`. Hover is a fullscreen landscape game: `HoverGame` renders a
  `fixed inset-0 touch-none` container; the WebGL canvas fills it and the HUD is an absolutely
  positioned `pointer-events-none` DOM overlay (interactive controls opt back in with
  `pointer-events-auto`).
- **Persistence:** logged-in scores and per-map clear milestones use timestamped account profile/per-level rows via
  `games/_shared/gameDataPersistence.ts`; anonymous progress uses `bwh.hover-game.progress.v1` and is
  promoted after the first successful account save. Device mute remains local in
  `bwh.hover-game.settings.v1`.
- **Game Select:** entry in `game-select/gameCatalog.ts`; endless games adapt to the level-grid contract
  (see "Catalog adapter").
- **Tests:** colocated `__tests__/`, `.dom.test.ts(x)` (jsdom). Never instantiate `WebGLRenderer` in
  tests — the engine layer is framework-free precisely so it tests headlessly.
- **CI (checklist — Hover initially shipped missing half of this):** adding a game requires ALL of:
  1. `jest.config.cjs` — add the game path to the `JEST_EXCLUDE_GAME_TESTS` ignore list
  2. `package.json` — `test:ci:<slug>` script
  3. `.github/workflows/ci.yml` — path filter under `changes`, an `outputs:` entry, a per-game test
     job, and the `test` aggregator (needs list + result var + failure check + all-skipped check)
- **Lint gotchas:** `simple-import-sort/imports` and unused-imports are errors — run
  `pnpm exec eslint --fix resources/js/games/hover/` before committing.

## Game rules (normative)

- Each **round** spawns an equal number of blue and red flags. Player collects all blue → **map won**;
  drone collects all red first → **map lost**.
- **Loss handling:** on a loss the same map restarts with freshly randomized spawns; cumulative score is
  kept; `MAX_LOSSES_PER_MAP = 3` consecutive losses on one map → **game over**.
- **Scoring (original-style decay):** every uncollected flag shares one value that starts at
  `FLAG_START_VALUE = 500` and decays `FLAG_DECAY_PER_SEC = 4` down to a floor of `FLAG_MIN_VALUE = 100`
  (recomputed from `elapsedSec`, so it is deterministic). Collecting a blue flag banks the current value.
  Map completion adds `MAP_BONUS_PER_CYCLE (1000) × cycle`. Best score persists.
- **Progression:** rounds cycle Castle → City → Sewer → Neon Circuit → Glacier Cavern → Hedge Maze →
  Desert Temple (`TOTAL_LEVELS = MAPS.length = 7`). `cycle = floor(roundIndex / 7) + 1`. Flags per
  team = `min(9, 2 + cycle)` (cycle 1 → 3 each). Pods = `min(8, 4 + cycle − 1)`. Traps =
  `min(5, 1 + cycle)`.
- **Difficulty ramps per level, not just per cycle** (`droneSpeedScaleForRound`): drone speed scale =
  `min(1.1, 0.68 + 0.045 × levelIndex + 0.06 × (cycle − 1))` — a first-time player can beat the
  castle; the temple drone is a real race.
- **Level select:** the attract and game-over overlays list all maps; a map is selectable once
  `bestRoundIndex` has reached it. Starting at a later level gives no score advantage (score always
  starts at 0; the map bonus scales with cycle, not level).
- **Powerup pods** float ~1.5 units up, bob, and show a **visible icon** (faithful to the original's
  visual language): green traffic light = speed up (×1.5 for 8s), red traffic light = slow down (×0.55
  for 6s — avoidable because visible). The **jump pod is a translucent bubble** holding the spring
  icon; collecting it grants **jump power for the rest of the round** (no charges). Jump pods are
  one-shot (no respawn — the power is already permanent); other pods respawn 20s after pickup. Pods
  affect **whoever touches them**, including the drone — except the drone ignores jump pods (it can't
  jump, so consuming them would be a silent no-op that reads as a bug).
- **Jump** (Space / JUMP button, requires jump power) launches a ballistic arc
  (`JUMP_VELOCITY = 13`, `GRAVITY = 34`, apex ≈ 2.49 units) that clears **low walls only**
  (`LOW_WALL_HEIGHT = 2.2`); high walls (`5.5`) always block. Low-wall and platform **tops are
  standable** — you can land on and ride them.
- **Sticky traps** (original Hover! element): red floor squares spawned per round
  (`trapCountForCycle`, spacing-constrained like pods). A **grounded** craft touching one is glued for
  `TRAP_HOLD_SEC = 2` (velocity zeroed, inputs dead), with a grace window afterwards so it can escape.
  Airborne crafts sail over. Both crafts are vulnerable — bumping the drone (or being bumped) into a
  trap emerges from the elastic craft-craft collision. The drone's A* treats trap cells as blocked, so
  it routes around them unless shoved in.
- **Directional arrow pads** (original Hover! element): map-authored floor chevrons (`'8642'` grid
  chars, numpad directions). A grounded craft crossing one is snapped to the arrow's heading and
  boosted along it (`ARROW_BOOST_SPEED = 32`, held above the speed clamp by a brief boost effect);
  `ARROW_GRACE_SEC` makes a pad fire once per crossing. Affects both crafts.
- **Platforms & ramps:** `'='` cells are raised floors at `lowWallHeight`; `'<>^v'` cells are ramps
  sloping up toward the pointed direction. The grounded hover tracks `groundHeightAt` (drive up ramps,
  fall off edges with a real ballistic drop); a platform with no ramp is reachable only with jump
  power (neon's center). The drone drives ramps (directed A*: climbs ≤ ramp steps, descents free) but
  never jumps.
- **Pause** on Esc, on-screen ⏸ (touch), or `visibilitychange` hidden.

## Architecture

Three strictly separated layers (this separation is the single most valuable design decision — keep it):

```
engine/  + maps/     pure TypeScript, zero three.js/React — Jest-tests headlessly
scene/   + HoverScene.tsx   three.js: meshes, textures, render loop, mirror pass
hud/     + HoverGame.tsx    React: phase state machine, HUD, overlays, input, audio
```

### State & data flow

- `GamePhase` (`attract | mapIntro | playing | paused | mapComplete | mapLost | gameOver`) lives in React
  state, owned by `HoverGame`.
- `EngineState` lives in a **ref**, mutated at a fixed timestep inside the RAF loop — never in React
  state. The HUD gets a throttled (~10 Hz) `HudSnapshot` pushed via callback; the minimap and mirror read
  the ref directly every frame.
- **Fixed timestep:** `DT = 1/120`, accumulator in the RAF loop, `MAX_SUBSTEPS = 6` clamp. `stepEngine`
  returns an `EngineEvent[]` (flag/pod/bounce/jump/win/lose with actor + intensity) consumed by
  `HoverGame` for SFX and phase transitions. Events are the only channel from engine to UI.
- **Round rebuild:** the scene rebuilds when `engineRef.current` is a **different object reference** than
  the last-built state (`beginRound` always allocates a fresh `EngineState`). Do NOT gate rebuilds on a
  React prop synced via `useEffect` — see gotcha #3.

### Input abstraction (touch-ready by design)

`InputState { thrust: -1..1, turn: -1..1, jumpHeld }` + `InputSource { read/attach/detach }`
(`input/inputState.ts`). The engine only ever sees an `InputState`; the drone AI *produces* one and runs
through the identical physics step as the player. Adding touch controls (`input/touchInput.ts` +
`hud/TouchControls.tsx`) required **zero engine changes**: the virtual joystick is just a second source,
merged with the keyboard via `mergeInputs` (sum + clamp axes, OR the buttons). Design future games'
inputs this way from day one.

### Physics (`engine/physics.ts`, custom — not cannon-es)

Planar circle-vs-grid simulation; ~200 lines, fully deterministic, unit-testable:

- Steering: `angularVel` eases toward `turn × TURN_RATE` (smoothing `TURN_SMOOTHING = 10`); heading
  integrates from it; camera roll is derived from `angularVel` at render time.
- Thrust along `headingForward(heading)`; drag `vel ×= (1 − DRAG·dt)`; **lateral grip** bleeds only the
  sideways velocity component (`LATERAL_GRIP`) — this is what produces the hovercraft drift feel.
- Collision: circle vs the 3×3 neighborhood of grid cells, closest-point push-out + reflection with
  `WALL_RESTITUTION = 0.65` (springy *Hover!* walls). `isSolidAtAltitude` makes low walls non-solid
  above their height (jump clearance). Craft-vs-craft is an equal-mass elastic bounce that **returns 0
  when the altitude gap exceeds `CRAFT_VERTICAL_CLEARANCE = 1.4`** (a jumping craft sails over).
- Tuning (current feel, post-#1474): `MAX_SPEED 26`, `THRUST_ACCEL 30`, `DRAG 0.8`,
  `LATERAL_GRIP 1.8`, `TURN_RATE 2.6`. HUD speed readout is `speed × 3.6` ("km/h").

### Coordinate convention (load-bearing — do not improvise)

World plane is XZ; `x` grows with grid `col`, `z` with `row`. `headingForward(heading)` in
`gameTypes.ts` matches three.js (`rotation.y = heading` faces local −z): heading 0 = north = "up" on the
minimap; positive turns counterclockwise. `headingTowards(d)` in `droneAi.ts` is its inverse. Every layer
(physics, AI, camera, minimap wedge) imports these two helpers instead of re-deriving trig — the one time
a layer hand-rolled it, the minimap wedge pointed backwards.

### Maps (`maps/`)

ASCII rows, one char per cell: `.` floor, `#` high wall, `-` low (jumpable, standable) wall,
`=` platform, `<>^v` ramps (sloping up toward the pointed direction), `8642` arrow pads (numpad
directions; parsed into `MapDef.arrowPads` and replaced by floor), `P`/`E` spawns.
`createMapDef` parses/validates (uniform width, exactly one P/E) and throws on malformed data.
`MAP_CELL_SIZE = 6` world units (4 → 5 in #1474, 5 → 6 in the arena expansion — **cell size is the
cheapest "make it more spacious" lever**; it widens every corridor at once). Seven shipped mazes, each
constructed so connectivity holds by design (test-enforced regardless):

- **castle** — the Hover! level-1 homage flagship: outer boulevard with a clockwise arrow-pad circuit,
  a walkable curtain-wall rampart ring (`=`) climbed via ramps from both sides, ground gates, and a
  hollow keep with a ground door plus a jumpable `-` side door
- **city** — street grid of building blocks; three blocks on the diagonal are `-` plazas (jump shortcuts)
- **sewer** — serpentine tunnels connected at alternating ends, `-` weirs cutting across, slalom pillars
- **neon** — synthwave night arena: open boulevard, pillared inner box with `-` neon side doors, glowing
  core; emissive walls + `grid` floor
- **glacier** — open rink ringed by `-` snowbanks with drive-through gaps; slippery (`lateralGrip 0.9`)
  and bouncy (`wallRestitution 0.8`)
- **garden** — hedge maze: three concentric rings with offset ground doors and a center-column `-` jump
  highway straight to the core; soft walls (`wallRestitution 0.45`)
- **temple** — hypostyle pillar-field slalom around a sanctum walled entirely with `-` sandstone

`MapTheme` carries all per-map look: sky gradient pair, fog color/density, floor pair, wall colors,
low-wall color, accent, light color/intensities, `wallTexture` (procedural generator:
`stone | panel | brick | neon | ice | hedge | sandstone`), optional `floorPattern: 'checker' | 'grid'`,
optional `wallEmissiveIntensity` (walls reuse their texture as an emissive map — the neon glow), and
optional `weather: 'snow' | 'rain' | 'sandstorm'` (glacier / garden / temple respectively).

**Weather** (`scene/weather.ts`): one THREE.Points cloud per round — a few hundred sprite particles in
a box that follows the player, re-wrapped every frame, so it reads as map-wide weather. Purely visual;
the engine never sees it. `depthWrite: false` + `frustumCulled = false`; the cloud lives in the static
group so `clearGroup` disposes its geometry/material/sprite with the rest of the round. Sandstorm pairs
with a denser, dustier fog on the temple theme.
Fog scales inversely with cell size — keep fog roughly proportional to world scale when tuning either.

**Per-map physics:** `MapDefInput.physics?: { lateralGrip?, wallRestitution? }` overrides the global
constants for that map only (`engine/physics.ts` reads `map.physics?.… ?? GLOBAL`). Both crafts are
affected equally, so difficulty stays fair; the drone AI needed no changes (stall detection already
covers icy overshoot).

**Maze authoring workflow that worked:** write the ASCII art, let `maps.dom.test.ts` verify it
(rectangular, sealed `#` border, exactly one P/E, **every floor cell BFS-reachable from both spawns with
low walls treated as blocking** — reachability must never depend on holding a jump charge), fix what the
test flags. Hand-counting row widths WILL produce off-by-ones; the parser + tests catch them instantly.

### Drone AI (`engine/droneAi.ts` + `engine/pathfinding.ts`)

- A* on the 4-connected floor graph (low walls block — the drone doesn't jump). Target = uncollected red
  flag with the shortest path; path stored as cell-center waypoints.
- Waypoint following emits a synthetic `InputState`: `turn = clamp(angleError × 3)`,
  `thrust = max(0.15, cos(angleError))` — through the same physics as the player, scaled by the per-cycle
  drone speed factor.
- **Repath throttle:** `repathCooldown = 0.5s` gates ALL pathfinding (target selection included). Without
  it, an unreachable target degenerates to one-A*-per-flag per 120 Hz substep — measured as the single
  worst CPU behavior found in review. Stall detection (speed < 2 for 1.2s while holding a path) clears
  the path, reverses thrust 0.4s, and zeroes the cooldown so recovery repaths immediately.

### Spawning (`engine/spawning.ts`)

Seeded (`mulberry32` in `engine/rng.ts` — `Date.now()`-seeded normally, URL-seeded in visual-test mode,
fixed-seeded in tests). Candidates = floor cells BFS-reachable from the player spawn, ≥ 4 cells from both
spawns. Flags interleave blue/red picks with ≥ 3-cell pairwise spacing; pods ≥ 2. Spacing relaxes
progressively (200 attempts per level) down to "any distinct cell", and only stacks entities on a shared
cell in the pathological all-cells-taken case (documented; unreachable on real maps). Pod kind weights:
speedUp 40 / jump 35 / slowDown 25.

### Rendering (`scene/`, `HoverScene.tsx`)

- **Walls:** one merged `BoxGeometry` mesh per wall height (`BufferGeometryUtils.mergeGeometries`),
  `MeshStandardMaterial` with procedural 256px canvas textures (`canvasTextures.ts`: stone/brick/panel +
  pod icons + sky gradient). All scene materials are **`DoubleSide`** — required by the mirror (below).
- **Lighting:** hemisphere + one shadow-casting directional (ortho shadow camera sized to the map,
  `bias −0.0002`, **`normalBias 0.6`** — see gotcha #5) + a theme-colored point light. `FogExp2`.
- **First-person camera:** FOV 75 at `altitude + COCKPIT_HEIGHT (1.5)`, rotation order `YXZ`,
  roll ∝ −angularVel, slight fixed downward pitch, sine bob while playing. A cockpit "cowl" mesh is
  parented to the camera — keep camera-attached geometry at the very bottom edge of the frustum
  (y ≈ −1.1, tilted), or it reads as floating garbage mid-view (gotcha #7).
- **Rear-view mirror** (`scene/mirror.ts`): a second full scene render into a top-center
  scissor+viewport rect, camera at the player's head facing `heading + π`, and the projection matrix
  **x-negated after `updateProjectionMatrix()`** so the image reads as a true mirror. The x-flip
  reverses triangle winding → culling breaks unless materials are `DoubleSide` (hence the global rule).
  `MIRROR_LAYOUT` fractions are shared with the HUD so the DOM frame and the GL glass stay aligned.
  Three.js `setViewport`/`setScissor` take CSS px (multiplied by pixelRatio internally).
- **Minimap** (`scene/minimap.ts` + `hud/Minimap.tsx`): pure 2D-canvas draw function (north-up, fixed
  orientation), unit-testable with a stub context. The static wall grid is rasterized once per
  (map, size, dpr) into an offscreen canvas and `drawImage`d per call, with a direct-draw fallback when
  `getContext('2d')` is unavailable (jsdom). Canvas element is DPR-scaled (attributes × dpr, CSS size
  fixed) and the caller wraps drawing in `ctx.scale(dpr, dpr)` — see gotcha #6.
- **Flags:** pole + cloth plane with per-vertex sine wave + `computeVertexNormals()` per frame — gated
  to flags within 70 units of the player (fog hides the rest). Flag groups **billboard toward the player
  every frame** (`rotation.y = atan2(dx, dz)`) so the cloth is never viewed edge-on.
- **Drone:** squashed sphere body, dark canopy dome, two emissive blue torus rings (counter-rotating),
  hover skirt cone, blue point light.

### Performance decisions (as of #1475)

1. **Static-only shadow map:** dynamic meshes don't cast; `renderer.shadowMap.autoUpdate = false` and
   `needsUpdate = true` once per round rebuild. Eliminates the per-frame shadow render of the whole
   scene — the biggest single win.
2. **Cloth animation distance gate** (70 units), **minimap wall-layer cache**, minimap drawn every 2nd
   frame, HUD snapshot at 10 Hz.
3. **Pause = zero work:** after two settle frames the RAF body returns early; the compositor keeps the
   last frame on screen (safe without `preserveDrawingBuffer`).
4. **Anti-pattern, tried and reverted:** rendering the mirror at half rate. The main pass clears the
   whole canvas every frame, so skipped mirror frames flash the background through the glass as 30 Hz
   flicker. The mirror renders **every frame**; its cost is bounded by the small scissor rect.

### Audio (`audio/sfx.ts`)

All-synthesized WebAudio, zero asset files. `AudioContext` is created/resumed only from a user gesture
(`unlock()` on Start). Engine hum = two detuned sawtooths → lowpass → gain, pitch/volume tracking speed
(`setEngineIntensity`), started/stopped with the `playing` phase. One-shots are oscillator/noise
envelopes; the load-bearing generator is `springTone(startFreq, endFreq, wobbles, duration, gain)` — a
damped pitch-wobble that produces the original's signature springy "boing" (wall bounces, jumps).
The drone capturing a flag plays a two-tone sawtooth klaxon loud enough to cut through the mix — it is a
gameplay alert, not ambience. Mute persists in settings; master gain ramps rather than hard-cuts.

### HUD & overlays (`hud/`)

Top: score panel (with live "flags worth N" decay readout) left, mirror frame center (from
`MIRROR_LAYOUT`), blue/red flag dot-rows right. Bottom: minimap left (desktop) or bottom-center smaller
(touch — the joystick owns the left corner), keyboard hint center (hidden on touch), dashboard right
(speed readout + bar, jump charge pips, active effect chip with countdown, mute toggle).
`ScreenOverlays` renders attract/mapIntro/paused/mapComplete/mapLost/gameOver, with touch-specific
attract copy. Timers for banner phases are `setTimeout`s owned by `HoverGame` (`MAP_INTRO_MS 2400`,
`MAP_COMPLETE_MS 3000`, `MAP_LOST_MS 2600`).

### Touch controls (`hud/TouchControls.tsx`, `input/touchInput.ts`)

Rendered only when `isTouchDevice()` and phase is `playing`. Joystick: 128px base / 56px knob, pointer
capture, radial clamp, 0.12 deadzone with rescale, up/down = thrust/reverse and left/right = strafe.
Dragging anywhere else on the playfield writes look axes: horizontal drag rotates the craft/view, vertical
drag glances slightly up/down. JUMP is hold-to-press
(the engine edge-detects `jumpHeld`). On-screen ⏸ replaces Esc. Touch state resets whenever the phase
leaves `playing` (prevents stuck inputs). The shell has `touch-none` to kill scroll/pinch.

### Persistence & catalog adapter (`gameProgress.ts`)

`SavedHoverProgress { version, bestScore, bestRoundIndex, mapsCleared }`. Endless-game → level-grid
adaptation: each map is a "level"; `unlockedLevel = min(HOVER_TOTAL_LEVELS, bestRoundIndex + 1)`,
`stars[i] = min(3, timesMapCleared)`. `MAP_ORDER` is **derived** from `MAPS` (never a second hardcoded
list). This required zero changes to the Game Select mechanics. **Roster-expansion rule:** a map id
missing from a saved `mapsCleared` means "0 cleared", not "corrupt save" — `parseSavedProgress` must
stay tolerant of absent keys or shipping a new map wipes everyone's progress (regression-tested in
`gameProgress.dom.test.ts`).

### Visual test mode (`visualTestMode.ts`)

`?visualTest=1&autoStart=1&seed=42&round=N` skips the attract screen, starts at round `N` (default 0 —
this is how you screenshot a specific map: `round=3` = neon, `4` = glacier, `5` = garden, `6` = temple),
seeds spawning deterministically (`seed + roundIndex`), and sets `window.__HOVER_VISUAL_READY__` after
3 rendered frames — the hook a
future Playwright visual spec (not yet written) will wait on. **Headless driving recipe used throughout
development:** build assets, `php artisan serve --port=8001` (8000 may be owned by another checkout),
then a Playwright script from the repo root (so `node_modules` resolves) that clicks Start, holds
`KeyW`, screenshots, and asserts on HUD testids (`speed-value`, `flag-dot-red[data-filled]`, …). Touch
verification uses a `devices['iPhone 13 landscape']` context and CDP `Input.dispatchTouchEvent` for
stick drags. Reading the screenshots caught every visual bug the test suite could not (cockpit
placement, shadow acne, joystick/minimap overlap, mirror flicker).

## Test coverage map

| Suite | What it locks down |
|---|---|
| `physics.dom.test.ts` | determinism, drag decay, restitution reflection, jump ballistics vs `v²/2g`, low-vs-high wall altitude, craft-craft momentum + altitude clearance |
| `pathfinding.dom.test.ts` | BFS coverage, A* optimality + detours, wall-cell nulls |
| `spawning.dom.test.ts` | seed determinism, reachability + spacing across all real maps × cycles, count scaling, cramped-map relaxation |
| `droneAi.dom.test.ts` | collects flags on open + detour maps within a time budget, retargeting, stall reverse |
| `engine.dom.test.ts` | scripted win/lose sims, decay/banking/bonus, pod effects + respawn, post-outcome no-op |
| `maps.dom.test.ts` | every shipped maze: sealed border, single spawns, full no-jump connectivity |
| `minimap.dom.test.ts` / `touchInput.dom.test.tsx` / `HoverGame.test.tsx` / `gameProgress` (via catalog) | draw calls, joystick/jump/pause wiring, phase transitions, persistence round-trips |

Tests that place entities at world coordinates must **derive them from `map.cellSize`** — hardcoded
world positions broke en masse when cellSize changed 4 → 5.

## Gotchas & learnings (numbered for reference)

1. **GPU resources leak silently in an endless game.** `disposeObject` walking geometry/material/map is
   not enough: `Light.dispose()` frees the shadow-map render target (2048² ≈ 16–32 MB each!), and a
   replaced `scene.background` texture must be disposed explicitly. Anything created per-round needs a
   per-round disposal story; "the group was cleared" ≠ "the VRAM was freed".
2. **Craft collision must respect altitude** just like wall collision does — any mechanic with a vertical
   dimension (jumping) needs every collision path audited, not just the obvious one.
3. **Don't gate render-loop rebuilds on React-synced props.** `beginRound` mutates the engine ref
   synchronously; a `roundKey` prop synced into a ref via `useEffect` lags by a commit, and a RAF can fire
   in the gap → one garbage frame of new state in old scenery. Compare object identity in the loop
   instead (`builtState !== engineRef.current`).
4. **The mirror x-flip inverts winding** → the whole scene's materials must be `DoubleSide`, or the
   mirror shows back-faces. Cheap for this scene; decide consciously for heavier ones.
5. **Shadow acne on merged wall geometry** shows as diagonal banding; `normalBias ≈ 0.6` (+ small
   negative `bias`) fixed it cleanly.
6. **DPR-scale every 2D canvas overlay** (attributes × devicePixelRatio, fixed CSS size, `ctx.scale`) —
   the WebGL canvas gets this via `setPixelRatio` but hand-rolled canvases don't, and a blurry minimap
   next to a crisp scene is glaring. If you cache raster layers, the cache key must include the dpr.
7. **Screenshot early, screenshot often.** Unit tests proved the engine; only reading rendered frames
   caught: cockpit mesh floating mid-view, shadow acne, joystick/minimap overlap on phones, and the
   half-rate-mirror flicker. Treat a headless drive + screenshot review as a mandatory gate for any
   scene-layer change.
8. **Throttle AI pathfinding by wall-clock, not by "when it seems needed".** A dead `repathCooldown`
   field passed review as "intended behavior" until the unreachable-target case multiplied A* by 120×/s.
   If a field exists to throttle something, test that it actually does.
9. **Sum-of-parts inputs:** modeling input as data (`InputState`) produced three producers (keyboard,
   drone AI, touch) and one consumer with no special cases. The touch feature was ~250 lines, all UI.
10. **One flag value, not N:** all flags spawning together means one shared decaying value — a large
    state-space simplification available whenever collectibles share a birth tick.
11. **`noUncheckedIndexedAccess` shapes API design:** prefer `.entries()`, `Map.get` + guard, and
    helpers returning safe defaults (`cellKindAt` returns `wallHigh` out of bounds — which also makes
    the world implicitly sealed).
12. **Codex may simply not show up.** It reviewed none of the three Hover PRs. The CLAUDE.md fallback
    (substitute `/code-review` after ~20 min of silence) found 2 confirmed correctness bugs (#1, #2
    above) and 8 real cleanups — run it rather than merging unreviewed.

## Tuning reference (safe to adjust, in `gameTypes.ts` unless noted)

| Knob | Current | Effect |
|---|---|---|
| `DRONE_BASE_SPEED_SCALE` / `_PER_LEVEL` / `_PER_CYCLE` / `_MAX` | 0.68 / +0.045 / +0.06 / 1.1 | drone difficulty ramp |
| `TRAP_HOLD_SEC` / `TRAP_GRACE_SEC` / `trapCountForCycle` | 2 / 1.2 / min(5, 1+cycle) | sticky trap punishment |
| `ARROW_BOOST_SPEED` / `ARROW_GRACE_SEC` | 32 / 1 | arrow pad shove |
| `WALL_RESTITUTION` | 0.65 | wall bounciness |
| `DRAG` / `LATERAL_GRIP` | 0.8 / 1.8 | coast decay / drift amount |
| `MAX_SPEED`, `THRUST_ACCEL`, `TURN_RATE` | 26 / 30 / 2.6 | overall pace |
| `MAP_CELL_SIZE` (`maps/mapTypes.ts`) | 6 | global spaciousness (update fog densities proportionally) |
| `FLAG_SPACING_CELLS` (`engine/spawning.ts`) | 5 | min pairwise flag spread (relaxes on cramped maps) |
| per-map `physics` (`maps/*.ts`) | glacier, garden | map-specific grip / wall bounce |
| flag/pod counts & caps | `flagCountForCycle` / `podCountForCycle` | round density |
| `springTone(...)` params (`audio/sfx.ts`) | — | boing character |

## Future (non-normative)

- Playwright visual spec on top of `visualTestMode` (hook already ships; see the parking-pickup visual
  harness docs for the pattern).
- Drone jump usage (it already banks charges conceptually — AI would need low-wall-aware pathing with a
  jump cost edge).
- More arenas: the ASCII + theme + connectivity-test pipeline makes a new map roughly an afternoon.
- Difficulty selector (map the existing per-cycle scalers to a user choice).
- Ghost/best-run replay: the deterministic engine + seeded RNG means recording inputs is sufficient.
