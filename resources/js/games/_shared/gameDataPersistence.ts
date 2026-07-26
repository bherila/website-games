import { z } from 'zod'

import { fetchWrapper } from '@/fetchWrapper'

import { LAST_AUTHENTICATED_USER_KEY } from '../pwa/serviceWorkerPolicy'
import { safeLocalStorage } from './progressParsers'

export const DATABASE_GAME_SLUGS = [
  'chicks-challenge',
  'block-blaster',
  'marble-sort',
  'parking-pickup',
  'hover',
  'math-horde',
  '2048',
] as const

export type DatabaseGameSlug = (typeof DATABASE_GAME_SLUGS)[number]
export type GameDataScope = 'profile' | 'level' | 'save'
export type GameDataStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface GameDataSlotAddress {
  scope: GameDataScope
  slot: string
}

export interface GameDataSlotInput extends GameDataSlotAddress {
  data: Record<string, unknown>
}

interface GameDataRow extends GameDataSlotInput {
  game: DatabaseGameSlug
  isDeleted?: boolean
  revision: number
  updatedAt: string | null
}

interface TypedGameDataDefinition<T> {
  game: DatabaseGameSlug
  localStorageKey: string
  promoteLocal?: boolean
  parse: (value: unknown) => T | null
  encode: (value: T) => readonly GameDataSlotInput[]
  decode: (rows: ReadonlyMap<string, GameDataRow>) => T | null
  clearSlots?: readonly GameDataSlotAddress[]
}

export interface GameDataDefinition {
  game: DatabaseGameSlug
  localStorageKey: string
  promoteLocal: boolean
  parse: (value: unknown) => unknown | null
  encode: (value: unknown) => readonly GameDataSlotInput[]
  decode: (rows: ReadonlyMap<string, GameDataRow>) => unknown | null
  clearSlots: readonly GameDataSlotAddress[]
}

const gameDataScopeSchema = z.enum(['profile', 'level', 'save'])
const gameDataRowSchema = z.object({
  game: z.enum(DATABASE_GAME_SLUGS),
  scope: gameDataScopeSchema,
  slot: z.string(),
  data: z.record(z.string(), z.unknown()),
  is_deleted: z.boolean().default(false),
  revision: z.number().int().nonnegative(),
  updated_at: z.string().nullable(),
})
const gameDataIndexSchema = z.object({ data: z.array(gameDataRowSchema) })
const gameDataBatchResultSchema = z.object({
  action: z.enum(['put', 'delete']),
  scope: gameDataScopeSchema,
  slot: z.string(),
  status: z.enum(['saved', 'stale', 'superseded', 'deleted', 'missing']),
  row: gameDataRowSchema.nullable(),
})
const gameDataBatchSchema = z.object({ data: z.array(gameDataBatchResultSchema) })
const appAuthenticationSchema = z.object({
  authenticated: z.boolean().optional(),
  currentUser: z.object({ id: z.union([z.string(), z.number()]) }).nullable().optional(),
  pwaCachedShell: z.boolean().optional(),
})

type PersistenceMode = 'unresolved' | 'local' | 'server'
type SlotOperationInput = { type: 'put', slot: GameDataSlotInput } | { type: 'delete', slot: GameDataSlotAddress }
type SlotOperation = SlotOperationInput & {
  revision: number | null
  writerId: string | null
  writerSequence: number | null
}

interface QueuedBatch {
  order: number
  operations: SlotOperation[]
}

interface SlotWriteQueue {
  game: DatabaseGameSlug
  pending: SlotOperation[]
  failedBatches: QueuedBatch[]
  inFlightBatches: QueuedBatch[]
  timer: number | null
  running: Promise<void> | null
  detached: Set<Promise<void>>
  forceDrainRequested: boolean
  lastError: unknown | null
  retryDelayMs: number
}

const durableSlotOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('put'),
    slot: z.object({
      scope: gameDataScopeSchema,
      slot: z.string(),
      data: z.record(z.string(), z.unknown()),
    }),
    revision: z.number().int().nonnegative().nullable(),
    writerId: z.string().nullable(),
    writerSequence: z.number().int().positive().nullable(),
  }),
  z.object({
    type: z.literal('delete'),
    slot: z.object({
      scope: gameDataScopeSchema,
      slot: z.string(),
    }),
    revision: z.number().int().nonnegative().nullable(),
    writerId: z.string().nullable(),
    writerSequence: z.number().int().positive().nullable(),
  }),
])
const durableBatchSchema = z.object({
  order: z.number().int().positive(),
  operations: z.array(durableSlotOperationSchema),
})
const durableRowSchema = z.object({
  game: z.enum(DATABASE_GAME_SLUGS),
  scope: gameDataScopeSchema,
  slot: z.string(),
  data: z.record(z.string(), z.unknown()),
  isDeleted: z.boolean().default(false),
  revision: z.number().int().nonnegative(),
  updatedAt: z.string().nullable(),
})
const durableStateSchema = z.object({
  version: z.literal(1),
  memoryValues: z.record(z.string(), z.string()),
  serverRows: z.array(durableRowSchema),
  queues: z.array(z.object({
    game: z.enum(DATABASE_GAME_SLUGS),
    pending: z.array(durableSlotOperationSchema),
    failedBatches: z.array(durableBatchSchema),
  })),
  nextBatchOrder: z.number().int().positive(),
})

