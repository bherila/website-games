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
import { cloudLineageKey, localSnapshotIncarnation, readCloudLineage, writeCloudLineage } from './cloudLineage'
import { CloudOperationQueue } from './cloudOperationQueue'
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
import { getOrCreateTabSessionId, importSandbox, isSandboxSlotEmpty, isSandboxSlotOwnedByAnotherTab, loadSandbox, migrateSandboxPayload, readSandboxSlotStorage, type SavedSandbox } from './gameProgress'
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
  restore: (slotId: SandboxSlotId, expectedRevision?: string) => Promise<SavedSandbox | null>
  /** Drop the cloud copy of a slot (mirrors a local clear). */
  remove: (slotId: SandboxSlotId, retry?: boolean, expectedRevision?: string) => Promise<boolean>
  /** Re-fetch cloud slot metadata. */
  refresh: () => void
  /** Mirror the current local slot after a failure or remote change. */
  retry: (slotId: SandboxSlotId, expectedRevision?: string) => void
}

/**
 * The result of the latest mirror attempt, paired with the digest of the save
 * it applied to. Pairing matters: an outcome recorded against an older save
 * must not be read as describing the current one.
 */
type PushOutcome =
  | { kind: 'upgrade' | 'idle' | 'pushing' | 'failed' | 'tooLarge' | 'unverified' | 'different'; digest: string }
  | { kind: 'observed'; revision?: string | undefined; digest: string; cloudUpdatedAt: string | null; observedAt: number }
  | {
      kind: 'pushed'
      revision?: string | undefined
      digest: string
      /** Server revision proven equal to `digest` by a successful push/restore. */
      cloudUpdatedAt: string | null
    }

const persistedPushOutcomeSchema = z.object({
  kind: z.enum(['pushed', 'failed', 'tooLarge', 'unverified', 'different', 'observed', 'upgrade']),
  observedAt: z.number().optional(),
  revision: z.string().optional(),
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
          result.data.kind === 'observed'
            ? { kind: 'observed', revision: result.data.revision, digest: result.data.digest, cloudUpdatedAt: result.data.cloudUpdatedAt ?? null, observedAt: result.data.observedAt ?? 0 }
            : result.data.kind === 'pushed'
            ? { kind: 'pushed', revision: result.data.revision, digest: result.data.digest, cloudUpdatedAt: result.data.cloudUpdatedAt ?? null }
            : { kind: result.data.kind, digest: result.data.digest }
      }
    }

    return outcomes
  } catch {
    return {}
  }
}

