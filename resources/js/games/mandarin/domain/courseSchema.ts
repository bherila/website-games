/**
 * Zod mirror of `resources/data/mandarin/course.schema.json`.
 *
 * The JSON schema is the canonical structural contract shared with the Laravel
 * import that Codex will write; this module makes the same shape available to
 * TypeScript at build/test time so components never reach into raw JSON. Keep
 * the two in sync — `__tests__/course.test.ts` cross-checks every key of the
 * JSON schema against this file.
 */
import { z } from 'zod'

const id = z.string().min(1)

export const audioVariantSchema = z.enum(['normal', 'slow'])

export const courseAudioRefSchema = z.object({
  sourceKind: z.enum(['utterance', 'target']),
  sourceId: id,
  variant: audioVariantSchema,
}).strict()

export const optionSchema = z.object({ id, label: z.string() }).strict()

export const choiceExerciseSchema = z.object({
  id,
  kind: z.literal('audio_choice'),
  phase: z.enum(['training', 'checkpoint']),
  nodeId: z.string().nullable(),
  sceneId: z.string().nullable(),
  primaryTargetId: z.string().nullable(),
  promptAudio: z.array(courseAudioRefSchema),
  question: z.string(),
  options: z.array(optionSchema).min(3).max(3),
  correctOptionId: id,
  explanation: z.string(),
  allowSlow: z.boolean(),
  allowTextHelp: z.boolean(),
  shuffleOptions: z.boolean(),
}).strict()

export const constructionExerciseSchema = z.object({
  id,
  kind: z.literal('chunk_order'),
  phase: z.literal('practice'),
  nodeId: id,
  sceneId: id,
  primaryTargetId: z.null(),
  sourceUtteranceId: id,
  question: z.string(),
  tiles: z.array(z.object({ id, zh: z.string() }).strict()),
  correctTileIds: z.array(id),
  displayAnswer: z.string(),
  explanation: z.string(),
}).strict()

export const targetSchema = z.object({
  id,
  zh: z.string(),
  pinyin: z.string(),
  en: z.string(),
  introducedInNode: id,
  speechText: z.string(),
  notes: z.array(z.string()),
}).strict()

export const supportSchema = z.object({
  id,
  zh: z.string(),
  pinyin: z.string(),
  en: z.string(),
  introducedInNode: id,
}).strict()

export const utteranceSchema = z.object({
  id,
  roleId: id,
  zh: z.string(),
  pinyin: z.string(),
  en: z.string(),
  speechText: z.string(),
  nodeId: z.string().nullable(),
  sceneId: z.string().nullable(),
  requiresTargetIds: z.array(id),
  usage: z.enum(['dialogue', 'training_variant', 'checkpoint_reserved']),
  audioVariants: z.array(audioVariantSchema),
}).strict()

export const nodeSchema = z.object({
  id,
  sceneId: id,
  order: z.number().int().min(1),
  title: z.string(),
  introducedTargetIds: z.array(id),
  introducedSupportIds: z.array(id),
  teachingUtteranceIds: z.array(id),
  exerciseIds: z.array(id),
  constructionIds: z.array(id),
  prerequisites: z.array(id),
}).strict()

export const sceneSettingSchema = z.enum(['gate', 'street', 'bridge', 'roadside', 'reunion'])

export const sceneSchema = z.object({
  id,
  order: z.number().int().min(1),
  title: z.string(),
  /** The JSON schema allows any non-empty string; the renderer needs one of five known settings. */
  setting: sceneSettingSchema,
  objective: z.string(),
  setup: z.string(),
  nodeIds: z.array(id),
  dialogueUtteranceIds: z.array(id),
  artSlotId: id,
  grammarNote: z.object({ title: z.string(), body: z.string() }).strict(),
  unlockAfterSceneId: z.string().nullable(),
}).strict()