const definitions = new Map<string, GameDataDefinition>()
const initializedDefinitions = new Map<string, Promise<void>>()
const memoryValues = new Map<string, string>()
const serverRows = new Map<string, GameDataRow>()
const writeQueues = new Map<DatabaseGameSlug, SlotWriteQueue>()
const blockedSaveSlots = new Set<string>()

let mode: PersistenceMode = 'unresolved'
let serverRowsPromise: Promise<void> | null = null
let lifecycleListenersInstalled = false
let degradedServerMode = false
let activeShadowKey: string | null = null
let reconnectPromise: Promise<void> | null = null
let writerId = createWriterId()
let nextWriterSequence = 1
let nextBatchOrder = 1

const AUTOSAVE_DELAY_MS = 2_000
const KEEPALIVE_MAX_BYTES = 60_000
const GAME_DATA_SHADOW_PREFIX = 'bwh.games.server-state.v1.'

class AuthenticationRequiredError extends Error {}
class NetworkUnavailableError extends Error {
  public constructor(public readonly cause: unknown) {
    super('The game-data service is unavailable.')
  }
}
class GameDataResponseError extends Error {}

/**
 * Erases the generic type after validating all game-specific encode/decode
 * callbacks at their declaration site.
 */
export function defineGameData<T>(definition: TypedGameDataDefinition<T>): GameDataDefinition {
  return {
    ...definition,
    parse: definition.parse,
    encode: (value: unknown) => definition.encode(value as T),
    decode: definition.decode,
    clearSlots: definition.clearSlots ?? [],
    promoteLocal: definition.promoteLocal ?? true,
  }
}

/**
 * Hydrates the requested game bindings before React mounts. Anonymous play
 * continues to use the games' existing localStorage keys. Authenticated play
 * uses an account-scoped local shadow while offline and replays it through the
 * normal revision/writer queue after reconnecting.
 */
export async function initializeGameDataPersistence(requestedDefinitions: readonly GameDataDefinition[]): Promise<void> {
  for (const definition of requestedDefinitions) {
    const existing = definitions.get(definition.localStorageKey)
    if (existing && existing.game !== definition.game) {
      throw new Error(`Game data key ${definition.localStorageKey} is registered for multiple games.`)
    }
    definitions.set(definition.localStorageKey, definition)
  }

  if (mode === 'unresolved') {
    const authentication = readAuthenticationContext()
    mode = authentication.authenticated ? 'server' : 'local'
    activeShadowKey = authentication.accountId
      ? `${GAME_DATA_SHADOW_PREFIX}${encodeURIComponent(authentication.accountId)}`
      : null
    if (mode === 'server') {
      restoreDurableState()
    }
  }

  if (mode === 'local') {
    return
  }

  installLifecycleFlush()
  try {
    await loadServerRows(requestedDefinitions)
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      switchToAnonymousMode()

      return
    }

    if (error instanceof NetworkUnavailableError) {
      degradedServerMode = true
      initializeDegradedDefinitions(requestedDefinitions)
      persistDurableState()

      return
    }

    throw error
  }

  degradedServerMode = false
  await initializeDefinitions(requestedDefinitions)
  scheduleRestoredQueues()
  persistDurableState()
}

/** Storage facade consumed by the existing synchronous game parsers. */
export function gameDataStorage(): GameDataStorage | null {
  if (mode !== 'server') {
    return safeLocalStorage()
  }

  return serverStorage
}

/** Forces queued writes to complete; primarily useful for deterministic tests. */
export async function flushGameDataWrites(): Promise<void> {
  if (degradedServerMode && [...writeQueues.values()].some(queueHasWork)) {
    throw new Error('Game data is saved locally and waiting for a connection.')
  }

  while (true) {
    const queues = [...writeQueues.values()]
    for (const queue of queues) {
      if (queue.timer !== null) {
        window.clearTimeout(queue.timer)
        queue.timer = null
      }
      queue.forceDrainRequested = true
      startQueue(queue)
    }

    const running = queues.flatMap((queue) => [
      ...(queue.running ? [queue.running] : []),
      ...queue.detached,
    ])
    if (running.length > 0) {
      await Promise.all(running)
      const failed = queues.find((queue) => queue.lastError !== null)
      if (failed) {
        throw failed.lastError
      }
      continue
    }

    const failed = queues.find((queue) => queue.lastError !== null)
    if (failed) {
      throw failed.lastError
    }

    if (queues.every((queue) => (
      queue.pending.length === 0
      && queue.failedBatches.length === 0
      && queue.timer === null
      && queue.detached.size === 0
    ))) {
      return
    }
  }
}

