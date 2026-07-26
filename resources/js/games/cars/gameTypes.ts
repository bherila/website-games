export const GAME_PROGRESS_STORAGE_KEY = 'bwh.cars-game.progress.v3'

export const CAR_COLORS = {
  red: { label: 'Red', hex: '#f5333f' },
  blue: { label: 'Blue', hex: '#2b7bf3' },
  green: { label: 'Green', hex: '#2fc148' },
  yellow: { label: 'Yellow', hex: '#ffc918' },
  purple: { label: 'Purple', hex: '#a44df0' },
  orange: { label: 'Orange', hex: '#ff8c1f' },
  cyan: { label: 'Cyan', hex: '#2fd2e8' },
  brown: { label: 'Brown', hex: '#9c5a28' },
  lime: { label: 'Lime', hex: '#a1dd1d' },
} as const

export type CarColor = keyof typeof CAR_COLORS

export const CAR_PATTERN_VALUES = [
  'dot',
  'stripe',
  'triangle',
  'star',
  'diamond',
  'chevron',
  'ring',
  'crosshatch',
  'plus',
] as const

export type CarPattern = typeof CAR_PATTERN_VALUES[number]

export const CAR_PATTERNS = {
  red: 'dot',
  blue: 'stripe',
  green: 'triangle',
  yellow: 'star',
  purple: 'diamond',
  orange: 'chevron',
  cyan: 'ring',
  brown: 'crosshatch',
  lime: 'plus',
} as const satisfies Record<CarColor, CarPattern>

export type Direction = 'up' | 'up-right' | 'right' | 'down-right' | 'down' | 'down-left' | 'left' | 'up-left'

export type CarStatus = 'field' | 'hidden' | 'parked' | 'departed'

export type ParkingSlotKind = 'regular' | 'vip'

export type PowerUpKind = 'vip' | 'shuffle' | 'fill'

export interface GridPosition {
  x: number
  y: number
}

export interface Car {
  id: string
  color: CarColor
  colorHidden: boolean
  direction: Direction
  capacity: number
  length: number
  position: GridPosition
  status: CarStatus
  parkingSlotId: string | null
  boarded: number
  tunnelId: string | null
  sequence: number
}

export interface Tunnel {
  id: string
  position: GridPosition
  garagePosition: GridPosition
  direction: Direction
  carIds: string[]
  visibleCarId: string | null
  remaining: number
}

export type FeederSide = 'left' | 'right'

export interface Passenger {
  id: string
  color: CarColor
  feederSide?: FeederSide
}

export interface ParkingSlot {
  id: string
  kind: ParkingSlotKind
  unlocked: boolean
  occupiedCarId: string | null
  index: number
}

export interface PowerUpInventory {
  vip: number
  shuffle: number
  fill: number
}

export interface CompletedLevel {
  level: number
  score: number
  stars: number
  awardedPowerUp: PowerUpKind
}

export interface FailedLevel {
  level: number
  reason: string
}

export interface GameState {
  version: 2
  level: number
  seed: number
  boardWidth: number
  boardHeight: number
  cars: Car[]
  tunnels: Tunnel[]
  passengerQueue: Passenger[]
  parkingSlots: ParkingSlot[]
  powerUps: PowerUpInventory
  levelScore: number
  totalScore: number
  highScore: number
  moves: number
  maxRegularSlotsUsed: number
  maxRegularSlotsUnlocked: number
  powerUpsUsed: number
  lastMessage: string
  completedLevel: CompletedLevel | null
  failedLevel: FailedLevel | null
}

export interface SavedGameProgress {
  version: 3
  unlockedLevel: number
  stars: Record<number, number>
  levelScores: Record<number, number>
  totalScore: number
  highScore: number
  powerUps: PowerUpInventory
}

export const DIRECTIONS: Direction[] = ['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left']
export const DIRECTION_STEPS: Record<Direction, GridPosition> = {
  up: { x: 0, y: -1 },
  'up-right': { x: 1, y: -1 },
  right: { x: 1, y: 0 },
  'down-right': { x: 1, y: 1 },
  down: { x: 0, y: 1 },
  'down-left': { x: -1, y: 1 },
  left: { x: -1, y: 0 },
  'up-left': { x: -1, y: -1 },
}
export const CAPACITIES = [4, 6, 10] as const
export const STARTING_REGULAR_SLOTS = 4
export const TOTAL_REGULAR_SLOTS = 7
export const BOARD_WIDTH = 24
export const BOARD_HEIGHT = 16
export const MIN_LOOP_PASSENGERS = 18
export const MAX_LOOP_PASSENGERS = 34

export function lengthForCapacity(capacity: number): number {
  if (capacity <= 4) {
    return 2
  }

  if (capacity <= 6) {
    return 3
  }

  return 4
}