export const courseSchema = z.object({
  schemaVersion: z.literal(1),
  courseId: id,
  contentVersion: id,
  title: z.string(),
  locale: z.object({
    spokenLanguage: z.string(),
    writtenLocale: z.string(),
    uiLocale: z.string(),
    pinyinConvention: z.string(),
  }).strict(),
  provenance: z.object({
    kind: z.literal('original_ai_draft'),
    createdAt: z.string(),
    nativeReviewed: z.boolean(),
    audioAuditioned: z.boolean(),
    notes: z.string(),
  }).strict(),
  roles: z.array(z.object({ id, name: z.string(), portraitSlotId: id }).strict()),
  scenes: z.array(sceneSchema),
  nodes: z.array(nodeSchema),
  targets: z.array(targetSchema),
  supportGlossary: z.array(supportSchema),
  utterances: z.array(utteranceSchema),
  exercises: z.array(choiceExerciseSchema),
  constructionExercises: z.array(constructionExerciseSchema),
  checkpointExercises: z.array(choiceExerciseSchema),
  checkpointPolicy: z.object({
    unlockAfterNodeId: id,
    normalSpeedOnFirstPresentation: z.boolean(),
    firstExposureOnlyForFreshScore: z.boolean(),
    recordReplayAndHelp: z.boolean(),
    feedbackAfterSubmission: z.boolean(),
    updateComponentSchedules: z.boolean(),
    voiceTransferClaim: z.boolean(),
  }).strict(),
  teachingPolicy: z.object({
    teachBeforeScoring: z.boolean(),
    onePrimaryTargetPerReview: z.boolean(),
    hideTextDuringAudioAssessment: z.boolean(),
    sceneCompletionIsNotMastery: z.boolean(),
    maximumNewPrimaryTargetsPerNode: z.number().int(),
  }).strict(),
  audioPolicy: z.object({
    roleMapping: z.string(),
    variants: z.array(audioVariantSchema),
    generation: z.literal('server_lazy_curated_only'),
    noAudioIsNotWrongAnswer: z.boolean(),
  }).strict(),
  sfx: z.array(z.object({
    id,
    recipe: id,
    purpose: z.string(),
    maxDurationMs: z.number().int().min(1),
  }).strict()),
}).strict()

export type Course = z.infer<typeof courseSchema>
export type CourseScene = z.infer<typeof sceneSchema>
export type CourseNode = z.infer<typeof nodeSchema>
export type CourseTarget = z.infer<typeof targetSchema>
export type CourseSupport = z.infer<typeof supportSchema>
export type CourseUtterance = z.infer<typeof utteranceSchema>
export type ChoiceExercise = z.infer<typeof choiceExerciseSchema>
export type ConstructionExercise = z.infer<typeof constructionExerciseSchema>
export type CourseAudioRef = z.infer<typeof courseAudioRefSchema>
export type SceneSetting = z.infer<typeof sceneSettingSchema>
export type AudioVariant = z.infer<typeof audioVariantSchema>

export class CourseValidationError extends Error {
  constructor(public readonly problems: readonly string[]) {
    super(`Course validation failed:\n${problems.join('\n')}`)
    this.name = 'CourseValidationError'
  }
}

