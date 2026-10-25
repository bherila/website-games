# Marble Sort

Marble Sort is a browser game mounted at `/marble-sort`. The player clears a chute-fed grid of marble boxes by busting boxes open, feeding their marbles onto a conveyor, and letting matching sorting blocks collect marbles in sets of three.

The page uses `resources/views/layouts/game.blade.php`, matching the Parking Pickup game shell: the game has a focused Blade mount that skips the global site navigation and loads a dedicated Vite React entry.

## Levels, Stars, And Progression

- The game ships a 25-level campaign defined in `resources/js/games/marble-sort/levels.ts`. Marble Sort boards are fully determined by (level, seed), so curation means pinning seeds whose generated boards play well; `levels.test.ts` asserts every campaign level generates a real (non-fallback) solver-proven board. Add levels by appending entries.
- The game boots to a level-select grid (shared `LevelSelectGrid` component with Parking Pickup): locked tiles past the unlock watermark, star ratings, a pulse on the next unplayed level, and mid-level snapshot resume.
- Stars: 3 for finishing without power-ups; 2 for one or two power-ups spent; 1 otherwise. `powerUpsUsed` already existed on the game state.
- Progress (`bwh.marble-sort.progress.v2`) stores the unlock watermark, per-level best stars, scores, and power-up inventory; the v1 keys are intentionally abandoned (progress reset). Snapshots use `bwh.marble-sort.snapshot.v4`.

## Core Loop

1. A level starts with a 3-column by 5-row grid, side chute counters, a conveyor loop, and sorting block stacks.
2. The player clicks an exposed bottom-of-column box. If the conveyor has room for the box payload, the box busts open and releases nine marbles of its true color.
3. Released marbles fall from the grid basin into the conveyor.
4. Conveyor marbles circulate past the sorting gate.
5. When a marble reaches the gate, it fills the top compatible sorting block if that block has an open slot.
6. Sorting blocks hold three marbles. Once all three slots are filled, the completed block clears and exposes the next block in that stack.
7. Chutes refill open grid squares in their row until their counter reaches zero.
8. The level is complete when every grid box is gone, every chute counter is zero, no marbles remain in flight or on the conveyor, and every sorting block stack is cleared.

## Visual Style

The target look is a "pop-it fidget toy" render: glossy candy-colored boxes and marbles on a saturated green field with a recessed light tray.

- Lighting is balanced so total irradiance stays near 1.0 — overdriving the hemisphere + sun stack under `NeutralToneMapping` bleaches saturated colors toward pastel.
- `MARBLE_COLORS` holds ten saturated colors. A level activates at most eight at once; the active set is a per-level window into the palette that steps by 3 (coprime with the palette size), so all ten colors appear across any ten consecutive levels. The order interleaves the muted colors (black, white, brown) between vivid ones so no level draws a drab set.
- Colorblind mode labels boxes and sorting blocks with `MARBLE_COLOR_ABBREVIATIONS` (distinct per color) rather than pattern-name initials, which collided.
- The conveyor renders as a gray track with a recessed marble channel along the actual loop path, a raised center island edged with a white divider line, and moving dimple markers that read as belt sockets.
- Sorting blocks scale their width to the per-stack column spacing (`sortingBlockWidth`) so stacks never overlap on high-color levels.
- Chutes sit clear of the grid footprint with a trim plate bridging to the grid edge so they read as attached without intersecting boxes.

## Boxes And Grid

- The grid is fixed at three columns by five rows for the first version.
- Each box contains exactly nine marbles.
- Box color determines which sorting block can consume the released marbles.
- Some boxes are hidden and render as question-mark blocks until one of their in-grid neighbors is cleared. Their true color is still known to the level generator and solver.
- A displayed question-mark box cannot be opened.
- A known-color box can only be opened when it is free: bottom-row boxes are free, and any other box is free only after the box directly below it in the same column has been cleared.
- Openable known-color boxes render with the 3x3 marble studs. Known-color blocked boxes render as plain solid color tiles until the box below is cleared.
- A clicked box is only opened when it is revealed, free, and the conveyor has enough free capacity for all nine marbles.
- Opening a box bursts the crate with a small ring + shard effect, then the nine marbles fall in a two-stage cascade: first vertically from the grid cell into the basin funnel mouth, then forward onto the conveyor belt.
- Opening a box increments moves and may reduce the level score.
- Open grid cells are eligible for chute refills.