/** Test-only reset for the module-level hydration and write caches. */
export function resetGameDataPersistenceForTests(): void {
  for (const queue of writeQueues.values()) {
    if (queue.timer !== null) {
      window.clearTimeout(queue.timer)
    }
  }

  definitions.clear()
  initializedDefinitions.clear()
  memoryValues.clear()
  serverRows.clear()
  writeQueues.clear()
  blockedSaveSlots.clear()
  removeLifecycleFlush()
  mode = 'unresolved'
  serverRowsPromise = null
  degradedServerMode = false
  activeShadowKey = null
  reconnectPromise = null
  writerId = createWriterId()
  nextWriterSequence = 1
  nextBatchOrder = 1
}

async function initializeDefinitions(requestedDefinitions: readonly GameDataDefinition[]): Promise<void> {
  const initializationPromises = new Set<Promise<void>>()
  const definitionsByGame = new Map<DatabaseGameSlug, GameDataDefinition[]>()
  const uniqueDefinitions = new Map(requestedDefinitions.map((definition) => [definition.localStorageKey, definition]))

  for (const definition of uniqueDefinitions.values()) {
    const existing = initializedDefinitions.get(definition.localStorageKey)
    if (existing) {
      initializationPromises.add(existing)
      continue
    }

    const gameDefinitions = definitionsByGame.get(definition.game) ?? []
    gameDefinitions.push(definition)
    definitionsByGame.set(definition.game, gameDefinitions)
  }

  for (const gameDefinitions of definitionsByGame.values()) {
    const hydration = hydrateGameDefinitions(gameDefinitions)
    const initialization = hydration.catch((error: unknown) => {
      for (const definition of gameDefinitions) {
        if (initializedDefinitions.get(definition.localStorageKey) === initialization) {
          initializedDefinitions.delete(definition.localStorageKey)
        }
      }

      throw error
    })

    for (const definition of gameDefinitions) {
      initializedDefinitions.set(definition.localStorageKey, initialization)
    }
    initializationPromises.add(initialization)
  }

  await Promise.all(initializationPromises)
}

async function hydrateGameDefinitions(gameDefinitions: readonly GameDataDefinition[]): Promise<void> {
  const localStorage = safeLocalStorage()
  const game = gameDefinitions[0]?.game
  if (!game) {
    return
  }

  const restoredQueue = writeQueues.get(game)
  const hasDurableWrites = restoredQueue ? queueHasWork(restoredQueue) : false
  const shadowValues = new Map<string, string>()
  if (hasDurableWrites) {
    for (const definition of gameDefinitions) {
      const shadowValue = memoryValues.get(definition.localStorageKey)
      if (shadowValue !== undefined) {
        shadowValues.set(definition.localStorageKey, shadowValue)
      }
    }
  }

  const localDefinitions: Array<{ definition: GameDataDefinition, value: unknown }> = []
  if (!hasDurableWrites) {
    for (const definition of gameDefinitions) {
      if (!definition.promoteLocal) {
        continue
      }

      const localRaw = readStorageValue(localStorage, definition.localStorageKey)
      const localValue = parseRawValue(definition, localRaw)

      if (localRaw !== null && localValue === null) {
        removeStorageValue(localStorage, definition.localStorageKey)
      } else if (localValue !== null) {
        localDefinitions.push({ definition, value: localValue })
      }
    }
  }

  const gameAlreadyHasServerData = hasServerStateForGame(game)
  const promotableSlots = coalesceSlotInputs(localDefinitions.flatMap(({ definition, value }) => (
    definition.encode(value).filter((slot) => {
      const existing = serverRows.get(rowKey(game, slot.scope, slot.slot))

      // Monotonic level/summary rows can always reconcile. Mutable inventory
      // and active saves migrate only when this game has no database state at
      // all; once any server row (including a tombstone) exists, the database
      // remains authoritative.
      if (slot.scope === 'level' || (slot.scope === 'profile' && slot.slot === 'default')) {
        return true
      }

      return !gameAlreadyHasServerData && !existing
    })
  )))

  // Progress, inventory, and active snapshot rows for one game migrate as a
  // single database batch. Local keys remain intact unless the entire batch
  // succeeds, preventing a failed snapshot write from being discarded after
  // its progress sibling has already reached the server.
  await promoteSlots(game, promotableSlots)
  for (const { definition } of localDefinitions) {
    removeStorageValue(localStorage, definition.localStorageKey)
  }

  const rows = rowsForGame(game)
  for (const definition of gameDefinitions) {
    const hydrated = definition.decode(rows)
    if (hydrated === null) {
      memoryValues.delete(definition.localStorageKey)
    } else {
      memoryValues.set(definition.localStorageKey, JSON.stringify(hydrated))
    }
  }

  for (const [key, value] of shadowValues) {
    memoryValues.set(key, value)
  }
}

