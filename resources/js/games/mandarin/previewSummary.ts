/**
 * Read-only summaries of Mandarin progress for the game-select card.
 *
 * Supports both live progress (partitioned into guest and per-account stores,
 * resolved via the current authentication context) and the mock preview
 * partition for preview mode. Reads local storage only; never touches or
 * relabels queued events.
 */
import { readAuthenticationContext } from '../_shared/gameDataPersistence'
import {
  createLocalPreviewStore,
  createLocalStore,
  livePartitionPrefix,
  safeLocalStorage,
} from './adapters/previewStore'
import { loadCourse } from './domain/course'
import { parseStoredProgress } from './domain/progress'

export interface MandarinSummary {
  started: boolean
  scenesCompleted: number
  totalScenes: number
  nodesCompleted: number
  totalNodes: number
}

export type MandarinPreviewSummary = MandarinSummary

/**
 * Resolves the account partition identifier from the current authentication context.
 * Returns `'user:' + accountId` when signed in, or `null` for a guest.
 */
export function resolveMandarinAccountPartitionId(storage: Storage | null = safeLocalStorage()): string | null {
  const auth = readAuthenticationContext(storage)
  if (!auth.authenticated || !auth.accountId) {
    return null
  }
  return auth.accountId.startsWith('user:') ? auth.accountId : `user:${auth.accountId}`
}

/**
 * Summarizes the mock preview partition (`mandarin.preview.*`). Retained for
 * scenarios where preview mode is intentionally used.
 */
export function summarizeMandarinPreview(storage: Storage | null = safeLocalStorage()): MandarinPreviewSummary {
  const course = loadCourse()
  const progress = parseStoredProgress(createLocalPreviewStore(storage).loadProgress(), course)
  return {
    started: !!progress && (progress.onboardingComplete || progress.completedNodeIds.length > 0),
    scenesCompleted: progress?.completedSceneIds.length ?? 0,
    totalScenes: course.scenes.length,
    nodesCompleted: progress?.completedNodeIds.length ?? 0,
    totalNodes: course.nodes.length,
  }
}

/**
 * Summarizes live-course progress for the active identity (guest or authenticated account).
 * An optional explicit `accountPartitionId` can be passed (e.g. `'user:42'` or `null`)
 * to query a specific partition directly.
 */
export function summarizeMandarinLive(
  storage: Storage | null = safeLocalStorage(),
  accountPartitionId?: string | null,
): MandarinSummary {
  const partitionId = accountPartitionId !== undefined
    ? accountPartitionId
    : resolveMandarinAccountPartitionId(storage)
  const course = loadCourse()
  const progress = parseStoredProgress(createLocalStore(storage, livePartitionPrefix(partitionId)).loadProgress(), course)
  return {
    started: !!progress && (progress.onboardingComplete || progress.completedNodeIds.length > 0),
    scenesCompleted: progress?.completedSceneIds.length ?? 0,
    totalScenes: course.scenes.length,
    nodesCompleted: progress?.completedNodeIds.length ?? 0,
    totalNodes: course.nodes.length,
  }
}
