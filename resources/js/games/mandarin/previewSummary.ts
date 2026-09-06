/**
 * Read-only summary of the preview partition for the game-select card. Reads
 * `mandarin.preview.*` only; never touches cloud-save keys.
 */
import { createLocalPreviewStore, safeLocalStorage } from './adapters/previewStore'
import { loadCourse } from './domain/course'
import { parseStoredProgress } from './domain/progress'

export interface MandarinPreviewSummary {
  started: boolean
  scenesCompleted: number
  totalScenes: number
  nodesCompleted: number
  totalNodes: number
}

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
