/**
 * Best-effort cloud mirror for Tower Throwback save slots.
 *
 * localStorage remains the source of truth (see `gameProgress.ts`); this layer
 * pushes a copy to the server for cross-device restore and never blocks
 * gameplay on the network. Every request goes through `fetchWrapper`, and every
 * server payload is validated with zod before it is trusted.
 *
 * Ownership model: each slot has at most one active server lease. A client
 * acquires a lease when it opens a slot for play and renews it opportunistically
 * on each successful push. A write that presents a stale/missing token while
 * another unexpired lease exists is rejected (HTTP 409); the displaced client
 * then drops to read-only until the player takes the lease over.
 */
import { z } from 'zod'

import { fetchWrapper } from '@/fetchWrapper'

import type { SandboxSlotId } from './gameTypes'

const BASE_URL = '/api/games/tower-throwback/saves'

const conflictSchema = z.object({
  acquired_at: z.string().nullable(),
  expires_at: z.string().nullable(),
})
export type CloudLeaseConflict = z.infer<typeof conflictSchema>

const cloudSlotMetaSchema = z.object({
  slot: z.string(),
  saved: z.boolean(),
  wire_version: z.number().int().nullable(),
  game_day: z.number().int().nullable(),
  star: z.number().int().nullable(),
  population: z.number().int().nullable(),
  funds: z.number().int().nullable(),
  updated_at: z.string().nullable(),
  lease_active: z.boolean(),
  lease_acquired_at: z.string().nullable(),
  lease_expires_at: z.string().nullable(),
  lease_token: z.string().optional(),
})
export type CloudSlotMeta = z.infer<typeof cloudSlotMetaSchema>

const listSchema = z.object({ data: z.array(cloudSlotMetaSchema) })
const singleSchema = z.object({ data: cloudSlotMetaSchema })
const payloadSchema = z.object({ data: cloudSlotMetaSchema.extend({ payload: z.unknown() }) })
const conflictBodySchema = z.object({ conflict: conflictSchema })
const authSchema = z.object({ authenticated: z.boolean().optional() })

export interface CloudSlotPayload {
  meta: CloudSlotMeta
  payload: unknown
}

/**
 * Per-slot cloud state as shown on the load screen.
 *
 * `synced` used to mean nothing more than "a local copy exists AND a cloud copy
 * exists", which stayed green while every push was failing. It now requires the
 * cloud copy to actually be current with the local one.
 *
 * - `synced`: the cloud copy matches the local save.
 * - `pushing`: a mirror is in flight.
 * - `stale`: both copies exist, but the local save is newer than the cloud one.
 * - `failed`: the last push failed for a reason the player can retry.
 * - `tooLarge`: the save exceeds the cloud byte budget; it stays local-only.
 * - `localOnly`: no cloud copy (or the slot lives only in the browser).
 * - `cloudAvailable`: a cloud save exists that is not present locally.
 * - `conflict`: another device holds the lease — writes are blocked (read-only).
 * - `checking`: the initial slot list has not resolved yet.
 * - `offline`: the server is unreachable; local storage is authoritative.
 */
export type CloudSlotStatus =
  | 'synced'
  | 'pushing'
  | 'stale'
  | 'failed'
  | 'tooLarge'
  | 'localOnly'
  | 'cloudAvailable'
  | 'conflict'
  | 'checking'
  | 'offline'

export interface CloudSlotView {
  status: CloudSlotStatus
  canRestore: boolean
  conflict: CloudLeaseConflict | null
  /** Server-side last-modified for the cloud copy, when one exists. */
  cloudUpdatedAt: string | null
  /** True when the last push failed and retrying is worth offering. */
  canRetry: boolean
}

export interface CloudDisplayMetadata {
  game_day: number | null
  star: number | null
  population: number | null
  funds: number | null
}

export interface CloudPushInput extends CloudDisplayMetadata {
  slot: SandboxSlotId
  payload: unknown
  wireVersion: number
  token: string
}

export type CloudLeaseResult =
  | { ok: true; token: string; meta: CloudSlotMeta }
  | { ok: false; reason: 'conflict'; conflict: CloudLeaseConflict }
  | { ok: false; reason: 'offline' }

export type CloudPushResult =
  | { ok: true; token: string; meta: CloudSlotMeta }
  | { ok: false; reason: 'conflict'; conflict: CloudLeaseConflict }
  | { ok: false; reason: 'offline' }
  | { ok: false; reason: 'error' }

