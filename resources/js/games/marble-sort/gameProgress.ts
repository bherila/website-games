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
  safeProgressNumber,
} from '../_shared/progressParsers'
import {
  BOX_MARBLE_COUNT,
  type Chute,
  type CompletedLevel,
  type ConveyorMarble,
  type FallingMarble,
  type GameOver,
  type GameState,
  GRID_COLUMNS,
  GRID_ROWS,
  MARBLE_COLORS,
  MARBLE_SORT_PROGRESS_STORAGE_KEY,
  type MarbleBox,
  type PowerUpInventory,
  type SavedGameProgress,
  type SortingStack,
} from './gameTypes'
import { TOTAL_LEVELS } from './levels'

export { safeProgressNumber }

// v4: neighbor-unlock + dispenser-adjacent refill rules; older snapshots were
// generated under row-based rules and may no longer be solvable.
export const MARBLE_SORT_SNAPSHOT_STORAGE_KEY = 'bwh.marble-sort.snapshot.v4'

interface SavedLevelSnapshot {
  version: 2
  state: GameState
}

function defineMarbleSortProgressGameData(includeInventory: boolean, promoteLocal: boolean) {
  return defineGameData<SavedGameProgress>({
    game: 'marble-sort',
    localStorageKey: MARBLE_SORT_PROGRESS_STORAGE_KEY,
    promoteLocal,
    parse: parseSavedProgress,
    encode: (progress) => {
      const slots: GameDataSlotInput[] = [{
        scope: 'profile',
        slot: 'default',
        data: {
          version: 2,
          unlocked_level: progress.unlockedLevel,
          total_score: progress.totalScore,
          high_score: progress.highScore,
        },
      }]
      if (includeInventory) {
        slots.push({
          scope: 'profile',
          slot: 'inventory',
          data: { version: 2, power_ups: progress.powerUps },
        })
      }
      slots.push(...[...new Set([...Object.keys(progress.stars), ...Object.keys(progress.levelScores)])]
        .map((level) => Number(level))
        .filter((level) => Number.isInteger(level) && level >= 1 && level <= TOTAL_LEVELS)
        .map((level) => ({
          scope: 'level' as const,
          slot: String(level),
          data: {
            version: 2,
            stars: progress.stars[level] ?? 0,
            score: progress.levelScores[level] ?? 0,
          },
        })))

      return slots
    },
    decode: (rows) => {
      const profileRow = rows.get(definitionRowKey('profile', 'default'))
      const profile = profileRow?.data.version === 2 ? profileRow : undefined
      const inventoryRow = includeInventory ? rows.get(definitionRowKey('profile', 'inventory')) : undefined
      const inventory = inventoryRow?.data.version === 2 ? inventoryRow : undefined
      let unlockedLevel = parseInteger(profile?.data.unlocked_level, 1) ?? 1
      const stars: Record<number, number> = {}
      const levelScores: Record<number, number> = {}
      let found = Boolean(profile || inventory)

      for (let level = 1; level <= TOTAL_LEVELS; level += 1) {
        const row = rows.get(definitionRowKey('level', String(level)))
        if (row?.data.version !== 2) {
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
        version: 2,
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

export const MARBLE_SORT_PROGRESS_GAME_DATA = defineMarbleSortProgressGameData(true, true)
export const MARBLE_SORT_CATALOG_GAME_DATA = defineMarbleSortProgressGameData(false, false)

export const MARBLE_SORT_SNAPSHOT_GAME_DATA = defineGameData<SavedLevelSnapshot>({
  game: 'marble-sort',
  localStorageKey: MARBLE_SORT_SNAPSHOT_STORAGE_KEY,
  parse: parseSavedLevelSnapshot,
  encode: (snapshot) => [{
    scope: 'save',
    slot: 'autosave',
    data: snapshot as unknown as Record<string, unknown>,
  }],
  decode: (rows) => parseSavedLevelSnapshot(rows.get(definitionRowKey('save', 'autosave'))?.data),
  clearSlots: [{ scope: 'save', slot: 'autosave' }],
})

export const MARBLE_SORT_GAME_DATA = [MARBLE_SORT_PROGRESS_GAME_DATA, MARBLE_SORT_SNAPSHOT_GAME_DATA] as const

export function createInitialPowerUps(): PowerUpInventory {
  return {
    extraBelt: 0,
    magnet: 0,
    shuffle: 0,
  }
}

export function createInitialProgress(): SavedGameProgress {
  return {
    version: 2,
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
    const raw = storage.getItem(MARBLE_SORT_PROGRESS_STORAGE_KEY)
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
    version: 2,
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
    storage.setItem(MARBLE_SORT_PROGRESS_STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // Persistence failures must not interrupt gameplay.
  }
}

export function saveLevelSnapshot(state: GameState, storage: Pick<Storage, 'setItem'> | null = gameDataStorage()): void {
  if (!storage || state.completedLevel) {
    return
  }

  const snapshot: SavedLevelSnapshot = {
    version: 2,
    state: cloneSerializableState(state),
  }
  try {
    storage.setItem(MARBLE_SORT_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot))
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
    const raw = storage.getItem(MARBLE_SORT_SNAPSHOT_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed) || parsed.version !== 2) {
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
    storage?.removeItem(MARBLE_SORT_SNAPSHOT_STORAGE_KEY)
  } catch {
    // Persistence failures must not interrupt gameplay.
  }
}

export function parseSavedProgress(value: unknown): SavedGameProgress | null {
  if (!isRecord(value) || value.version !== 2) {
    return null
  }

  const unlockedLevel = parseInteger(value.unlockedLevel, 1)
  const stars = parseStars(value.stars)
  const levelScores = parseLevelScores(value.levelScores)
  if (unlockedLevel === null || stars === null || levelScores === null) {
    return null
  }

  return {
    version: 2,
    unlockedLevel,
    stars,
    levelScores,
    totalScore: safeProgressNumber(value.totalScore),
    highScore: safeProgressNumber(value.highScore),
    powerUps: sanitizePowerUps(value.powerUps),
  }
}

function parseSavedLevelSnapshot(value: unknown): SavedLevelSnapshot | null {
  if (!isRecord(value) || value.version !== 2) {
    return null
  }

  const state = parseGameState(value.state)

  return state ? { version: 2, state } : null
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
    extraBelt: Math.max(0, safeProgressNumber(candidate?.extraBelt)),
    magnet: Math.max(0, safeProgressNumber(candidate?.magnet)),
    shuffle: Math.max(0, safeProgressNumber(candidate?.shuffle)),
  }
}

function cloneSerializableState(state: GameState): GameState {
  return {
    ...state,
    activeColors: [...state.activeColors],
    boxes: state.boxes.map((box) => ({
      ...box,
      position: { ...box.position },
    })),
    chutes: state.chutes.map((chute) => ({
      ...chute,
      queue: chute.queue.map((box) => ({ ...box })),
    })),
    conveyor: state.conveyor.map((marble) => ({ ...marble })),
    fallingMarbles: state.fallingMarbles.map((marble) => ({
      ...marble,
      from: { ...marble.from },
    })),
    sortingStacks: state.sortingStacks.map((stack) => ({
      ...stack,
      blocks: stack.blocks.map((block) => ({ ...block })),
    })),
    powerUps: { ...state.powerUps },
    completedLevel: state.completedLevel ? { ...state.completedLevel } : null,
    gameOver: state.gameOver ? { ...state.gameOver } : null,
  }
}

function parseGameState(value: unknown): GameState | null {
  if (!isRecord(value) || value.version !== 1) {
    return null
  }

  const level = parseInteger(value.level, 1)
  const seed = parseInteger(value.seed)
  const boxes = parseArray(value.boxes, parseMarbleBox)
  const chutes = parseArray(value.chutes, parseChute)
  const conveyor = parseArray(value.conveyor, parseConveyorMarble)
  const fallingMarbles = parseArray(value.fallingMarbles, parseFallingMarble)
  const sortingStacks = parseArray(value.sortingStacks, parseSortingStack)
  const activeColors = parseArray(value.activeColors, parseMarbleColor)
  const conveyorCapacity = parseInteger(value.conveyorCapacity, BOX_MARBLE_COUNT)
  const baseConveyorCapacity = parseInteger(value.baseConveyorCapacity, BOX_MARBLE_COUNT)
  const levelScore = parseNumber(value.levelScore)
  const totalScore = parseNumber(value.totalScore)
  const highScore = parseNumber(value.highScore)
  const moves = parseNumber(value.moves)
  const powerUpsUsed = parseNumber(value.powerUpsUsed)
  const clearedBlocks = parseNumber(value.clearedBlocks)
  const nextBoxSequence = parseInteger(value.nextBoxSequence)
  const nextMarbleSequence = parseInteger(value.nextMarbleSequence)
  const conveyorTicks = parseNumber(value.conveyorTicks)

  if (
    level === null
    || seed === null
    || boxes === null
    || chutes === null
    || conveyor === null
    || fallingMarbles === null
    || sortingStacks === null
    || activeColors === null
    || conveyorCapacity === null
    || baseConveyorCapacity === null
    || levelScore === null
    || totalScore === null
    || highScore === null
    || moves === null
    || powerUpsUsed === null
    || clearedBlocks === null
    || nextBoxSequence === null
    || nextMarbleSequence === null
    || conveyorTicks === null
    || !isRecord(value.powerUps)
  ) {
    return null
  }

  if (boxes.some((box) => box.position.column < 0 || box.position.column >= GRID_COLUMNS || box.position.row < 0 || box.position.row >= GRID_ROWS)) {
    return null
  }

  if (conveyor.some((marble) => marble.slotIndex >= conveyorCapacity)) {
    return null
  }

  const slotsSeen = new Set<number>()
  for (const marble of conveyor) {
    if (slotsSeen.has(marble.slotIndex)) {
      return null
    }
    slotsSeen.add(marble.slotIndex)
  }

  return {
    version: 1,
    level,
    seed,
    boxes,
    chutes,
    conveyor,
    fallingMarbles,
    sortingStacks,
    activeColors,
    conveyorCapacity: Math.max(BOX_MARBLE_COUNT, conveyorCapacity),
    baseConveyorCapacity: Math.max(BOX_MARBLE_COUNT, baseConveyorCapacity),
    levelScore,
    totalScore,
    highScore,
    moves,
    powerUpsUsed,
    clearedBlocks,
    nextBoxSequence,
    nextMarbleSequence,
    conveyorTicks,
    powerUps: sanitizePowerUps(value.powerUps),
    lastMessage: typeof value.lastMessage === 'string' ? value.lastMessage : '',
    completedLevel: parseCompletedLevel(value.completedLevel),
    gameOver: parseGameOver(value.gameOver),
  }
}

function parseMarbleBox(value: unknown): MarbleBox | null {
  if (!isRecord(value)) {
    return null
  }

  const color = parseMarbleColor(value.color)
  const position = parseGridPosition(value.position)
  if (!color || !position || typeof value.id !== 'string') {
    return null
  }

  return {
    id: value.id,
    color,
    hidden: value.hidden === true,
    position,
    source: value.source === 'chute' ? 'chute' : 'initial',
  }
}

function parseChute(value: unknown): Chute | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null
  }

  const row = parseInteger(value.row, 0)
  const queue = parseArray(value.queue, (item): Chute['queue'][number] | null => {
    if (!isRecord(item)) {
      return null
    }

    const color = parseMarbleColor(item.color)
    return color ? { color, hidden: item.hidden === true } : null
  })

  const side = value.side === 'right' || value.side === 'left' ? value.side : null
  if (row === null || row >= GRID_ROWS || queue === null || side === null) {
    return null
  }

  return {
    id: value.id,
    row,
    side,
    remaining: Math.max(0, parseInteger(value.remaining, 0) ?? 0),
    queue,
  }
}

function parseConveyorMarble(value: unknown): ConveyorMarble | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null
  }

  const color = parseMarbleColor(value.color)
  const sequence = parseInteger(value.sequence)
  const slotIndex = parseInteger(value.slotIndex)
  if (!color || sequence === null || slotIndex === null || slotIndex < 0) {
    return null
  }

  return { id: value.id, color, sequence, slotIndex }
}

function parseFallingMarble(value: unknown): FallingMarble | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null
  }

  const color = parseMarbleColor(value.color)
  const sequence = parseInteger(value.sequence)
  const from = parseGridPosition(value.from)
  if (!color || sequence === null || !from) {
    return null
  }

  return { id: value.id, color, sequence, from }
}

