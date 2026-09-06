/**
 * Typed, indexed view over the canonical course JSON. This is the only module
 * that imports the JSON file; everything else asks the index.
 */
import courseJson from '../../../../data/mandarin/foundations.v1.json'
import type { AudioSourceRef, CourseIdentity } from '../contracts/mandarin'
import {
  type ChoiceExercise,
  type ConstructionExercise,
  type Course,
  type CourseAudioRef,
  type CourseNode,
  type CourseScene,
  type CourseSupport,
  type CourseTarget,
  type CourseUtterance,
  parseCourse,
} from './courseSchema'

export interface SpokenText {
  zh: string
  pinyin: string
  en: string
  /** Story role for portraits; targets are read by the narrator. */
  roleId: string | null
}

export interface CourseIndex {
  course: Course
  identity: CourseIdentity
  scenes: readonly CourseScene[]
  /** Nodes in journey order (scene order, then node order). */
  nodes: readonly CourseNode[]
  sceneById: ReadonlyMap<string, CourseScene>
  nodeById: ReadonlyMap<string, CourseNode>
  targetById: ReadonlyMap<string, CourseTarget>
  supportById: ReadonlyMap<string, CourseSupport>
  utteranceById: ReadonlyMap<string, CourseUtterance>
  exerciseById: ReadonlyMap<string, ChoiceExercise>
  constructionById: ReadonlyMap<string, ConstructionExercise>
  checkpointById: ReadonlyMap<string, ChoiceExercise>
  roleById: ReadonlyMap<string, Course['roles'][number]>
  /** Utterance IDs that must never be shown before the listening check. */
  reservedUtteranceIds: ReadonlySet<string>
  sourceText(ref: Pick<AudioSourceRef, 'sourceKind' | 'sourceId'>): SpokenText | null
  nextNodeId(nodeId: string): string | null
  previousNodeId(nodeId: string): string | null
  sceneForNode(nodeId: string): CourseScene
  /** Exercises whose primary target is the given target, in course order. */
  exercisesForTarget(targetId: string): readonly ChoiceExercise[]
}

function indexBy<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]))
}

export function buildCourseIndex(course: Course): CourseIndex {
  const scenes = [...course.scenes].sort((a, b) => a.order - b.order)
  const nodeById = indexBy(course.nodes)
  const nodes = scenes.flatMap((scene) => scene.nodeIds.map((nodeId) => {
    const node = nodeById.get(nodeId)
    if (!node) throw new Error(`Scene ${scene.id} lists unknown node ${nodeId}`)
    return node
  })).sort((a, b) => a.order - b.order)
  const sceneById = indexBy(scenes)
  const targetById = indexBy(course.targets)
  const supportById = indexBy(course.supportGlossary)
  const utteranceById = indexBy(course.utterances)
  const exerciseById = indexBy(course.exercises)
  const constructionById = indexBy(course.constructionExercises)
  const checkpointById = indexBy(course.checkpointExercises)
  const roleById = indexBy(course.roles)
  const reservedUtteranceIds = new Set(course.utterances.filter((u) => u.usage === 'checkpoint_reserved').map((u) => u.id))
  const exercisesByTarget = new Map<string, ChoiceExercise[]>()
  for (const exercise of course.exercises) {
    if (exercise.primaryTargetId === null) continue
    const list = exercisesByTarget.get(exercise.primaryTargetId) ?? []
    list.push(exercise)
    exercisesByTarget.set(exercise.primaryTargetId, list)
  }

  const nodeOrder = nodes.map((node) => node.id)

  return {
    course,
    identity: { courseId: course.courseId, contentVersion: course.contentVersion },
    scenes,
    nodes,
    sceneById,
    nodeById,
    targetById,
    supportById,
    utteranceById,
    exerciseById,
    constructionById,
    checkpointById,
    roleById,
    reservedUtteranceIds,
    sourceText(ref) {
      if (ref.sourceKind === 'utterance') {
        const utterance = utteranceById.get(ref.sourceId)
        return utterance ? { zh: utterance.zh, pinyin: utterance.pinyin, en: utterance.en, roleId: utterance.roleId } : null
      }
      if (ref.sourceKind === 'target') {
        const target = targetById.get(ref.sourceId)
        return target ? { zh: target.zh, pinyin: target.pinyin, en: target.en, roleId: null } : null
      }
      return null
    },
    nextNodeId(nodeId) {
      const index = nodeOrder.indexOf(nodeId)
      return index >= 0 ? nodeOrder[index + 1] ?? null : null
    },
    previousNodeId(nodeId) {
      const index = nodeOrder.indexOf(nodeId)
      return index > 0 ? nodeOrder[index - 1] ?? null : null
    },
    sceneForNode(nodeId) {
      const node = nodeById.get(nodeId)
      const scene = node ? sceneById.get(node.sceneId) : undefined
      if (!scene) throw new Error(`Unknown node ${nodeId}`)
      return scene
    },
    exercisesForTarget(targetId) {
      return exercisesByTarget.get(targetId) ?? []
    },
  }
}

let cached: CourseIndex | null = null

/** Parses and indexes the bundled course once per module instance. */
export function loadCourse(): CourseIndex {
  if (!cached) {
    cached = buildCourseIndex(parseCourse(courseJson))
  }
  return cached
}

/** Convert a course prompt ref into the gateway's source ref (same shape today, kept explicit). */
export function toSourceRef(ref: CourseAudioRef): AudioSourceRef {
  return { sourceKind: ref.sourceKind, sourceId: ref.sourceId, variant: ref.variant }
}

export function sourceKey(ref: AudioSourceRef): string {
  return `${ref.sourceKind}:${ref.sourceId}:${ref.variant}`
}

export function withVariant(ref: AudioSourceRef, variant: 'normal' | 'slow'): AudioSourceRef {
  if (ref.sourceKind === 'sfx') return ref
  return { sourceKind: ref.sourceKind, sourceId: ref.sourceId, variant }
}