function loadServerRows(requestedDefinitions: readonly GameDataDefinition[]): Promise<void> {
  if (serverRowsPromise) {
    return serverRowsPromise
  }

  serverRowsPromise = (async () => {
    const games = [...new Set(requestedDefinitions.map((definition) => definition.game))]
    const includesSaves = requestedDefinitions.some((definition) => (
      definition.clearSlots.some((slot) => slot.scope === 'save')
    ))
    const parameters = new URLSearchParams({ include_saves: includesSaves ? '1' : '0' })
    games.forEach((game) => parameters.append('games[]', game))

    let response: Response
    try {
      response = await fetchWrapper.getRaw(`/api/games/data?${parameters.toString()}`)
    } catch (error) {
      throw new NetworkUnavailableError(error)
    }
    if (response.status === 401) {
      throw new AuthenticationRequiredError('The game-data session has ended.')
    }
    if (!response.ok) {
      throw new GameDataResponseError(`Unable to load game data (${response.status}).`)
    }

    refreshCsrfToken(response)
    const parsed = gameDataIndexSchema.parse(await response.json())
    for (const [key, row] of serverRows) {
      if (games.includes(row.game)) {
        serverRows.delete(key)
      }
    }

    for (const row of parsed.data) {
      const normalized = normalizeRow(row)
      adoptLatestRow(rowKey(normalized.game, normalized.scope, normalized.slot), normalized)
    }
  })()

  return serverRowsPromise
}

const serverStorage: GameDataStorage = {
  getItem(key: string): string | null {
    return memoryValues.get(key) ?? null
  },

  setItem(key: string, rawValue: string): void {
    const definition = definitions.get(key)
    if (!definition) {
      throw new Error(`Unregistered authenticated game data key: ${key}`)
    }

    const value = parseRawValue(definition, rawValue)
    if (value === null) {
      throw new Error(`Invalid game data for ${definition.game}.`)
    }

    memoryValues.set(key, JSON.stringify(value))
    for (const slot of definition.encode(value)) {
      const existing = serverRows.get(rowKey(definition.game, slot.scope, slot.slot))
      if (!existing || !sameData(existing.data, slot.data)) {
        queueOperation(definition.game, { type: 'put', slot })
      }
    }
    persistDurableState()
  },

  removeItem(key: string): void {
    const definition = definitions.get(key)
    if (!definition) {
      throw new Error(`Unregistered authenticated game data key: ${key}`)
    }

    memoryValues.delete(key)
    for (const slot of definition.clearSlots) {
      queueOperation(definition.game, { type: 'delete', slot })
    }
    persistDurableState()
  },
}

function queueOperation(game: DatabaseGameSlug, operationInput: SlotOperationInput): void {
  const address = rowKey(game, operationInput.slot.scope, operationInput.slot.slot)
  if (
    (operationInput.slot.scope === 'save' && blockedSaveSlots.has(address))
    || (operationInput.slot.scope === 'profile'
      && operationInput.slot.slot === 'inventory'
      && hasBlockedSaveForGame(game))
  ) {
    return
  }

  const operation = createSlotOperation(game, operationInput)
  const queue = writeQueues.get(game) ?? {
    game,
    pending: [],
    failedBatches: [],
    inFlightBatches: [],
    timer: null,
    running: null,
    detached: new Set<Promise<void>>(),
    forceDrainRequested: false,
    lastError: null,
    retryDelayMs: 1_000,
  }
  const matchingIndex = queue.pending.findIndex((pending) => sameAddress(pending.slot, operation.slot))
  if (matchingIndex >= 0) {
    queue.pending.splice(matchingIndex, 1)
  }
  // Re-appending a replacement preserves call order. In particular, a win's
  // progress rows stay ahead of the autosave deletion that follows them.
  queue.pending.push(operation)
  writeQueues.set(game, queue)

  persistDurableState()
  scheduleQueue(queue)
}

function startQueue(queue: SlotWriteQueue): void {
  if (degradedServerMode || queue.running || !queueHasWork(queue)) {
    return
  }

  queue.running = (async () => {
    while (queueHasWork(queue)) {
      const batch = takeNextBatch(queue)
      queue.inFlightBatches.push(batch)
      persistDurableState()
      const autosaveOnly = batch.operations.every(isAutosavePut)

      try {
        await persistBatch(queue, batch.operations, canUseKeepalive(batch.operations))
        removeInFlightBatch(queue, batch)
        if (queue.failedBatches.length === 0) {
          queue.lastError = null
        }
        queue.retryDelayMs = 1_000
      } catch (error) {
        // The exact request must retry before newer pending state. If the
        // server committed this batch before its response was lost, its stable
        // writer sequence makes the retry idempotent.
        removeInFlightBatch(queue, batch)
        addFailedBatch(queue, batch)
        queue.lastError = error
        console.error('Unable to save game data.', error)
        break
      }
      persistDurableState()

      // A slow connection must not turn the autosave debounce into one request
      // per round trip. Newer autosaves wait for the normal delay after the
      // current autosave succeeds; progress and deletes continue immediately.
      if (
        autosaveOnly
        && !queue.forceDrainRequested
        && queue.failedBatches.length === 0
        && queue.pending.length > 0
        && queue.pending.every(isAutosavePut)
      ) {
        break
      }
    }
  })().finally(() => {
    queue.running = null
    if (!queueHasWork(queue)) {
      queue.forceDrainRequested = false
    }
    refreshMemoryWhenSettled(queue)
    persistDurableState()
    scheduleQueue(queue)
  })
}