function parseSortingStack(value: unknown): SortingStack | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null
  }

  const color = parseMarbleColor(value.color)
  const index = parseInteger(value.index)
  const blocks = parseArray(value.blocks, (item): SortingStack['blocks'][number] | null => {
    if (!isRecord(item) || typeof item.id !== 'string') {
      return null
    }

    const blockColor = parseMarbleColor(item.color)
    const slotsFilled = parseInteger(item.slotsFilled, 0)
    if (!blockColor || slotsFilled === null || slotsFilled > 3) {
      return null
    }

    return {
      id: item.id,
      color: blockColor,
      slotsFilled,
    }
  })

  if (!color || index === null || blocks === null) {
    return null
  }

  return {
    id: value.id,
    color,
    index,
    blocks,
  }
}

function parseCompletedLevel(value: unknown): CompletedLevel | null {
  if (!isRecord(value)) {
    return null
  }

  const level = parseInteger(value.level, 1)
  const score = parseNumber(value.score)
  const stars = parseInteger(value.stars, 0)
  const awardedPowerUp = value.awardedPowerUp === 'shuffle' || value.awardedPowerUp === 'extraBelt' || value.awardedPowerUp === 'magnet'
    ? value.awardedPowerUp
    : null
  if (level === null || score === null || stars === null || stars > 3 || awardedPowerUp === null) {
    return null
  }

  return {
    awardedPowerUp,
    level,
    score,
    stars,
  }
}

function parseGameOver(value: unknown): GameOver | null {
  if (!isRecord(value) || value.reason !== 'belt_full') {
    return null
  }

  return {
    reason: 'belt_full',
    message: typeof value.message === 'string'
      ? value.message
      : 'The conveyor is full. Reset the level and pop boxes in a different order.',
  }
}

function parseGridPosition(value: unknown): { column: number, row: number } | null {
  if (!isRecord(value)) {
    return null
  }

  const column = parseInteger(value.column, 0)
  const row = parseInteger(value.row, 0)
  if (column === null || row === null) {
    return null
  }

  return { column, row }
}

function parseMarbleColor(value: unknown): keyof typeof MARBLE_COLORS | null {
  return typeof value === 'string' && value in MARBLE_COLORS ? value as keyof typeof MARBLE_COLORS : null
}
