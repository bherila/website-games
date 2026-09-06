/**
 * Learner-visible progress for the preview partition. Story unlocks are
 * permanent and independent of any memory estimate; nothing here is a
 * spaced-repetition scheduler (the gateway projection owns due lists).
 */
import type { AssistanceLevel, OpportunityOutcome } from './assessment'
import type { CourseIndex } from './course'

export const PROGRESS_VERSION = 1 as const

export interface OpportunitySummary {
  opportunityId: string
  exerciseId: string
  mode: OpportunityOutcome['mode']
  nodeId: string | null
  firstAction: 'answer' | 'dont_know' | 'skip' | null
  firstCorrect: boolean | null
  firstAssistance: AssistanceLevel | null
  attempts: number
  resolvedCorrect: boolean
  helpUsed: boolean
  at: string
}

export interface CheckpointResult {
  exerciseId: string
  /** First-ever presentation of this reserved item in this partition. */
  fresh: boolean
  correct: boolean | null
  assistance: AssistanceLevel
  replays: number
  at: string
}

export interface PreviewProgress {
  version: typeof PROGRESS_VERSION
  courseId: string
  contentVersion: string
  onboardingComplete: boolean
  currentNodeId: string
  introducedNodeIds: string[]
  completedNodeIds: string[]
  completedSceneIds: string[]
  opportunities: OpportunitySummary[]
  constructions: Record<string, { attempts: number; solved: boolean }>
  checkpoint: {
    exposedExerciseIds: string[]
    results: CheckpointResult[]
  }
  reviewSessionsCompleted: number
  updatedAt: string
}

const MAX_OPPORTUNITIES = 600

export function createInitialProgress(course: CourseIndex, now: () => string = isoNow): PreviewProgress {
  const first = course.nodes[0]
  if (!first) throw new Error('Course has no nodes')
  return {
    version: PROGRESS_VERSION,
    courseId: course.identity.courseId,
    contentVersion: course.identity.contentVersion,
    onboardingComplete: false,
    currentNodeId: first.id,
    introducedNodeIds: [],
    completedNodeIds: [],
    completedSceneIds: [],
    opportunities: [],
    constructions: {},
    checkpoint: { exposedExerciseIds: [], results: [] },
    reviewSessionsCompleted: 0,
    updatedAt: now(),
  }
}

export function isoNow(): string {
  return new Date().toISOString()
}

export type SceneStatus = 'locked' | 'available' | 'in_progress' | 'complete'
export type NodeStatus = 'locked' | 'available' | 'introduced' | 'complete'

export function isSceneUnlocked(progress: PreviewProgress, course: CourseIndex, sceneId: string): boolean {
  const scene = course.sceneById.get(sceneId)
  if (!scene) return false
  return scene.unlockAfterSceneId === null || progress.completedSceneIds.includes(scene.unlockAfterSceneId)
}

export function isNodeUnlocked(progress: PreviewProgress, course: CourseIndex, nodeId: string): boolean {
  const node = course.nodeById.get(nodeId)
  if (!node) return false
  if (!isSceneUnlocked(progress, course, node.sceneId)) return false
  return node.prerequisites.every((prerequisite) => progress.completedNodeIds.includes(prerequisite))
}

export function nodeStatus(progress: PreviewProgress, course: CourseIndex, nodeId: string): NodeStatus {
  if (progress.completedNodeIds.includes(nodeId)) return 'complete'
  if (!isNodeUnlocked(progress, course, nodeId)) return 'locked'
  return progress.introducedNodeIds.includes(nodeId) ? 'introduced' : 'available'
}

export function sceneStatus(progress: PreviewProgress, course: CourseIndex, sceneId: string): SceneStatus {
  if (progress.completedSceneIds.includes(sceneId)) return 'complete'
  if (!isSceneUnlocked(progress, course, sceneId)) return 'locked'
  const scene = course.sceneById.get(sceneId)
  const touched = scene?.nodeIds.some((nodeId) => progress.introducedNodeIds.includes(nodeId) || progress.completedNodeIds.includes(nodeId))
  return touched ? 'in_progress' : 'available'
}

/** True once both nodes of the scene have been introduced (teaching seen). */
export function sceneFullyIntroduced(progress: PreviewProgress, course: CourseIndex, sceneId: string): boolean {
  const scene = course.sceneById.get(sceneId)
  return !!scene && scene.nodeIds.every((nodeId) => progress.introducedNodeIds.includes(nodeId))
}

export function isCheckpointUnlocked(progress: PreviewProgress, course: CourseIndex): boolean {
  return progress.completedNodeIds.includes(course.course.checkpointPolicy.unlockAfterNodeId)
}