function startDetachedPending(queue: SlotWriteQueue): void {
  if (queue.pending.length === 0) {
    return
  }

  const batch = createBatch(queue.pending.splice(0))
  queue.inFlightBatches.push(batch)
  persistDurableState()
  const detached = persistBatch(queue, batch.operations, canUseKeepalive(batch.operations))
    .then(() => {
      removeInFlightBatch(queue, batch)
      if (queue.failedBatches.length === 0) {
        queue.lastError = null
      }
      queue.retryDelayMs = 1_000
    })
    .catch((error: unknown) => {
      removeInFlightBatch(queue, batch)
      addFailedBatch(queue, batch)
      queue.lastError = error
      console.error('Unable to save game data.', error)
    })
    .finally(() => {
      queue.detached.delete(detached)
      refreshMemoryWhenSettled(queue)
      persistDurableState()
      scheduleQueue(queue)
    })

  queue.detached.add(detached)
}

async function persistBatch(
  queue: SlotWriteQueue,
  operations: readonly SlotOperation[],
  keepalive: boolean,
): Promise<void> {
  const body = { operations: operations.map(toBatchPayload) }
  const response: unknown = keepalive
    ? await fetchWrapper.put(`/api/games/${encodeURIComponent(queue.game)}/data`, body, { keepalive: true })
    : await fetchWrapper.put(`/api/games/${encodeURIComponent(queue.game)}/data`, body)
  const parsed = gameDataBatchSchema.parse(response)
  if (parsed.data.length !== operations.length) {
    throw new Error('The game data API returned an incomplete batch result.')
  }

  parsed.data.forEach((result, index) => {
    const operation = operations[index]
    if (!operation || !sameAddress(operation.slot, result)) {
      throw new Error('The game data API returned batch results out of order.')
    }

    const key = rowKey(queue.game, result.scope, result.slot)
    if (result.status === 'stale') {
      if (
        operation.type === 'put'
        && operation.slot.scope !== 'save'
        && result.row
        && !result.row.is_deleted
        && sameData(result.row.data, operation.slot.data)
      ) {
        const normalized = normalizeRow(result.row)
        const latest = adoptLatestRow(key, normalized)
        advancePendingRevision(queue, result, operation.revision, latest.revision)

        return
      }

      if (result.row) {
        adoptLatestRow(key, normalizeRow(result.row))
      }

      if (result.scope === 'save') {
        blockedSaveSlots.add(key)
        purgeOperationsAfterSaveConflict(queue, result)
        window.dispatchEvent(new CustomEvent('game-data-conflict', {
          detail: { game: queue.game, scope: result.scope, slot: result.slot },
        }))
      }

      return
    }

    if (result.status === 'superseded') {
      if (result.row) {
        const latest = adoptLatestRow(key, normalizeRow(result.row))
        advancePendingRevision(queue, result, operation.revision, latest.revision)
      }

      return
    }

    if (result.status === 'deleted' || result.status === 'missing') {
      if (result.row) {
        const latest = adoptLatestRow(key, normalizeRow(result.row))
        advancePendingRevision(queue, result, operation.revision, latest.revision)
      } else {
        const existing = serverRows.get(key)
        if (!existing || existing.revision === operation.revision) {
          serverRows.delete(key)
        }
        resetPendingRevision(queue, result, operation.revision)
      }

      return
    }

    if (!result.row) {
      throw new Error('The game data API omitted a saved row.')
    }

    const normalized = normalizeRow(result.row)
    const latest = adoptLatestRow(key, normalized)
    advancePendingRevision(queue, result, operation.revision, latest.revision)
  })
}

function advancePendingRevision(
  queue: SlotWriteQueue,
  address: GameDataSlotAddress,
  previousRevision: number | null,
  nextRevision: number,
): void {
  for (const pending of queue.pending) {
    if (sameAddress(pending.slot, address) && pending.revision === previousRevision) {
      pending.revision = nextRevision
    }
  }
}

function resetPendingRevision(
  queue: SlotWriteQueue,
  address: GameDataSlotAddress,
  previousRevision: number | null,
): void {
  for (const pending of queue.pending) {
    if (sameAddress(pending.slot, address) && pending.revision === previousRevision) {
      pending.revision = null
    }
  }
}

function coalesceSlotInputs(slots: readonly GameDataSlotInput[]): GameDataSlotInput[] {
  const coalesced = new Map<string, GameDataSlotInput>()
  for (const slot of slots) {
    const key = definitionRowKey(slot.scope, slot.slot)
    if (coalesced.has(key)) {
      coalesced.delete(key)
    }
    coalesced.set(key, slot)
  }

  return [...coalesced.values()]
}

