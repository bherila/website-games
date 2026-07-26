import { earnsCompletionReward } from '../_shared/campaignRewards'
import {
  defineGameData,
  definitionRowKey,
  type GameDataSlotInput,
  gameDataStorage,
} from '../_shared/gameDataPersistence'
import {
  isRecord,
  parseArray,
  parseInteger,
  parseNumber,
  parseStars,
  parseString,
  safeProgressNumber,
} from '../_shared/progressParsers'
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  type Car,
  CAR_COLORS,
  type CarColor,
  type CarStatus,
  type Direction,
  DIRECTIONS,
  type FailedLevel,
  type FeederSide,
  GAME_PROGRESS_STORAGE_KEY,
  type GameState,
  type GridPosition,
  lengthForCapacity,
  type ParkingSlot,
  type ParkingSlotKind,
  type Passenger,
  type PowerUpInventory,
  type SavedGameProgress,
  type Tunnel,
} from './gameTypes'
import { TOTAL_LEVELS } from './levels/levels'

export { safeProgressNumber }

export const LEVEL_SNAPSHOT_STORAGE_KEY = 'bwh.cars-game.snapshot.v3'

interface SavedLevelSnapshot {
  version: 3
  state: GameState
}

function defineCarsProgressGameData(includeInventory: boolean, promoteLocal: boolean) {
  return defineGameData<SavedGameProgress>({
    game: 'parking-pickup',
    localStorageKey: GAME_PROGRESS_STORAGE_KEY,
    promoteLocal,
    parse: parseSavedProgress,
    encode: (progress) => {
      const slots: GameDataSlotInput[] = [{
        scope: 'profile',
        slot: 'default',
        data: {
          version: 3,
          unlocked_level: progress.unlockedLevel,
          total_score: progress.totalScore,
          high_score: progress.highScore,
        },
      }]
      if (includeInventory) {
        slots.push({
          scope: 'profile',
          slot: 'inventory',
          data: { version: 3, power_ups: progress.powerUps },
        })
      }
      slots.push(...[...new Set([...Object.keys(progress.stars), ...Object.keys(progress.levelScores)])]
        .map((level) => Number(level))
        .filter((level) => Number.isInteger(level) && level >= 1 && level <= TOTAL_LEVELS)
        .map((level) => ({
          scope: 'level' as const,
          slot: String(level),
          data: {
            version: 3,
            stars: progress.stars[level] ?? 0,
            score: progress.levelScores[level] ?? 0,
          },
        })))

      return slots
    },
    decode: (rows) => {
      const profileRow = rows.get(definitionRowKey('profile', 'default'))
      const profile = profileRow?.data.version === 3 ? profileRow : undefined
      const inventoryRow = includeInventory ? rows.get(definitionRowKey('profile', 'inventory')) : undefined
      const inventory = inventoryRow?.data.version === 3 ? inventoryRow : undefined
      let unlockedLevel = parseInteger(profile?.data.unlocked_level, 1) ?? 1
      const stars: Record<number, number> = {}
      const levelScores: Record<number, number> = {}
      let found = Boolean(profile || inventory)

      for (let level = 1; level <= TOTAL_LEVELS; level += 1) {
        const row = rows.get(definitionRowKey('level', String(level)))
        if (row?.data.version !== 3) {
          continue
        }

        const rowStars = parseInteger(row.data.stars, 0)
        const rowScore = parseInteger(row.data.score, 0)
        if (rowStars === null || rowStars > 3 || rowScore === null) {
          continue
        }

        found = true
        stars[level] = rowStars
        levelScores[level] = rowScore
        unlockedLevel = Math.max(unlockedLevel, level + 1)
      }

      const bestScoreTotal = Object.values(levelScores).reduce((total, score) => total + score, 0)
      const hydratedTotalScore = Math.max(safeProgressNumber(profile?.data.total_score), bestScoreTotal)

      return found ? parseSavedProgress({
        version: 3,
        unlockedLevel,
        stars,
        levelScores,
        totalScore: hydratedTotalScore,
        highScore: Math.max(safeProgressNumber(profile?.data.high_score), hydratedTotalScore),
        powerUps: inventory?.data.power_ups,
      }) : null
    },
  })
}

export const CARS_PROGRESS_GAME_DATA = defineCarsProgressGameData(true, true)
export const CARS_CATALOG_GAME_DATA = defineCarsProgressGameData(false, false)