export function markOnboardingComplete(progress: PreviewProgress, now: () => string = isoNow): PreviewProgress {
  return { ...progress, onboardingComplete: true, updatedAt: now() }
}

export function markNodeIntroduced(progress: PreviewProgress, nodeId: string, now: () => string = isoNow): PreviewProgress {
  if (progress.introducedNodeIds.includes(nodeId)) return progress
  return { ...progress, introducedNodeIds: [...progress.introducedNodeIds, nodeId], currentNodeId: nodeId, updatedAt: now() }
}

export function recordOpportunity(
  progress: PreviewProgress,
  outcome: OpportunityOutcome,
  nodeId: string | null,
  now: () => string = isoNow,
): PreviewProgress {
  const summary: OpportunitySummary = {
    opportunityId: outcome.opportunityId,
    exerciseId: outcome.exerciseId,
    mode: outcome.mode,
    nodeId,
    firstAction: outcome.firstAttempt?.action ?? null,
    firstCorrect: outcome.firstAttempt?.correct ?? null,
    firstAssistance: outcome.firstAttempt?.assistance ?? null,
    attempts: outcome.attempts,
    resolvedCorrect: outcome.resolvedCorrect,
    helpUsed: outcome.helpUsed,
    at: now(),
  }
  const existing = progress.opportunities.filter((item) => item.opportunityId !== outcome.opportunityId)
  const opportunities = [...existing, summary].slice(-MAX_OPPORTUNITIES)
  return { ...progress, opportunities, updatedAt: now() }
}

export function recordConstruction(
  progress: PreviewProgress,
  constructionId: string,
  solved: boolean,
  now: () => string = isoNow,
): PreviewProgress {
  const previous = progress.constructions[constructionId] ?? { attempts: 0, solved: false }
  return {
    ...progress,
    constructions: { ...progress.constructions, [constructionId]: { attempts: previous.attempts + 1, solved: previous.solved || solved } },
    updatedAt: now(),
  }
}

/**
 * Completing a node is a story unlock, not mastery: any resolved run through
 * its exercises (helped or not) counts. Returns the scene that just completed,
 * if any, so the caller can show the scene beat.
 */
export function completeNode(
  progress: PreviewProgress,
  course: CourseIndex,
  nodeId: string,
  now: () => string = isoNow,
): { progress: PreviewProgress; completedSceneId: string | null } {
  const node = course.nodeById.get(nodeId)
  if (!node) return { progress, completedSceneId: null }
  const completedNodeIds = progress.completedNodeIds.includes(nodeId)
    ? progress.completedNodeIds
    : [...progress.completedNodeIds, nodeId]
  const scene = course.sceneById.get(node.sceneId)
  const sceneDone = !!scene && scene.nodeIds.every((id) => completedNodeIds.includes(id))
  const completedSceneIds = sceneDone && scene && !progress.completedSceneIds.includes(scene.id)
    ? [...progress.completedSceneIds, scene.id]
    : progress.completedSceneIds
  const next = course.nextNodeId(nodeId)
  return {
    progress: {
      ...progress,
      completedNodeIds,
      completedSceneIds,
      currentNodeId: next ?? nodeId,
      updatedAt: now(),
    },
    completedSceneId: sceneDone && scene && !progress.completedSceneIds.includes(scene.id) ? scene.id : null,
  }
}

export function recordCheckpointResult(
  progress: PreviewProgress,
  result: Omit<CheckpointResult, 'fresh' | 'at'>,
  now: () => string = isoNow,
): PreviewProgress {
  const fresh = !progress.checkpoint.exposedExerciseIds.includes(result.exerciseId)
  return {
    ...progress,
    checkpoint: {
      exposedExerciseIds: fresh
        ? [...progress.checkpoint.exposedExerciseIds, result.exerciseId]
        : progress.checkpoint.exposedExerciseIds,
      results: [...progress.checkpoint.results, { ...result, fresh, at: now() }],
    },
    updatedAt: now(),
  }
}

export function markCheckpointExposed(progress: PreviewProgress, exerciseId: string, now: () => string = isoNow): PreviewProgress {
  if (progress.checkpoint.exposedExerciseIds.includes(exerciseId)) return progress
  return {
    ...progress,
    checkpoint: { ...progress.checkpoint, exposedExerciseIds: [...progress.checkpoint.exposedExerciseIds, exerciseId] },
    updatedAt: now(),
  }
}

export function recordReviewSessionComplete(progress: PreviewProgress, now: () => string = isoNow): PreviewProgress {
  return { ...progress, reviewSessionsCompleted: progress.reviewSessionsCompleted + 1, updatedAt: now() }
}

