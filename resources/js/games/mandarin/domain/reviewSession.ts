/**
 * Builds bounded review / extra-practice sessions from a due list the gateway
 * supplies. There is deliberately no scheduling algorithm here: the mock
 * gateway hands over a deterministic due list today and the real projection
 * will later. The UI only decides which exercise to show for each due target.
 */
import type { CourseIndex } from './course'
import type { ChoiceExercise } from './courseSchema'
import type { PreviewProgress } from './progress'
import { hashString } from './random'

export const REVIEW_SESSION_LIMIT = 10

export interface ReviewItem {
  targetId: string
  exercise: ChoiceExercise
}

export interface ReviewPlan {
  kind: 'scheduled' | 'extra'
  items: ReviewItem[]
  /** Due targets left over after the bounded session. */
  backlog: number
}

/** Rotates through the exercises for a target so repeats vary. */
function pickExercise(course: CourseIndex, progress: PreviewProgress, targetId: string): ChoiceExercise | null {
  const candidates = course.exercisesForTarget(targetId)
  if (candidates.length === 0) return null
  const priorCount = progress.opportunities.filter((item) => candidates.some((exercise) => exercise.id === item.exerciseId)).length
  return candidates[priorCount % candidates.length] ?? null
}

export function buildScheduledReview(
  course: CourseIndex,
  progress: PreviewProgress,
  dueTargetIds: readonly string[],
  limit: number = REVIEW_SESSION_LIMIT,
): ReviewPlan {
  const taught = new Set(progress.completedNodeIds)
  const eligible = dueTargetIds.filter((targetId) => {
    const target = course.targetById.get(targetId)
    return !!target && taught.has(target.introducedInNode)
  })
  const items: ReviewItem[] = []
  for (const targetId of eligible.slice(0, limit)) {
    const exercise = pickExercise(course, progress, targetId)
    if (exercise) items.push({ targetId, exercise })
  }
  return { kind: 'scheduled', items, backlog: Math.max(0, eligible.length - limit) }
}

/** Unscheduled practice drawn from completed nodes; visibly separate from scheduled review. */
export function buildExtraPractice(
  course: CourseIndex,
  progress: PreviewProgress,
  seed: string,
  limit: number = REVIEW_SESSION_LIMIT,
): ReviewPlan {
  const pool: ReviewItem[] = []
  for (const nodeId of progress.completedNodeIds) {
    const node = course.nodeById.get(nodeId)
    if (!node) continue
    for (const exerciseId of node.exerciseIds) {
      const exercise = course.exerciseById.get(exerciseId)
      if (exercise && exercise.primaryTargetId) pool.push({ targetId: exercise.primaryTargetId, exercise })
    }
  }
  if (pool.length === 0) return { kind: 'extra', items: [], backlog: 0 }
  const start = hashString(seed) % pool.length
  const items: ReviewItem[] = []
  const usedTargets = new Set<string>()
  for (let offset = 0; offset < pool.length && items.length < limit; offset += 1) {
    const item = pool[(start + offset) % pool.length]!
    if (usedTargets.has(item.targetId)) continue
    usedTargets.add(item.targetId)
    items.push(item)
  }
  return { kind: 'extra', items, backlog: 0 }
}
