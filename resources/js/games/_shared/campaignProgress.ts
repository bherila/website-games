import { earnsCompletionReward } from './campaignRewards'
import {
  type DatabaseGameSlug,
  defineGameData,
  definitionRowKey,
  type GameDataDefinition,
  type GameDataSlotInput,
  gameDataStorage,
} from './gameDataPersistence'
import { isRecord, parseInteger, parseStars, safeProgressNumber } from './progressParsers'

/** Saved campaign progress for scored, star-rated games with a power-up inventory. */
export interface CampaignProgress<Version extends number, PowerUp extends string> {
  version: Version
  unlockedLevel: number
  stars: Record<number, number>
  levelScores: Record<number, number>
  totalScore: number
  highScore: number
  powerUps: Record<PowerUp, number>
}

/** The parts of a game's live state that campaign progress reads. */
export interface CampaignState<PowerUp extends string> {
  level: number
  completedLevel: { level: number, score: number, stars: number } | null
  totalScore: number
  highScore: number
  powerUps: Record<PowerUp, number>
}

export interface CampaignProgressConfig<Version extends number, PowerUp extends string, State extends CampaignState<PowerUp>> {
  game: DatabaseGameSlug
  progressKey: string
  snapshotKey: string
  /** Schema version written into local saves, database rows and snapshots. */
  version: Version
  powerUps: readonly PowerUp[]
  totalLevels: number
  parseGameState: (value: unknown) => State | null
  /** A deep copy of only the serializable fields, for a level snapshot. */
  cloneState: (state: State) => State
}

interface SavedLevelSnapshot<Version extends number, State> {
  version: Version
  state: State
}

/**
 * Builds the progress, catalog and in-level snapshot codecs shared by campaign
 * games: a versioned localStorage blob, `profile/default` and
 * `profile/inventory` rows, `level/N {stars, score}` rows and a
 * `save/autosave` snapshot row. Byte layout matches what each game shipped.
 */