async function promoteSlots(game: DatabaseGameSlug, slots: readonly GameDataSlotInput[]): Promise<void> {
  if (slots.length === 0) {
    return
  }

  const queue: SlotWriteQueue = {
    game,
    pending: [],
    failedBatches: [],
    inFlightBatches: [],
    timer: null,
    running: null,
    detached: new Set<Promise<void>>(),
    forceDrainRequested: false,
    lastError: null,
    retryDelayMs: 1_000,
  }
  const operations = slots.map((slot) => createSlotOperation(game, { type: 'put', slot }))
  await persistBatch(queue, operations, false)

  const conflict = operations.find((operation) => blockedSaveSlots.has(rowKey(game, operation.slot.scope, operation.slot.slot)))
  if (conflict) {
    throw new Error(`The ${game} ${conflict.slot.scope}/${conflict.slot.slot} row changed before it could be promoted.`)
  }
}

function toBatchPayload(operation: SlotOperation) {
  return {
    action: operation.type,
    scope: operation.slot.scope,
    slot: operation.slot.slot,
    revision: operation.revision,
    ...(operation.writerId && operation.writerSequence !== null ? {
      writer_id: operation.writerId,
      writer_sequence: operation.writerSequence,
    } : {}),
    ...(operation.type === 'put' ? { data: operation.slot.data } : {}),
  }
}

function createSlotOperation(game: DatabaseGameSlug, operationInput: SlotOperationInput): SlotOperation {
  const isSave = operationInput.slot.scope === 'save'

  return {
    ...operationInput,
    revision: serverRows.get(rowKey(game, operationInput.slot.scope, operationInput.slot.slot))?.revision ?? null,
    writerId: isSave ? writerId : null,
    writerSequence: isSave ? nextWriterSequence++ : null,
  }
}

function createBatch(operations: SlotOperation[]): QueuedBatch {
  return { order: nextBatchOrder++, operations }
}

function takeNextBatch(queue: SlotWriteQueue): QueuedBatch {
  const failed = queue.failedBatches.shift()
  if (failed) {
    return failed
  }

  return createBatch(queue.pending.splice(0))
}

function addFailedBatch(queue: SlotWriteQueue, batch: QueuedBatch): void {
  if (queue.failedBatches.some((failed) => failed.order === batch.order)) {
    return
  }

  queue.failedBatches.push(batch)
  queue.failedBatches.sort((left, right) => left.order - right.order)
}

function removeInFlightBatch(queue: SlotWriteQueue, batch: QueuedBatch): void {
  queue.inFlightBatches = queue.inFlightBatches.filter((candidate) => candidate.order !== batch.order)
}

function queueHasWork(queue: SlotWriteQueue): boolean {
  return queue.failedBatches.length > 0 || queue.pending.length > 0
}

function scheduleQueue(queue: SlotWriteQueue): void {
  if (degradedServerMode || queue.running || queue.detached.size > 0 || !queueHasWork(queue)) {
    return
  }

  const hasFailedBatch = queue.failedBatches.length > 0
  const delay = hasFailedBatch
    ? queue.retryDelayMs
    : queue.pending.every(isAutosavePut) ? AUTOSAVE_DELAY_MS : 0

  if (queue.timer !== null) {
    if (delay !== 0) {
      return
    }
    window.clearTimeout(queue.timer)
  }

  queue.timer = window.setTimeout(() => {
    queue.timer = null
    startQueue(queue)
  }, delay)

  if (hasFailedBatch) {
    queue.retryDelayMs = Math.min(queue.retryDelayMs * 2, 30_000)
  }
}

function refreshMemoryWhenSettled(queue: SlotWriteQueue): void {
  if (
    !queue.running
    && queue.detached.size === 0
    && !queueHasWork(queue)
    && queue.lastError === null
  ) {
    refreshMemoryForGame(queue.game)
    const localStorage = safeLocalStorage()
    for (const definition of definitions.values()) {
      if (definition.game === queue.game) {
        removeStorageValue(localStorage, definition.localStorageKey)
      }
    }
  }
}

