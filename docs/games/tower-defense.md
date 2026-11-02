# Tower Defense

A mazing tower defense at `/tower-defense`. Waves of enemies walk across open terrain toward
the keep. The player's hero runs around the field building towers and walls, and collects the
gold coins defeated enemies drop. Eight levels, each with its own map and 8 to 20 waves.

## Implementation

- `gameEngine.ts`: the headless simulation and every player command. `tickGame` is a fixed
  step and a whole game replays from its seed. It imports nothing from Three or React.
- `pathfinding.ts`: Dijkstra flow fields and the step rule walkers use to descend them.
- `catalog.ts`: elements, towers, enemies and hero upgrades. All the balance numbers but the
  wave curve live here.
- `levels.ts`: the eight maps as ASCII, and `buildWaves`, the one rule all waves come from.
- `TowerDefenseScene.tsx` + `scene/`: rendering only. An orthographic camera (`boardCamera.ts`)
  fits the board and turns a quarter turn on a wide screen, so one map fills a phone in portrait
  and an iPad in landscape. Pointer rays hit a level above the ground first, because tall
  towers stand in front of the cells behind them.
- `TowerDefenseGame.tsx` + `ui/`: level select, HUD, tray, panels and overlays. What the pointer
  means depends on the armed tool, and that decision lives here, not in the scene.

## Rules

- **Maze or break.** Walkers follow `openField`, which treats buildings as solid. Where it gives
  no way through they follow `breachField`, where a building costs `1 + hp/30` to enter, and
  attack whatever is next. So sealing the route is allowed: enemies go for the weakest point,
  and the route reopens when something falls. Sappers always use `breachField`, so a very long
  maze cannot hold them, and flyers ignore the ground entirely. Route arrows on the board show
  the current path (red when breaking through) and a cyan line shows the next flyers' path.
- **The hero is the bottleneck.** Gold is paid when an order is given, but nothing is built until
  the hero reaches it. A tap on the ground sends the hero there first; queued jobs wait. The
  hero climbs over buildings at a high cost, so it can never be walled in, and cannot be hurt.
  An idle hero sweeps up coins within 3.2 cells and repairs adjacent buildings.
- **Coins must be collected.** Each kill drops up to five coins, which fade after 32 s (blinking
  for the last 7). A flyer's coins land on the nearest walkable cell, so none are unreachable.
  Clearing a wave also pays a small bonus, so missing coins does not end a run.
- **Elements.** Fire beats nature beats earth beats light beats dark beats water beats fire, at
  1.6× damage (0.6× the other way). Each wave from the third has an element. Every few waves
  the player picks a new element, which unlocks its tower; the simulation stops until they do.
- **Upgrades.** Three tiers: double, then quadruple damage, with more range and health. Upgrading
  costs about what another tower would, so it trades no dps for keeping the maze intact. Selling
  returns 70%, or everything if the hero had not finished building it.
- **Winning.** Starting from 20 lives, stars come from lives left: 18+ is three, 10+ is two.

## Controls

Tap a tray card, then tap the ground. Towers land on release, after a ghost shows the spot and
range. Walls paint as you drag, and the card stays armed until tapped again. With nothing armed,
tap the ground to send the hero (holding keeps it chasing the finger), a building to upgrade or
sell it, or a queued ghost to cancel and refund it. Keys: arrows or WASD steer, 1-8 pick a
card, N sends the next wave, Space pauses, Escape clears the selection. A hidden tab pauses.

## Progress

`_shared/levelStarsProgress.ts`, in `bwh.tower-defense.progress.v1`. `GameSlug::TowerDefense`
allows levels 1-8 and profile `default`. A run in progress is not saved; reloading returns to
level select, as in Math Horde.

## Testing

- `__tests__/gameEngine.test.ts`: every rule above, headlessly.
- `__tests__/levels.test.ts`: map validity, the difficulty curve and balance. `__tests__/pilot.ts`
  is a plain player that drives only the public commands. It never mazes or matches elements, so
  "it can win every level" leaves a real player headroom, and "doing nothing loses by wave 5"
  shows the threat is real. Changing `catalog.ts` or the wave curve should re-run these.
- `__tests__/TowerDefenseGame.test.tsx`: pointer handling, panels, overlays and saved progress.
- `tests/e2e/tower-defense.spec.ts`: real browser journeys at desktop, phone and iPad sizes.
