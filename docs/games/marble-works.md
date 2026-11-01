# Marble Works

A marble-run construction puzzle modelled on the kids' toy. Each level has one or more
**droppers** holding marbles and one or more goal **baskets**. The player picks track pieces
from a tray, places them on a pegboard grid, and presses **Go**. The marbles then drop one
after another and roll under real gravity and collision physics. Every marble settling in a
basket that takes it solves the level.

Route `/marble-works` (`games.marble-works`), entrypoint
`resources/js/games/marble-works/index.tsx`, save slug `marble-works`.

## Core loop

1. **Edit.** Tap a tray card to arm a piece. Then tap or drag on the board: a ghost snaps to
   the cell under the pointer (green = fits, red = doesn't) and is placed on release. With a
   mouse, the ghost follows the pointer while you hover.
2. Tap a placed piece to select it. A floating bar offers **Rotate / Flip / Remove**.
   Dragging a placed piece moves it; dropping it on the tray removes it.
3. **Go** builds the physics world from the level plus the placements and opens the
   droppers. **Stop** returns to Edit with every piece kept.
4. **Win:** confetti, then the level-complete overlay (stars, the gem and par goals, and
   Levels / Replay / Next).
5. **Fail** (a marble fell off, got stuck, landed in a basket that refuses it, or the run
   timed out): a toast names the marble and why, every marble's path stays on the board as a
   dotted *ghost path*, and the game returns to Edit after 0.65 s. The ghost paths clear on
   the next edit.

Keyboard shortcuts: `R` rotate, `F` flip (the selected piece, or the armed piece before you
place it), `Delete` remove, `Esc` deselect, `Space` Go/Stop.

## Marbles, droppers and baskets

| Kind | Radius | Mass | What it changes |
|---|---|---|---|
| Glass | 0.2 | 1 | The standard marble. |
| Mini | 0.12 | 0.4 | Falls through a Sieve; flies furthest off a Launcher. |
| Steel | 0.2 | 3 | Shatters glass track and panes; flies shortest; bounces lowest. |

Kinds live in `physics/marbles.ts`. Launchers and trampolines give every marble the same
impulse, so speed scales with `1 / sqrt(mass)` (`impulseSpeedScale`); a trampoline uses the
square root of that again. Rubber bumpers bounce heavy marbles less.

- A **dropper** (`Dropper`) holds marbles that fall one at a time: marble `i` falls at
  `delay + i × interval` seconds (default interval 1.6 s). Several droppers run at once.
  `marbleSchedule` orders every marble in the level by release time; that order is the
  marble index everywhere (events, paths, the HUD row of marble chips).
- A **basket** (`Basket`) may only take one kind (`accepts`, shown by its pennant colour and
  a little marble on it) and may hold a fixed number of marbles (`capacity`, shown as pips).
  A marble that settles in a basket is removed from the world, so later marbles never pile
  up on it.
- **Gems** are cells a marble collects by rolling through (within 0.34 of the centre).

## Stars

| Star | Earned by |
|---|---|
| 1 | Solving the level |
| +1 | Collecting every gem (automatic on a level without gems) |
| +1 | Using at most `par` pieces |

`par` is never below the reference solution's size, and every reference solution collects
every gem, so three stars is always reachable (`levelSolutions.test.ts`).

## Board and coordinates

- The board is `cols × rows` cells, 1 world unit per cell, with `+y` up. Cell `(col, row)`
  counts from the top-left.
- A placement's `(col, row)` is the top-left cell of its footprint.
- A piece is data (`pieces/pieceCatalog.ts`): variants of wall **polylines** in local
  footprint coordinates (origin bottom-left, `+y` up). Each polyline describes a *surface*,
  and the solid is on the right-hand side of the direction of travel.
- **Flip** mirrors x and reverses the point order, so the solid stays on the same side.
- The physics (`physics/runWorld.ts`), the meshes (`scene/builders/pieceMesh.ts`) and the
  tray icons (`ui/PieceIcon.tsx`) all read the same polylines. What you see is exactly what
  the marble hits.
- Rows connect at `SURFACE = 0.12` above a cell's bottom edge. A ramp enters at the row
  above's surface height and leaves at its own, so ramps chain diagonally and flat track
  continues a ramp's exit.

## Piece catalogue

| Family | Pieces | Material (friction / restitution) | Notes |
|---|---|---|---|
| Track | Track (1×1), Long Track (2×1) | track 0.2 / 0.1 | Flat. |
| Ramp | Steep Ramp (1×1, 45°), Gentle Ramp (2×1) | track | Flip sets the downhill direction. |
| Turn | Curve (1×1; drop→roll, or a quarter-pipe), U-Turn (1×2) | track / tube | The U-Turn sends the marble back one row lower. |
| Tube | Tube (vertical or horizontal), Elbow Tube, Funnel (3×1) | tube 0.12 / 0.05 | Walls on both sides; the funnel centres wide arrivals. |
| Jump | Jump (kicker lip, 38°), Launcher | track / spring | The launcher fires at a fixed 62° and 7 cells/s (glass) on contact. |
| Bouncer | Bumper (45° or upright), Trampoline | rubber 0.3 / 0.55–0.9, spring | The trampoline sets `vy = (keep · |impact vy| + boost) · √(1/√mass)`. |
| Sorter | Switch (1×1), Sieve (2×1) | track | See below. |
| Glass | Glass Track (1×1), Glass Pane (1×1 upright) | glass 0.15 / 0.15 | Shatter when a steel ball touches them. |

- **Switch** (`toggle` behaviour): a paddle from one top corner down to the far side's
  rolling surface, so it chains into track. Each time a marble that touched it leaves its
  footprint (plus a marble radius), it swaps to its mirror image. Flip sets the first
  marble's direction. The physics keeps both orientations as bodies and turns one off with
  a zero collision group; the mesh swings the paddle between the two poses.
- **Sieve** (`sieve` behaviour): a two-cell grate. Each marble kind has its own collision
  bit, and the sieve's mask leaves out kinds no bigger than `SIEVE_MAX_RADIUS`, so mini
  marbles fall through at any speed. It is two cells wide because a fast mini marble crossing
  one cell drops barely half a cell and would be caught by whatever track follows.
- **Glass** (`fragile` behaviour): a steel ball's first touch turns the piece off for the
  rest of the run and restores the ball's pre-impact velocity × 0.8, so it crashes straight
  through. Glass and mini marbles treat it as ordinary track or wall. Once broken it stays
  broken, so release order matters.

The launcher, trampoline, switch and glass effects are applied between fixed steps from each
piece's `collide` event (fired before the solver, so the marble's pre-impact velocity is
known). Nothing depends on restitution > 1, which is unstable in cannon-es.

