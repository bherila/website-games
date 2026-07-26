# Chick's Challenge

Chick's Challenge is a 2D top-down tile puzzler mounted at `/games/chicks-challenge` — an original homage to the classic
1989 tile-puzzle genre (Chip's Challenge). The player steers a little chip-collector around a grid,
gathering microchips to open the chip socket and reach the exit, using keys, boots, and pushable
blocks while avoiding water, fire, and deterministic monsters. The world is **step-based**: nothing
moves until the player moves, so every level is a pure deterministic puzzle scored by move count.

All levels are **originals** designed for this game — no level, name, or asset is copied from any
commercial release. The homage is to the mechanics, exactly as Hover is a homage.

This document is the implementation specification and acceptance-criteria contract. It is written to
be handed to coding agents; each section is normative unless marked "tuning" or "follow-up".

## House conventions (must follow)

Chick's Challenge is the fifth game in this repo and must mirror the existing four:

- **Reference implementations:** `resources/js/games/hover/` for the pure-`engine/` + `scene/` +
  React-HUD layering and the input abstraction (`hover/input/inputState.ts`, `touchInput.ts`);
  `resources/js/games/block-blaster/` and `cars/` for level select, overlays, and progress patterns.
- **Shell:** `games/PortraitGameShell.tsx` with `allowLandscape` — portrait framing is unchanged, but the
  shell measures with `100dvh` and drops the 4:3 width lock in landscape (opt-in; the other games keep
  the strict portrait lock).
- **Stack:** `three` (orthographic camera — no physics engine needed; the game is grid-logic), React 19,
  TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` —
  use `import type`), Tailwind for HUD/overlays. No new dependencies.
- **Mount pattern:** public route in `routes/web.php` below the auth group →
  `resources/views/games/chicks-challenge.blade.php` extending `layouts.game` with `<div id="chicks-game-root"></div>`
  → per-page Vite entry `resources/js/games/chicks-challenge/index.tsx` registered in `vite.config.ts`
  `laravel({ input: [...] })`.
- **Persistence:** authenticated progress uses timestamped `user_game_data` profile/per-level rows via
  `games/_shared/gameDataPersistence.ts`; anonymous progress retains the defensive, versioned
  `localStorage` format and is promoted after the first successful account save. Device mute remains
  local. Level select uses `games/_shared/LevelSelectGrid.tsx`; win overlay uses
  `games/_shared/StarRow.tsx`.
- **Game Select registration:** append one entry to `game-select/gameCatalog.ts` (slug `chicks-challenge`,
  title `Chick's Challenge`, emoji `🐥`, `TOTAL_LEVELS = 40`, `loadProgress` from `chicks-challenge/gameProgress.ts`).
- **Tests:** co-located `__tests__/`; `*.test.ts` runs in the node Jest project (no DOM), `*.test.tsx` /
  `*.dom.test.ts` in jsdom. Never instantiate `WebGLRenderer` in tests — the pure `engine/` layer is
  where all game logic lives and is tested headlessly.
- **CI:** game tests run in their own job, excluded from the app suite via `JEST_EXCLUDE_GAME_TESTS`
  (see CI wiring section).
- **Lint gotchas:** `simple-import-sort/imports` and `unused-imports/no-unused-imports` are errors.

## Core loop

1. Player opens the game and lands on the **level-select grid** (40 tiles = 8 rows of 5, sequential
   unlock, star badges) via `_shared/LevelSelectGrid`.
2. Tapping an unlocked tile starts the level: top-down board, HUD shows chips remaining, move counter
   vs par, and inventory (keys/boots).
3. Player moves one tile at a time (arrows/WASD, swipe, or on-screen D-pad). Each **accepted** move
   advances the whole world one step: slides resolve, then monsters move.
4. Collect all chips → the chip socket opens → step through it to reach the **exit**.
5. **Win:** reach the exit → star rating from move count vs par → overlay with next / replay / menu.
   Progress and best-move counts persist.
6. **Lose:** drown, burn, or touch a monster → short death animation → overlay with restart / menu.
   Restarting resets the level and the move counter (deaths never penalize the next attempt's stars).
   A restart button is always in the HUD.
7. **Stuck:** after each accepted move (debounced until input is idle) a background solver probe
   (`engine/solver.ts` stepping API, capped node budget) checks whether the level is still winnable.
   A **definitive** `unsolvable` result — e.g. a block pushed into a dead corner — immediately shows
   the Stuck overlay ("No way to finish") with restart / menu; `budget`/`solved` results do nothing.
   Probes cancel on new input or reset and run in idle slices so they never block the frame.

## Game rules (normative)

### Step model

- A **move** = one accepted player input: a direction (up/down/left/right) or **wait**. The move
  counter increments only on accepted moves.
- A directional input is **rejected** (bump feedback, no counter increment, monsters do NOT move) when
  the target tile is not enterable and cannot be made enterable by a push.
- **Wait** (Space / tap the player character) is always accepted: the player stays put, monsters
  advance one step. Needed for monster-timing puzzles; it costs a move.
- Resolution order for an accepted move:
  1. Player steps into the target tile (or stays, for wait). Entry effects apply (below).
  2. **Slide chain:** if the player now stands on ice (without skates) or a force floor (without
     suction boots), forced steps continue — ice keeps the current direction (corners redirect),
     force floors impose theirs — re-applying entry effects each step, until the player rests on a
     non-forcing tile, a forced step is blocked (player stops in place), the player dies, or exits.
     Forced steps do not increment the move counter.
  3. If the player is alive and has not exited: **each monster takes exactly one step** (in spawn
     order = reading order at parse time), per its AI, with its own slide chain fully resolved. A
     monster left resting on a slide tile by a blocked slide chooses by its normal AI next turn.
  4. Button effects triggered during 1–3 apply immediately when the button is stepped on.
- Forced-move chains (player, monster, or block) are capped at 256 steps; hitting the cap is a level
  design error caught by tests — shipped levels must never contain closed slide loops.
- There is **no RNG anywhere in the engine.** Identical input sequences produce identical outcomes.

### Tiles & items

- **Chips (`c`)** — collected on entry; HUD counts down. **Socket (`S`)** — impassable until all chips
  are collected, then entering it consumes it to floor. **Exit (`E`)** — entering wins. Levels may
  have 0 chips (no socket) for pure-logic puzzles.
- **Socket chokepoint rule (level design, test-enforced):** in every level with chips, each exit must
  sit in a walled pocket whose only opening is a socket — a BFS treating only walls and sockets as
  blocking must NOT reach an exit. This guarantees chip collection can never be sidestepped (doors,
  water, and blocks do not count as barriers for this check).
- **Keys/doors** — four colors. Red/blue/yellow keys are consumed opening their door; **green keys
  are reusable** (never consumed). Opening a door consumes the door to floor. Keys stack (inventory
  shows counts).
- **Water (`~`)** — drowns the player without flippers; blocks monsters (fireballs die in it).
  **Fire (`*`)** — burns the player without fire boots; blocks all monsters.
- **Boots** — flippers (`f`, water), fire boots (`i`), skates (`k`, ice), suction boots (`u`, force
  floors). Held permanently once picked up — until a **thief (`Z`)** tile strips all boots on entry.
- **Ice (`5`)** — slides the mover onward in its current direction. **Ice corners (`7 9 1 3` =
  NW/NE/SW/SE)** — walls on their two outer edges; a slider entering is redirected 90° around the
  bend. **Force floors (`8 2 4 6` = up/down/left/right)** — push the mover in the arrow direction.
- **Dirt blocks (`X`)** — the player (only) can push one block per step into an enterable tile; no
  double-block pushes; blocks pushed onto ice/force floors slide by the same chain rules. A block
  pushed into **water** turns that tile into floor (path building) and the block is gone. A block
  resting on a button holds it pressed. Blocks crush nothing — a push toward a monster/player-occupied
  tile is blocked.
- **Dirt (`%`)** — blocks monsters and blocks; the player entering clears it to floor.
- **Hint (`?`)** — while the player stands on it, the level's hint text shows in the HUD. Purely
  informational.
- **Pop-up wall (`,`)** — enterable once; becomes a wall when the player steps off it.
- **Toggle walls (`[` closed / `]` open)** — every **green button (`(`)** press (by player, block, or
  monster) flips all toggle walls on the level.
- **Blue button (`=`)** — reverses all tanks 180°.
- **Red button (`)`)** — each red button is linked to the nearest **clone machine (`M`)** (ties broken
  by reading order; link recorded at parse). Pressing it spawns a copy of the machine's template
  monster (defined in level metadata) onto the machine's launch tile if that tile is enterable;
  otherwise nothing. Total live monsters cap at 32 — presses beyond the cap silently no-op. A clone
  spawned during the player's own step (button pressed by the player or a pushed block) already
  exists when the monster phase runs, so it takes its first step that same move; clones spawned
  during the monster phase wait until the next move.
- **Teleport (`+`)** — all teleports on a level form one group in reading order. Entering one, the
  mover exits from the **next** teleport in the group (wrapping — the entry teleport itself is the
  final candidate, i.e. passing straight through) continuing in the same direction; if that exit is
  blocked, try the next teleport in order; if all are blocked, the original entering move is
  rejected/blocked. Chained teleports are not supported: an exit tile that is itself a teleport is
  skipped as blocked. Movers never rest on a teleport tile.
- Out-of-bounds is wall. Every level grid must additionally be enclosed by a wall border (validated).

### Monsters

Touching a monster in either direction — player steps into one, or one steps into the player — kills
the player. Monsters treat chips, items, keys, doors, sockets, dirt, blocks, and other monsters as
walls; they never pick anything up and never enter the exit. They do slide on ice and force floors
(no boots). All AIs are deterministic:

| char | monster  | AI |
|------|----------|----|
| `A`  | bug      | wall-follower: tries left-of-facing, forward, right-of-facing, back — first enterable |
| `O`  | ball     | moves along its facing; when blocked, reverses direction |
| `F`  | fireball | forward; when blocked tries right, then left, then back; dies (despawns) entering water |
| `T`  | tank     | forward only; when blocked it parks until a blue button flips all tanks 180° |

Default initial facing is **up**; a level may override per-monster via `facingOverrides`.

### Scoring & stars

- Score = **moves used** in the winning run (accepted inputs, incl. waits). Lower is better.
- Every level has a solver-derived **par** (= the deterministic A* solver's solution length for that
  grid — enforced by test; the solver is weighted, so par is honest but not guaranteed optimal, and
  `bestMoves` lets players beat it).
- Stars: **3★** `moves ≤ ceil(par × 1.1)`, **2★** `moves ≤ ceil(par × 1.5)`, **1★** any completion.
  Helper `starsForMoves(moves, par)` in `gameTypes.ts`; deaths/restarts never affect stars.

## Controls

- **Keyboard:** arrows / WASD = step; hold auto-repeats a step every 150 ms (only when the previous
  move resolved); Space = wait; R = restart; Esc = level select.
- **Touch:** swipe anywhere on the board = one step in the swipe direction; touch-hold after a swipe
  keeps stepping in that direction at the auto-repeat cadence. An on-screen **D-pad**
  (≥ 44 px targets, built on the `hover/hud/TouchControls.tsx` pointer-capture pattern) renders only
  when `isTouchDevice()`; tapping the player character = wait. The pad lives in the toolbar
  (`hud/GameToolbar.tsx`) — a bottom row in portrait, a right-hand column in landscape.
- Input flows through Hover's abstraction: keyboard and touch are two `InputSource`s merged into one
  device-agnostic intent stream; the engine consumes discrete `MoveIntent`s (`up/down/left/right/wait`)
  from a small queue (max 2 buffered) so fast play feels responsive without skipping animations.
- **Every source reports a screen-space intent.** `ChicksGame` converts it to board space exactly once
  via `rotateIntent(intent, quarterTurns)` (`input/orientation.ts`), so "up" always means the direction
  the player sees as up, whatever rotation the board is rendered at. `wait` is rotation-invariant. The
  rotation is read from a ref (so a held auto-repeat follows a mid-hold flip) that is synced in a
  **layout** effect: a passive effect would leave a one-frame window where the rotated board is already
  painted while the remap still used the previous rotation.

## Scene & rendering

- three.js **orthographic** camera looking straight down (this is the "2D via the WebGL stack" reuse —
  same renderer/lifecycle/disposal patterns as the other games, per-game `scene/threeUtils.ts` copied
  from Hover's).
- **Board:** one quad mesh per tile using shared geometries + procedural canvas-texture materials
  (flat, saturated, toon-ish; distinct silhouettes AND distinct colors so tiles read for colorblind
  players — e.g. water animated ripple, fire flicker, ice glossy with corner bevels, force floors
  animated chevrons). Items (chips, keys, boots) are small billboarded quads with a gentle bob.
  Player and monsters are quads tweened between tiles (~110 ms ease) with a short facing flip; forced
  slides tween faster (~70 ms/tile) and chain visually.
- **Camera fit:** if the level fits the viewport at ≥ 32 px/tile (`MIN_PX_PER_TILE`), show the whole
  board centered; otherwise the camera smooth-follows the player showing at least `MIN_TILES_ACROSS`
  tiles, clamped to the board edges.
- **Board rotation (normative):** the *board only* may render rotated one quarter turn when that makes
  a mismatched level fit a mismatched viewport. `input/orientation.ts` owns the rule:
  manual preference wins (`auto` / `rotated` / `upright`, device-only localStorage); square boards never
  rotate; the rotated orientation must fit the whole board at `MIN_PX_PER_TILE` (follow-camera boards
  gain nothing from rotating); a board already comfortable upright at 64 px/tile is left alone; and the
  flip needs a ≥ 1.15× tile-size gain, applied symmetrically so the band is sticky (no oscillation on
  small resizes or a phone held near 45°). `BoardRotor.tsx` swaps the container's
  axes and rotates it by CSS so the canvas renders at the rotated aspect and the camera math above is
  unchanged; the flip animates 260 ms and respects `prefers-reduced-motion`. HUD, toolbar, D-pad,
  overlays and level select never rotate.
- **Rotation direction (normative):** *whether* to turn is decided purely from the geometry above;
  *which way* comes from `screen.orientation.angle`, so the board lands world-upright whichever way the
  phone was turned. `rotatedTurnsForDeviceAngle` maps the angle to 1 quarter turn (clockwise) or 3
  (counter-clockwise): a device turned clockwise (`DEVICE_ANGLE_TURNED_CLOCKWISE`, 270°) needs the board
  turned counter-clockwise, and vice versa; both portrait angles (0 / 180) have no world-upright answer
  and keep the clockwise default. The direction is a *tie-breaker only* — a missing
  `screen.orientation`, a non-numeric angle, or an angle between quarters (snapped to the nearest) all
  fall back to clockwise and never change whether a board rotates. `DEVICE_ANGLE_TURNED_CLOCKWISE` is
  the entire convention: flipping it to 90 reverses the mapping, which is the one knob to turn if a real
  device disagrees. The direction only has an observable effect where the CSS viewport is *not* following
  the device (rotation lock, or a portrait-locked install); when the browser rotates the viewport itself
  it has already made screen-up = world-up. `rotateIntent`'s modular arithmetic covers all four
  rotations, so the counter-clockwise board is the exact mirror mapping with no special case, and the
  rotor's axis swap is identical for both directions. Manual `rotated` means "turned the
  device-appropriate way". Hysteresis anchors on *whether* the board is turned, so a device-angle change
  re-turns a rotated board the other way instead of reading as a fit change.
- **Hysteresis is per level (normative):** the sticky anchor is keyed on the *level's identity* (plus its
  dimensions), not on dimensions alone, and it is cleared when the board unloads. Two consecutive levels
  of the same size are therefore each decided from upright — keying on `"{cols}x{rows}"` would have let a
  same-sized level open rotated where a fresh decision picks upright.
- **Effects:** splash particle on drown/block-into-water, puff on burn, sparkle on chip pickup,
  confetti burst on exit (reuse the marble-sort confetti approach), screen-shake-free (portrait
  shell). Death and win animations ≤ 600 ms before the overlay.
- Levels are ≤ 32×32 → worst case ~1k static quads + < 40 dynamic quads; trivially 60 fps. No
  shadows, one ambient light (or unlit materials).

## HUD & screens

- **Level select:** `_shared/LevelSelectGrid` (5-wide, 40 tiles), locked/stars/pulse per house style.
- **In-level layout:** HUD bar, playfield and toolbar are flow siblings (a column in portrait, with the
  toolbar becoming a right-hand column in landscape) — chrome must never cover board tiles. Safe-area
  insets (`env(safe-area-inset-*)`) apply on every edge the chrome touches; the page opts into
  `viewport-fit=cover` via the layout's `viewport-content` section, without which those insets are 0.
- **In-level HUD:** top bar — level number, chips-remaining chip (💠 n), moves counter shown as
  `moves / par`; inventory row of key counts and boot icons; icon buttons: mute, restart, level select.
  Hint text appears in a bottom banner (`hud/HintBanner.tsx`) while standing on a hint tile.
- **Toolbar:** board-rotation toggle (auto / turned / upright) plus the touch D-pad.
- **Win overlay:** dimmed backdrop, `StarRow` stars animate in, `moves / par` line, buttons: replay,
  next (pulsing), menu.
- **Death overlay:** dimmed backdrop, cause icon (💧 / 🔥 / 👾), restart (pulsing), menu.
- **Overlay scrolling (normative):** every overlay (win / death / stuck) is itself the scroll container
  (`overflow-y-auto`) and centres its dialog with `m-auto min-h-full` **on the dialog**, never with
  `items-center` on the scroll container — centring a scroll container strands the top of a too-tall
  dialog above the scroll origin, where scrolling can never reach it (same pattern and rationale as
  `_shared/LevelSelectGrid`). The padding belongs to the scrolled dialog so `min-h-full` adds no
  permanent scroll.
- Wordless except numerals, the short hint strings, and level titles. All buttons ≥ 44 px.

## Stars & progress

Persistence key `bwh.chicks-challenge.progress.v1`:

```ts
interface SavedChicksProgress {
  version: 1
  unlockedLevel: number              // highest playable level id (starts at 1, caps at 40)
  stars: Record<number, number>      // levelId -> best stars (0–3)
  bestMoves: Record<number, number>  // levelId -> lowest winning move count
}
```

Load defensively via `_shared/progressParsers` (corrupt/missing → fresh default). Winning level N sets
`unlockedLevel = max(unlockedLevel, min(N+1, 40))`, `stars[N] = max(old, earned)`,
`bestMoves[N] = min(old ?? ∞, moves)`. `loadProgress()` returns the `LevelSelectProgress` shape
directly (no adapter needed). No mid-level snapshots.

## Level definition schema

Levels are data. Grids are ASCII art — one char per tile — which makes them reviewable in diffs and
authorable by agents.

```ts
type Facing = 'up' | 'down' | 'left' | 'right'

interface ChicksLevelDef {
  id: number                 // 1..40, contiguous
  title: string              // short original name
  grid: readonly string[]    // equal-length rows; enclosed by '#' border
  par: number                // MUST equal the deterministic A* solver's solution length (enforced by test)
  /** Optional U/D/L/R/W sequence for replay-debugging fixtures; shipped levels omit it. */
  solution?: string
  hint?: string              // shown on '?' tiles
  facingOverrides?: Record<string, Facing>   // "x,y" -> initial monster facing
  cloneTemplates?: Record<string, { monster: 'A' | 'O' | 'F' | 'T'; facing: Facing }> // "x,y" of each 'M'
}
```

### Tile legend (single source of truth: `levels/legend.ts`)

| char | tile | char | tile |
|------|------|------|------|
| `.` | floor | `#` | wall |
| `@` | player start (exactly one) | `E` | exit |
| `c` | chip | `S` | chip socket |
| `r g b y` | red/green/blue/yellow key | `R G B Y` | matching door |
| `~` | water | `*` | fire |
| `f i k u` | flippers / fire boots / skates / suction boots | `%` | dirt |
| `5` | ice | `7 9 1 3` | ice corner NW/NE/SW/SE |
| `8 2 4 6` | force floor up/down/left/right | `X` | dirt block (on floor) |
| `?` | hint | `,` | pop-up wall |
| `[` `]` | toggle wall closed/open | `(` `=` `)` | green/blue/red button |
| `M` | clone machine | `+` | teleport |
| `A O F T` | bug / ball / fireball / tank (on floor) | `Z` | thief |

`levels/parseLevel.ts` converts a `ChicksLevelDef` into the engine's initial `GameState` (tile layer +
entity list + button/teleport/clone links). Parse errors (ragged rows, no `@`, unknown chars, `M`
without a `cloneTemplates` entry) throw — surfaced by the validation tests, never at runtime for
shipped levels.

## The 40 levels

40 original levels in 8 phases of 5 (fills the 5-wide select grid as 8 rows). The table is the design
contract — mechanics and teaching per level. The **par** column is an informational snapshot; the
source of truth is each level def, whose par must equal the deterministic solver's result (enforced
by the solver gate). Sizes: S ≤ 11×11 (fits viewport), M ≤ 20×20, L ≤ 32×32. Each phase opens with a
near-tutorial for its new mechanic and closes with a combiner/capstone that should be the hardest of
its phase. Hints (`?`) appear on the first level of each phase and nowhere else.

