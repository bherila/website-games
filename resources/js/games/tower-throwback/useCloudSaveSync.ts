/**
 * React glue between the engine's local save flow and the best-effort cloud
 * mirror in `cloudSync.ts`. localStorage stays authoritative; this hook only
 * shadows writes to the server, exposes per-slot cloud status for the load
 * screen, and drives the lease take-over / read-only flows. Nothing here ever
 * blocks gameplay — every network path is fire-and-forget or swallowed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'

import { safeLocalStorage } from '../_shared/progressParsers'
import { CLOUD_ENVELOPE_WIRE_VERSION, decodeCloudPayload, encodeCloudPayload } from './cloudPayload'
import {
  acquireLease,
  type CloudDeletionStatus,
  type CloudLeaseConflict,
  type CloudSlotMeta,
  type CloudSlotStatus,
  type CloudSlotView,
  deleteCloudSlot,
  getCloudSlot,
  isCloudSyncEnabled,
  listCloudSlots,
  pushCloudSlot,
} from './cloudSync'
import { getOrCreateTabSessionId, importSandbox, isSandboxSlotEmpty, loadSandbox, migrateSandboxPayload, readSandboxSlotStorage, type SavedSandbox } from './gameProgress'
import { SANDBOX_SLOT_IDS, type SandboxSlotId } from './gameTypes'
import { fitsCloudBudget } from './saveBudget'

type Phase = 'checking' | 'ready' | 'offline'

export interface CloudSaveSync {
  enabled: boolean
  slots: Record<SandboxSlotId, CloudSlotView>
  /** Acquire/renew the lease when a slot is opened for play. */
  openSlot: (slotId: SandboxSlotId) => void
  /** Mirror a local save to the cloud, extending the lease. */
  pushSlot: (slotId: SandboxSlotId, saved: SavedSandbox) => void
  /** Take a lease over from another device (force acquire). */
  takeOver: (slotId: SandboxSlotId) => Promise<boolean>
  /** Pull a cloud save down into the local slot; returns the restored save. */
  restore: (slotId: SandboxSlotId) => Promise<SavedSandbox | null>
  /** Drop the cloud copy of a slot (mirrors a local clear). */
  remove: (slotId: SandboxSlotId) => Promise<boolean>
  /** Re-fetch cloud slot metadata. */
  refresh: () => void
  /** Mirror the current local slot after a failure or remote change. */
  retry: (slotId: SandboxSlotId) => void
}

/**
 * The result of the latest mirror attempt, paired with the digest of the save
 * it applied to. Pairing matters: an outcome recorded against an older save
 * must not be read as describing the current one.
 */
type PushOutcome =
  | { kind: 'idle' | 'pushing' | 'failed' | 'tooLarge'; digest: string }
  | {
      kind: 'pushed'
      digest: string
      /** Server revision proven equal to `digest` by a successful push/restore. */
      cloudUpdatedAt: string | null
    }

const persistedPushOutcomeSchema = z.object({
  kind: z.enum(['pushed', 'failed', 'tooLarge']),
  digest: z.string(),
  cloudUpdatedAt: z.string().nullable().optional(),
})
type PersistedPushOutcome = z.infer<typeof persistedPushOutcomeSchema>

const PERSISTED_OUTCOMES_KEY = 'towerThrowback.cloudSync.v1'