## Physics

- **Engine:** cannon-es, the same as Block Blaster and Marble Sort.
- **Gravity:** `(0, −9.8, 0)`.
- **Marbles:** a `Sphere` per marble (radius and mass by kind) with `linearFactor (1,1,0)` and
  `angularFactor (0,0,1)`, so they stay in the plane and roll. Marbles collide with each
  other (restitution 0.45). A marble joins the world when its dropper releases it.
- **Bodies:** every placement (fixed or the player's) has its own static body, so contacts
  can be attributed to pieces (`firstContacts`, used by the level search). Blocks, pegs and
  baskets share one static body.
- **Step:** a fixed `1/240 s` step, driven by the shared `advanceFixedSteps`
  (`_shared/three/physicsStep.ts`). At most 16 steps run per rendered frame.
- **Speed clamp:** 9 cells/s. Walls are ≥ 0.1 thick, so marbles can't tunnel through them.
- **Contact materials:** cannon-es uses per-shape contact materials only when **both** shapes
  carry one, so each marble's sphere shape has its kind's material.
- **Outcomes** (`physics/runOutcome.ts`), judged per marble and then for the run:
  - **home:** inside an accepting basket with room for 0.3 s;
  - **wrong / full:** settled in a basket that does not take its kind / is already full;
  - **out:** more than 1 cell past the sides or bottom;
  - **stuck:** slower than 0.06 for 1.5 s outside a basket;
  - the run is **won** when every marble is home, fails on the first failed marble, and
    **times out** 25 s after the last release.
- **Determinism:** runs are deterministic. `simulateRun(level, placements)` reproduces
  exactly what the player sees.

## Levels

Levels are defined in `levels/levels.ts`. Each level lists the board size, droppers,
baskets, gems, blocks, pegs, fixed pieces and no-build cells; the tray and par; a hint
(shown on a first visit only when `autoHint` is set, i.e. on levels that introduce
something); and a reference `solution`.

| # | Title | Idea | Par |
|---|---|---|---|
| 1 | First Drop | Tutorial: pick → place → Go | 1 |
| 2 | Zig-Zag | Flip; swing out for the gem and back | 3 |
| 3 | Bank Shot | Two bumpers throw the marble over a wall | 3 |
| 4 | Turn Around | U-Turn | 3 |
| 5 | Spring Up | Launcher | 2 |
| 6 | Heavy Metal | The steel ball; glass breaks | 2 |
| 7 | Fork in the Road | Switch; one marble per basket | 2 |
| 8 | Steel Yourself | Glass track keeps glass and drops steel | 5 |
| 9 | Wrong Order | Steel first, so glass track won't do: switch them | 6 |
| 10 | Small Fry | Sieve | 2 |
| 11 | Long Shot | One launcher, three weights, three distances | 3 |
| 12 | Rendezvous | Two droppers, one basket, a funnel | 4 |
| 13 | Launch Window | Launcher sorting with a bank shot | 5 |
| 14 | Bounce House | One trampoline bounce: glass clears the wall, steel doesn't | 3 |
| 15 | Switchyard | A tree of three switches for four marbles | 5 |
| 16 | Sorting Office | Sieve the minis, then switch steel from glass | 6 |
| 17 | Heavy Middle | Glass, steel, glass: a switch sorts them | 7 |
| 18 | Glass Maze | Steel smashes a path for the glass marbles | 6 |
| 19 | Grand Machine | Sieve, switch and routing for five marbles | 8 |

### Shortcut finder

The original twelve levels could each be won with one or two pieces, whatever their
reference solution used. `levels/levelSearch.ts` searches for the cheapest winning builds:

- It only tries pieces where a marble actually goes. In any winning build the pieces are
  first touched in some order, and the build with just the first *i* pieces runs identically
  until piece *i + 1* is touched, so piece *i + 1* lies on that build's path. Growing builds
  one piece at a time along the path, keeping only builds whose new piece is touched last,
  reaches every winning build once.
- Breadth-first (default) proves a minimum when the result is `exhausted`. Best-first
  (`bestFirst`) explores builds that get more marbles home, collect more gems and run longer
  first; it finds large solutions quickly but proves nothing.

`pnpm run marble-works:search [--pieces N] [--runs N] [--gems] [--best] [ids…]` runs it over
the campaign on worker threads (Node imports the TypeScript source directly through
`scripts/marble-works/ts-hooks.mjs`) and exits non-zero when a level is beaten below its
reference size. The campaign was tuned with it: no-build cells rule out cheaper builds it
found. Some levels can still be won without the gems with fewer pieces than par; three stars
always needs the intended machine. Re-run it after changing a level, a piece or the physics.

## UI

The visual style is a chunky plastic toy on a birch pegboard, drawn with an orthographic
camera looking head-on at the board.

- **Board layout:** `board/layout.ts` contain-fits the board with a 0.45-cell frame margin.
  The camera sits over the board centre with a camera-relative frustum, and pointer events
  map to cells with plain arithmetic, so no raycasting is needed.
- **Piece colours** are set per family in `scene/palette.ts`. Obstacles are slate with bolts,
  and no-build cells are red-hatched.
- **Glass:** marbles, tubes, glass pieces and gems use `MeshPhysicalMaterial` transmission,
  so the board behind them is refracted through them. Refraction renders the board a second
  time each frame, at half resolution (`transmissionResolutionScale`). `scene/glassQuality.ts`
  picks the quality: software-rendered browsers (no GPU) and devices whose median frame time
  over their first 30 frames exceeds 45 ms draw the same materials as tinted see-through glass
  instead (`lite`). Only the physical materials (glass, steel, gems) get the reflection map,
  prefiltered from a small painted studio image once per level; sampling it across the
  painted board cost most of a software renderer's frame rate. Measured in local headless
  Chromium (SwiftShader) on level 1: about 8 fps and a 3 s load, against 8.4 fps and 2.2 s
  before the rebuild; refraction plus a room environment map had cost it 2 fps and 12 s.
- **Marbles:** glass marbles have a spinning cat's-eye swirl; mini marbles are small green
  glass; steel balls are polished metal with a machined band. Queued marbles wait in a row
  on top of their dropper. A marble that lands sinks into its basket and lights a pip.
- **Effects:** a smashed glass piece bursts into tumbling, seeded shards
  (`scene/effects/shards.ts`); a collected gem pops in a small burst; a switch's paddle
  swings between its two poses.
- **Tray:** a strip along the bottom in portrait, and a left column at `md` and wider.
- **Chrome:** the shared `GameBottomToolbar` (Levels, Clear, Go/Stop, Fullscreen),
  `LevelSelectGrid` and `TapHint`.
- **Reduced motion:** with `prefers-reduced-motion`, the trail, confetti, basket wobble and
  snap animation are all off.

## Progress

`_shared/levelStarsProgress.ts` (shared with Block Blaster) stores the local blob
`bwh.marble-works.progress.v2`. It syncs as a `profile/default {unlocked_level}` row plus
one `level/N {stars}` row per level. `GameSlug::MarbleWorks` allows levels 1–24 and profile
`default` only.

The rebuilt campaign started progress afresh. Its rows carry `campaign_revision: 2`; the
client ignores rows from any other campaign, and `GameDataMerger` replaces a row from an
older campaign outright instead of keeping its higher stars (and drops a write from an older
client). The original campaign's `v1` local key is not read.

## Testing

- `__tests__/levelSolutions.test.ts`: for every level, the reference solution wins with every
  gem within par, an empty board does not win, and runs are deterministic. A failure prints
  an ASCII picture of the board and every marble's path (`__tests__/boardAscii.ts`).
- `pieceBehavior.test.ts`: headless checks of each piece and marble kind: the launcher's angle
  and speed and its weight scaling, the trampoline's height gain and weight scaling, the
  bumper's bounce, tube routing, the kicker at fast and slow speeds, the switch's
  alternation, glass breaking only under steel, the sieve, gems, and baskets that refuse a
  kind or are full.
- `levelSearch.test.ts`: the shortcut finder proves known minimums and reports its budget.
- `levels.test.ts` (static validation), `grid.test.ts`, `pieceGeometry.test.ts`,
  `layout.test.ts`, `runOutcome.test.ts`, `pieceMesh.test.ts`, and the React tests (the scene
  is mocked).
- `tests/e2e/marble-works.spec.ts` (`pnpm run test:e2e:marble-works`): builds and wins the
  tutorial in a real browser and checks the board fits the viewport. It is not part of the PR
  gate.
- `tests/Feature/MarbleWorksGamePageTest.php`, plus the level-24/25 bounds in
  `GameDataApiTest` and the campaign-revision rule in `tests/Unit/GameDataMergerTest.php`.