/** Cloud sync only runs for a signed-in player; anonymous play stays local. */
export function isCloudSyncEnabled(): boolean {
  if (typeof document === 'undefined') {
    return false
  }
  try {
    const script = document.getElementById('app-initial-data')
    const raw: unknown = script?.textContent ? JSON.parse(script.textContent) : null
    const parsed = authSchema.safeParse(raw)

    return parsed.success && parsed.data.authenticated === true
  } catch {
    return false
  }
}

/** Slot metadata for every cloud slot, or `null` if the server is unreachable. */
export async function listCloudSlots(): Promise<CloudSlotMeta[] | null> {
  try {
    const response: unknown = await fetchWrapper.get(BASE_URL)
    const parsed = listSchema.safeParse(response)

    return parsed.success ? parsed.data.data : null
  } catch {
    return null
  }
}

/** The opaque payload plus metadata for one slot, or `null` if unavailable. */
export async function getCloudSlot(slot: SandboxSlotId): Promise<CloudSlotPayload | null> {
  try {
    const response: unknown = await fetchWrapper.get(`${BASE_URL}/${encodeURIComponent(slot)}`)
    const parsed = payloadSchema.safeParse(response)
    if (!parsed.success) {
      return null
    }

    return { meta: parsed.data.data, payload: parsed.data.data.payload }
  } catch {
    return null
  }
}

/** Acquire (or, with `force`, take over) the lease for a slot. */
export async function acquireLease(
  slot: SandboxSlotId,
  options: { force?: boolean; token?: string | null } = {},
): Promise<CloudLeaseResult> {
  const body: Record<string, unknown> = {}
  if (options.force) {
    body.force = true
  }
  if (options.token) {
    body.lease_token = options.token
  }

  let response: Response
  try {
    response = await fetchWrapper.postRaw(`${BASE_URL}/${encodeURIComponent(slot)}/lease`, body)
  } catch {
    return { ok: false, reason: 'offline' }
  }

  return interpretLeaseResponse(response)
}

/** Push a local save to the server, extending the lease on success. */
export async function pushCloudSlot(input: CloudPushInput): Promise<CloudPushResult> {
  const body = {
    payload: input.payload,
    wire_version: input.wireVersion,
    lease_token: input.token,
    game_day: input.game_day,
    star: input.star,
    population: input.population,
    funds: input.funds,
  }

  let response: Response
  try {
    response = await fetchWrapper.putRaw(`${BASE_URL}/${encodeURIComponent(input.slot)}`, body)
  } catch {
    return { ok: false, reason: 'offline' }
  }

  if (response.status === 409) {
    return conflictFromResponse(response)
  }
  if (!response.ok) {
    return { ok: false, reason: 'error' }
  }

  const parsed = await parseJson(response, singleSchema)
  if (!parsed || parsed.data.lease_token === undefined) {
    return { ok: false, reason: 'error' }
  }

  return { ok: true, token: parsed.data.lease_token, meta: parsed.data }
}

/** Release a lease this client holds. Best-effort; failures are swallowed. */
export async function releaseLease(slot: SandboxSlotId, token: string): Promise<void> {
  try {
    await fetchWrapper.delete(`${BASE_URL}/${encodeURIComponent(slot)}/lease`, { lease_token: token })
  } catch {
    // Releasing is advisory; a missed release simply expires with the TTL.
  }
}

/** Delete a cloud slot entirely. Best-effort. */
export async function deleteCloudSlot(slot: SandboxSlotId): Promise<void> {
  try {
    await fetchWrapper.delete(`${BASE_URL}/${encodeURIComponent(slot)}`, {})
  } catch {
    // Best-effort: a failed cloud delete leaves a stale mirror, never a crash.
  }
}

async function interpretLeaseResponse(response: Response): Promise<CloudLeaseResult> {
  if (response.status === 409) {
    return conflictFromResponse(response)
  }
  if (!response.ok) {
    return { ok: false, reason: 'offline' }
  }

  const parsed = await parseJson(response, singleSchema)
  if (!parsed || parsed.data.lease_token === undefined) {
    return { ok: false, reason: 'offline' }
  }

  return { ok: true, token: parsed.data.lease_token, meta: parsed.data }
}

async function conflictFromResponse(
  response: Response,
): Promise<{ ok: false; reason: 'conflict'; conflict: CloudLeaseConflict }> {
  const parsed = await parseJson(response, conflictBodySchema)

  return {
    ok: false,
    reason: 'conflict',
    conflict: parsed?.conflict ?? { acquired_at: null, expires_at: null },
  }
}

async function parseJson<T>(response: Response, schema: z.ZodType<T>): Promise<T | null> {
  try {
    const raw: unknown = await response.json()
    const parsed = schema.safeParse(raw)

    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
