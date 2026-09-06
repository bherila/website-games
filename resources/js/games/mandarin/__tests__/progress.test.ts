import { loadCourse } from '../domain/course'
import {
  completeNode,
  createInitialProgress,
  isCheckpointUnlocked,
  isNodeUnlocked,
  isSceneUnlocked,
  learnerVisibleVocabulary,
  markCheckpointExposed,
  markNodeIntroduced,
  parseStoredProgress,
  recordCheckpointResult,
  sceneStatus,
  summarizeScene,
} from '../domain/progress'
import { buildExtraPractice, buildScheduledReview } from '../domain/reviewSession'

const course = loadCourse()
const now = (): string => '2026-09-06T00:00:00.000Z'

describe('preview progress', () => {
  it('starts at the first node with only scene 1 unlocked', () => {
    const progress = createInitialProgress(course, now)
    expect(progress.currentNodeId).toBe('s1n1')
    expect(isSceneUnlocked(progress, course, 's1')).toBe(true)
    expect(isSceneUnlocked(progress, course, 's2')).toBe(false)
    expect(isNodeUnlocked(progress, course, 's1n2')).toBe(false)
    expect(isCheckpointUnlocked(progress, course)).toBe(false)
  })

  it('walks the whole five-scene journey and unlocks the checkpoint only at the end', () => {
    let progress = createInitialProgress(course, now)
    const completedScenes: string[] = []
    for (const node of course.nodes) {
      expect(isNodeUnlocked(progress, course, node.id)).toBe(true)
      progress = markNodeIntroduced(progress, node.id, now)
      const result = completeNode(progress, course, node.id, now)
      progress = result.progress
      if (result.completedSceneId) completedScenes.push(result.completedSceneId)
      if (node.id !== 's5n2') expect(isCheckpointUnlocked(progress, course)).toBe(false)
    }
    expect(completedScenes).toEqual(['s1', 's2', 's3', 's4', 's5'])
    expect(progress.completedNodeIds).toHaveLength(10)
    expect(isCheckpointUnlocked(progress, course)).toBe(true)
    expect(sceneStatus(progress, course, 's5')).toBe('complete')
  })

  it('summarises a scene without any mastery claim', () => {
    const progress = createInitialProgress(course, now)
    const summary = summarizeScene(progress, course, 's1')
    expect(Object.keys(summary)).not.toContain('mastered')
    expect(JSON.stringify(summary)).not.toMatch(/master/i)
    expect(summary.questions).toBe(10)
  })

  it('never lists reserved checkpoint text as learner vocabulary', () => {
    let progress = createInitialProgress(course, now)
    for (const node of course.nodes) progress = completeNode(markNodeIntroduced(progress, node.id, now), course, node.id, now).progress
    const vocabulary = learnerVisibleVocabulary(progress, course)
    expect(vocabulary.targetIds).toHaveLength(30)
    for (const id of vocabulary.targetIds) expect(course.reservedUtteranceIds.has(id)).toBe(false)
  })

  it('keeps the caller-captured freshness of a checkpoint result even after early exposure', () => {
    let progress = createInitialProgress(course, now)
    progress = markCheckpointExposed(progress, 'cp01', now)
    progress = recordCheckpointResult(progress, { exerciseId: 'cp01', fresh: true, correct: null, assistance: 'unscored', replays: 0 }, now)
    expect(progress.checkpoint.results[0]).toMatchObject({ fresh: true, correct: null, assistance: 'unscored' })
    progress = recordCheckpointResult(progress, { exerciseId: 'cp01', fresh: false, correct: true, assistance: 'unaided', replays: 1 }, now)
    expect(progress.checkpoint.results[1]?.fresh).toBe(false)
    expect(progress.checkpoint.exposedExerciseIds).toEqual(['cp01'])
  })

  it('rejects stored progress from another course or version', () => {
    expect(parseStoredProgress({ version: 1, courseId: 'other' }, course)).toBeNull()
    expect(parseStoredProgress({ version: 2, courseId: 'mandarin-foundations' }, course)).toBeNull()
    expect(parseStoredProgress('junk', course)).toBeNull()
    expect(parseStoredProgress({ version: 1, courseId: 'mandarin-foundations', currentNodeId: 'nope' }, course)?.currentNodeId).toBe('s1n1')
  })
})

describe('review sessions', () => {
  it('bounds scheduled review to ten and reports the backlog', () => {
    let progress = createInitialProgress(course, now)
    for (const node of course.nodes.slice(0, 4)) progress = completeNode(progress, course, node.id, now).progress
    const due = [...course.targetById.values()].filter((target) => progress.completedNodeIds.includes(target.introducedInNode)).map((target) => target.id)
    expect(due.length).toBeGreaterThan(10)
    const plan = buildScheduledReview(course, progress, due)
    expect(plan.items).toHaveLength(10)
    expect(plan.backlog).toBe(due.length - 10)
    expect(plan.kind).toBe('scheduled')
  })

  it('ignores due targets the learner has not been taught', () => {
    const progress = createInitialProgress(course, now)
    expect(buildScheduledReview(course, progress, ['hello', 'where']).items).toHaveLength(0)
  })

  it('draws extra practice only from completed nodes and marks it distinct', () => {
    let progress = createInitialProgress(course, now)
    progress = completeNode(progress, course, 's1n1', now).progress
    const plan = buildExtraPractice(course, progress, 'seed')
    expect(plan.kind).toBe('extra')
    expect(plan.items.length).toBeGreaterThan(0)
    for (const item of plan.items) expect(item.exercise.nodeId).toBe('s1n1')
    expect(buildExtraPractice(course, progress, 'seed').items.map((item) => item.exercise.id)).toEqual(plan.items.map((item) => item.exercise.id))
  })
})
