import { defineCampaignProgress } from '../_shared/campaignProgress'
import {
  isRecord,
  parseArray,
  parseInteger,
  parseNumber,
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
  type Tunnel,
} from './gameTypes'
import { TOTAL_LEVELS } from './levels/levels'

export { safeProgressNumber }

export const LEVEL_SNAPSHOT_STORAGE_KEY = 'bwh.cars-game.snapshot.v3'

const campaign = defineCampaignProgress({
  game: 'parking-pickup',
  progressKey: GAME_PROGRESS_STORAGE_KEY,
  snapshotKey: LEVEL_SNAPSHOT_STORAGE_KEY,
  version: 3,
  powerUps: ['vip', 'shuffle', 'fill'],
  totalLevels: TOTAL_LEVELS,
  parseGameState,
  cloneState: cloneSerializableState,
})

export const CARS_PROGRESS_GAME_DATA = campaign.progressGameData
export const CARS_CATALOG_GAME_DATA = campaign.catalogGameData
export const CARS_SNAPSHOT_GAME_DATA = campaign.snapshotGameData
export const CARS_GAME_DATA = campaign.gameData
export const {
  createInitialPowerUps,
  createInitialProgress,
  sanitizePowerUps,
  parseSavedProgress,
  loadProgress,
  saveProgress,
  recordWin,
  saveLevelSnapshot,
  loadLevelSnapshot,
  clearLevelSnapshot,
} = campaign

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
