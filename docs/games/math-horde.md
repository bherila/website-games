# Math Horde

Math Horde is an auto-firing squad runner at `/math-horde`. Steer through arithmetic
gates to grow the squad, shoot gates to improve their values, and defeat the hordes
before they collide with the player. The campaign contains 12 deterministic levels.

## Implementation

- `resources/js/games/math-horde/index.tsx` mounts the persisted React game.
- `MathHordeGame.tsx` owns level selection, the tutorial, pause, and result overlays.
- `MathHordeScene.tsx` owns Three.js rendering and the fixed-step engine loop.
- `gameEngine.ts` contains the headless simulation; `levels.ts` generates the campaign
  from seeded data and checks it with the greedy pilot in `pilot.ts`.
- `gameProgress.ts` encodes account profile/per-level rows through the shared persistence
  adapter. Anonymous progress uses `bwh.math-horde.progress.v1`.

## Controls

Drag or swipe across the canvas to steer. Left/right arrows and A/D move the target
position; holding a steering key continues moving it. Horizontal wheel input also
steers. Firing is automatic while playing.

Space and Escape toggle pause once per press; repeated keydown events from holding
either key do not toggle again. Game shortcuts leave already-handled events,
focused buttons, links, form controls, and editable content alone. In particular,
Space on Mute, Pause, or Resume keeps the button's native keyboard activation.
Steering does not change the target while paused or while the tutorial is open.

## Progress and preferences

A win records the best stars, score, and survivor count independently and unlocks
the next level. Two- and three-star thresholds come from each level's surviving-army
thresholds. Active runs are not saved; reloading returns to level selection.

The introductory tutorial appears until dismissed, tracked by the local
`bwh.math-horde.tutorial.v1` preference. Sound mute is device-local in
`bwh.math-horde.muted.v1`. Audio uses synthesized Web Audio effects unlocked by a
player gesture.

## Verification

The co-located Jest suites cover engine rules, generated levels, persistence, and
the React shell. Keyboard regressions cover pause autorepeat, focused controls,
normal pause/resume, and steering while playing versus paused. Browser journeys
live in `tests/e2e/math-horde.spec.ts`; run them with
`pnpm run test:e2e:math-horde` against a local Laravel server with built assets.
The desktop and 375px touch projects also run in the shared gameplay CI shards.
Functional browser journeys use a 1280 by 720 desktop viewport, a 375 by 812 touch
viewport, and device scale factor 1 to bound software WebGL cost.