/** Structural parse; throws CourseValidationError on any shape problem. */
export function parseCourseStructure(raw: unknown): Course {
  const result = courseSchema.safeParse(raw)
  if (!result.success) {
    throw new CourseValidationError(result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`))
  }
  return result.data
}

/**
 * Referential checks the JSON schema cannot express. Mirrors what the Laravel
 * import should reject; keep the list additive so the two stay comparable.
 */
export function validateCourseSemantics(course: Course): string[] {
  const problems: string[] = []
  const ids = <T extends { id: string }>(items: readonly T[], label: string): Map<string, T> => {
    const map = new Map<string, T>()
    for (const item of items) {
      if (map.has(item.id)) {
        problems.push(`${label} id duplicated: ${item.id}`)
      }
      map.set(item.id, item)
    }
    return map
  }

  const scenes = ids(course.scenes, 'scene')
  const nodes = ids(course.nodes, 'node')
  const targets = ids(course.targets, 'target')
  const supports = ids(course.supportGlossary, 'support')
  const utterances = ids(course.utterances, 'utterance')
  const exercises = ids(course.exercises, 'exercise')
  const constructions = ids(course.constructionExercises, 'construction')
  const checkpoints = ids(course.checkpointExercises, 'checkpoint')
  const roles = ids(course.roles, 'role')

  for (const scene of course.scenes) {
    for (const nodeId of scene.nodeIds) {
      const node = nodes.get(nodeId)
      if (!node) problems.push(`scene ${scene.id} references missing node ${nodeId}`)
      else if (node.sceneId !== scene.id) problems.push(`node ${nodeId} belongs to ${node.sceneId}, listed under ${scene.id}`)
    }
    for (const utteranceId of scene.dialogueUtteranceIds) {
      const utterance = utterances.get(utteranceId)
      if (!utterance) problems.push(`scene ${scene.id} references missing utterance ${utteranceId}`)
      else if (utterance.usage === 'checkpoint_reserved') problems.push(`scene ${scene.id} exposes reserved utterance ${utteranceId}`)
    }
    if (scene.unlockAfterSceneId !== null && !scenes.has(scene.unlockAfterSceneId)) {
      problems.push(`scene ${scene.id} unlocks after missing scene ${scene.unlockAfterSceneId}`)
    }
  }

  for (const node of course.nodes) {
    if (!scenes.has(node.sceneId)) problems.push(`node ${node.id} references missing scene ${node.sceneId}`)
    if (node.introducedTargetIds.length > course.teachingPolicy.maximumNewPrimaryTargetsPerNode) {
      problems.push(`node ${node.id} introduces more than ${course.teachingPolicy.maximumNewPrimaryTargetsPerNode} targets`)
    }
    for (const targetId of node.introducedTargetIds) {
      const target = targets.get(targetId)
      if (!target) problems.push(`node ${node.id} introduces missing target ${targetId}`)
      else if (target.introducedInNode !== node.id) problems.push(`target ${targetId} says it is introduced in ${target.introducedInNode}, not ${node.id}`)
    }
    for (const supportId of node.introducedSupportIds) {
      if (!supports.has(supportId)) problems.push(`node ${node.id} introduces missing support ${supportId}`)
    }
    for (const utteranceId of node.teachingUtteranceIds) {
      const utterance = utterances.get(utteranceId)
      if (!utterance) problems.push(`node ${node.id} teaches missing utterance ${utteranceId}`)
      else if (utterance.usage === 'checkpoint_reserved') problems.push(`node ${node.id} teaches reserved utterance ${utteranceId}`)
    }
    for (const exerciseId of node.exerciseIds) {
      const exercise = exercises.get(exerciseId)
      if (!exercise) problems.push(`node ${node.id} references missing exercise ${exerciseId}`)
      else if (exercise.nodeId !== node.id) problems.push(`exercise ${exerciseId} belongs to ${exercise.nodeId}, listed under ${node.id}`)
    }
    for (const constructionId of node.constructionIds) {
      if (!constructions.has(constructionId)) problems.push(`node ${node.id} references missing construction ${constructionId}`)
    }
    for (const prerequisite of node.prerequisites) {
      if (!nodes.has(prerequisite)) problems.push(`node ${node.id} requires missing node ${prerequisite}`)
    }
  }

  for (const utterance of course.utterances) {
    if (!roles.has(utterance.roleId)) problems.push(`utterance ${utterance.id} has unknown role ${utterance.roleId}`)
    for (const targetId of utterance.requiresTargetIds) {
      if (!targets.has(targetId)) problems.push(`utterance ${utterance.id} requires missing target ${targetId}`)
    }
    if (utterance.usage === 'checkpoint_reserved' && (utterance.nodeId !== null || utterance.sceneId !== null)) {
      problems.push(`reserved utterance ${utterance.id} must not be attached to a node or scene`)
    }
  }

  const checkChoice = (exercise: ChoiceExercise, reserved: boolean): void => {
    if (!exercise.options.some((option) => option.id === exercise.correctOptionId)) {
      problems.push(`exercise ${exercise.id} correct option ${exercise.correctOptionId} is not one of its options`)
    }
    if (exercise.primaryTargetId !== null && !targets.has(exercise.primaryTargetId)) {
      problems.push(`exercise ${exercise.id} targets missing ${exercise.primaryTargetId}`)
    }
    for (const ref of exercise.promptAudio) {
      if (ref.sourceKind === 'utterance') {
        const utterance = utterances.get(ref.sourceId)
        if (!utterance) problems.push(`exercise ${exercise.id} plays missing utterance ${ref.sourceId}`)
        else if ((utterance.usage === 'checkpoint_reserved') !== reserved) {
          problems.push(`exercise ${exercise.id} ${reserved ? 'must use' : 'must not use'} a reserved utterance (${ref.sourceId})`)
        }
      } else if (!targets.has(ref.sourceId)) {
        problems.push(`exercise ${exercise.id} plays missing target ${ref.sourceId}`)
      }
    }
  }
  for (const exercise of course.exercises) {
    if (exercise.phase !== 'training') problems.push(`exercise ${exercise.id} is not a training exercise`)
    checkChoice(exercise, false)
  }
  for (const exercise of course.checkpointExercises) {
    if (exercise.phase !== 'checkpoint') problems.push(`checkpoint ${exercise.id} is not a checkpoint exercise`)
    checkChoice(exercise, true)
  }
  for (const construction of course.constructionExercises) {
    if (!utterances.has(construction.sourceUtteranceId)) problems.push(`construction ${construction.id} sources missing utterance ${construction.sourceUtteranceId}`)
    const tileIds = new Set(construction.tiles.map((tile) => tile.id))
    if (construction.correctTileIds.length !== construction.tiles.length || construction.correctTileIds.some((tileId) => !tileIds.has(tileId))) {
      problems.push(`construction ${construction.id} answer does not use exactly its tiles`)
    }
  }
  if (!nodes.has(course.checkpointPolicy.unlockAfterNodeId)) {
    problems.push(`checkpoint unlocks after missing node ${course.checkpointPolicy.unlockAfterNodeId}`)
  }
  if (checkpoints.size === 0) problems.push('no checkpoint exercises')

  return problems
}

/** Full parse: structure + referential integrity. */
export function parseCourse(raw: unknown): Course {
  const course = parseCourseStructure(raw)
  const problems = validateCourseSemantics(course)
  if (problems.length > 0) {
    throw new CourseValidationError(problems)
  }
  return course
}