## Chutes

- Chutes sit on the left and right sides of selected grid rows.
- A chute displays the number of boxes it still needs to eject.
- After a box opens, the row's chutes try to refill open cells in that row.
- Each ejected box decrements its chute counter.
- Chute boxes are assigned during level generation and preserve the level's solvable color order.
- When a chute counter reaches zero, that chute remains as an empty visual counter and no longer injects boxes.

## Conveyor

- The conveyor is a continuous stadium-shaped loop below the grid.
- The conveyor has finite marble capacity. This makes the order of box openings matter.
- Marbles are drawn as a packed queue (shoulder-to-shoulder along the belt), spaced by marble diameter rather than spread evenly across the loop.
- Marbles keep their stable identity while circulating and should not teleport between updates.
- Sorting is gate-based: only a marble crossing the sorting gate may enter a block.
- If no compatible block has a slot when a marble reaches the gate, the marble keeps circulating.
- If circulating and falling marbles fill the belt, the level enters a game-over state and must be reset.
- The level generator sizes sorting stacks so every generated marble has a compatible destination.

## Sorting Blocks

- Sorting blocks are arranged in vertical stacks below the conveyor. The active (depth 0) block sits closest to the conveyor; upcoming blocks recede behind it so the player can read which colors are queued.
- The active block shows three lego-stud-style slots on its top face. Empty slots render as recessed dark dimples; filled slots render as colored studs with a seated marble.
- A slot can only accept a marble whose color matches the block color.
- A filled block clears with a small confetti burst, and the next block tweens up from below to take its place.
- Stack order is randomized. A color may be buried under other colors, so the player needs to open boxes in an order that keeps the belt from filling before matching receptacles are exposed.
- Empty stacks render as inactive lanes.
- Completing blocks is the primary objective; all stacks must be empty to complete the level.

## Controls

- The game uses the same responsive shell pattern as Parking Pickup.
- On portrait screens, the HUD is compact so the play field remains visible.
- Bottom controls are icon buttons with tooltips.
- Reset restarts the current level.
- Tutorial opens the local tutorial overlay.
- Colorblind mode adds stable color labels and patterns to boxes, marbles, and sorting blocks.

## Power-Ups

### Magnet

Magnet pulls currently conveyor-held marbles into matching sorting blocks as far as available slots allow.

### Shuffle

Shuffle changes the visible grid and chute box colors into another solvable arrangement without changing counts.

### Extra Belt

Extra Belt temporarily increases conveyor capacity for the current level.

Each power-up uses a confirmation dialog before spending inventory.

## Level Generation

- Levels are randomly generated from a deterministic seed for the level number.
- Generated levels must be solvable by a simple solver pass before they are accepted.
- The solver opens only revealed free boxes whose colors match currently exposed receptacles, drains the conveyor into matching blocks, and verifies that chute refills plus sorting stack order can finish before the belt fills.
- Difficulty ramps gradually with level:
  - more colors are introduced (up to all ten),
  - more chute-fed boxes appear,
  - sorting stacks get deeper,
  - more hidden boxes appear,
  - conveyor capacity becomes tighter relative to available boxes.
- If random generation fails repeatedly, the engine falls back to a conservative open level that is still solvable.

## Scoring And Progress

- Logged-in progress is saved as timestamped account profile and per-level rows; anonymous play uses the versioned local save.
- Saved progress includes the unlocked-level watermark, per-level best stars and scores, total score, high score, and power-up inventory.
- The active level is saved separately in an `autosave` slot so refreshing the page resumes the board; rapid snapshots are coalesced and serialized.
- Level score is finalized when the level is complete.
- Extra moves and power-up use reduce score.
- Completing a level awards a random power-up.