export const CARS_SNAPSHOT_GAME_DATA = defineGameData<SavedLevelSnapshot>({
  game: 'parking-pickup',
  localStorageKey: LEVEL_SNAPSHOT_STORAGE_KEY,
  parse: parseSavedLevelSnapshot,
  encode: (snapshot) => [{
    scope: 'save',
    slot: 'autosave',
    data: snapshot as unknown as Record<string, unknown>,
  }],
  decode: (rows) => parseSavedLevelSnapshot(rows.get(definitionRowKey('save', 'autosave'))?.data),
  clearSlots: [{ scope: 'save', slot: 'autosave' }],
})

export const CARS_GAME_DATA = [CARS_PROGRESS_GAME_DATA, CARS_SNAPSHOT_GAME_DATA] as const

export function createInitialPowerUps(): PowerUpInventory {
  return {
    vip: 0,
    shuffle: 0,
    fill: 0,
  }
}

export function createInitialProgress(): SavedGameProgress {
  return {
    version: 3,
    unlockedLevel: 1,
    stars: {},
    levelScores: {},
    totalScore: 0,
    highScore: 0,
    powerUps: createInitialPowerUps(),
  }
}

export function loadProgress(storage: Pick<Storage, 'getItem'> | null = gameDataStorage()): SavedGameProgress {
  if (!storage) {
    return createInitialProgress()
  }

  try {
    const raw = storage.getItem(GAME_PROGRESS_STORAGE_KEY)
    if (!raw) {
      return createInitialProgress()
    }

    return parseSavedProgress(JSON.parse(raw)) ?? createInitialProgress()
  } catch {
    return createInitialProgress()
  }
}

/**
 * Records a level win from a completed state. Never lowers an earned star
 * count or the unlocked-level watermark. Score and power-up rewards are only
 * persisted when the completion improves the saved star result.
 */
export function recordWin(progress: SavedGameProgress, state: GameState): SavedGameProgress {
  const completed = state.completedLevel
  if (!completed) {
    return progress
  }

  const existingStars = progress.stars[completed.level] ?? 0
  const rewardEarned = earnsCompletionReward(existingStars, completed.stars)
  const levelScores = rewardEarned
    ? {
        ...progress.levelScores,
        [completed.level]: Math.max(progress.levelScores[completed.level] ?? 0, completed.score),
      }
    : { ...progress.levelScores }
  const totalScore = rewardEarned
    ? Math.max(
        progress.totalScore,
        state.totalScore,
        Object.values(levelScores).reduce((total, score) => total + score, 0),
      )
    : progress.totalScore

  return {
    version: 3,
    // Deliberately uncapped: finishing today's final level pre-unlocks the
    // next one the moment more levels ship. The grid only renders defined ids.
    unlockedLevel: Math.max(progress.unlockedLevel, completed.level + 1),
    stars: { ...progress.stars, [completed.level]: Math.max(existingStars, completed.stars) },
    levelScores,
    totalScore,
    highScore: Math.max(progress.highScore, state.highScore, totalScore),
    powerUps: rewardEarned ? { ...state.powerUps } : { ...progress.powerUps },
  }
}


