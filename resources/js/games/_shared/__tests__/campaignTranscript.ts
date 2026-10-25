import { definitionRowKey, type GameDataDefinition } from '../gameDataPersistence'

/** The surface every campaign codec exposes, old or new. */
export interface CampaignModule<Progress, State> {
  progress: GameDataDefinition
  catalog: GameDataDefinition
  snapshot: GameDataDefinition
  createInitialProgress: () => Progress
  parseSavedProgress: (value: unknown) => Progress | null
  saveProgress: (progress: Progress, storage: Pick<Storage, 'setItem'>) => void
  loadProgress: (storage: Pick<Storage, 'getItem'>) => Progress
  recordWin: (progress: Progress, state: State) => Progress
  saveLevelSnapshot: (state: State, storage: Pick<Storage, 'setItem'>) => void
  loadLevelSnapshot: (storage: Pick<Storage, 'getItem'>, progress: Progress) => State | null
  startLevel: (level: number, progress: Progress) => State
}

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, String(value)) },
  }
}

function rows(definition: GameDataDefinition, value: unknown) {
  return new Map(definition.encode(value).map((slot) => [definitionRowKey(slot.scope, slot.slot), { ...slot, game: definition.game, revision: 1, updatedAt: null }]))
}

/**
 * Every byte a campaign codec writes or reads back, for a fixed set of inputs.
 * Comparing transcripts before and after a refactor proves saves are unchanged.
 */
export function campaignTranscript<Progress extends { version: number, powerUps: Record<string, number> }, State extends { completedLevel: unknown }>(module: CampaignModule<Progress, State>): Record<string, unknown> {
  const initial = module.createInitialProgress()
  const powerUps = Object.fromEntries(Object.keys(initial.powerUps).map((name, index) => [name, index + 2]))
  const sample = module.parseSavedProgress({
    version: initial.version, unlockedLevel: 4, stars: { 1: 3, 2: 1, 3: 2 }, levelScores: { 1: 120, 3: 45, 4: 9 }, totalScore: 165, highScore: 200, powerUps,
  })!
  const storage = memoryStorage()
  module.saveProgress(sample, storage)
  const saved = [...Array(storage.length).keys()].map((index) => [storage.key(index), storage.getItem(storage.key(index)!)])
  const level = module.startLevel(2, sample)
  const winning = { ...level, completedLevel: { ...(level as Record<string, unknown>), level: 2, score: 300, stars: 3, awardedPowerUp: Object.keys(powerUps)[0] }, totalScore: 465, highScore: 465 } as unknown as State
  const lesser = { ...winning, completedLevel: { ...(winning.completedLevel as object), stars: 1, score: 10 } } as State
  const snapshotStorage = memoryStorage()
  const snapshotState = module.startLevel(3, sample)
  module.saveLevelSnapshot(snapshotState, snapshotStorage)

  return {
    initial,
    saved,
    loaded: module.loadProgress(storage),
    progressRows: module.progress.encode(sample),
    catalogRows: module.catalog.encode(sample),
    decodedProgress: module.progress.decode(rows(module.progress, sample)),
    decodedCatalog: module.catalog.decode(rows(module.catalog, sample)),
    decodedEmpty: module.progress.decode(new Map()),
    rejected: [
      module.parseSavedProgress({ ...sample, version: initial.version + 1 }),
      module.parseSavedProgress({ ...sample, levelScores: { x: 'nope' } }),
      module.parseSavedProgress({ ...sample, powerUps: { bogus: 5 } }),
      module.parseSavedProgress({ ...sample, levelScores: undefined }),
    ],
    win: module.recordWin(sample, winning),
    lesserWin: module.recordWin(sample, lesser),
    snapshotSaved: snapshotStorage.getItem(module.snapshot.localStorageKey),
    snapshotLoaded: module.loadLevelSnapshot(snapshotStorage, sample),
    snapshotLockedOut: module.loadLevelSnapshot(snapshotStorage, { ...sample, unlockedLevel: 1 }),
    snapshotRows: module.snapshot.encode({ version: initial.version, state: snapshotState }),
  }
}
