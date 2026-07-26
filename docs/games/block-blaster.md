# Block Blaster

Block Blaster is a 3D physics shooting game mounted at `/games/block-blaster`. Each level presents an
artfully stacked arrangement of blocks of different sizes, weights, and colors on a pedestal platform in a
carnival field. The player has a limited supply of cannonballs and must knock **every block off its
platform** before the balls run out. Some platforms rotate, exposing different faces of the structure over
time. The game is entirely wordless: the first levels teach the mechanics through layout and visual hints
alone.

This document is the implementation specification and acceptance-criteria contract. It is written to be
handed to coding agents; each section is normative unless marked "tuning" or "follow-up".

## House conventions (must follow)

Block Blaster is the third game in this repo and must mirror the existing two:

- **Reference implementations:** `resources/js/games/marble-sort/` (uses cannon-es physics — closest
  reference) and `resources/js/games/cars/` (camera/scene/tutorial patterns).
- **Stack:** `three` + `cannon-es` (already in `package.json` — no new dependencies), React 19, TypeScript
  strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` — use
  `import type`), Tailwind for HUD/overlays.
- **Mount pattern:** public route in `routes/web.php` below the auth group → `resources/views/games/block-blaster.blade.php`
  extending `layouts.game` with `<div id="block-blaster-root"></div>` → per-page Vite entry
  `resources/js/games/block-blaster/index.tsx` registered in `vite.config.ts` `laravel({ input: [...] })`.
- **Shell:** wrap the game in `games/PortraitGameShell.tsx` (portrait viewport, `max-width: min(100vw, 100vh*3/4)`).
- **Persistence:** authenticated progress uses timestamped `user_game_data` profile/per-level rows via
  `games/_shared/gameDataPersistence.ts`. Anonymous progress keeps the defensive, versioned
  `localStorage` format and is promoted after the first successful account save.
- **Tests:** co-located `__tests__/` dir; `*.test.ts` runs in the node Jest project (no DOM,
  no `@testing-library` imports), `*.dom.test.ts` / `*.test.tsx` run in jsdom. Never instantiate
  `WebGLRenderer` in tests — test builders/engine logic directly (see `marble-sort/__tests__/physicsWorld.test.ts`).
- **CI:** game tests run in their own job, excluded from the app suite via `JEST_EXCLUDE_GAME_TESTS`
  (see CI wiring section).
- **Lint gotchas:** `simple-import-sort/imports` and `unused-imports/no-unused-imports` are errors.

## Core loop

1. Player opens the game and lands on the **level-select grid** (25 tiles, sequential unlock, star badges).
2. Tapping an unlocked tile starts the level: camera behind a cannon at the bottom of a portrait 3D field,
   platform(s) with stacked blocks mid-field, ball-count chip in the HUD.
3. Player moves the pointer to aim (the cannon barrel tracks the aim point) and taps/releases to fire one
   cannonball. Each shot decrements the ball counter.
4. Balls collide with blocks; blocks topple, slide, and fall. A block whose center falls below the
   platform's top surface by more than one block-height is **cleared** (it can never return).
5. **Win:** all blocks cleared → confetti + star rating (based on balls remaining) → overlay with
   next-level / replay / menu buttons. Progress and best stars persist.
6. **Lose:** all balls fired, no ball still in flight, physics settled, and blocks remain → shake/dim
   animation → overlay with replay / menu buttons.

## Controls (wordless)

- **Pointer move / touch drag:** aim. Raycast from camera through the pointer onto a vertical aim plane
  through the platform center; cannon yaw/pitch visually tracks the point. A subtle reticle (small ring)
  renders at the aim point.
- **Tap / click (pointer up):** fire one ball, with a ~250 ms cooldown. Firing while a previous ball is in
  flight is allowed.
- **Ballistics:** ball leaves the muzzle at fixed speed `BALL_SPEED`. Solve the low-arc launch elevation so
  the ball's trajectory passes through the 3D aim point (standard projectile elevation solve); if no
  solution (target out of range), fire straight at the point. The player never sees numbers — the ball just
  goes where they tapped.
- **Rim-clearing aim assist:** the cannon pivot sits below the platform tops, so the plain low arc to a
  block at tabletop level clips the platform's near rim. The solver raises the launch arc in minimal
  steps until the trajectory clears every rim between the muzzle and the aim point
  (`solveRimClearingLaunch`), so tapping a block hits that block. The assist skips rims the shot passes
  beside (twin platforms) and never engages when the player aims below the tabletop.
- No keyboard required. HUD buttons (retry, level select) are icon-only.

## Physics specification

- **Engine:** cannon-es `World`, fixed timestep `1/60`, `world.step(1/60, dt, 3)` from the rAF loop.
  Gravity `(0, -18, 0)` (≈2× earth for a snappy arcade feel — tuning constant in `sceneConstants.ts`).
- **Materials/contacts:** one `ballMaterial`, `blockMaterial`, `platformMaterial`, `groundMaterial`.
  Contact pairs: block↔platform friction **0.6** (high, so rotating platforms carry their blocks),
  restitution 0.1; ball↔block friction 0.3, restitution 0.25; block↔block friction 0.4; anything↔ground
  friction 0.5.
- **Ground:** static plane at `y = 0` (grass).
- **Platforms:** each platform is a `KINEMATIC` body — a cylinder (round) or box (square) top slab whose
  top surface sits at `topY`, plus a purely visual pedestal column (no physics needed below the slab).
  Rotation modes:
  - `continuous`: set `angularVelocity.y = speed` each step.
  - `oscillate`: `angle(t) = maxAngle * sin(t * speed / maxAngle)`; set angular velocity to the derivative
    each step (do not teleport the quaternion — velocity-driven so friction carries the blocks).
  - Blocks on **rotating** platforms must have sleeping disabled (`allowSleep = false`); on static
    platforms blocks may sleep.
- **Blocks:** dynamic `Box` / `Cylinder` bodies, mass per catalog below, spawned from the level definition
  (positions local to the platform: X/Z from platform center, Y measured from the platform top surface to
  the block's **base**). Spawn with the platform's initial rotation applied.
- **Balls:** dynamic spheres, radius 0.35, mass 8. Pooled. A ball is removed when `y < -5`, when it
  sleeps, or 6 s after firing, whichever comes first.
- **Cleared detection:** block cleared when `body.position.y < platform.topY - CLEAR_DROP` (CLEAR_DROP = 1.2)
  or when it falls off the world (`y < -5`). Cleared is latched (a set of block ids). Cleared blocks stay
  in the world briefly (they visibly tumble onto the grass), then fade/despawn after ~2.5 s.
- **Settle detection (for lose):** after the last ball is removed, the level is "settled" when every
  remaining block's `velocity.length() < 0.08` and `angularVelocity.length() < 0.1` for 45 consecutive
  frames, or after a 6 s timeout. Only then does the lose overlay show — a lucky late topple still counts.
- **Units:** 1 unit ≈ 1 m. Platform top at `topY ≈ 2.0`, cannon muzzle at `z ≈ 7`, platforms near `z ≈ 0`.

## Block catalog

All colors are flat/toon-style materials (`MeshLambertMaterial` or similar); stripes/accents are cheap
canvas textures generated at runtime (see `marble-sort/scene/builders` for the pattern). Sizes are
`[width, height, depth]` in world units.

| type        | shape    | size            | mass | look                                   | role |
|-------------|----------|-----------------|------|----------------------------------------|------|
| `crate`     | box      | 1.0 × 1.0 × 1.0 | 1.0  | warm orange, darker edge frame         | basic unit |
| `smallCube` | box      | 0.6 × 0.6 × 0.6 | 0.4  | sunny yellow                           | precision targets, spire tips |
| `beam`      | box      | 3.0 × 0.75 × 0.75 | 2.0 | silver with red zig-zag band (screenshot look) | lintels, roofs |
| `plank`     | box      | 2.5 × 0.3 × 1.0 | 1.2  | red with white trim                    | floors, dominoes (stood on end) |
| `barrel`    | cylinder | r 0.5 × h 1.0   | 1.5  | silver with red circle badge           | rolls when knocked |
| `stone`     | box      | 1.2 × 1.2 × 1.2 | 6.0  | cool gray, chiseled face               | heavy — soaks hits, shields |

Weight is legible through color: warm/light colors = light blocks, gray = heavy. This is the wordless
signal taught in level 6.

## Scene & camera

- Portrait 3D scene matching the screenshots' vibe with procedural low-poly art (no asset files): blue-sky
  gradient, distant tree line, rolling grass field with scattered flower dots, bunting flags on posts, a
  striped big-top tent and a simple ferris-wheel silhouette in the background (static decoration meshes,
  built once in `scene/builders/environment.ts`).
- Camera: perspective, positioned behind/above the cannon (`~[0, 4.5, 10.5]`, looking at `[0, 2, 0]`),
  FOV tuned for a 3:4 portrait viewport. Fixed per level (no orbit); a gentle 0.5 s ease-in dolly when a
  level starts.
- Cannon: stylized circus cannon (cylinder barrel + sphere body, red with yellow stars) at the bottom
  center on a small round base; barrel visually tracks the aim point; muzzle-flash puff + recoil on fire.
- Effects: hit puff particles on ball→block impact, confetti burst on win (reuse the approach from
  `marble-sort/scene/animation/confetti.ts`), soft drop shadows via a single directional light with
  shadow map (low resolution, only over the platform area).

## HUD & screens (wordless)

- **Level select (entry screen):** 5×5 grid of tiles. Unlocked tiles show the level number and 0–3 star
  icons; the next unplayed tile pulses; locked tiles show a padlock icon. A small cannon logo up top. No
  instruction text.
- **In-level HUD:** top-right chip with a cannonball icon and the remaining count (mirrors the "Balls 16"
  chip in the screenshots); top-left small chip with the level number; bottom-left icon buttons: retry
  (circular arrow) and level-select (grid icon). All buttons ≥ 44 px hit targets.
- **Win overlay:** dimmed backdrop, 1–3 large stars animate in, then buttons: replay (arrow-loop), next
  (arrow-right, pulsing). Confetti behind.
- **Lose overlay:** dimmed backdrop, gray broken-star, replay button pulsing, level-select button.
- **Tutorial hints (levels with `hint`):** a pulsing white ring + animated pointer-finger icon overlaid at
  the projected screen position of a designated target block, plus a ghost trajectory dot-arc from the
  cannon to that point. The hint disappears permanently after the first shot of the level. No words.

## Stars & progress

- Win = 1★ minimum. `starThresholds: { twoStar, threeStar }` are **minimum balls remaining** at the moment
  of victory for 2★/3★.
- Persistence key `bwh.block-blaster.progress.v1`:
  ```ts
  interface SavedProgress {
    version: 1
    unlockedLevel: number            // highest playable level id (starts at 1)
    stars: Record<number, number>    // levelId -> best stars earned (0–3)
  }
  ```
  Load defensively via `_shared/progressParsers` (corrupt/missing → fresh default). Winning level N sets
  `unlockedLevel = max(unlockedLevel, N+1)` (capped at 25) and `stars[N] = max(old, earned)`.
- No mid-level snapshot persistence (levels are < 2 minutes); leaving mid-level abandons the attempt.

## Level definition schema

Levels are data, not code. All 25 live in `levels/levels.ts` as `LEVELS: readonly LevelDef[]`.

```ts
type BlockType = 'crate' | 'smallCube' | 'beam' | 'plank' | 'barrel' | 'stone'