**Phase 1 — Basics (1–5).** Movement, chips, socket, exit, keys/doors.

| # | title | size | teaches | par |
|---|-------|------|---------|-----|
| 1 | First Steps | S | move, collect chips, socket, exit | 16 |
| 2 | Lock & Key | S | fetch the key from a side pocket, unlock the divider | 21 |
| 3 | Four Doors | S | quadrant pinwheel: each room hides the next color's key | 32 |
| 4 | Green Means Go | S | one green key reused across four gating green doors | 36 |
| 5 | Key Economy | M | three keys, three doors — fetch-order routing puzzle | 43 |

**Phase 2 — Blocks (6–10).** Pushing, water bridging, sokoban-lite.

| # | title | size | teaches | par |
|---|-------|------|---------|-----|
| 6 | Push | S | blocks bridge the only water crossing | 16 |
| 7 | Bridge Builder | S | block into water = floor | 19 |
| 8 | Causeway | S | two-block bridge sequenced across a channel | 30 |
| 9 | Warehouse | M | sokoban shaft; careless pushes softlock (restart lesson) | 20 |
| 10 | Dirt Work | M | capstone: co-align two block bridges, then a dirt/door spine | 52 |

**Phase 3 — Elements & boots (11–15).** Water/fire as terrain, flippers, fire boots, thief.

