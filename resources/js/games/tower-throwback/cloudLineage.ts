import { z } from 'zod'

import { safeLocalStorage } from '../_shared/progressParsers'
import { SANDBOX_SLOT_IDS,type SandboxSlotId } from './gameTypes'

const entry = z.object({ revision: z.string().optional(), blocked: z.boolean().optional(), incarnation: z.string().nullable().optional() })
export type CloudLineage = Partial<Record<SandboxSlotId, z.infer<typeof entry>>>

/** Authority is never shared between accounts; offline last-account hints are not sufficient. */
export function cloudLineageKey(): string | null {
  try {
    const data = JSON.parse(document.getElementById('app-initial-data')?.textContent ?? 'null') as { authenticated?: boolean; currentUser?: { id?: unknown } } | null
    const id = data?.currentUser?.id
    return data?.authenticated === true && (typeof id === 'string' || typeof id === 'number')
      ? `towerThrowback.cloudLineage.v2.${encodeURIComponent(String(id))}` : null
  } catch { return null }
}

/** Local-only metadata is in the same atomic write as the snapshot; migration/export strips it. */
export function localSnapshotMetadata(previousRaw: string | null): { account: string | null; incarnation: string } {
  const account = cloudLineageKey()
  try {
    const previous = JSON.parse(previousRaw ?? 'null') as { _cloudLocal?: { account?: unknown; incarnation?: unknown } } | null
    if (previous?._cloudLocal?.account === account && typeof previous._cloudLocal.incarnation === 'string') {
      return { account, incarnation: previous._cloudLocal.incarnation }
    }
  } catch { /* Start a new browser incarnation. */ }
  const incarnation = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return { account, incarnation }
}

export function localSnapshotIncarnation(raw: string | null): string | null {
  try {
    const parsed = JSON.parse(raw ?? 'null') as { _cloudLocal?: { incarnation?: unknown } } | null
    return typeof parsed?._cloudLocal?.incarnation === 'string' ? parsed._cloudLocal.incarnation : null
  } catch { return null }
}

export function readCloudLineage(key: string | null, readLocal: (slot: SandboxSlotId) => string | null): CloudLineage {
  const result: CloudLineage = {}
  if (!key) return result
  for (const slot of SANDBOX_SLOT_IDS) {
    try {
      const raw: unknown = JSON.parse(safeLocalStorage()?.getItem(`${key}.${slot}`) ?? '{}')
      const parsed = entry.safeParse(raw)
      if (parsed.success) {
        const incarnation = localSnapshotIncarnation(readLocal(slot))
        result[slot] = { ...parsed.data,
          blocked: parsed.data.blocked || (parsed.data.revision !== undefined && parsed.data.incarnation !== incarnation) }
      }
    } catch { /* A missing/corrupt record never authorizes a blind write. */ }
  }
  return result
}

/** Write one slot only: two tabs working on different slots do not erase each other's lineage. */
export function writeCloudLineage(key: string | null, slot: SandboxSlotId, value: z.infer<typeof entry>): void {
  try { if (key) safeLocalStorage()?.setItem(`${key}.${slot}`, JSON.stringify(value)) } catch { /* local progress remains authoritative */ }
}