export function saveProgress(progress: SavedGameProgress, storage: Pick<Storage, 'setItem'> | null = gameDataStorage()): void {
  if (!storage) {
    return
  }

  try {
    storage.setItem(GAME_PROGRESS_STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // Persistence failures must not interrupt gameplay.
  }
}

export function saveLevelSnapshot(state: GameState, storage: Pick<Storage, 'setItem'> | null = gameDataStorage()): void {
  if (!storage || state.completedLevel) {
    return
  }

  const snapshot: SavedLevelSnapshot = {
    version: 3,
    state: cloneSerializableState(state),
  }
  try {
    storage.setItem(LEVEL_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Persistence failures must not interrupt gameplay.
  }
}

export function loadLevelSnapshot(
  storage: Pick<Storage, 'getItem'> | null = gameDataStorage(),
  progress: SavedGameProgress = loadProgress(storage),
): GameState | null {
  if (!storage) {
    return null
  }

  try {
    const raw = storage.getItem(LEVEL_SNAPSHOT_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed) || parsed.version !== 3) {
      return null
    }

    const state = parseGameState(parsed.state)
    if (!state || state.level > progress.unlockedLevel) {
      return null
    }

    return state
  } catch {
    return null
  }
}

export function clearLevelSnapshot(storage: Pick<Storage, 'removeItem'> | null = gameDataStorage()): void {
  try {
    storage?.removeItem(LEVEL_SNAPSHOT_STORAGE_KEY)
  } catch {
    // Persistence failures must not interrupt gameplay.
  }
}

export function parseSavedProgress(value: unknown): SavedGameProgress | null {
  if (!isRecord(value) || value.version !== 3) {
    return null
  }

  const unlockedLevel = parseInteger(value.unlockedLevel, 1)
  const stars = parseStars(value.stars)
  const levelScores = parseLevelScores(value.levelScores)
  if (unlockedLevel === null || stars === null || levelScores === null) {
    return null
  }

  return {
    version: 3,
    unlockedLevel,
    stars,
    levelScores,
    totalScore: safeProgressNumber(value.totalScore),
    highScore: safeProgressNumber(value.highScore),
    powerUps: sanitizePowerUps(value.powerUps),
  }
}

function parseSavedLevelSnapshot(value: unknown): SavedLevelSnapshot | null {
  if (!isRecord(value) || value.version !== 3) {
    return null
  }

  const state = parseGameState(value.state)

  return state ? { version: 3, state } : null
}

function parseLevelScores(value: unknown): Record<number, number> | null {
  if (value === undefined) {
    return {}
  }
  if (!isRecord(value)) {
    return null
  }

  const scores: Record<number, number> = {}
  for (const [level, score] of Object.entries(value)) {
    const parsedLevel = parseInteger(Number(level), 1)
    const parsedScore = parseInteger(score, 0)
    if (parsedLevel === null || parsedScore === null) {
      return null
    }
    scores[parsedLevel] = parsedScore
  }

  return scores
}

export function sanitizePowerUps(powerUps: unknown): PowerUpInventory {
  const candidate = powerUps as Partial<PowerUpInventory> | undefined

  return {
    vip: Math.max(0, safeProgressNumber(candidate?.vip)),
    shuffle: Math.max(0, safeProgressNumber(candidate?.shuffle)),
    fill: Math.max(0, safeProgressNumber(candidate?.fill)),
  }
}

function cloneSerializableState(state: GameState): GameState {
  return {
    ...state,
    cars: state.cars.map((car) => ({
      ...car,
      position: { ...car.position },
    })),
    tunnels: state.tunnels.map((tunnel) => ({
      ...tunnel,
      position: { ...tunnel.position },
      garagePosition: { ...tunnel.garagePosition },
      carIds: [...tunnel.carIds],
    })),
    passengerQueue: state.passengerQueue.map((passenger) => ({ ...passenger })),
    parkingSlots: state.parkingSlots.map((slot) => ({ ...slot })),
    powerUps: { ...state.powerUps },
    completedLevel: state.completedLevel ? { ...state.completedLevel } : null,
    failedLevel: state.failedLevel ? { ...state.failedLevel } : null,
  }
}

function parseGameState(value: unknown): GameState | null {
  if (!isRecord(value) || value.version !== 2) {
    return null
  }

  const level = parseInteger(value.level, 1)
  const seed = parseInteger(value.seed)
  const boardWidth = parseInteger(value.boardWidth, 1)
  const boardHeight = parseInteger(value.boardHeight, 1)
  const cars = parseArray(value.cars, parseCar)
  const tunnels = parseArray(value.tunnels, parseTunnel)
  const passengerQueue = parseArray(value.passengerQueue, parsePassenger)
  const parkingSlots = parseArray(value.parkingSlots, parseParkingSlot)
  const levelScore = parseNumber(value.levelScore)
  const totalScore = parseNumber(value.totalScore)
  const highScore = parseNumber(value.highScore)
  const moves = parseNumber(value.moves)
  const maxRegularSlotsUsed = parseNumber(value.maxRegularSlotsUsed)
  const maxRegularSlotsUnlocked = parseNumber(value.maxRegularSlotsUnlocked)
  const powerUpsUsed = parseNumber(value.powerUpsUsed)
  const failedLevel = parseFailedLevel(value.failedLevel)

  if (
    level === null
    || seed === null
    || boardWidth === null
    || boardHeight === null
    || cars === null
    || tunnels === null
    || passengerQueue === null
    || parkingSlots === null
    || levelScore === null
    || totalScore === null
    || highScore === null
    || moves === null
    || maxRegularSlotsUsed === null
    || maxRegularSlotsUnlocked === null
    || powerUpsUsed === null
    || failedLevel === null
    || !isRecord(value.powerUps)
    || value.completedLevel !== null
  ) {
    return null
  }

  if (boardWidth !== BOARD_WIDTH || boardHeight !== BOARD_HEIGHT) {
    return null
  }

  if (cars.some((car) => car.length !== lengthForCapacity(car.capacity))) {
    return null
  }

  return {
    version: 2,
    level,
    seed,
    boardWidth,
    boardHeight,
    cars,
    tunnels,
    passengerQueue,
    parkingSlots,
    powerUps: sanitizePowerUps(value.powerUps),
    levelScore,
    totalScore,
    highScore,
    moves,
    maxRegularSlotsUsed,
    maxRegularSlotsUnlocked,
    powerUpsUsed,
    lastMessage: typeof value.lastMessage === 'string' ? value.lastMessage : '',
    completedLevel: null,
    failedLevel: failedLevel ?? null,
  }
}

function parseFailedLevel(value: unknown): FailedLevel | undefined | null {
  if (value === undefined || value === null) {
    return undefined
  }

  if (!isRecord(value)) {
    return null
  }

  const level = parseInteger(value.level, 1)
  if (level === null || typeof value.reason !== 'string') {
    return null
  }

  return {
    level,
    reason: value.reason,
  }
}

function parseCar(value: unknown): Car | null {
  if (!isRecord(value)) {
    return null
  }

  const position = parseGridPosition(value.position)
  const color = parseCarColor(value.color)
  const direction = parseDirection(value.direction)
  const status = parseCarStatus(value.status)
  const capacity = parseInteger(value.capacity, 1)
  const length = parseInteger(value.length, 1)
  const sequence = parseInteger(value.sequence, 0)

  if (
    typeof value.id !== 'string'
    || color === null
    || direction === null
    || capacity === null
    || length === null
    || position === null
    || status === null
    || !isNullableString(value.parkingSlotId)
    || typeof value.boarded !== 'number'
    || !Number.isFinite(value.boarded)
    || !isNullableString(value.tunnelId)
    || sequence === null
  ) {
    return null
  }

  return {
    id: value.id,
    color,
    colorHidden: value.colorHidden === true,
    direction,
    capacity,
    length,
    position,
    status,
    parkingSlotId: value.parkingSlotId,
    boarded: value.boarded,
    tunnelId: value.tunnelId,
    sequence,
  }
}

function parseTunnel(value: unknown): Tunnel | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null
  }

  const position = parseGridPosition(value.position)
  const garagePosition = parseGridPosition(value.garagePosition)
  const direction = parseDirection(value.direction)
  const carIds = parseArray(value.carIds, parseString)
  const remaining = parseInteger(value.remaining, 0)

  if (
    position === null
    || garagePosition === null
    || direction === null
    || carIds === null
    || !isNullableString(value.visibleCarId)
    || remaining === null
  ) {
    return null
  }

  return {
    id: value.id,
    position,
    garagePosition,
    direction,
    carIds,
    visibleCarId: value.visibleCarId,
    remaining,
  }
}