| # | title | size | teaches | par |
|---|-------|------|---------|-----|
| 11 | Swim Lessons | S | flippers open water paths | 20 |
| 12 | Firewalker | S | fire boots open fire paths | 20 |
| 13 | Steam | M | interleaved water/fire; both boots, order matters | 43 |
| 14 | The Heist | M | thieves strip boots — re-equip between crossings | 57 |
| 15 | Amphibious | M | boots + blocks + doors combined | 56 |

**Phase 4 — Ice (16–20).** Sliding, corners, skates.

| # | title | size | teaches | par |
|---|-------|------|---------|-----|
| 16 | First Slide | S | ice slides to the far wall | 15 |
| 17 | Bank Shots | S | ice corners redirect slides | 15 |
| 18 | Rink Runner | M | brake-chip slide tour: lane-entry order routes the rink | 30 |
| 19 | Skate Park | M | skates let you turn into pockets forced slides overshoot | 37 |
| 20 | Glacier | M | capstone: block bridges over water bands + ice round trip | 89 |

**Phase 5 — Force floors (21–25).** Conveyors, suction boots, ice combos.

| # | title | size | teaches | par |
|---|-------|------|---------|-----|
| 21 | Moving Walkway | S | force floors carry you | 15 |
| 22 | Against the Current | S | entering/exiting conveyor lanes | 19 |
| 23 | Sorting Machine | S | conveyor junctions route you; pick entry points | 18 |
| 24 | Suction Boots | M | suction boots reach pockets belts push you out of | 34 |
| 25 | Pinball | M | capstone: cross-wired force lanes through corner junctions | 49 |