export function defineCampaignProgress<Version extends number, PowerUp extends string, State extends CampaignState<PowerUp>>(
  { game, progressKey, snapshotKey, version, powerUps: powerUpNames, totalLevels, parseGameState, cloneState }: CampaignProgressConfig<Version, PowerUp, State>,
) {
  type Progress = CampaignProgress<Version, PowerUp>
  type Snapshot = SavedLevelSnapshot<Version, State>

  function createInitialPowerUps(): Record<PowerUp, number> {
    return Object.fromEntries(powerUpNames.map((name) => [name, 0])) as Record<PowerUp, number>
  }

  function sanitizePowerUps(powerUps: unknown): Record<PowerUp, number> {
    const candidate = powerUps as Partial<Record<PowerUp, unknown>> | undefined

    return Object.fromEntries(powerUpNames.map((name) => [name, Math.max(0, safeProgressNumber(candidate?.[name]))])) as Record<PowerUp, number>
  }

  function createInitialProgress(): Progress {
    return { version, unlockedLevel: 1, stars: {}, levelScores: {}, totalScore: 0, highScore: 0, powerUps: createInitialPowerUps() }
  }

  function parseSavedProgress(value: unknown): Progress | null {
    if (!isRecord(value) || value.version !== version) {
      return null
    }

    const unlockedLevel = parseInteger(value.unlockedLevel, 1)
    const stars = parseStars(value.stars)
    const levelScores = parseLevelScores(value.levelScores)
    if (unlockedLevel === null || stars === null || levelScores === null) {
      return null
    }

    return {
      version,
      unlockedLevel,
      stars,
      levelScores,
      totalScore: safeProgressNumber(value.totalScore),
      highScore: safeProgressNumber(value.highScore),
      powerUps: sanitizePowerUps(value.powerUps),
    }
  }

  function parseSavedLevelSnapshot(value: unknown): Snapshot | null {
    if (!isRecord(value) || value.version !== version) {
      return null
    }

    const state = parseGameState(value.state)

    return state ? { version, state } : null
  }

  function defineProgressGameData(includeInventory: boolean, promoteLocal: boolean): GameDataDefinition {
    return defineGameData<Progress>({
      game,
      localStorageKey: progressKey,
      promoteLocal,
      parse: parseSavedProgress,
      encode: (progress) => {
        const slots: GameDataSlotInput[] = [{
          scope: 'profile',
          slot: 'default',
          data: {
            version,
            unlocked_level: progress.unlockedLevel,
            total_score: progress.totalScore,
            high_score: progress.highScore,
          },
        }]
        if (includeInventory) {
          slots.push({
            scope: 'profile',
            slot: 'inventory',
            data: { version, power_ups: progress.powerUps },
          })
        }
        slots.push(...[...new Set([...Object.keys(progress.stars), ...Object.keys(progress.levelScores)])]
          .map((level) => Number(level))
          .filter((level) => Number.isInteger(level) && level >= 1 && level <= totalLevels)
          .map((level) => ({
            scope: 'level' as const,
            slot: String(level),
            data: {
              version,
              stars: progress.stars[level] ?? 0,
              score: progress.levelScores[level] ?? 0,
            },
          })))

        return slots
      },
      decode: (rows) => {
        const profileRow = rows.get(definitionRowKey('profile', 'default'))
        const profile = profileRow?.data.version === version ? profileRow : undefined
        const inventoryRow = includeInventory ? rows.get(definitionRowKey('profile', 'inventory')) : undefined
        const inventory = inventoryRow?.data.version === version ? inventoryRow : undefined
        let unlockedLevel = parseInteger(profile?.data.unlocked_level, 1) ?? 1
        const stars: Record<number, number> = {}
        const levelScores: Record<number, number> = {}
        let found = Boolean(profile || inventory)

        for (let level = 1; level <= totalLevels; level += 1) {
          const row = rows.get(definitionRowKey('level', String(level)))
          if (row?.data.version !== version) {
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
          version,
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

  const progressGameData = defineProgressGameData(true, true)
  const snapshotGameData = defineGameData<Snapshot>({
    game,
    localStorageKey: snapshotKey,
    parse: parseSavedLevelSnapshot,
    encode: (snapshot) => [{
      scope: 'save',
      slot: 'autosave',
      data: snapshot as unknown as Record<string, unknown>,
    }],
    decode: (rows) => parseSavedLevelSnapshot(rows.get(definitionRowKey('save', 'autosave'))?.data),
    clearSlots: [{ scope: 'save', slot: 'autosave' }],
  })

  function loadProgress(storage: Pick<Storage, 'getItem'> | null = gameDataStorage()): Progress {
    if (!storage) {
      return createInitialProgress()
    }

    try {
      const raw = storage.getItem(progressKey)
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
  function recordWin(progress: Progress, state: State): Progress {
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
      version,
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

  function saveProgress(progress: Progress, storage: Pick<Storage, 'setItem'> | null = gameDataStorage()): void {
    if (!storage) {
      return
    }

    try {
      storage.setItem(progressKey, JSON.stringify(progress))
    } catch {
      // Persistence failures must not interrupt gameplay.
    }
  }

  function saveLevelSnapshot(state: State, storage: Pick<Storage, 'setItem'> | null = gameDataStorage()): void {
    if (!storage || state.completedLevel) {
      return
    }

    const snapshot: Snapshot = { version, state: cloneState(state) }
    try {
      storage.setItem(snapshotKey, JSON.stringify(snapshot))
    } catch {
      // Persistence failures must not interrupt gameplay.
    }
  }

  function loadLevelSnapshot(
    storage: Pick<Storage, 'getItem'> | null = gameDataStorage(),
    progress: Progress = loadProgress(storage),
  ): State | null {
    if (!storage) {
      return null
    }

    try {
      const raw = storage.getItem(snapshotKey)
      if (!raw) {
        return null
      }

      const parsed = JSON.parse(raw) as unknown
      if (!isRecord(parsed) || parsed.version !== version) {
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

  function clearLevelSnapshot(storage: Pick<Storage, 'removeItem'> | null = gameDataStorage()): void {
    try {
      storage?.removeItem(snapshotKey)
    } catch {
      // Persistence failures must not interrupt gameplay.
    }
  }

  return {
    progressGameData,
    /** Catalog reads never hydrate the inventory or promote a local save. */
    catalogGameData: defineProgressGameData(false, false),
    snapshotGameData,
    gameData: [progressGameData, snapshotGameData] as const,
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
  }
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