function persistOutcomes(outcomes: Partial<Record<SandboxSlotId, PushOutcome>>, uncertain: ReadonlySet<SandboxSlotId>): void {
  const storage = safeLocalStorage()
  if (!storage) {
    return
  }
  try {
    const persisted: Partial<Record<SandboxSlotId, PersistedPushOutcome>> = {}
    for (const slotId of SANDBOX_SLOT_IDS) {
      const outcome = outcomes[slotId]
      if (outcome?.kind === 'observed') {
        persisted[slotId] = { ...outcome }
      } else if (uncertain.has(slotId)) {
        persisted[slotId] = { kind: outcome?.kind === 'different' ? 'different' : 'unverified', digest: outcome?.digest ?? '' }
      } else if (outcome && outcome.kind !== 'idle' && outcome.kind !== 'pushing') {
        persisted[slotId] = outcome.kind === 'pushed'
          ? { kind: 'pushed', revision: outcome.revision, digest: outcome.digest, cloudUpdatedAt: outcome.cloudUpdatedAt }
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

export function useCloudSaveSync(localSavedSlots: ReadonlySet<SandboxSlotId>, sessionId?: string): CloudSaveSync {
  const [enabled] = useState(isCloudSyncEnabled)
  const [tabSessionId] = useState(() => sessionId ?? getOrCreateTabSessionId())
  const [phase, setPhase] = useState<Phase>(enabled ? 'checking' : 'offline')
  const [meta, setMeta] = useState<Partial<Record<SandboxSlotId, CloudSlotMeta>>>({})
  const [conflicts, setConflicts] = useState<Partial<Record<SandboxSlotId, CloudLeaseConflict>>>({})
  const [deletions, setDeletions] = useState<Partial<Record<SandboxSlotId, CloudDeletionStatus>>>({})
  const [local, setLocal] = useState(() => localDigests(localSavedSlots))
  const [outcomes, setOutcomes] = useState(loadPersistedOutcomes)
  const uncertainRef = useRef(new Set(SANDBOX_SLOT_IDS.filter((id) =>
    ['unverified', 'observed', 'different'].includes(outcomes[id]?.kind ?? ''),
  )))
  const [queue] = useState(() => new CloudOperationQueue())
  const mountedRef = useRef(true)
  const [lineageKey] = useState(cloudLineageKey)
  const [initialLineage] = useState(() => readCloudLineage(lineageKey, (slot) => readSandboxSlotStorage(slot)?.raw ?? null))
  const metaRef = useRef<Partial<Record<SandboxSlotId, CloudSlotMeta>>>({})
  const revisionsRef = useRef<Partial<Record<SandboxSlotId, string>>>(Object.fromEntries(SANDBOX_SLOT_IDS.flatMap((id) => initialLineage[id]?.revision ? [[id, initialLineage[id]!.revision]] : [])))
  const incarnationsRef = useRef<Partial<Record<SandboxSlotId, string | null>>>(Object.fromEntries(SANDBOX_SLOT_IDS.map((id) => [id, initialLineage[id]?.incarnation ?? null])))
  const ownSuccessorsRef = useRef<Partial<Record<SandboxSlotId, Map<string, string>>>>({})
  const deleteRevisionsRef = useRef<Partial<Record<SandboxSlotId, string>>>({})
  const [changed, setChanged] = useState<Partial<Record<SandboxSlotId, boolean>>>(Object.fromEntries(SANDBOX_SLOT_IDS.map((id) => [id, initialLineage[id]?.blocked ?? false])))
  const changedRef = useRef(new Set(SANDBOX_SLOT_IDS.filter((id) => initialLineage[id]?.blocked)))
  const tokensRef = useRef<Partial<Record<SandboxSlotId, string>>>({})
  const readOnlyRef = useRef(new Set<SandboxSlotId>())
  const intentRef = useRef<Partial<Record<SandboxSlotId, number>>>({})
  const versionRef = useRef<Partial<Record<SandboxSlotId, number>>>({})
  const deletingRef = useRef<Partial<Record<SandboxSlotId, Promise<boolean>>>>({})
  const verifyingRef = useRef(new Set<SandboxSlotId>())
  const refreshRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const setOutcome = useCallback((slot: SandboxSlotId, outcome: PushOutcome | null) => {
    if (!mountedRef.current) return
    setOutcomes((prev) => {
      const next = { ...prev }
      if (outcome) next[slot] = outcome
      else delete next[slot]
      persistOutcomes(next, uncertainRef.current)
      return next
    })
  }, [])
  const markUncertain = useCallback((slot: SandboxSlotId) => {
    uncertainRef.current.add(slot)
    if (mountedRef.current) setOutcomes((prev) => {
      persistOutcomes(prev, uncertainRef.current)
      return { ...prev }
    })
  }, [])
  const applyMeta = useCallback((slot: SandboxSlotId, next: CloudSlotMeta) => {
    metaRef.current[slot] = next
    if (mountedRef.current) setMeta((prev) => ({ ...prev, [slot]: next }))
  }, [])
  const recordSuccessor = useCallback((slot: SandboxSlotId, before: string, after: string) => {
    if (before === after) return
    const edges = ownSuccessorsRef.current[slot] ??= new Map()
    edges.set(before, after)
    if (edges.size > 64) edges.delete(edges.keys().next().value!)
  }, [])
  const ownDescendant = useCallback((slot: SandboxSlotId, revision: string): string => {
    const seen = new Set<string>()
    const edges = ownSuccessorsRef.current[slot]
    while (edges?.has(revision) && !seen.has(revision)) {
      seen.add(revision)
      revision = edges.get(revision)!
    }
    return revision
  }, [])
  const persistLineage = useCallback((slot: SandboxSlotId) => {
    const incarnation = incarnationsRef.current[slot] ?? null
    writeCloudLineage(lineageKey, slot, { revision: revisionsRef.current[slot], blocked: changedRef.current.has(slot), incarnation })
  }, [lineageKey])
  const rememberRevision = useCallback((slot: SandboxSlotId, revision: string, incarnation: string | null) => {
    revisionsRef.current[slot] = revision
    incarnationsRef.current[slot] = incarnation
    persistLineage(slot)
  }, [persistLineage])
  const markChanged = useCallback((slot: SandboxSlotId) => {
    changedRef.current.add(slot)
    persistLineage(slot)
    setChanged((prev) => ({ ...prev, [slot]: true }))
  }, [persistLineage])
  const clearChanged = useCallback((slot: SandboxSlotId) => {
    changedRef.current.delete(slot)
    persistLineage(slot)
    setChanged((prev) => { const next = { ...prev }; delete next[slot]; return next })
  }, [persistLineage])
  const clearConflict = useCallback((slot: SandboxSlotId) => {
    readOnlyRef.current.delete(slot)
    setConflicts((prev) => { const next = { ...prev }; delete next[slot]; return next })
  }, [])
  const markConflict = useCallback((slot: SandboxSlotId, conflict: CloudLeaseConflict) => {
    readOnlyRef.current.add(slot)
    delete tokensRef.current[slot]
    setConflicts((prev) => ({ ...prev, [slot]: conflict }))
  }, [])
  const nextIntent = useCallback((slot: SandboxSlotId): number => {
    const next = (intentRef.current[slot] ?? 0) + 1
    intentRef.current[slot] = next
    return next
  }, [])
  const operation = useCallback(async <T,>(slot: SandboxSlotId, run: () => Promise<T>): Promise<T> => {
    versionRef.current[slot] = (versionRef.current[slot] ?? 0) + 1
    try { return await run() } finally { versionRef.current[slot] = (versionRef.current[slot] ?? 0) + 1 }
  }, [])

  const refresh = useCallback(() => {
    if (!enabled) return
    const request = ++refreshRef.current
    const versions = { ...versionRef.current }
    void (async () => {
      const rows = await listCloudSlots()
      if (!mountedRef.current || request !== refreshRef.current) return
      if (!rows) { setPhase('offline'); return }
      const byId = new Map(rows.map((row) => [row.slot, row]))
      setMeta((prev) => {
        const next = { ...prev }
        for (const slot of SANDBOX_SLOT_IDS) {
          if (versions[slot] !== versionRef.current[slot] || !queue.isIdle(slot)) continue
          const row = byId.get(slot)
          if (row) { next[slot] = row; metaRef.current[slot] = row }
          else { delete next[slot]; delete metaRef.current[slot] }
        }
        return next
      })
      setDeletions((prev) => {
        const next = { ...prev }
        for (const slot of SANDBOX_SLOT_IDS) {
          if (versions[slot] === versionRef.current[slot] && queue.isIdle(slot) && byId.get(slot)?.saved && next[slot] === 'deleted') next[slot] = 'idle'
        }
        return next
      })
      setPhase('ready')
    })()
  }, [enabled, queue])
  useEffect(() => { refresh() }, [refresh])

  // Internal calls run inside the slot worker. Enqueuing acquisition here
  // would deadlock a push waiting on work queued behind that same push.
  const ensureLease = useCallback(async (slot: SandboxSlotId): Promise<string | null> => {
    if (tokensRef.current[slot]) return tokensRef.current[slot]!
    const result = await acquireLease(slot)
    if (!mountedRef.current) return null
    if (result.ok) {
      tokensRef.current[slot] = result.token
      clearConflict(slot)
      applyMeta(slot, result.meta)
      return result.token
    }
    if (result.reason === 'conflict') markConflict(slot, result.conflict)
    return null
  }, [applyMeta, clearConflict, markConflict])

  const reconcile = useCallback((slot: SandboxSlotId) => {
    // This read is ordered after DELETE and any already queued slot work.
    void queue.barrier(slot, () => operation(slot, async () => {
      if (!mountedRef.current) return
      const rows = await listCloudSlots()
      if (!mountedRef.current || !rows) return
      const row = rows.find((item) => item.slot === slot)
      setMeta((prev) => {
        const next = { ...prev }
        if (row) { next[slot] = row; metaRef.current[slot] = row }
        else { delete next[slot]; delete metaRef.current[slot] }
        return next
      })
      const deletedRevision = deleteRevisionsRef.current[slot]
      if (deletedRevision && row?.content_revision !== deletedRevision) {
        if (row?.saved) { markChanged(slot); setDeletions((prev) => ({ ...prev, [slot]: 'failed' })) }
        else if (row?.deleted) {
          // A fresh tombstone proves the old content revision was fenced, including a lost DELETE acknowledgement.
          delete deleteRevisionsRef.current[slot]
          rememberRevision(slot, row.content_revision, null)
          setDeletions((prev) => ({ ...prev, [slot]: isSandboxSlotEmpty(slot) ? 'deleted' : 'idle' }))
        }
      }
      setPhase('ready')
    })).catch(() => { /* keep the last known metadata and failed status */ })
  }, [markChanged, operation, queue, rememberRevision])

  const verify = useCallback((slot: SandboxSlotId) => {
    if (!mountedRef.current || verifyingRef.current.has(slot)) return
    verifyingRef.current.add(slot)
    void queue.barrier(slot, () => operation(slot, async () => {
      if (!mountedRef.current || !uncertainRef.current.has(slot)) return
      const before = readSandboxSlotStorage(slot)
      const saved = loadSandbox(slot)
      if (!before || !saved || isSandboxSlotOwnedByAnotherTab(slot, tabSessionId)) { reconcile(slot); return }
      const intent = intentRef.current[slot]
      const cloud = await getCloudSlot(slot)
      if (!mountedRef.current) return
      const after = readSandboxSlotStorage(slot)
      if (!after || after.raw !== before.raw || after.owner !== before.owner || intent !== intentRef.current[slot]) return
      const digest = saveDigest(JSON.stringify(saved))
      const decoded = cloud ? decodeCloudPayload(cloud.payload) : null
      const remote = decoded === null ? null : migrateSandboxPayload(decoded)
      if (!cloud || !remote) { setOutcome(slot, { kind: 'unverified', digest }); reconcile(slot); return }
      applyMeta(slot, cloud.meta)
      setLocal((prev) => ({ ...prev, [slot]: digest }))
      const matches = JSON.stringify(remote) === JSON.stringify(saved)
      if (matches) { rememberRevision(slot, cloud.meta.content_revision, localSnapshotIncarnation(before.raw)); clearChanged(slot) }
      else markChanged(slot)
      setOutcome(slot, matches
        ? { kind: 'observed', revision: cloud.meta.content_revision, digest, cloudUpdatedAt: cloud.meta.updated_at, observedAt: Date.now() }
        : { kind: 'different', digest })
    })).catch(() => { /* the last uncertain status remains visible */ }).finally(() => verifyingRef.current.delete(slot))
  }, [applyMeta, clearChanged, markChanged, operation, queue, reconcile, rememberRevision, setOutcome, tabSessionId])

  const pushSlot = useCallback((slot: SandboxSlotId, saved: SavedSandbox, expectedRevision?: string) => {
    if (!enabled) return
    if (expectedRevision === undefined && revisionsRef.current[slot]
      && incarnationsRef.current[slot] !== localSnapshotIncarnation(readSandboxSlotStorage(slot)?.raw ?? null)) {
      markChanged(slot)
      return
    }
    if (expectedRevision === undefined && changedRef.current.has(slot)) return
    const intent = nextIntent(slot)
    setDeletions((prev) => ({ ...prev, [slot]: 'idle' }))
    const requestedDigest = saveDigest(JSON.stringify(saved))
    setLocal((prev) => ({ ...prev, [slot]: requestedDigest }))
    setOutcome(slot, { kind: 'pushing', digest: requestedDigest })
    queue.push(slot, () => operation(slot, async () => {
      if (!mountedRef.current) return
      if (expectedRevision !== undefined) { revisionsRef.current[slot] = expectedRevision; incarnationsRef.current[slot] = localSnapshotIncarnation(readSandboxSlotStorage(slot)?.raw ?? null); clearChanged(slot) }
      else if (changedRef.current.has(slot)) return
      let readIncarnation: string | null = null
      const current = (): SavedSandbox | null => {
        const snapshot = readSandboxSlotStorage(slot)
        if (!snapshot?.raw || (snapshot.owner !== null && snapshot.owner !== tabSessionId)) return null
        const incarnation = localSnapshotIncarnation(snapshot.raw)
        if (revisionsRef.current[slot] && incarnationsRef.current[slot] !== incarnation) {
          markChanged(slot)
          return null
        }
        try {
          const saved = migrateSandboxPayload(JSON.parse(snapshot.raw))
          readIncarnation = incarnation
          return saved
        } catch { return null }
      }
      if (readOnlyRef.current.has(slot)) {
        if (intent === intentRef.current[slot]) setOutcome(slot, { kind: 'unverified', digest: requestedDigest })
        reconcile(slot)
        return
      }
      try {
        const initial = current()
        if (!initial) {
          if (intent === intentRef.current[slot]) setOutcome(slot, { kind: 'unverified', digest: requestedDigest })
          reconcile(slot)
          return
        }
        const initialIncarnation = readIncarnation
        const initialJson = JSON.stringify(initial)
        if (intent === intentRef.current[slot]) setLocal((prev) => ({ ...prev, [slot]: saveDigest(initialJson) }))
        const initialEnvelope = encodeCloudPayload(initialJson)
        if (!fitsCloudBudget(JSON.stringify(initialEnvelope))) {
          if (intent === intentRef.current[slot]) setOutcome(slot, { kind: 'tooLarge', digest: saveDigest(initialJson) })
          reconcile(slot)
          return
        }
        // Establish lineage by comparing contents, never by blessing an unseen latest revision.
        if (!revisionsRef.current[slot]) {
          const rows = await listCloudSlots()
          if (!mountedRef.current || !rows) { setOutcome(slot, { kind: 'unverified', digest: requestedDigest }); return }
          if (localSnapshotIncarnation(readSandboxSlotStorage(slot)?.raw ?? null) !== initialIncarnation) { markChanged(slot); return }
          const row = rows.find((item) => item.slot === slot)
          if (row) applyMeta(slot, row)
          if (row?.deleted) { markChanged(slot); return }
          if (!row || !row.saved) rememberRevision(slot, row?.content_revision ?? 'absent', initialIncarnation)
          else {
            const cloud = await getCloudSlot(slot)
            if (!mountedRef.current) return
            const decoded = cloud ? decodeCloudPayload(cloud.payload) : null
            const remote = decoded === null ? null : migrateSandboxPayload(decoded)
            if (!cloud || !remote) { setOutcome(slot, { kind: 'unverified', digest: requestedDigest }); return }
            applyMeta(slot, cloud.meta)
            if (JSON.stringify(remote) !== initialJson || localSnapshotIncarnation(readSandboxSlotStorage(slot)?.raw ?? null) !== initialIncarnation) { markChanged(slot); return }
            rememberRevision(slot, cloud.meta.content_revision, initialIncarnation)
          }
        }
        const expected = revisionsRef.current[slot]!
        const token = await ensureLease(slot)
        if (!mountedRef.current) return
        const payload = current()
        if (!payload) {
          if (intent === intentRef.current[slot]) setOutcome(slot, { kind: 'unverified', digest: requestedDigest })
          reconcile(slot)
          return
        }
        if (expected === 'absent' && metaRef.current[slot]?.saved === false && !metaRef.current[slot]?.deleted) rememberRevision(slot, metaRef.current[slot]!.content_revision, readIncarnation)
        const serialized = JSON.stringify(payload)
        const digest = saveDigest(serialized)
        if (intent === intentRef.current[slot]) setLocal((prev) => ({ ...prev, [slot]: digest }))
        const report = (outcome: PushOutcome): void => { if (intent === intentRef.current[slot]) setOutcome(slot, outcome) }
        if (!token) {
          report({ kind: readOnlyRef.current.has(slot) ? 'idle' : 'failed', digest })
          reconcile(slot)
          return
        }
        const envelope = serialized === initialJson ? initialEnvelope : encodeCloudPayload(serialized)
        if (!fitsCloudBudget(JSON.stringify(envelope))) { report({ kind: 'tooLarge', digest }); reconcile(slot); return }
        const sentIncarnation = readIncarnation
        const sentRevision = revisionsRef.current[slot]!
        const result = await pushCloudSlot({ slot, payload: envelope, wireVersion: CLOUD_ENVELOPE_WIRE_VERSION, token, expectedRevision: sentRevision,
          game_day: payload.clock.day, star: payload.star, population: population(payload), funds: payload.funds })
        if (!mountedRef.current) return
        if (result.ok) {
          // Keep a valid token even when a newer local intent is waiting.
          tokensRef.current[slot] = result.token
          recordSuccessor(slot, sentRevision, result.meta.content_revision)
          rememberRevision(slot, result.meta.content_revision, sentIncarnation)
          if (localSnapshotIncarnation(readSandboxSlotStorage(slot)?.raw ?? null) !== sentIncarnation) markChanged(slot)
          applyMeta(slot, result.meta)
          setPhase('ready')
          report(uncertainRef.current.has(slot) ? { kind: 'unverified', digest }
            : { kind: 'pushed', revision: result.meta.content_revision, digest, cloudUpdatedAt: result.meta.updated_at })
        } else if (result.reason === 'revision') {
          applyMeta(slot, result.meta)
          markChanged(slot)
        } else if (result.reason === 'upgrade') {
          report({ kind: 'upgrade', digest })
        } else if (result.reason === 'conflict') {
          markConflict(slot, result.conflict)
          report({ kind: 'idle', digest })
          reconcile(slot)
        } else {
          if (result.reason === 'offline' || result.reason === 'unconfirmed') markUncertain(slot)
          report({ kind: uncertainRef.current.has(slot) ? 'unverified' : 'failed', digest })
          reconcile(slot)
        }
        if (uncertainRef.current.has(slot)) verify(slot)
      } catch {
        markUncertain(slot)
        if (intent === intentRef.current[slot]) setOutcome(slot, { kind: 'unverified', digest: requestedDigest })
        reconcile(slot)
        verify(slot)
      }
    }))
  }, [applyMeta, clearChanged, enabled, ensureLease, markChanged, markConflict, markUncertain, nextIntent, operation, queue, reconcile, recordSuccessor, rememberRevision, setOutcome, tabSessionId, verify])

  const retry = useCallback((slot: SandboxSlotId, expectedRevision?: string) => {
    const saved = loadSandbox(slot)
    if (saved) pushSlot(slot, saved, expectedRevision)
  }, [pushSlot])
  const openSlot = useCallback((slot: SandboxSlotId) => {
    if (enabled) void queue.barrier(slot, () => operation(slot, async () => {
      if (mountedRef.current && !(await ensureLease(slot))) reconcile(slot)
    })).catch(() => reconcile(slot))
  }, [enabled, ensureLease, operation, queue, reconcile])
  const takeOver = useCallback((slot: SandboxSlotId): Promise<boolean> => {
    if (!enabled) return Promise.resolve(false)
    return queue.barrier(slot, () => operation(slot, async () => {
      if (!mountedRef.current) return false
      const result = await acquireLease(slot, { force: true })
      if (!mountedRef.current) return false
      if (!result.ok) { reconcile(slot); return false }
      tokensRef.current[slot] = result.token
      clearConflict(slot)
      applyMeta(slot, result.meta)
      return true
    })).catch(() => false)
  }, [applyMeta, clearConflict, enabled, operation, queue, reconcile])

  const restore = useCallback((slot: SandboxSlotId, expectedRevision?: string): Promise<SavedSandbox | null> => {
    if (!enabled) return Promise.resolve(null)
    // Consent applies to these exact bytes/owner, including time spent waiting.
    const before = readSandboxSlotStorage(slot)
    const revision = expectedRevision ?? metaRef.current[slot]?.content_revision ?? 'absent'
    const intent = nextIntent(slot)
    return queue.barrier(slot, () => operation(slot, async () => {
      if (!mountedRef.current) return null
      if (!before || !revision) { reconcile(slot); return null }
      const unchanged = (): boolean => {
        const current = readSandboxSlotStorage(slot)
        return current !== null && current.raw === before.raw && current.owner === before.owner
      }
      const fail = (): null => {
        reconcile(slot)
        if (intent === intentRef.current[slot]) {
          const saved = loadSandbox(slot)
          if (saved) setOutcome(slot, { kind: 'unverified', digest: saveDigest(JSON.stringify(saved)) })
        }
        return null
      }
      if (!unchanged()) return fail()
      const expected = ownDescendant(slot, revision)
      const cloud = await getCloudSlot(slot, expected)
      if (!mountedRef.current) return null
      if (!cloud) return fail()
      recordSuccessor(slot, expected, cloud.meta.content_revision)
      if (!unchanged()) return fail()
      const decoded = decodeCloudPayload(cloud.payload)
      if (decoded === null || migrateSandboxPayload(decoded) === null) return fail()
      const result = importSandbox(JSON.stringify(decoded), slot, tabSessionId)
      if (!result.ok) return fail()
      const digest = saveDigest(JSON.stringify(result.saved))
      setLocal((prev) => ({ ...prev, [slot]: digest }))
      rememberRevision(slot, cloud.meta.content_revision, result.incarnation)
      if (localSnapshotIncarnation(readSandboxSlotStorage(slot)?.raw ?? null) !== result.incarnation) { markChanged(slot); return null }
      clearChanged(slot)
      applyMeta(slot, cloud.meta)
      setDeletions((prev) => ({ ...prev, [slot]: 'idle' }))
      if (intent === intentRef.current[slot]) setOutcome(slot, uncertainRef.current.has(slot)
        ? { kind: 'unverified', digest } : { kind: 'pushed', revision: cloud.meta.content_revision, digest, cloudUpdatedAt: cloud.meta.updated_at })
      if (uncertainRef.current.has(slot)) verify(slot)
      return result.saved
    })).catch(() => null)
  }, [applyMeta, clearChanged, enabled, markChanged, nextIntent, operation, ownDescendant, queue, reconcile, recordSuccessor, rememberRevision, setOutcome, tabSessionId, verify])

  const remove = useCallback((slot: SandboxSlotId, retry = false, expectedRevision?: string): Promise<boolean> => {
    if (!enabled) return Promise.resolve(false)
    if (deletingRef.current[slot]) return deletingRef.current[slot]!
    const before = readSandboxSlotStorage(slot)
    if (!before) { setDeletions((prev) => ({ ...prev, [slot]: 'failed' })); return Promise.resolve(false) }
    if (before.raw !== null || before.owner !== null) return Promise.resolve(false)
    const revision = retry ? deleteRevisionsRef.current[slot] : expectedRevision ?? metaRef.current[slot]?.content_revision ?? 'absent'
    if (!revision) { setDeletions((prev) => ({ ...prev, [slot]: 'failed' })); reconcile(slot); return Promise.resolve(false) }
    deleteRevisionsRef.current[slot] = revision
    const intent = nextIntent(slot)
    setDeletions((prev) => ({ ...prev, [slot]: 'pending' }))
    const promise = queue.barrier(slot, () => operation(slot, async () => {
      if (!mountedRef.current) return false
      if (!isSandboxSlotEmpty(slot)) {
        if (intent === intentRef.current[slot]) setDeletions((prev) => ({ ...prev, [slot]: 'idle' }))
        reconcile(slot)
        return false
      }
      const expected = ownDescendant(slot, revision)
      deleteRevisionsRef.current[slot] = expected
      const confirmed = await deleteCloudSlot(slot, expected)
      if (!mountedRef.current) return confirmed
      if (!confirmed) markUncertain(slot)
      if (intent !== intentRef.current[slot]) return false
      if (!isSandboxSlotEmpty(slot)) {
        setDeletions((prev) => ({ ...prev, [slot]: 'idle' }))
        reconcile(slot)
        return false
      }
      if (!confirmed) {
        setDeletions((prev) => ({ ...prev, [slot]: 'failed' }))
        reconcile(slot)
        return false
      }
      delete tokensRef.current[slot]
      clearConflict(slot)
      clearChanged(slot)
      // Reconcile this acknowledged deletion to retain its tombstone lineage for a future new tower.
      reconcile(slot)
      delete metaRef.current[slot]
      setLocal((prev) => { const next = { ...prev }; delete next[slot]; return next })
      setOutcome(slot, null)
      setMeta((prev) => { const next = { ...prev }; delete next[slot]; return next })
      setDeletions((prev) => ({ ...prev, [slot]: 'deleted' }))
      return true
    })).catch(() => {
      markUncertain(slot)
      if (mountedRef.current && intent === intentRef.current[slot]) setDeletions((prev) => ({ ...prev, [slot]: 'failed' }))
      return false
    })
    deletingRef.current[slot] = promise
    void promise.finally(() => { if (deletingRef.current[slot] === promise) delete deletingRef.current[slot] })
    return promise
  }, [clearChanged, clearConflict, enabled, markUncertain, nextIntent, operation, ownDescendant, queue, reconcile, setOutcome])

  const slots = useMemo<Record<SandboxSlotId, CloudSlotView>>(() => {
    const views = {} as Record<SandboxSlotId, CloudSlotView>
    for (const slot of SANDBOX_SLOT_IDS) {
      const conflict = conflicts[slot] ?? null, row = meta[slot] ?? null
      const hasLocal = localSavedSlots.has(slot), hasCloud = row?.saved ?? false
      const outcome = outcomes[slot]
      const current = outcome && hasLocal && outcome.digest === local[slot] ? outcome : null
      let status: CloudSlotStatus
      if (changed[slot]) status = 'changed'
      else if (conflict) status = 'conflict'
      else if (current?.kind === 'upgrade') status = 'upgrade'
      else if (current?.kind === 'tooLarge') status = 'tooLarge'
      else if (current?.kind === 'pushing') status = 'pushing'
      else if (current?.kind === 'failed') status = 'failed'
      else if (current?.kind === 'unverified') status = 'unverified'
      else if (current?.kind === 'different') status = 'different'
      else if (phase === 'checking') status = 'checking'
      else if (phase === 'offline') status = 'offline'
      else if (hasCloud && hasLocal) status = current?.kind === 'observed'
        ? current.revision === row?.content_revision ? 'matched' : 'unverified'
        : current?.kind === 'pushed' && current.revision === row?.content_revision ? 'synced' : 'stale'
      else status = hasCloud ? 'cloudAvailable' : 'localOnly'
      const deletion = hasLocal && deletions[slot] !== 'pending' ? 'idle' : deletions[slot] ?? 'idle'
      views[slot] = { canClear: hasCloud || deletion === 'failed', revision: row?.content_revision ?? (phase === 'ready' ? 'absent' : undefined), deletion, status, conflict, cloudUpdatedAt: row?.updated_at ?? null,
        matchedAt: current?.kind === 'observed' ? current.observedAt : null,
        canRestore: hasCloud && deletion === 'idle',
        canRetry: deletion === 'idle' && ['changed', 'failed', 'stale', 'unverified', 'different'].includes(status) }
    }
    return views
  }, [changed, conflicts, deletions, local, localSavedSlots, meta, outcomes, phase])
  return useMemo(() => ({ enabled, slots, openSlot, pushSlot, takeOver, restore, remove, refresh, retry }),
    [enabled, slots, openSlot, pushSlot, takeOver, restore, remove, refresh, retry])
}