**Phase 6 — Monsters (26–30).** One AI at a time, then mixed; wait becomes essential.

| # | title | size | teaches | par |
|---|-------|------|---------|-----|
| 26 | Bug Patrol | S | bug wall-follows; time your dash (wait input) | 12 |
| 27 | Pinball Wizards | S | balls oscillate on fixed lanes | 14 |
| 28 | Fire Escape | M | fireballs ricochet right; water kills them | 13 |
| 29 | Tank Column | M | tanks + blue buttons reverse them | 20 |
| 30 | The Gauntlet | L | capstone: bug/ball/fireball/tank rooms chained with timing | 105 |

**Phase 7 — Machinery (31–35).** Toggle walls, clone machines, teleports, pop-up walls.

| # | title | size | teaches | par |
|---|-------|------|---------|-----|
| 31 | Toggle | S | green buttons flip toggle walls | 18 |
| 32 | Copy Machine | L | clone fuse: sprint the toggle before the spawn's press seals it | 72 |
| 33 | Wormholes | L | hub-and-spoke teleports; entry direction + fallback route pockets | 44 |
| 34 | No Way Back | M | popup partitions force a one-way tour; wrong orders softlock | 52 |
| 35 | Factory Floor | L | capstone: conveyor factory — belts, toggle gates, clone-fed button | 87 |

