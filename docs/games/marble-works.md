# Marble Works

A marble-run construction puzzle modelled on the kids' toy. Each level has a marble
resting in a fixed **dropper** and a goal **basket**. The player picks track pieces from a
tray, places them on a pegboard grid, and presses **Go**. The marble then drops and rolls
under real gravity and collision physics. Landing in the basket solves the level.

Route `/marble-works` (`games.marble-works`), entrypoint
`resources/js/games/marble-works/index.tsx`, save slug `marble-works`.

## Core loop

1. **Edit.** Tap a tray card to arm a piece. Then tap or drag on the board: a ghost snaps to
   the cell under the pointer (green = fits, red = doesn't) and is placed on release. With a
   mouse, the ghost follows the pointer while you hover.
2. Tap a placed piece to select it. A floating bar offers **Rotate / Flip / Remove**.
   Dragging a placed piece moves it; dropping it on the tray removes it.
3. **Go** builds the physics world from the level plus the placements and releases the
   marble. **Stop** returns to Edit with every piece kept.
4. **Win:** confetti, then the level-complete overlay (Levels / Replay / Next).
5. **Fail** (fell off, stuck, or timed out): a toast says why, the marble's path stays on the
   board as a dotted *ghost path*, and the game returns to Edit after 0.65 s. The ghost path
   clears on the next edit.

Keyboard shortcuts: `R` rotate, `F` flip (the selected piece, or the armed piece before you
place it), `Delete` remove, `Esc` deselect, `Space` Go/Stop.

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
| Jump | Jump (kicker lip, 38°), Launcher | track / spring | The launcher fires at a fixed 62° and 7 cells/s on contact. |
| Bouncer | Bumper (45° or upright), Trampoline | rubber 0.3 / **0.85**, spring | The trampoline sets `vy = keep · |impact vy| + boost` (0.9, 1.2). |

The launcher and trampoline effects are applied between fixed steps from each piece's
`collide` event. Nothing depends on restitution > 1, which is unstable in cannon-es.

## Physics

- **Engine:** cannon-es, the same as Block Blaster and Marble Sort.
- **Gravity:** `(0, −9.8, 0)`.
- **Marble:** a `Sphere(r = 0.2)` with `linearFactor (1,1,0)` and `angularFactor (0,0,1)`, so it
  stays in the plane and rolls.
- **Step:** a fixed `1/240 s` step, driven by the shared `advanceFixedSteps`
  (`_shared/three/physicsStep.ts`). At most 16 steps run per rendered frame.
- **Speed clamp:** 9 cells/s. Walls are ≥ 0.1 thick, so the marble can't tunnel through them.
- **Contact materials:** cannon-es uses per-shape contact materials only when **both** shapes
  carry one, so the marble's sphere shape has the marble material.
- **Outcomes** (`physics/runOutcome.ts`):
  - **win:** inside the basket interior for 0.3 s;
  - **out:** more than 1 cell past the sides or bottom;
  - **stuck:** slower than 0.06 for 1.5 s outside the basket;
  - **timeout:** 25 s.
- **Determinism:** runs are deterministic. `simulateRun(level, placements)` reproduces
  exactly what the player sees.

## Levels

Levels are defined in `levels/levels.ts`. Each level lists:

- the board size, start, goal, blocks, pegs, fixed pieces and no-build cells;
- the inventory and par;
- a hint and a reference `solution`.

Stars are awarded as follows:

| Stars | Condition |
|---|---|
| 1 | Level solved |
| 2 | Solved using ≤ `par.two` pieces |
| 3 | Solved using ≤ `par.three` pieces (never below the reference solution length) |

| # | Title | Teaches |
|---|---|---|
| 1 | First Drop | Tutorial: pick → place → Go (one steep ramp) |
| 2 | Zig-Zag | Flip, chaining ramps |
| 3 | Mind the Gap | Straight track bridges |
| 4 | Turn Around | U-Turn |
| 5 | Tube Station | Tubes and elbows around pegs |
| 6 | Bank Shot | Bumper |
| 7 | Big Jump | Kicker over a no-build pit |
| 8 | Spring Up | Launcher (the trampoline is a decoy) |
| 9 | Peg Field | Funnel catches a scattered marble |
| 10 | Switchback | Two U-Turns, tight inventory |
| 11 | Bounce House | Bumper → trampoline onto a ledge |
| 12 | Grand Machine | Tubes, track, jump, U-Turn, ramps, launcher |

## UI

The visual style is a chunky plastic toy on a birch pegboard, drawn with an orthographic
camera looking head-on at the board.

- **Board layout:** `board/layout.ts` contain-fits the board with a 0.45-cell frame margin.
  The camera sits over the board centre with a camera-relative frustum, and pointer events
  map to cells with plain arithmetic, so no raycasting is needed.
- **Piece colours** are set per family in `scene/palette.ts`. Obstacles are slate with bolts,
  and no-build cells are red-hatched.
- **Marble:** a glass marble with a spinning cat's-eye swirl and a short dotted trail.
- **Tray:** a strip along the bottom in portrait, and a left column at `md` and wider.
- **Chrome:** the shared `GameBottomToolbar` (Levels, Clear, Go/Stop, Fullscreen),
  `LevelSelectGrid` and `TapHint`.
- **Reduced motion:** with `prefers-reduced-motion`, the trail, confetti, basket wobble and
  snap animation are all off.

## Progress

`_shared/levelStarsProgress.ts` (shared with Block Blaster) stores the local blob
`bwh.marble-works.progress.v1`. It syncs as a `profile/default {unlocked_level}` row plus
one `level/N {stars}` row per level. `GameSlug::MarbleWorks` allows levels 1–12 and profile
`default` only.

## Testing

- `__tests__/levelSolutions.test.ts`: for every level, the reference solution wins, an empty
  board does not, and runs are deterministic. A failure prints an ASCII picture of the board
  and the marble's path (`__tests__/boardAscii.ts`).
- `pieceBehavior.test.ts`: headless checks of each piece: the launcher's angle and speed, the
  trampoline's height gain, the bumper's bounce, tube routing, and the kicker at fast and
  slow speeds.
- `levels.test.ts` (static validation), `grid.test.ts`, `pieceGeometry.test.ts`,
  `layout.test.ts`, `runOutcome.test.ts`, `pieceMesh.test.ts`, and the React tests (the scene
  is mocked).
- `tests/e2e/marble-works.spec.ts` (`pnpm run test:e2e:marble-works`): builds and wins the
  tutorial in a real browser and checks the board fits the viewport. It is not part of the PR
  gate.
- `tests/Feature/MarbleWorksGamePageTest.php`, plus the level-12/13 bounds in
  `GameDataApiTest`.
