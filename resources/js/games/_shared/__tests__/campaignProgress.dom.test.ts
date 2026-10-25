import * as cars from '../../cars/gameEngine'
import * as carsProgress from '../../cars/gameProgress'
import * as marble from '../../marble-sort/gameEngine'
import * as marbleProgress from '../../marble-sort/gameProgress'
import carsFixture from './__fixtures__/campaignProgress.cars.json'
import marbleFixture from './__fixtures__/campaignProgress.marble-sort.json'
import { campaignTranscript } from './campaignTranscript'

// Fixtures were captured from each game's own codec before the shared factory
// existed. Any byte that changes in a local save, database row, decode, win or
// snapshot fails here, so players' saved progress cannot drift.
const fixtures: Record<string, unknown> = { cars: carsFixture, 'marble-sort': marbleFixture }
const games = {
  cars: { ...carsProgress, progress: carsProgress.CARS_PROGRESS_GAME_DATA, catalog: carsProgress.CARS_CATALOG_GAME_DATA, snapshot: carsProgress.CARS_SNAPSHOT_GAME_DATA, startLevel: cars.startLevel },
  'marble-sort': { ...marbleProgress, progress: marbleProgress.MARBLE_SORT_PROGRESS_GAME_DATA, catalog: marbleProgress.MARBLE_SORT_CATALOG_GAME_DATA, snapshot: marbleProgress.MARBLE_SORT_SNAPSHOT_GAME_DATA, startLevel: marble.startLevel },
}

test.each(Object.entries(games))('%s saves, loads, records wins and snapshots byte-for-byte as before', (name, module) => {
  // Stringify both sides so key order, as written to storage, is compared too.
  expect(JSON.stringify(campaignTranscript(module as never), null, 1)).toBe(JSON.stringify(fixtures[name], null, 1))
})
