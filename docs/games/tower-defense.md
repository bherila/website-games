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

## Picking this up later

### Status

Shipped in #235. Everything above is implemented and tested, but **nobody had played a full
level by hand when it merged**, so the balance below comes only from the scripted pilot. The
first job of any iteration is to ask how it felt on a real device. The iPad layout has only run
in Chromium at iPad size, not on an iPad.

### Where to change what

| To change | Look in |
| --- | --- |
| Tower or enemy numbers, costs, hero speed, sell refund | `catalog.ts` |
| Coin lifetime, wave timers, build reach, repair, sweep radius | constants at the top of `gameEngine.ts` |
| Wave size, health curve, coin curve, which enemies come when | `buildWaves` and the patterns in `levels.ts` |
| A map, its starting gold, its difficulty, its element picks | `LEVELS` in `levels.ts` |
| Models and colours | `scene/models.ts`, `scene/themes.ts` |
| What a tap or drag means | `handlePointer` in `TowerDefenseGame.tsx` |
| Camera angle and fit | `scene/boardCamera.ts` (the e2e helper `cellPoint` reuses it) |
| HUD, tray, panels, overlays | `ui/` |

### Recipes

- **A new tower:** add its id to `TowerId` (`gameTypes.ts`), then an entry in `TOWERS` and
  `TOWER_IDS` (`catalog.ts`), a `towerParts` case (`scene/models.ts`), `TOWER_SHOT_COLOR`
  (`scene/themes.ts`), and `FIRE_SOUND` plus a recipe (`audio/sfx.ts`). The tray lists wall, arrow
  and one tower per unlocked element, so a tower outside that pattern also needs `BuildTray.tsx`
  and the digit-key list in `TowerDefenseGame.tsx`.
- **A new enemy:** `EnemyKind`, `ENEMIES`, `ENEMY_CAPACITY` (`scene/unitView.ts`), `enemyGeometry`
  (`scene/models.ts`), and a wave pattern in `levels.ts`. A test requires every kind to appear in
  the longest level.
- **A new special behaviour:** a field on `TowerDef` or `EnemyDef`, applied in `applyShot` or
  `tickEnemies`, with a rule test in `gameEngine.test.ts`.
- **A new level:** add it to `LEVELS`, 13 x 21 with one `E` and at least one `S`. Then raise
  `GameSlug::TowerDefense` in `app/Enums/Games/GameSlug.php` and the pinned level counts in
  `levels.test.ts` and `tests/Feature/GameDataApiTest.php`.
- **Rebuilding the campaign:** set `campaignRevision` in `gameProgress.ts` so old stars stop
  applying. See "Progress" in `marble-works.md`.

### Balance

The pilot's lives left out of 20, measured on the merged tuning. "Seeds 1-5" are other random
seeds; the tests only pin the default seed, because a seed changes where coins land and so the
order of the pilot's purchases.

| # | Map | Theme | Waves | Gold | Health | Count | Picks after wave | Pilot | Seeds 1-5 | Minutes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Meadow Pass | meadow | 8 | 100 | 0.8 | 0.85 | 3, 6 | 20 | 20, 20, 20, 20, 20 | 3 |
| 2 | Twin Creeks | meadow | 10 | 110 | 0.95 | 0.9 | 0, 4, 8 | 20 | 20, 20, 20, 20, 20 | 5 |
| 3 | Stone Garden | dunes | 12 | 120 | 1 | 0.95 | 0, 4, 8 | 19 | 18, 19, 19, 19, 19 | 6 |
| 4 | Two Gates | dunes | 14 | 140 | 0.8 | 0.85 | 0, 4, 8, 12 | 10 | 10, 10, 8, 10, 10 | 8 |
| 5 | Frozen Switchback | tundra | 15 | 150 | 0.95 | 1 | 0, 4, 8, 12 | 15 | 20, 15, 20, 20, 15 | 9 |
| 6 | Glacier Lake | tundra | 16 | 160 | 0.85 | 0.85 | 0, 4, 8, 12 | 3 | 5, 5, 1, 5, 5 | 8 |
| 7 | Cinder Crossing | ember | 18 | 170 | 0.9 | 0.9 | 0, 4, 8, 12, 16 | 8 | 10, 8, 13, 13, 10 | 10 |
| 8 | The Last Keep | dusk | 20 | 190 | 1.05 | 1 | 0, 4, 8, 12, 16 | 11 | 11, 13, 11, 11, 13 | 11 |

