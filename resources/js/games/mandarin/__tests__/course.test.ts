import schemaJson from '../../../../data/mandarin/course.schema.json'
import courseJson from '../../../../data/mandarin/foundations.v1.json'
import { buildCourseIndex, loadCourse, sourceKey } from '../domain/course'
import { CourseValidationError, parseCourse, parseCourseStructure, validateCourseSemantics } from '../domain/courseSchema'

const rawCourse = (): Record<string, unknown> => JSON.parse(JSON.stringify(courseJson)) as Record<string, unknown>

describe('canonical course data', () => {
  it('parses the shipped JSON with the expected shape', () => {
    const course = loadCourse()
    expect(course.identity).toEqual({ courseId: 'mandarin-foundations', contentVersion: '1.1.0' })
    expect(course.scenes.map((scene) => scene.id)).toEqual(Array.from({ length: 10 }, (_, i) => `s${i + 1}`))
    expect(course.scenes.map((scene) => scene.setting)).toEqual(['gate', 'street', 'bridge', 'roadside', 'reunion', 'street', 'bridge', 'roadside', 'gate', 'reunion'])
    expect(course.nodes).toHaveLength(20)
    expect(course.targetById.size).toBe(50)
    expect(course.supportById.size).toBe(20)
    expect(course.utteranceById.size).toBe(100)
    expect(course.exerciseById.size).toBe(100)
    expect(course.constructionById.size).toBe(5)
    expect(course.checkpointById.size).toBe(20)
  })

  it('has no semantic errors and every exercise has exactly three options', () => {
    const course = loadCourse()
    expect(validateCourseSemantics(course.course)).toEqual([])
    for (const exercise of course.exerciseById.values()) {
      expect(exercise.options).toHaveLength(3)
      expect(exercise.options.map((option) => option.id)).toContain(exercise.correctOptionId)
    }
  })

  it('keeps the reserved utterances out of every node and scene', () => {
    const course = loadCourse()
    expect(course.reservedUtteranceIds.size).toBe(20)
    for (const id of course.reservedUtteranceIds) {
      const utterance = course.utteranceById.get(id)!
      expect(utterance.nodeId).toBeNull()
      expect(utterance.sceneId).toBeNull()
      for (const node of course.nodes) expect(node.teachingUtteranceIds).not.toContain(id)
      for (const scene of course.scenes) expect(scene.dialogueUtteranceIds).not.toContain(id)
    }
    for (const checkpoint of course.checkpointById.values()) {
      expect(course.reservedUtteranceIds.has(checkpoint.promptAudio[0]!.sourceId)).toBe(true)
    }
  })

  it('unlocks the checkpoint only after the last node', () => {
    const course = loadCourse()
    expect(course.course.checkpointPolicy.unlockAfterNodeId).toBe('s10n2')
    expect(course.nodes.at(-1)?.id).toBe('s10n2')
  })

  it('rejects structurally invalid course JSON', () => {
    expect(() => parseCourse({ schemaVersion: 2 })).toThrow(CourseValidationError)
    const raw = rawCourse()
    const broken = { ...raw, exercises: (raw.exercises as unknown[]).slice(1) }
    expect(validateCourseSemantics(parseCourseStructure(broken))).toContain('node s1n1 references missing exercise e001')
    expect(() => parseCourse(broken)).toThrow(CourseValidationError)
  })

  it('mirrors the JSON schema required keys', () => {
    const schema = schemaJson as { required: string[] }
    const raw = rawCourse()
    for (const key of schema.required) expect(raw).toHaveProperty(key)
    expect(() => buildCourseIndex(parseCourse(raw))).not.toThrow()
  })

  it('exposes source text and journey navigation', () => {
    const course = loadCourse()
    expect(course.sourceText({ sourceKind: 'utterance', sourceId: '01a' })?.zh).toBe('你好。')
    expect(course.sourceText({ sourceKind: 'target', sourceId: 'hello' })?.en).toBe('Hello.')
    expect(course.sourceText({ sourceKind: 'support', sourceId: 'please' })).toMatchObject({ zh: '请', pinyin: 'qǐng', roleId: null })
    expect(course.nextNodeId('s1n2')).toBe('s2n1')
    expect(course.nextNodeId('s10n2')).toBeNull()
    expect(course.sceneForNode('s3n1').id).toBe('s3')
    expect(sourceKey({ sourceKind: 'utterance', sourceId: '01a', variant: 'slow' })).toBe('utterance:01a:slow')
    expect(sourceKey({ sourceKind: 'support', sourceId: 'please', variant: 'normal' })).toBe('support:please:normal')
  })
})