interface BlockPlacement {
  type: BlockType
  /** X/Z from platform center; Y = height of the block's BASE above the platform top surface. */
  position: [number, number, number]
  rotationYDeg?: number          // yaw around the block's center
  layOnSide?: boolean            // barrels/planks: rotate 90° about Z so they lie horizontally
}

interface PlatformRotation {
  mode: 'continuous' | 'oscillate'
  speedDegPerSec: number         // continuous: signed angular speed; oscillate: peak angular speed
  maxAngleDeg?: number           // oscillate only: amplitude, e.g. 90
}

interface PlatformDef {
  shape: 'round' | 'square'
  radius: number                 // round: cylinder radius; square: half-width
  topY: number                   // height of the top surface (typically 2.0)
  center: [number, number]       // world X/Z of the platform axis
  rotation?: PlatformRotation
  blocks: BlockPlacement[]
}

interface LevelDef {
  id: number                     // 1..25, contiguous
  balls: number
  starThresholds: { twoStar: number, threeStar: number }   // 0 <= two < three < balls
  platforms: PlatformDef[]       // 1 or 2
  hint?: { platform: number, block: number }               // indices of the tutorial target block
}
```

Placement rules (enforced by tests): every block's footprint must lie within its platform's footprint —
deliberate cantilevers are allowed up to a single global tolerance `MAX_OVERHANG = 0.35` (a test
constant, not a schema field, to keep the schema minimal); blocks must not interpenetrate each other or the platform at spawn beyond a
0.02 tolerance; stacked blocks must rest on a surface (platform top or a block below) within a 0.05 gap.

## The 25 levels

Budgets/thresholds are the design contract; exact coordinates are the level author's job and must satisfy
the placement rules and the stability/physics tests. `2★/3★` = min balls remaining.

**Phase 1 — wordless tutorial (1–6).** Static platforms, generous budgets, hints on 1–4.

| # | name (internal) | platform | blocks | balls | 2★/3★ | teaches |
|---|---|---|---|---|---|---|
| 1 | First Shot | round r2.2 | 1 crate, centered | 5 | 2/4 | tap = fire; hint ring on the crate |
| 2 | Double Trouble | round r2.4 | 2 crates, 1.6 apart | 5 | 1/3 | one ball per target; hint on first crate |
| 3 | Three Stack | round r2.2 | 3 crates stacked in a column | 3 | 1/2 | hitting low topples the whole stack; hint at bottom crate |
| 4 | The Tower | round r2.2 | tower of 5 crates | 4 | 1/2 | aim at the base; hint at base |
| 5 | Tabletop | square r2.4 | 2 crate pillars (2 high) + 1 plank bridging them | 4 | 1/2 | structures collapse; no hint |
| 6 | Heavyweight | round r2.4 | 1 stone centered + 2 crates beside it | 5 | 1/3 | gray = heavy, needs solid direct hits |

**Phase 2 — mechanics (7–12).** Rotation, rolling, walls, multiple platforms.

| # | name | platform | blocks | balls | 2★/3★ | teaches |
|---|---|---|---|---|---|---|
| 7 | Carousel | round r2.4, continuous 15°/s | 2×2 crate square | 5 | 1/3 | platform rotates; timing |
| 8 | Barrel Pyramid | square r2.4 | 6 barrels in a 3-2-1 pyramid (lying on sides, axes aligned) | 4 | 1/2 | barrels roll |
| 9 | The Wall | square r2.6 | 3×3 crate wall (one crate thick, facing player) | 5 | 1/2 | punch through the middle |
| 10 | Hidden Treasure | round r2.4, continuous 20°/s | 2 stones side by side front, 3 smallCubes hidden behind | 5 | 1/2 | wait for rotation to expose the light stuff |
| 11 | Twin Pedestals | 2 round r1.8 at x=±2.4 | 3-crate stack on each | 6 | 2/4 | two platforms; both must be cleared |
| 12 | The Spire | round r1.6 | crate + crate + smallCube + smallCube column | 3 | 1/2 | small platform, easy knock-offs, economy |

**Phase 3 — challenge (13–19).** Combinations, tighter budgets.

| # | name | platform | blocks | balls | 2★/3★ | notes |
|---|---|---|---|---|---|---|
| 13 | Cantilever | square r2.4 | stone counterweight + plank overhanging the edge + 2 smallCubes on the overhang | 4 | 1/2 | hit the counterweight, the rest slides off |
| 14 | Domino Run | square r2.8 | 5 planks stood on end in a front-to-back line (0.9 apart, thin faces toward the cannon) so the chain follows the shot | 3 | 1/2 | one low shot chains them all |
| 15 | Fortress | round r2.6, continuous 18°/s | 8-crate perimeter wall + 1 stone in the middle | 6 | 1/3 | breach then bully the stone |
| 16 | Barrel Bridge | square r2.6 | 2 barrel pillars (upright) + beam across + 3 smallCubes on the beam | 5 | 1/3 | multi-story |
| 17 | Fast Spin | round r2.4, continuous 40°/s | 2×2 crates + beam laid across the top | 5 | 1/3 | fast rotation; lead your shots |
| 18 | Stonehenge | square r2.8 | 3 stone pillar pairs, each pair bridged by a beam | 6 | 1/2 | heavy everything; use beams as levers |
| 19 | Pendulum | round r2.4, oscillate 35°/s ±90° | stone shield front / 4 smallCubes behind | 5 | 1/3 | oscillation never fully exposes — thread the swing |

**Phase 4 — mastery (20–25).**

| # | name | platform | blocks | balls | 2★/3★ | notes |
|---|---|---|---|---|---|---|
| 20 | Triple Decker | square r2.6 | 3 stories: 4 crates / plank floor / 2 crates + barrel / plank floor / smallCube | 5 | 1/3 | demolition order matters |
| 21 | Counter-Spin | 2 round r1.8 at x=±2.4, continuous +25°/s and −25°/s | mixed stack on each (crates+barrel; crates+stone) | 7 | 2/4 | two rotating targets |
| 22 | The Keep | round r2.8, continuous 20°/s | crate perimeter + inner spire (stone base, crate, smallCube) | 6 | 1/3 | fortress + spire combo |
| 23 | Minimalist | round r1.4 | 4 smallCubes in a 2×2 on a tiny platform | 4 | 1/2 | precision; splash a pair per ball |
| 24 | Avalanche | square r3.0 | 24-block mixed mountain (crates, barrels, planks, 2 stones) | 12 | 2/4 | spectacle; pick load-bearing shots |
| 25 | Grand Finale | round r3.0, oscillate 30°/s ±120° | castle: 4 stone corner base, crate walls, beam roof ring, center spire with smallCube crown | 12 | 2/4 | everything at once |

Authoring guidance: keep total block count ≤ 26 and live balls ≤ budget, so worst-case body count stays
under ~40 dynamic bodies. Compose "artful" stacks — symmetry, color alternation, silhouettes — not random
piles (level 24 is a *designed* mountain).

## Architecture / file layout

```
resources/js/games/block-blaster/
  index.tsx                    # vite entry: createRoot(#block-blaster-root)
  BlockBlasterGame.tsx         # top-level state machine: select / playing / won / lost; owns progress
  BlockBlasterScene.tsx        # canvas component; owns three renderer + engine loop; props = SceneProps (gameTypes)
  GameHud.tsx                  # ball chip, level chip, icon buttons
  LevelSelect.tsx              # 5×5 grid screen
  LevelCompleteOverlay.tsx     # win overlay (stars) — mirror marble-sort naming
  GameOverOverlay.tsx          # lose overlay
  TutorialHint.tsx             # pulsing ring/finger + ghost arc (screen-space, driven by scene projection cb)
  gameTypes.ts                 # shared types: GameStatus, SceneProps, ShotResult, star helpers, constants
  gameProgress.ts              # SavedProgress parser plus profile/per-level row codec
  levels/
    levelTypes.ts              # LevelDef schema above + BLOCK_CATALOG (sizes/masses/colors)
    levels.ts                  # LEVELS: 25 defs
    levelValidation.ts         # pure functions used by tests (footprint, overlap, support checks)
  scene/
    sceneConstants.ts          # palette, physics constants, camera constants
    threeUtils.ts              # disposal helpers (copy pattern from marble-sort)
    cameraRig.ts
    aiming.ts                  # pointer->aim-plane raycast + ballistic elevation solve (pure, unit-tested)
    builders/
      environment.ts           # sky, grass, tents, ferris wheel, bunting
      platformMesh.ts
      blockMesh.ts             # per-type mesh + canvas stripe textures
      cannonMesh.ts
      ballMesh.ts
    physics/
      world.ts                 # createWorld(), materials/contacts
      levelWorld.ts            # buildLevelWorld(level) -> bodies keyed by block id (used by game AND tests)
      simulation.ts            # step loop helpers: cleared detection, settle detection (pure where possible)
    effects/
      confetti.ts
      hitPuff.ts
  __tests__/                   # see acceptance criteria
