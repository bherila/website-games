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

## Art

`docs/games/tower-defense-concept.webp` is the target look: warm, chunky, toy-like low poly. New models
and themes should match it. Everything on the board is drawn in code, not from image files:

- `scene/models.ts`: towers, walls and enemies. A tower's body is lit; its flame, crystal or orb is a
  separate unlit `towerGlowGeometry`, so it stays bright in every theme and can animate.
- `scene/groundPaint.ts`: paints each level's ground and shores once into one canvas texture. Detail
  has to be bold and have no "up", because wide screens turn the board on its side.
- `scene/water.ts`: animated water and lava in one shader. Its mask matches the holes cut in the land.
- `scene/terrainView.ts`: scenery placement, the keep, portals and the dirt path that follows the route.
- `scene/themes.ts`: every colour for the five themes.

`ui/icons/*.webp` are generated images (192 px, transparent), shown through `ui/GameIcon.tsx`. They came
from an image model working from the concept sheet, in one consistent style: chunky low-poly 3D,
three-quarter view, one bold centred subject filling about 80% of the frame, soft top light, readable at
48 pixels. Add a new tower's icon the same way, and check it at 48 pixels.

## Testing

- `__tests__/gameEngine.test.ts`: every rule above, headlessly.
- `__tests__/levels.test.ts`: map validity, the difficulty curve and balance. `__tests__/pilot.ts`
  is a scripted player that drives only the public commands. By default it never mazes or matches
  elements, so "it can win every level" leaves a real player headroom, and "doing nothing loses by
  wave 5" shows the threat is real. Changing `catalog.ts` or the wave curve should re-run these.
- `__tests__/TowerDefenseGame.test.tsx`: pointer handling, panels, overlays and saved progress.
- `tests/e2e/tower-defense.spec.ts`: real browser journeys at desktop, phone and iPad sizes.

## Flyers against walkers

Walkers test total damage, because a longer maze gives every tower more time to shoot. Flyers test
coverage of the straight line to the keep, because walls do nothing to them. The pilot's `style`
option measures both, and each run returns `leaks`, `routeLength` and `flightCoverage`:

- `plain` builds no maze and covers the route and the flight line.
- `maze-ignoring-flyers` builds wall barriers and aims every tower at the walkers.
- `maze-covering-flyers` builds the same barriers and gives every third tower to the flight line.

Lives lost to flyers per run, averaged over seeds 1-5 at current balance:

| Level | `plain` | `maze-ignoring-flyers` | `maze-covering-flyers` |
|---|---|---|---|
| 1 Meadow Pass | 0 | 0 | 0 |
| 2 Twin Creeks | 0 | 0.6 | 0 |
| 3 Stone Garden | 0 | 0 (4 of 5 runs lost by wave 7) | 0 |
| 4 Two Gates | 0 | 3 | 1 |
| 5 Frozen Switchback | 0 | 6.2 | 3.6 (2 of 5 runs lost at wave 10) |
| 6 Glacier Lake | 0 | 0 | 0 |
| 7 Cinder Crossing | 0 | 6.2 | 3.2 |
| 8 The Last Keep | 0 | 0.8 (1 of 5 runs lost at wave 18) | 0 (3 of 5 runs lost at wave 18) |

A run lost early misses its level's later flyer waves (7, 12 and 17), so Stone Garden and Frozen
Switchback undercount. Trust the flyer columns more than the mazing styles' total lives: these pilots lay out barriers by route length
alone, so they often move walkers away from their own towers, and they do worse than `plain` on
some levels. That says more about their skill than about mazing.

Tuning target, not yet met or enforced: covering the line leaks almost nothing, and ignoring it
costs a good share of lives without ending the run. Flyer count sets the most a player can lose,
flyer health sets how much coverage they need, and speed barely matters. `hpScale` and `countScale`
apply to every enemy, so tuning flyers per level needs a new field.