How to read it:

- The pilot never mazes or matches elements, so its result is a floor, not the difficulty a
  person will feel. Levels 1 to 3 are probably too easy for anyone who mazes.
- Levels are not in strict order for the pilot. Glacier Lake is the hardest for it because its two
  routes around the lake are nearly equal, so a tower can flip the route away from the others.
  A person can see that on the route arrows; check by hand before easing it further.
- Results are chaotic: a small number change can swing a level by many lives. Compare across
  seeds with `runPilot(level, { seed })` before trusting one run. `runPilot` also takes
  `maxTowers`, `coinEffort`, `thinkSeconds`, `elements` and `callWavesEarly`.
- If a tuning change fails the "can be won" test, first check whether the pilot or the level is
  at fault. Every early failure of this kind was the pilot's: chasing coins starved its build
  queue, and it ignored the flyers' straight line.

### Traps already hit

- **Flow fields must be `Float64Array`.** With 32-bit floats, Dijkstra's stale-entry check throws
  away valid nodes through rounding, and maps look disconnected. Enemies just stand at the spawn.
- **`bestStep` must score `field + entry cost`.** Taking only the lowest field value makes walkers
  smash a wall one step from the exit even when walking around is cheaper.
- **`tickGame` does nothing while `pendingPicks > 0`.** A headless test that does not choose an
  element, or repeats one already chosen, hangs until its time limit.
- **Enemy health needs a floor of 1.** At 0 an enemy can never be killed and the level never ends.
- **`GamePwaTest` pins the number of app shortcuts,** so filtering local PHPUnit to
  `GamePwaRoutes` misses it. Run `--filter=GamePwa`.
- **Tray icons are emoji, which are blank in headless Chromium here** because it has no emoji font.
  Screenshots from this machine do not show them, so check icons on a real device.

### Running it

```bash
pnpm exec jest resources/js/games/tower-defense     # rules, balance, UI; about 15 s
pnpm run build                                      # e2e and page tests need real assets
SESSION_DRIVER=file CACHE_STORE=file php -d memory_limit=1G artisan serve --port=8123 &
PLAYWRIGHT_BASE_URL=http://127.0.0.1:8123 pnpm run test:e2e:tower-defense
```

The port is whatever is free; 8000 was taken by another project on the dev machine. File sessions
avoid needing a migrated local database. `tests/e2e/gameplay-durations.json` has no entries for
this game yet, so its tests run at an estimate until durations are refreshed (see `AGENTS.md`).

### Not built yet

Roughly in the order they seem worth doing. None of these are decided.

1. **Saving a run.** Long levels take over ten minutes, and a reload or an iPad evicting the tab
   loses the run. It needs a `save` slot in `GameSlug::supports` and a snapshot of the state. The
   hard parts are not serializable as they stand: `random` and `rules` are closures, and
   `buildingAt` and the fields are derived.
2. **Tutorial beyond level 1.** Mazing, element matching, sappers and flyers are explained only in
   the opening dialog and the HUD.
3. **Dual-element towers,** combining two elements into a stronger tower. This is the main piece of
   the Element TD formula left out on purpose. It would fit as new `TOWERS` entries gated on two
   unlocked elements, and needs a way to show them in the tray.
4. **An endless mode,** which `buildWaves` could already generate, with a best-wave score.
5. **Placing towers by keyboard.** Hero movement and menus work from the keyboard; choosing a cell
   needs a pointer.
6. **Device polish.** Measure the frame rate with a full board on a real iPad. If it struggles, the
   shadow map in `TowerDefenseScene.tsx` is the first thing to try turning down, then one mesh per
   wall, which `scene/buildingView.ts` could instance.