function loadPersistedOutcomes(): Partial<Record<SandboxSlotId, PushOutcome>> {
  const storage = safeLocalStorage()
  if (!storage) {
    return {}
  }
  try {
    const raw = storage.getItem(PERSISTED_OUTCOMES_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (typeof parsed !== 'object' || parsed === null) {
      return {}
    }

    const outcomes: Partial<Record<SandboxSlotId, PushOutcome>> = {}
    for (const slotId of SANDBOX_SLOT_IDS) {
      const result = persistedPushOutcomeSchema.safeParse((parsed as Record<string, unknown>)[slotId])
      if (result.success) {
        outcomes[slotId] =
          result.data.kind === 'pushed'
            ? { kind: 'pushed', digest: result.data.digest, cloudUpdatedAt: result.data.cloudUpdatedAt ?? null }
            : { kind: result.data.kind, digest: result.data.digest }
      }
    }

    return outcomes
  } catch {
    return {}
  }
}

function persistOutcomes(outcomes: Partial<Record<SandboxSlotId, PushOutcome>>): void {
  const storage = safeLocalStorage()
  if (!storage) {
    return
  }
  try {
    const persisted: Partial<Record<SandboxSlotId, PersistedPushOutcome>> = {}
    for (const slotId of SANDBOX_SLOT_IDS) {
      const outcome = outcomes[slotId]
      if (outcome && outcome.kind !== 'idle' && outcome.kind !== 'pushing') {
        persisted[slotId] =
          outcome.kind === 'pushed'
            ? { kind: 'pushed', digest: outcome.digest, cloudUpdatedAt: outcome.cloudUpdatedAt }
            : { kind: outcome.kind, digest: outcome.digest }
      }
    }
    storage.setItem(PERSISTED_OUTCOMES_KEY, JSON.stringify(persisted))
  } catch {
    // Cloud status history is advisory; a blocked/full localStorage must not
    // interfere with the authoritative local save.
  }
}

/**
 * Cheap content digest (FNV-1a) over the serialized save. Only ever compared
 * for equality against another digest produced here, so collision resistance is
 * not a security property — it just has to distinguish "this exact save was
 * mirrored" from "the local save has moved on since".
 */
function saveDigest(serialized: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < serialized.length; i++) {
    hash ^= serialized.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return `${serialized.length.toString(36)}:${hash.toString(36)}`
}

function localDigests(savedSlots: ReadonlySet<SandboxSlotId>): Partial<Record<SandboxSlotId, string>> {
  const digests: Partial<Record<SandboxSlotId, string>> = {}
  for (const slotId of savedSlots) {
    const saved = loadSandbox(slotId)
    if (saved) {
      digests[slotId] = saveDigest(JSON.stringify(saved))
    }
  }

  return digests
}

function population(saved: SavedSandbox): number {
  return saved.units.reduce(
    (sum, unit) => sum + unit.population.low + unit.population.med + unit.population.high + unit.population.vip,
    0,
  )
}

export function useCloudSaveSync(localSavedSlots: ReadonlySet<SandboxSlotId>): CloudSaveSync {
  const [enabled] = useState<boolean>(() => isCloudSyncEnabled())

  const [phase, setPhase] = useState<Phase>(enabled ? 'checking' : 'offline')
  const [meta, setMeta] = useState<Partial<Record<SandboxSlotId, CloudSlotMeta>>>({})
  const [conflicts, setConflicts] = useState<Partial<Record<SandboxSlotId, CloudLeaseConflict>>>({})

  const [deletions, setDeletions] = useState<Partial<Record<SandboxSlotId, CloudDeletionStatus>>>({})
  const deleteIntentRef = useRef<Partial<Record<SandboxSlotId, number>>>({})
  const deleteFenceRef = useRef<Partial<Record<SandboxSlotId, number>>>({})
  const deletingRef = useRef<Partial<Record<SandboxSlotId, { attempt: number; promise: Promise<boolean> }>>>({})

  const tokensRef = useRef<Partial<Record<SandboxSlotId, string>>>({})
  const readOnlyRef = useRef<Set<SandboxSlotId>>(new Set())
  /** Digest of the newest LOCAL save we have seen for each slot. */
  const [local, setLocal] = useState<Partial<Record<SandboxSlotId, string>>>(() => localDigests(localSavedSlots))
  /** What happened to the most recent mirror attempt for each slot. */
  const [outcomes, setOutcomes] = useState<Partial<Record<SandboxSlotId, PushOutcome>>>(loadPersistedOutcomes)
  /** Invalidates completions from older overlapping pushes for the same slot. */
  const pushAttemptRef = useRef<Partial<Record<SandboxSlotId, number>>>({})

  const setOutcome = useCallback((slotId: SandboxSlotId, outcome: PushOutcome | null) => {
    setOutcomes((prev) => {
      const next = { ...prev }
      if (outcome === null) {
        delete next[slotId]
      } else {
        next[slotId] = outcome
      }
      persistOutcomes(next)
      return next
    })
  }, [])

  const applyMeta = useCallback((slotId: SandboxSlotId, next: CloudSlotMeta) => {
    setMeta((prev) => ({ ...prev, [slotId]: next }))
  }, [])

  const markConflict = useCallback((slotId: SandboxSlotId, conflict: CloudLeaseConflict) => {
    readOnlyRef.current.add(slotId)
    delete tokensRef.current[slotId]
    setConflicts((prev) => ({ ...prev, [slotId]: conflict }))
  }, [])

  const clearConflict = useCallback((slotId: SandboxSlotId) => {
    readOnlyRef.current.delete(slotId)
    setConflicts((prev) => {
      if (!(slotId in prev)) {
        return prev
      }
      const next = { ...prev }
      delete next[slotId]
      return next
    })
  }, [])

  const refresh = useCallback(() => {
    if (!enabled) {
      return
    }
    void (async () => {
      const attempts = { ...pushAttemptRef.current }
      const rows = await listCloudSlots()
      if (rows === null) {
        setPhase('offline')
        return
      }
      const byId: Partial<Record<SandboxSlotId, CloudSlotMeta>> = {}
      for (const row of rows) {
        if ((SANDBOX_SLOT_IDS as readonly string[]).includes(row.slot)) {
          byId[row.slot as SandboxSlotId] = row
        }
      }
      setMeta((prev) => {
        const next = { ...prev }
        for (const slot of SANDBOX_SLOT_IDS) {
          if (attempts[slot] !== pushAttemptRef.current[slot]) continue
          if (byId[slot]) next[slot] = byId[slot]
          else delete next[slot]
        }
        return next
      })
      setDeletions((prev) => {
        const next = { ...prev }
        for (const slot of SANDBOX_SLOT_IDS) {
          if (attempts[slot] === pushAttemptRef.current[slot] && byId[slot]?.saved && next[slot] === 'deleted') next[slot] = 'idle'
        }
        return next
      })
      setPhase('ready')
    })()
  }, [enabled])

  useEffect(() => {
    refresh()
  }, [refresh])

  const ensureLease = useCallback(async (slotId: SandboxSlotId): Promise<string | null> => {
    const existing = tokensRef.current[slotId]
    if (existing) {
      return existing
    }
    const fence = deleteFenceRef.current[slotId]
    const result = await acquireLease(slotId, { token: existing ?? null })
    if (fence !== deleteFenceRef.current[slotId]) return null
    if (result.ok) {
      tokensRef.current[slotId] = result.token
      clearConflict(slotId)
      applyMeta(slotId, result.meta)
      return result.token
    }
    if (result.reason === 'conflict') {
      markConflict(slotId, result.conflict)
    }
    return null
  }, [applyMeta, clearConflict, markConflict])

  const openSlot = useCallback((slotId: SandboxSlotId) => {
    if (!enabled) {
      return
    }
    void ensureLease(slotId)
  }, [enabled, ensureLease])

  const pushSlot = useCallback((slotId: SandboxSlotId, saved: SavedSandbox) => {
    if (!enabled) return
    deleteIntentRef.current[slotId] = (deleteIntentRef.current[slotId] ?? 0) + 1
    setDeletions((prev) => ({ ...prev, [slotId]: 'idle' }))
    if (readOnlyRef.current.has(slotId)) return
    const serialized = JSON.stringify(saved)
    const digest = saveDigest(serialized)
    const attempt = (pushAttemptRef.current[slotId] ?? 0) + 1
    pushAttemptRef.current[slotId] = attempt
    // Record what the LOCAL copy is before attempting anything, so a failed or
    // in-flight push can be reported against the save the player actually has.
    setLocal((prev) => ({ ...prev, [slotId]: digest }))

    // The cloud copy is the compressed v3 envelope; the budget applies to what
    // the server stores, so measure the envelope, not the raw save.
    const envelope = encodeCloudPayload(serialized)
    if (!fitsCloudBudget(JSON.stringify(envelope))) {
      // Predict the server's rejection rather than firing a request that will
      // 422 and then be swallowed. The local save is already written and safe.
      setOutcome(slotId, { kind: 'tooLarge', digest })
      return
    }

    setOutcome(slotId, { kind: 'pushing', digest })

    void (async () => {
      const token = await ensureLease(slotId)
      if (pushAttemptRef.current[slotId] !== attempt) {
        return
      }
      if (token === null) {
        // No lease: either a conflict (already marked) or the server is away.
        setOutcome(slotId, { kind: readOnlyRef.current.has(slotId) ? 'idle' : 'failed', digest })
        return
      }
      const result = await pushCloudSlot({
        slot: slotId,
        payload: envelope,
        wireVersion: CLOUD_ENVELOPE_WIRE_VERSION,
        token,
        game_day: saved.clock.day,
        star: saved.star,
        population: population(saved),
        funds: saved.funds,
      })
      if (pushAttemptRef.current[slotId] !== attempt) {
        return
      }
      if (result.ok) {
        tokensRef.current[slotId] = result.token
        applyMeta(slotId, result.meta)
        setPhase('ready')
        setOutcome(slotId, { kind: 'pushed', digest, cloudUpdatedAt: result.meta.updated_at })
        return
      }
      if (result.reason === 'conflict') {
        markConflict(slotId, result.conflict)
        setOutcome(slotId, { kind: 'idle', digest })
        return
      }
      // Previously swallowed: local storage still holds the authoritative copy,
      // but the player deserves to know the mirror is behind and retryable.
      setOutcome(slotId, { kind: 'failed', digest })
    })()
  }, [applyMeta, enabled, ensureLease, markConflict, setOutcome])

  /** Retry only the authoritative local copy. A cached payload can belong to
   * a tower that was replaced, restored, or cleared since the failed push. */
  const retry = useCallback((slotId: SandboxSlotId) => {
    const payload = loadSandbox(slotId)
    if (payload) {
      pushSlot(slotId, payload)
    }
  }, [pushSlot])

  const takeOver = useCallback(async (slotId: SandboxSlotId): Promise<boolean> => {
    if (!enabled) {
      return false
    }
    const result = await acquireLease(slotId, { force: true })
    if (!result.ok) {
      return false
    }
    tokensRef.current[slotId] = result.token
    clearConflict(slotId)
    applyMeta(slotId, result.meta)
    return true
  }, [applyMeta, clearConflict, enabled])

  const restore = useCallback(async (slotId: SandboxSlotId): Promise<SavedSandbox | null> => {
    if (!enabled) {
      return null
    }
    const cloud = await getCloudSlot(slotId)
    if (cloud === null) {
      return null
    }
    // Unwrap a v3 envelope (legacy raw saves pass through), refusing formats
    // this client does not know. Then validate against the current wire
    // contract before it is allowed anywhere near local storage.
    const decoded = decodeCloudPayload(cloud.payload)
    if (decoded === null || migrateSandboxPayload(decoded) === null) {
      return null
    }
    // The fetch may outlive a tab ownership change. Check ownership and claim
    // the restored slot in the synchronous local write, after the fetch ends.
    const result = importSandbox(JSON.stringify(decoded), slotId, getOrCreateTabSessionId())
    if (!result.ok) {
      return null
    }

    deleteIntentRef.current[slotId] = (deleteIntentRef.current[slotId] ?? 0) + 1
    setDeletions((prev) => ({ ...prev, [slotId]: 'idle' }))
    const digest = saveDigest(JSON.stringify(result.saved))
    setLocal((prev) => ({ ...prev, [slotId]: digest }))
    applyMeta(slotId, cloud.meta)
    setOutcome(slotId, { kind: 'pushed', digest, cloudUpdatedAt: cloud.meta.updated_at })

    return result.saved
  }, [applyMeta, enabled, setOutcome])

  const remove = useCallback((slotId: SandboxSlotId): Promise<boolean> => {
    if (!enabled) return Promise.resolve(false)
    const pending = deletingRef.current[slotId]
    if (pending && pending.attempt === deleteIntentRef.current[slotId]) return pending.promise
    const local = readSandboxSlotStorage(slotId)
    if (!local) {
      setDeletions((prev) => ({ ...prev, [slotId]: 'failed' }))
      return Promise.resolve(false)
    }
    if (local.raw !== null || local.owner !== null) return Promise.resolve(false)
    const attempt = (deleteIntentRef.current[slotId] ?? 0) + 1
    deleteIntentRef.current[slotId] = attempt
    deleteFenceRef.current[slotId] = (deleteFenceRef.current[slotId] ?? 0) + 1
    pushAttemptRef.current[slotId] = (pushAttemptRef.current[slotId] ?? 0) + 1
    setDeletions((prev) => ({ ...prev, [slotId]: 'pending' }))
    // DELETE removes payload and lease together. Releasing first would open a
    // window for another writer and is unnecessary for the account-owner API.
    const promise = (async () => {
      let confirmed = false
      try { confirmed = await deleteCloudSlot(slotId) } catch { /* unconfirmed */ }
      if (deleteIntentRef.current[slotId] !== attempt) return false
      if (!isSandboxSlotEmpty(slotId)) {
        setDeletions((prev) => ({ ...prev, [slotId]: 'idle' }))
        return false
      }
      if (!confirmed) {
        setDeletions((prev) => ({ ...prev, [slotId]: 'failed' }))
        refresh()
        return false
      }
      // A list/lease read begun during DELETE may still describe its old row.
      // Fence those observations as well as ones started before the request.
      pushAttemptRef.current[slotId] = (pushAttemptRef.current[slotId] ?? 0) + 1
      deleteFenceRef.current[slotId] = (deleteFenceRef.current[slotId] ?? 0) + 1
      delete tokensRef.current[slotId]
      clearConflict(slotId)
      setLocal((prev) => { const next = { ...prev }; delete next[slotId]; return next })
      setOutcome(slotId, null)
      setMeta((prev) => { const next = { ...prev }; delete next[slotId]; return next })
      setDeletions((prev) => ({ ...prev, [slotId]: 'deleted' }))
      return true
    })()
    deletingRef.current[slotId] = { attempt, promise }
    void promise.finally(() => {
      if (deletingRef.current[slotId]?.attempt === attempt) delete deletingRef.current[slotId]
    })
    return promise
  }, [clearConflict, enabled, refresh, setOutcome])

  const slots = useMemo<Record<SandboxSlotId, CloudSlotView>>(() => {
    const views = {} as Record<SandboxSlotId, CloudSlotView>
    for (const slotId of SANDBOX_SLOT_IDS) {
      const conflict = conflicts[slotId] ?? null
      const slotMeta = meta[slotId] ?? null
      const cloudHasSave = slotMeta?.saved ?? false
      const localHasSave = localSavedSlots.has(slotId)

      const outcome = outcomes[slotId] ?? null
      const localDigest = local[slotId] ?? null
      // Only trust an outcome that describes the save currently on disk.
      const current = outcome && localHasSave && outcome.digest === localDigest ? outcome : null

      let status: CloudSlotStatus
      if (conflict) {
        status = 'conflict'
      } else if (current?.kind === 'tooLarge') {
        // Reported ahead of `checking`/`offline`: it is a property of the save
        // itself, and no amount of connectivity will change it.
        status = 'tooLarge'
      } else if (current?.kind === 'pushing') {
        status = 'pushing'
      } else if (current?.kind === 'failed') {
        status = 'failed'
      } else if (phase === 'checking') {
        status = 'checking'
      } else if (phase === 'offline') {
        status = 'offline'
      } else if (cloudHasSave && localHasSave) {
        // "Both exist" is NOT the same as "in sync". If the local save has
        // moved on since the last successful push, say so.
        status =
          current?.kind === 'pushed' && current.cloudUpdatedAt === slotMeta?.updated_at
            ? 'synced'
            : 'stale'
      } else if (cloudHasSave) {
        status = 'cloudAvailable'
      } else {
        status = 'localOnly'
      }

      const deletion = localHasSave && deletions[slotId] !== 'pending' ? 'idle' : deletions[slotId] ?? 'idle'
      views[slotId] = {
        deletion,
        status,
        canRestore: cloudHasSave && deletion === 'idle',
        conflict,
        cloudUpdatedAt: slotMeta?.updated_at ?? null,
        canRetry: deletion === 'idle' && (status === 'failed' || status === 'stale'),
      }
    }
    return views
  }, [conflicts, deletions, local, localSavedSlots, meta, outcomes, phase])

  return useMemo(
    () => ({ enabled, slots, openSlot, pushSlot, takeOver, restore, remove, refresh, retry }),
    [enabled, slots, openSlot, pushSlot, takeOver, restore, remove, refresh, retry],
  )
}