```

Laravel side: route `Route::get('/games/block-blaster', fn () => view('games.block-blaster'))->name('games.block-blaster');`
(public, below the auth group, next to the other games), Blade view per house pattern, feature test
`tests/Feature/BlockBlasterGamePageTest.php` (mirror `MarbleSortGamePageTest.php`).

## Testing & acceptance criteria

**A. Gates (all must pass):** `pnpm run type-check`, `pnpm run lint`, `pnpm run test` (full, game included),
`pnpm run build`, `vendor/bin/pint --test`, `vendor/bin/phpstan analyse --memory-limit=1G`, and
`php artisan test --compact tests/Feature/BlockBlasterGamePageTest.php`.

**B. Level data (node tests, `levels.test.ts`):**
1. Exactly 25 levels, ids 1–25 contiguous; `0 ≤ twoStar < threeStar < balls`.
2. Every block footprint inside its platform (overhang ≤ `MAX_OVERHANG = 0.35`).
3. No spawn interpenetration (block↔block, block↔platform) beyond 0.02.
4. Every block supported: base within 0.05 of the platform top or of a block surface beneath it.
5. Difficulty-curve sanity: levels 1–6 static; a rotating platform first appears at 7; two-platform levels
   have ≥ 6 balls.

**C. Physics stability (node test, `levelStability.test.ts`):** for each of the 25 levels, build the real
cannon-es world via `buildLevelWorld`, step 8 simulated seconds at 1/60 **with rotation active** where
defined, fire nothing, and assert zero blocks cleared and every block's displacement from spawn < 0.5
units (blocks may micro-settle but must not slide off or collapse). This is the "artfully stacked ≠
falls over on its own" guarantee. Keep this file in the default suite (not `.slow.test.ts`) — 25 × 480
steps of ≤ 40 bodies runs in well under a second per level with SWC/node.

**C2. Playability probe (node test, `playability.probe.test.ts`):** a deterministic greedy bot (target
the nearest uncleared block, lead rotating platforms by time-of-flight, raise the aim to lob over the
platform's near rim) must clear a representative set of levels within their ball budgets — a skill FLOOR
for a competent player. Budgets/thresholds in the table above were tuned against this bot; the level-14
domino chain must clear in a single shot.

**D. Engine unit tests:** ballistic solve hits the aim point within tolerance at several ranges; cleared
latch (block below threshold stays cleared even if bodies later intersect); settle detection (lose fires
only after quiescence); star computation boundaries; oscillate rotation angle function is
velocity-continuous.

**E. Progress tests (`gameProgress.dom.test.ts`):** round-trip save/load; corrupt JSON → defaults; win
monotonically raises stars and never lowers; `unlockedLevel` caps at 25.

**F. Component tests (jsdom):** `BlockBlasterGame.test.tsx` with the scene mocked — level select renders
25 tiles with correct lock state; entering a level shows the HUD with the level's ball count; win overlay
shows correct star count and advances unlock; retry restores ball count. `TutorialHint` disappears after
first shot.

**G. Wordless-tutorial acceptance (manual):** a new player who cannot read must be able to clear levels
1–4 guided only by the hint ring/finger and layout. Levels 1–4 define `hint`; no level contains
instructional text; the only strings on screen are numerals.

**H. Playability (manual, dev):** every level completable within its ball budget by a competent player;
3★ achievable on every level (the author must 3★ each level once in dev mode). Dev jump:
`/games/block-blaster?level=N` loads level N directly (allowed in production — it's a toy, not a secret;
progress unlock still only advances by winning).

**I. Performance:** 60 fps on a mid-tier phone profile: ≤ 40 dynamic bodies, ball pooling, no per-frame
allocations in the step loop, shadow map ≤ 1024², total added JS (gzipped) for the entry reasonable
(three is chunk-split by existing vite config).

## CI wiring (exact edits)

1. `package.json`: add `"test:ci:block-blaster": "jest --passWithNoTests --maxWorkers=2 resources/js/games/block-blaster"`.
2. `jest.config.cjs`: add `'/resources/js/games/block-blaster/'` to `gameTestPathIgnorePatterns`.
3. `.github/workflows/ci.yml`:
   - `changes` filter `block_blaster:` matching `resources/js/games/block-blaster/**`,
     `resources/js/games/_shared/**`, `resources/js/games/PortraitGameShell.tsx`,
     `resources/views/games/block-blaster.blade.php`, `tests/Feature/BlockBlasterGamePageTest.php`,
     `package.json` (mirror the `marble_sort` filter), plus the job output line.
   - `block-blaster-tests` job cloned from `marble-sort-tests`.
   - Add the job to the final gate's `needs`/result checks (mirror `marble_sort_tests`).
4. `vite.config.ts`: add `'resources/js/games/block-blaster/index.tsx'` to the `laravel({ input })` list.

## Out of scope / follow-ups (do not build now)

- Sound effects (cars has an `audio/` pattern to copy later).
- Playwright E2E + visual harness (`docs/games/parking-pickup-visual-harness.md` pattern) — follow-up PR.
- Power-ups (multi-ball, bomb ball), coins/economy, level editor.

## Implementation to-do list (handoff checklist)

Scaffold (sole-writer, first):
- [ ] Branch + this spec committed; draft PR opened.
- [ ] `levels/levelTypes.ts` (schema + `BLOCK_CATALOG`), `gameTypes.ts` (SceneProps contract, constants,
      star helper), stub `BlockBlasterScene.tsx`, `index.tsx`, Blade view, route, vite entry,
      `package.json` script, jest exclusion, ci.yml edits. Tree type-checks.

Workstream A — engine + scene (owns `scene/**`, `BlockBlasterScene.tsx`, engine tests):
- [ ] `physics/world.ts`, `physics/levelWorld.ts`, `physics/simulation.ts` (cleared latch, settle, rotation drivers).
- [ ] `aiming.ts` ballistic solve + reticle projection; cannon fire w/ cooldown + pooled balls.
- [ ] Builders: environment, platform, blocks (canvas stripe textures), cannon, ball; camera rig; effects.
- [ ] `BlockBlasterScene.tsx` implementing `SceneProps` exactly; rAF loop; disposal on unmount.
- [ ] Tests: D (engine units) + any builder smoke tests.

Workstream B — levels (owns `levels/levels.ts`, `levels/levelValidation.ts`, level tests):
- [ ] 25 `LevelDef`s per the table, artful arrangements.
- [ ] `levelValidation.ts` pure checks + `levels.test.ts` (criteria B).
- [ ] `levelStability.test.ts` (criteria C) against `physics/levelWorld.ts`.
- [ ] Hand-tune placements until stability passes for all 25.

Workstream C — UI shell (owns `BlockBlasterGame.tsx`, HUD/overlays/select/hint, `gameProgress.ts`, PHP test):
- [ ] `gameProgress.ts` + tests (criteria E).
- [ ] `LevelSelect`, `GameHud`, overlays, `TutorialHint`, `BlockBlasterGame` state machine wired to
      `SceneProps`; `?level=N` dev jump.
- [ ] Component tests (criteria F); `tests/Feature/BlockBlasterGamePageTest.php`.

Integration (sole-writer, last):
- [ ] Wire A+B+C, run all gates (criteria A), fix-forward.
- [ ] Manual playthrough pass (criteria G/H) + browser screenshot sanity.
- [ ] PR ready-for-review; address codex findings as follow-up commits.