function installLifecycleFlush(): void {
  if (lifecycleListenersInstalled) {
    return
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('pagehide', flushPendingWritesNow)
  window.addEventListener('online', handleOnline)
  lifecycleListenersInstalled = true
}

function removeLifecycleFlush(): void {
  if (!lifecycleListenersInstalled) {
    return
  }

  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('pagehide', flushPendingWritesNow)
  window.removeEventListener('online', handleOnline)
  lifecycleListenersInstalled = false
}

function handleVisibilityChange(): void {
  if (document.visibilityState === 'hidden') {
    flushPendingWritesNow()
  }
}

function flushPendingWritesNow(): void {
  if (degradedServerMode) {
    persistDurableState()

    return
  }

  for (const queue of writeQueues.values()) {
    if (queue.timer !== null) {
      window.clearTimeout(queue.timer)
      queue.timer = null
    }
    queue.forceDrainRequested = true
    if (queue.running || queue.detached.size > 0) {
      startDetachedPending(queue)
    } else {
      startQueue(queue)
      startDetachedPending(queue)
    }
  }
}

function handleOnline(): void {
  void reconnectServerMode()
}

function isAutosavePut(operation: SlotOperation): boolean {
  return operation.type === 'put' && operation.slot.scope === 'save'
}

function sameAddress(left: GameDataSlotAddress, right: GameDataSlotAddress): boolean {
  return left.scope === right.scope && left.slot === right.slot
}

function hasBlockedSaveForGame(game: DatabaseGameSlug): boolean {
  const prefix = `${game}\u0000save\u0000`

  return [...blockedSaveSlots].some((key) => key.startsWith(prefix))
}

function purgeOperationsAfterSaveConflict(queue: SlotWriteQueue, address: GameDataSlotAddress): void {
  const shouldKeep = (operation: SlotOperation): boolean => (
    !sameAddress(operation.slot, address)
    && !(operation.slot.scope === 'profile' && operation.slot.slot === 'inventory')
  )

  queue.pending = queue.pending.filter(shouldKeep)
  queue.failedBatches = queue.failedBatches
    .map((batch) => ({ ...batch, operations: batch.operations.filter(shouldKeep) }))
    .filter((batch) => batch.operations.length > 0)
}

function canUseKeepalive(operations: readonly SlotOperation[]): boolean {
  return new Blob([JSON.stringify({ operations: operations.map(toBatchPayload) })]).size <= KEEPALIVE_MAX_BYTES
}

function readAuthenticationContext(): { authenticated: boolean, accountId: string | null } {
  const localStorage = safeLocalStorage()

  try {
    const script = document.getElementById('app-initial-data')
    const raw: unknown = script?.textContent ? JSON.parse(script.textContent) : null
    const parsed = appAuthenticationSchema.safeParse(raw)
    if (!parsed.success) {
      return { authenticated: false, accountId: null }
    }

    if (parsed.data.pwaCachedShell) {
      const cachedAccountId = readStorageValue(localStorage, LAST_AUTHENTICATED_USER_KEY)

      return { authenticated: cachedAccountId !== null, accountId: cachedAccountId }
    }

    if (parsed.data.authenticated === true) {
      const accountId = parsed.data.currentUser?.id !== undefined
        ? String(parsed.data.currentUser.id)
        : 'authenticated'
      writeStorageValue(localStorage, LAST_AUTHENTICATED_USER_KEY, accountId)

      return { authenticated: true, accountId }
    }

    removeStorageValue(localStorage, LAST_AUTHENTICATED_USER_KEY)

    return { authenticated: false, accountId: null }
  } catch {
    return { authenticated: false, accountId: null }
  }
}

function initializeDegradedDefinitions(requestedDefinitions: readonly GameDataDefinition[]): void {
  const localStorage = safeLocalStorage()
  for (const definition of new Map(
    requestedDefinitions.map((definition) => [definition.localStorageKey, definition]),
  ).values()) {
    const shadowValue = parseRawValue(definition, memoryValues.get(definition.localStorageKey) ?? null)
    if (shadowValue !== null) {
      memoryValues.set(definition.localStorageKey, JSON.stringify(shadowValue))
      initializedDefinitions.set(definition.localStorageKey, Promise.resolve())
      continue
    }

    const localValue = parseRawValue(
      definition,
      readStorageValue(localStorage, definition.localStorageKey),
    )
    if (localValue !== null) {
      memoryValues.set(definition.localStorageKey, JSON.stringify(localValue))
    }
    initializedDefinitions.set(definition.localStorageKey, Promise.resolve())
  }
}

async function reconnectServerMode(): Promise<void> {
  if (mode !== 'server' || !degradedServerMode || reconnectPromise) {
    return reconnectPromise ?? Promise.resolve()
  }

  reconnectPromise = (async () => {
    serverRowsPromise = null
    try {
      await loadServerRows([...definitions.values()])
      degradedServerMode = false
      initializedDefinitions.clear()
      await initializeDefinitions([...definitions.values()])
      scheduleRestoredQueues()
      persistDurableState()
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        switchToAnonymousMode()

        return
      }
      if (!(error instanceof NetworkUnavailableError)) {
        console.error('Unable to reconcile offline game data.', error)
      }
    }
  })().finally(() => {
    reconnectPromise = null
  })

  return reconnectPromise
}

function switchToAnonymousMode(): void {
  const localStorage = safeLocalStorage()
  for (const definition of definitions.values()) {
    const value = memoryValues.get(definition.localStorageKey)
    if (value !== undefined) {
      writeStorageValue(localStorage, definition.localStorageKey, value)
    }
  }

  for (const queue of writeQueues.values()) {
    if (queue.timer !== null) {
      window.clearTimeout(queue.timer)
    }
  }
  if (activeShadowKey) {
    removeStorageValue(localStorage, activeShadowKey)
  }
  removeStorageValue(localStorage, LAST_AUTHENTICATED_USER_KEY)
  writeQueues.clear()
  serverRows.clear()
  memoryValues.clear()
  initializedDefinitions.clear()
  blockedSaveSlots.clear()
  mode = 'local'
  degradedServerMode = false
  activeShadowKey = null
  serverRowsPromise = null
  removeLifecycleFlush()
}