function parsePassenger(value: unknown): Passenger | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null
  }

  const color = parseCarColor(value.color)
  const feederSide = parseFeederSide(value.feederSide)
  if (color === null || feederSide === null) {
    return null
  }

  return {
    id: value.id,
    color,
    ...(feederSide ? { feederSide } : {}),
  }
}

function parseParkingSlot(value: unknown): ParkingSlot | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null
  }

  const kind = parseParkingSlotKind(value.kind)
  const index = parseInteger(value.index)
  if (
    kind === null
    || typeof value.unlocked !== 'boolean'
    || !isNullableString(value.occupiedCarId)
    || index === null
  ) {
    return null
  }

  return {
    id: value.id,
    kind,
    unlocked: value.unlocked,
    occupiedCarId: value.occupiedCarId,
    index,
  }
}

function parseGridPosition(value: unknown): GridPosition | null {
  if (!isRecord(value)) {
    return null
  }

  const x = parseInteger(value.x)
  const y = parseInteger(value.y)
  if (x === null || y === null) {
    return null
  }

  return { x, y }
}

function parseCarColor(value: unknown): CarColor | null {
  return typeof value === 'string' && value in CAR_COLORS ? value as CarColor : null
}

function parseDirection(value: unknown): Direction | null {
  return typeof value === 'string' && DIRECTIONS.includes(value as Direction) ? value as Direction : null
}

function parseCarStatus(value: unknown): CarStatus | null {
  return value === 'field' || value === 'hidden' || value === 'parked' || value === 'departed' ? value : null
}

function parseFeederSide(value: unknown): FeederSide | undefined | null {
  if (value === undefined) {
    return undefined
  }

  return value === 'left' || value === 'right' ? value : null
}

function parseParkingSlotKind(value: unknown): ParkingSlotKind | null {
  return value === 'regular' || value === 'vip' ? value : null
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}