## Current Implementation Notes

- Route: `/marble-sort`
- React entry: `resources/js/games/marble-sort/index.tsx`
- Game shell/state orchestration: `resources/js/games/marble-sort/MarbleSortGame.tsx`
- Controls and HUD: `resources/js/games/marble-sort/GameControls.tsx`
- Main scene orchestration: `resources/js/games/marble-sort/MarbleSortScene.tsx`
- Static scene builders live under `resources/js/games/marble-sort/scene/builders/`.
- Animation modules live under `resources/js/games/marble-sort/scene/animation/`.
- Game engine: `resources/js/games/marble-sort/gameEngine.ts`
- Shared game contracts: `resources/js/games/marble-sort/gameTypes.ts`
- Progress persistence: `resources/js/games/marble-sort/gameProgress.ts` (board-state parsing), on the shared `_shared/campaignProgress.ts` factory for progress, inventory, database rows and the level snapshot. `_shared/__tests__/campaignProgress.dom.test.ts` pins every saved byte to fixtures captured before the factory existed.
- Anonymous/legacy progress key: `bwh.marble-sort.progress.v2`
- Anonymous/legacy level snapshot key: `bwh.marble-sort.snapshot.v4`
- Rendering uses Three.js through Vite.
- The scene owns the PMREM environment render target, sun shadow target, and
  cloud meshes. Leaving a level releases them along with the board; the temporary
  `RoomEnvironment` and PMREM generator are released after environment generation.
- The full-resolution sun shadow is reused while only clouds and conveyor
  sockets move (neither casts a shadow). Board changes and moving marbles,
  dispenser boxes, or sorting stacks refresh it, including each animation's
  final frame. Shadow resolution, lighting, materials, and physics stay the same.
- The first version uses automatic conveyor sorting rather than manual drag-and-drop.

## Rendering Investigation

An October 2026 local Chromium/SwiftShader probe used the first campaign board,
a 1703 by 959 desktop viewport, and a 677 by 757 drawing buffer. It captured
the scene's renderer in a temporary Playwright response override, rendered the
same scene repeatedly, and read `renderer.info.render`. For elapsed time it
called WebGL `readPixels` on one pixel after each render to wait for the GPU;
timing `renderer.render` alone mostly measures command submission.

Reusing the sun shadow removed 130 draw calls and 98,912 triangles per settled
frame (373 calls / 228,718 triangles versus 243 / 129,806). This avoids rebuilding
the unchanged 2048 by 2048 shadow map while retaining the same visible shadows.
Three synchronized samples per condition had medians of 1.55 seconds with
shadow updates and 1.65 seconds with the cached map: these noisy software-rendered
samples do **not** demonstrate a frame-time improvement. A later diagnostic was
stopped after exceeding its time budget on the shared host. The main rendering
bottleneck remains unresolved; these results do not justify reducing visual
quality or converting repeated marble meshes to instances yet.

## Open Questions

- Final tuning for level difficulty, conveyor capacity, score penalties, and power-up award rates.
- Whether later versions should support manual sorting gestures.
- Whether to add sounds, haptics, or a more elaborate box-bust animation.

## Browser Regression Coverage

`pnpm run test:e2e:marble-sort` runs the desktop and mobile Chromium journeys in
`tests/e2e/marble-sort.spec.ts`. They pop a real hinted box, verify its nine-marble
payload and autosave, resume after a page reload, and reset the original board.
Desktop also checks resuming through the level menu and completing all five
tutorial steps; mobile checks advancing, dismissing, and reopening the tutorial.
Mobile play uses touch input. The suite reads the game’s own autosave for assertions and does not
inject a board or progress. It also runs in the shared gameplay browser gate.
Functional journeys use a 1280 by 720 desktop viewport, the 375 by 812 touch
viewport, and device scale factor 1 to bound software rendering cost.