function restoreDurableState(): void {
  if (!activeShadowKey) {
    return
  }

  const raw = readStorageValue(safeLocalStorage(), activeShadowKey)
  if (raw === null) {
    return
  }

  try {
    const parsed = durableStateSchema.parse(JSON.parse(raw))
    for (const [key, value] of Object.entries(parsed.memoryValues)) {
      memoryValues.set(key, value)
    }
    for (const row of parsed.serverRows) {
      serverRows.set(rowKey(row.game, row.scope, row.slot), row)
    }
    for (const persistedQueue of parsed.queues) {
      const failedBatches = [...persistedQueue.failedBatches]
        .sort((left, right) => left.order - right.order)
      writeQueues.set(persistedQueue.game, {
        game: persistedQueue.game,
        pending: [...persistedQueue.pending],
        failedBatches,
        inFlightBatches: [],
        timer: null,
        running: null,
        detached: new Set<Promise<void>>(),
        forceDrainRequested: false,
        lastError: null,
        retryDelayMs: 1_000,
      })
    }
    const highestBatchOrder = parsed.queues.flatMap((queue) => queue.failedBatches)
      .reduce((highest, batch) => Math.max(highest, batch.order), 0)
    nextBatchOrder = Math.max(parsed.nextBatchOrder, highestBatchOrder + 1)
  } catch {
    removeStorageValue(safeLocalStorage(), activeShadowKey)
  }
}

function persistDurableState(): void {
  if (mode !== 'server' || !activeShadowKey) {
    return
  }

  const queues = [...writeQueues.values()].map((queue) => {
    const durableBatches = new Map<number, QueuedBatch>()
    for (const batch of [...queue.failedBatches, ...queue.inFlightBatches]) {
      durableBatches.set(batch.order, batch)
    }

    return {
      game: queue.game,
      pending: queue.pending,
      failedBatches: [...durableBatches.values()].sort((left, right) => left.order - right.order),
    }
  })
  const state: z.input<typeof durableStateSchema> = {
    version: 1,
    memoryValues: Object.fromEntries(memoryValues),
    serverRows: [...serverRows.values()],
    queues,
    nextBatchOrder,
  }
  writeStorageValue(safeLocalStorage(), activeShadowKey, JSON.stringify(state))
}

function scheduleRestoredQueues(): void {
  for (const queue of writeQueues.values()) {
    scheduleQueue(queue)
  }
}

function refreshCsrfToken(response: Response): void {
  const token = response.headers.get('X-CSRF-TOKEN')
  if (!token) {
    return
  }

  document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
    ?.setAttribute('content', token)
}

function parseRawValue(definition: GameDataDefinition, rawValue: string | null): unknown | null {
  if (rawValue === null) {
    return null
  }

  try {
    return definition.parse(JSON.parse(rawValue))
  } catch {
    return null
  }
}

function readStorageValue(storage: GameDataStorage | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function removeStorageValue(storage: GameDataStorage | null, key: string): void {
  try {
    storage?.removeItem(key)
  } catch {
    // A failed cleanup is safe: hydration will retry it on the next page load.
  }
}

function writeStorageValue(storage: GameDataStorage | null, key: string, value: string): void {
  try {
    storage?.setItem(key, value)
  } catch {
    // Storage can be unavailable in privacy modes; in-memory play still works.
  }
}

function normalizeRow(row: z.infer<typeof gameDataRowSchema>): GameDataRow {
  return {
    game: row.game,
    scope: row.scope,
    slot: row.slot,
    data: row.data,
    isDeleted: row.is_deleted,
    revision: row.revision,
    updatedAt: row.updated_at,
  }
}

function adoptLatestRow(key: string, candidate: GameDataRow): GameDataRow {
  const existing = serverRows.get(key)
  if (!existing || candidate.revision >= existing.revision) {
    serverRows.set(key, candidate)

    return candidate
  }

  return existing
}

function rowKey(game: DatabaseGameSlug, scope: GameDataScope, slot: string): string {
  return `${game}\u0000${scope}\u0000${slot}`
}

export function definitionRowKey(scope: GameDataScope, slot: string): string {
  return `${scope}\u0000${slot}`
}

function rowsForGame(game: DatabaseGameSlug): ReadonlyMap<string, GameDataRow> {
  const rows = new Map<string, GameDataRow>()
  for (const row of serverRows.values()) {
    if (row.game === game && !row.isDeleted) {
      rows.set(definitionRowKey(row.scope, row.slot), row)
    }
  }

  return rows
}

function hasServerStateForGame(game: DatabaseGameSlug): boolean {
  return [...serverRows.values()].some((row) => row.game === game)
}

function refreshMemoryForGame(game: DatabaseGameSlug): void {
  const rows = rowsForGame(game)
  for (const definition of definitions.values()) {
    if (definition.game !== game) {
      continue
    }
    if (definition.clearSlots.some((slot) => blockedSaveSlots.has(rowKey(game, slot.scope, slot.slot)))) {
      continue
    }

    const value = definition.decode(rows)
    if (value === null) {
      memoryValues.delete(definition.localStorageKey)
    } else {
      memoryValues.set(definition.localStorageKey, JSON.stringify(value))
    }
  }
}

function sameData(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (value === null || typeof value !== 'object') {
    return value
  }

  const record = value as Record<string, unknown>

  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalize(record[key])]),
  )
}

function createWriterId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