**Phase 8 — Mastery (36–40).** Everything combined; long expert routes.

| # | title | size | teaches | par |
|---|-------|------|---------|-----|
| 36 | Four Rooms | L | four quadrants, one mechanic each, shared key economy | 93 |
| 37 | Deep Freeze | L | ice labyrinth + monsters on ice | 88 |
| 38 | The Vault | L | nested rings: thief, teleports, water — strict ordering | 90 |
| 39 | Rube Goldberg | L | block-onto-button chains driving toggles/clones/tanks | 94 |
| 40 | Grand Tour | L | finale touring every mechanic | 116 |

## Expanding the level pack (adding levels & assuring quality)

Levels are pure data gated by machine checks — anyone (human or agent) can add levels by following
this playbook. "Done" is defined by the gates, not by opinion.

### Where levels live & what to touch

1. Add `ChicksLevelDef` entries to a `levels/phaseN.ts` file (or create `phase9.ts` and spread it in
   `levels/index.ts`). Ids must stay contiguous `1..TOTAL_LEVELS`.
2. Growing past 40: bump `TOTAL_LEVELS` in `gameTypes.ts` — level select, unlock caps, progress and
   the Game Select card all derive from it; no other runtime change is needed.
3. New phase? Extend `PHASE_OPENER_IDS` in `levels/validation.ts` (each phase opener must carry the
   phase's single `?` hint tile + `hint` text; hints are forbidden elsewhere).
4. Mechanic availability is id-gated (`MECHANIC_MIN_ID` in `validation.ts`) to protect the difficulty
   curve; ids > 35 have everything unlocked.

### The four gates (definition of done — all in `__tests__/`, run in the chicks CI job)

- **Static validation** (`levels.test.ts`): rectangular ≤ 32×32, fully wall-enclosed, exactly one
  `@`, ≥ 1 exit, socket iff chips, per-color key/door economy, clone templates wired, mechanic
  id-floors, hint placement.
- **Solver gate** (`solver.test.ts`): the deterministic weighted-A* must solve the level within its
  node budget, `par` must equal the solver's solution length, and the sealed-socket BFS must NOT
  reach an exit (socket chokepoint).
- **Necessity gate** (`necessity.test.ts`): every mechanic present, mutated away, must make the
  level unsolvable — doors sealed, boots removed, blocks deleted, teleports walled, buttons dead,
  dirt hardened. Anything on the board must be load-bearing; decoration fails the build.
- **Quality metrics** (asserted alongside the solver gate): per-phase floors on **detour factor**
  (par ÷ manhattan start→exit — kills walk-at-the-exit corridors) and **solver nodes expanded**
  (search effort ≈ real decisions; a forced path expands ~1 node per move). Capstones (ids ×5) must
  be the hardest of their phase. Thresholds live in one const block next to the test.

### Authoring loop

1. Design the grid as ASCII rows (legend in `levels/legend.ts`); plan the intended route.
2. Run the gates filtered to your level:
   `pnpm jest resources/js/games/chicks-challenge/__tests__/solver.test.ts .../necessity.test.ts .../levels.test.ts -t "level N"`
3. Set `par` to the solver-gate failure message's reported value ("update par to N").
4. **If the solver's par is far below your intended route, your level has a shortcut** — read the
   solver's implied path and plug the hole. If the solver returns `budget`, simplify.
5. A necessity failure means a mechanic is decorative: rework it to gate progress (see patterns) or
   remove it.
6. Playtest in dev mode: `/games/chicks-challenge?level=N` (`&record=1` logs your input string).

### Proven gating patterns (use these; naive placements fail the gates)

- **Socket**: the exit sits in a walled pocket whose only opening is the socket (test-enforced).
- **Blocks**: make them *enablers* (pushed into water to bridge the only crossing), never corridor
  *plugs* — deleting a plug opens the path, so plugs always fail necessity.
- **Boots**: branch pockets off slide lanes — forced slides physically cannot turn into them, so
  skates/suction are the only way in; for flippers/fire boots, the hazard must span the full route
  width (no dry detour).
- **Clone machines**: the clone-pressed button lives in an alcove sealed to walkers whose only
  access is the machine tile itself (spawned tank steps onto the button and parks).
- **Doors**: place them in walls that fully partition regions; a door in a wall stub is decoration.
- **Loops**: sever perimeter loops so teleports/crossings can't be skirted the long way around.

### Practicalities

- Keep boards ≤ 26 tiles wide for mobile readability; monsters ≤ 12 per level (hard cap 32 with
  clones); rooms and corridors, not noise.
- For agents: author ONE level at a time and re-run the gates each time; verify metrics with a
  scratch `solve(parseLevel(def))` test and delete scratch files before finishing.
- Pars are solver-derived and deterministic — never hand-tune them, and never add `solution`
  strings to shipped levels (replay strings are for debugging fixtures only).
- After the pack changes, refresh the level table above (pars/sizes/teaches) — it is documentation,
  not the source of truth.
Compose readable grids — rooms and corridors, not noise. Solutions need not be optimal; par×1.1
rounding gives 3★ slack, and `bestMoves` lets players beat par.

## Architecture / file layout

```
resources/js/games/chicks-challenge/
  index.tsx                    # vite entry: createRoot(#chicks-game-root)
  ChicksGame.tsx                # top-level state machine: select / playing / won / dead; owns progress
  ChicksScene.tsx               # canvas host; three renderer + tween loop; consumes engine events
  LevelSelect.tsx              # wraps _shared/LevelSelectGrid
  BoardRotor.tsx               # sizes + CSS-rotates the board container (board only, never the chrome)
  hud/
    GameHud.tsx                # chips/moves/inventory chips + buttons (top bar)
    GameToolbar.tsx            # rotation toggle + D-pad; bottom row / landscape side column
    HintBanner.tsx             # bottom hint banner while standing on a hint tile
    TouchDpad.tsx              # on-screen D-pad (TouchControls pattern)
  overlays/
    LevelCompleteOverlay.tsx   # StarRow + moves/par + next/replay/menu
    DeathOverlay.tsx
  gameTypes.ts                 # GameStatus, SceneProps, starsForMoves, constants, storage keys
  gameProgress.ts              # SavedChicksProgress parser plus profile/per-level row codec
  engine/                      # PURE TS — no three, no React, no DOM
    types.ts                   # GameState, Tile, Entity, MoveIntent, EngineEvent
    draft.ts                   # mutable working copy used inside one applyMove resolution
    applyMove.ts               # (state, intent) -> { state, events } — THE reducer
    solver.ts                  # deterministic weighted-A* over applyMove; stepping API for runtime probes
    movement.ts                # enterability, pushes, slide chains (shared player/monster/block)
    monsters.ts                # per-type AI step functions
    machinery.ts               # buttons, toggles, clones, teleports, pop-ups
  levels/
    legend.ts                  # char -> tile/entity mapping (single source of truth)
    levelTypes.ts              # ChicksLevelDef
    parseLevel.ts              # def -> initial GameState (+ link resolution, parse errors)
    replay.ts                  # replaySolution + ASCII board diagnostics for authoring
    validation.ts              # pure static checks used by tests
    index.ts                   # LEVELS: readonly ChicksLevelDef[] (concats phases)
    phase1.ts … phase8.ts      # 5 levels each — one file per phase for parallel authoring
  scene/
    sceneConstants.ts          # palette, tile px, tween timings
    threeUtils.ts              # disposal helpers (copy Hover's)
    tileTextures.ts            # procedural canvas textures per tile type
    boardBuilder.ts            # static tile layer meshes
    entitySprites.ts           # player/monster/block/item quads + tweens
    cameraRig.ts               # ortho fit-or-follow logic
    effects.ts                 # splash/puff/sparkle/confetti
  input/
    inputQueue.ts              # keyboard + swipe + dpad -> buffered MoveIntent queue (max 2)
    useStuckProbe.ts           # idle-sliced solver probe driving the Stuck overlay
    orientation.ts             # PURE: rotation decision (fit/comfort/hysteresis) + intent remap
    orientationStorage.ts      # device-only board-rotation preference (raw localStorage)
    useBoardOrientation.ts     # ResizeObserver + visualViewport measurement -> chosen rotation
  __tests__/
```

Laravel side: route `Route::get('/games/chicks-challenge', fn () => view('games.chicks-challenge'))->name('games.chicks-challenge');`
(public, next to the other games), Blade view per house pattern, feature test
`tests/Feature/ChicksChallengeGamePageTest.php` (mirror `HoverGamePageTest.php`).

The engine is a pure reducer: `applyMove(state, intent)` returns the next immutable state plus an
`EngineEvent[]` (`moved`, `slid`, `bumped`, `pickedUp`, `doorOpened`, `blockPushed`, `splash`,
`toggled`, `cloned`, `teleported`, `died{cause}`, `won{moves}`), which the scene consumes for
animation/effects and the tests assert on. Replays are `solution.split('').reduce(applyMove, initial)`.

## Testing & acceptance criteria

**A. Gates (all must pass):** `pnpm run type-check`, `pnpm run lint`, `pnpm run test`,
`pnpm run build`, `vendor/bin/pint --test`, `vendor/bin/phpstan analyse --memory-limit=1G`, and
`php artisan test --compact tests/Feature/ChicksChallengeGamePageTest.php`.

**B. Level static validation (node, `levels.test.ts`):** exactly 40 levels, ids 1–40 contiguous;
rectangular grids ≤ 32×32 fully wall-enclosed; exactly one `@`; ≥ 1 `E`; socket present iff chips > 0;
per color, consumed-key count ≥ door count (green: ≥ 1 key if any green door); every `M` has a
`cloneTemplates` entry and every template a machine; every `facingOverrides` key addresses a monster;
teleport groups have ≥ 2 members; all chars in the legend; difficulty-curve sanity (phase-1 levels
contain no monsters/ice/force/machinery; monsters first appear in phase 6; etc.).

**C. Solver gate (node, `solver.test.ts`) — the keystone:** for each of the 40 levels, the
deterministic weighted-A* solver (`engine/solver.ts`, driving the real `applyMove` reducer) must
find a winning input sequence within its node budget, and the stored `par` must equal the solver's
solution length (no hardcoded solutions anywhere). Additionally, for every level with a socket, the
relaxed sealed-socket BFS must NOT reach an exit (the chokepoint rule above) — chip collection can
never be bypassed. The solver's stepping API is the same machinery the game uses at runtime for
stuck detection. `replaySolution` (`levels/replay.ts`) remains for debugging fixtures.

**C2. Mechanic necessity gate (node, `necessity.test.ts`) — persistent anti-bypass:** for every
mechanic class present in a level, mutate its benefit away and re-solve; the level MUST become
unsolvable, or the mechanic is decorative and the level is broken. Mutations: each door color →
walls; each boot tile → floor; blocks → removed; teleports → walls; green/blue/red buttons → dead
(floor); dirt → walls. Levels may have many solutions — what this forbids is any winning route that
sidesteps an obstacle. New levels must pass this gate; intentional red-herring elements are not
currently supported (everything on the board must matter).

**C3. Quality metrics gate (asserted with the solver gate's per-level solve):** per-phase floors on
detour factor (par ÷ manhattan start→nearest exit) and solver nodes expanded, plus capstone-hardest
and difficulty-curve sanity. Encodes "no corridor levels" mechanically; thresholds are calibrated
just below the pack's accepted levels and live in a single const block. See "Expanding the level
pack" for the authoring workflow these gates define.

**D. Engine unit tests (node):** slide chains (ice stop-on-block, corner redirects, force-floor
loops capped, block sliding); push rules (no double push, push-into-water → floor, push onto button);
key consumption incl. green reuse; socket gating; each monster AI on canonical fixtures; both
directions of monster-player collision; toggle/clone/teleport/thief/pop-up semantics; blocked-teleport
fallback order; tank + blue button; monster cap; wait advancing monsters; rejected input moving
nothing; `starsForMoves` boundaries (exact `ceil` edges).

**E. Progress tests (`gameProgress.dom.test.ts`):** round-trip; corrupt JSON → defaults; stars/
bestMoves monotone (never lowered/raised respectively); `unlockedLevel` caps at 40.

**F. Component tests (jsdom, scene mocked):** `ChicksGame.test.tsx` — level select renders 40 tiles
with lock state; entering a level shows HUD with that level's chip count and par; win overlay shows
computed stars and advances unlock; death overlay restarts cleanly; hint banner appears on hint tile.
`inputQueue` test: keyboard + swipe merge, buffer caps at 2.

**G. Playability (manual, dev):** author 3★s every level once in dev mode. Dev jump
`/games/chicks-challenge?level=N` (allowed in production; unlock still only advances by winning);
`&record=1` logs the input string for solution authoring.

**H. Mobile:** `pnpm run test:e2e:chicks-challenge` (Playwright, desktop + Pixel 7 projects) covers
board-inside-viewport at the smallest and largest level sizes, no page overflow, chrome outside the
rotated container, rotation on a phone-sized viewport, the toggle override, and ≥ 44 px pad targets.
Rotation decision + input remap are unit-tested (`__tests__/orientation.test.ts`,
`useBoardOrientation.test.tsx`, `ChicksGameRotation.test.tsx`). Still manual: real-device swipe feel,
notch/home-indicator insets, and iOS Safari's dynamic browser chrome.

## CI wiring (exact edits)

1. `package.json`: add `"test:ci:chicks-challenge": "jest --passWithNoTests --maxWorkers=2 resources/js/games/chicks-challenge"`.
2. `jest.config.cjs`: add `'/resources/js/games/chicks-challenge/'` to `gameTestPathIgnorePatterns`.
3. `.github/workflows/ci.yml` (mirror the `hover` entries):
   - `changes` filter `chicks:` matching `resources/js/games/chicks-challenge/**`, `resources/js/games/_shared/**`,
     `resources/js/games/PortraitGameShell.tsx`, `resources/views/games/chicks-challenge.blade.php`,
     `tests/Feature/ChicksChallengeGamePageTest.php`, `package.json`, `pnpm-lock.yaml`, `vite.config.*`,
     `jest.config.*`, `.github/workflows/**`; plus the `outputs:` line.
   - `chicks-tests` job cloned from `hover-tests`, gated on the filter, running `pnpm run test:ci:chicks-challenge`.
   - Final `test` gate: add to `needs`, result var, failure/cancelled checks, all-skipped guard.
4. `vite.config.ts`: add `'resources/js/games/chicks-challenge/index.tsx'` to `laravel({ input })`.

## Out of scope / follow-ups (do not build now)

- Replacing the procedural SFX with recorded audio files (the `audio/sfx.ts` registry keys every
  sound by name — 'splash', 'pickup-chip', … — precisely so files can swap in without code changes).
- Visual-regression screenshots (the Playwright spec asserts layout, not pixels).
- Real-device confirmation of the `screen.orientation.angle` convention behind the rotation direction
  (implemented per "Rotation direction" above, with a clockwise fallback and a single constant to flip).
- Undo, replays/ghosts, level editor, and additional level packs.
- Real-time mode or level timers (the game is deliberately step-based).

## Implementation to-do list (handoff checklist)

Parallelize with well-specified Sonnet agents; the pure engine + replay tests make every workstream
independently verifiable. Integration and judgment calls stay with the lead.

Scaffold (sole-writer, first):
- [ ] Branch + this spec committed; draft PR opened.
- [ ] `levels/legend.ts`, `levels/levelTypes.ts`, `engine/types.ts`, `gameTypes.ts` (SceneProps,
      `starsForMoves`, constants), stub `ChicksScene.tsx`, `index.tsx`, Blade view, route, vite entry,
      `package.json` script, jest exclusion, ci.yml edits. Tree type-checks.

Workstream A — engine (owns `engine/**`, `levels/parseLevel.ts`, criteria C/D harness):
- [ ] `movement.ts` (enterability, pushes, slide chains), `applyMove.ts` reducer + events.
- [ ] `monsters.ts` AIs, `machinery.ts` (buttons/toggles/clones/teleports/thief/pop-ups).
- [ ] `parseLevel.ts` with link resolution + parse errors; engine unit tests (criteria D).

Workstream B — levels (owns `levels/phase*.ts`, `levels/validation.ts`, criteria B/C tests; splits
further into 4 parallel Sonnet agents, 2 phases each, once phase1 sets the pattern):
- [ ] `validation.ts` + `levels.test.ts` (criteria B); `solutions.test.ts` replay harness (criteria C).
- [ ] 40 grids + solutions per the table, authored & verified via `?level=N&record=1`.

Workstream C — scene (owns `scene/**`, `ChicksScene.tsx`):
- [ ] Tile textures, board builder, entity sprites + tweens, camera rig, effects, disposal.
- [ ] Scene consumes `EngineEvent[]`; no game logic in the scene layer.

Workstream D — UI shell (owns `ChicksGame.tsx`, `hud/`, `overlays/`, `input/`, `gameProgress.ts`, PHP test):
- [ ] `gameProgress.ts` + tests (criteria E); `inputQueue` + keyboard/swipe/D-pad.
- [ ] LevelSelect, HUD, overlays, `ChicksGame` state machine, `?level=N` / `&record=1` dev modes.
- [ ] Component tests (criteria F); `tests/Feature/ChicksChallengeGamePageTest.php`; catalog entry.

Integration (sole-writer, last):
- [ ] Wire A+B+C+D, run all gates (criteria A), fix-forward.
- [ ] Manual playthrough pass (criteria G/H) incl. a phone check.
- [ ] PR ready-for-review; address codex findings as follow-up commits on the same branch.