export interface SceneSummary {
  sceneId: string
  completed: boolean
  questions: number
  firstAttemptCorrect: number
  usedHelp: number
  newTargetIds: string[]
  newSupportIds: string[]
}

/** Summary for the scene-completion beat. Deliberately has no "mastered" field. */
export function summarizeScene(progress: PreviewProgress, course: CourseIndex, sceneId: string): SceneSummary {
  const scene = course.sceneById.get(sceneId)
  if (!scene) throw new Error(`Unknown scene ${sceneId}`)
  const nodes = scene.nodeIds.map((nodeId) => course.nodeById.get(nodeId)).filter((node) => node !== undefined)
  const exerciseIds = new Set(nodes.flatMap((node) => node.exerciseIds))
  const latestByExercise = new Map<string, OpportunitySummary>()
  for (const opportunity of progress.opportunities) {
    if (opportunity.mode === 'lesson' && exerciseIds.has(opportunity.exerciseId) && !latestByExercise.has(opportunity.exerciseId)) {
      latestByExercise.set(opportunity.exerciseId, opportunity)
    }
  }
  let firstAttemptCorrect = 0
  let usedHelp = 0
  for (const opportunity of latestByExercise.values()) {
    if (opportunity.firstCorrect === true && opportunity.firstAssistance === 'unaided') firstAttemptCorrect += 1
    if (opportunity.helpUsed || opportunity.attempts > 1) usedHelp += 1
  }
  return {
    sceneId,
    completed: progress.completedSceneIds.includes(sceneId),
    questions: exerciseIds.size,
    firstAttemptCorrect,
    usedHelp,
    newTargetIds: nodes.flatMap((node) => node.introducedTargetIds),
    newSupportIds: nodes.flatMap((node) => node.introducedSupportIds),
  }
}

/** Targets and support entries the learner has been taught so far (never reserved text). */
export function learnerVisibleVocabulary(progress: PreviewProgress, course: CourseIndex): { targetIds: string[]; supportIds: string[] } {
  const seen = new Set([...progress.introducedNodeIds, ...progress.completedNodeIds])
  const targetIds: string[] = []
  const supportIds: string[] = []
  for (const node of course.nodes) {
    if (!seen.has(node.id)) continue
    targetIds.push(...node.introducedTargetIds)
    supportIds.push(...node.introducedSupportIds)
  }
  return { targetIds, supportIds }
}

/** Conservative structural check for stored progress; never trusts unknown shapes. */
export function parseStoredProgress(value: unknown, course: CourseIndex): PreviewProgress | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (record.version !== PROGRESS_VERSION) return null
  if (record.courseId !== course.identity.courseId) return null
  const strings = (input: unknown): string[] => Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string') : []
  const currentNodeId = typeof record.currentNodeId === 'string' && course.nodeById.has(record.currentNodeId)
    ? record.currentNodeId
    : course.nodes[0]!.id
  const checkpoint = typeof record.checkpoint === 'object' && record.checkpoint !== null ? record.checkpoint as Record<string, unknown> : {}
  return {
    version: PROGRESS_VERSION,
    courseId: course.identity.courseId,
    contentVersion: typeof record.contentVersion === 'string' ? record.contentVersion : course.identity.contentVersion,
    onboardingComplete: record.onboardingComplete === true,
    currentNodeId,
    introducedNodeIds: strings(record.introducedNodeIds).filter((id) => course.nodeById.has(id)),
    completedNodeIds: strings(record.completedNodeIds).filter((id) => course.nodeById.has(id)),
    completedSceneIds: strings(record.completedSceneIds).filter((id) => course.sceneById.has(id)),
    opportunities: Array.isArray(record.opportunities)
      ? record.opportunities.filter((item): item is OpportunitySummary =>
        typeof item === 'object' && item !== null && typeof (item as OpportunitySummary).opportunityId === 'string'
        && typeof (item as OpportunitySummary).exerciseId === 'string')
      : [],
    constructions: typeof record.constructions === 'object' && record.constructions !== null
      ? record.constructions as PreviewProgress['constructions']
      : {},
    checkpoint: {
      exposedExerciseIds: strings(checkpoint.exposedExerciseIds),
      results: Array.isArray(checkpoint.results)
        ? checkpoint.results.filter((item): item is CheckpointResult => typeof item === 'object' && item !== null && typeof (item as CheckpointResult).exerciseId === 'string')
        : [],
    },
    reviewSessionsCompleted: typeof record.reviewSessionsCompleted === 'number' ? record.reviewSessionsCompleted : 0,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : isoNow(),
  }
}
