/**
 * Every arrangement of every construction exercise. Check is only enabled once
 * all tiles are placed, so these 84 permutations are the complete input space
 * the diagnosis can ever see: 5 target orders and 79 wrong ones.
 */
import { type ConstructionDiagnosis, constructionHint, diagnoseConstruction } from '../domain/construction'
import { CONSTRUCTION_TILES, describeTile, tileMeta } from '../domain/constructionTiles'
import { loadCourse } from '../domain/course'

const course = loadCourse()
const exercises = [...course.constructionById.values()]

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]]
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]))
}

const cases = exercises.flatMap((exercise) =>
  permutations(exercise.tiles.map((tile) => tile.id)).map((placed) => ({ exercise, placed })))

describe('construction diagnosis over every arrangement', () => {
  it('covers 84 arrangements across the five exercises', () => {
    expect(cases).toHaveLength(84)
    expect(cases.filter(({ exercise, placed }) => placed.join('>') === exercise.correctTileIds.join('>'))).toHaveLength(5)
  })

  it.each(cases.map(({ exercise, placed }) => [exercise.id, placed.join(' '), exercise, placed] as const))(
    '%s / %s',
    (_id, _order, exercise, placed) => {
      const diagnosis = diagnoseConstruction(placed, exercise.correctTileIds)
      const solved = placed.join('>') === exercise.correctTileIds.join('>')
      expect(diagnosis.solved).toBe(solved)

      // Marks describe every placed tile, and agree with the target order.
      expect(diagnosis.marks).toHaveLength(placed.length)
      diagnosis.marks.forEach((mark, index) => {
        expect(mark.tileId).toBe(placed[index])
        expect(mark.correct).toBe(exercise.correctTileIds[index] === placed[index])
      })

      // The prefix is exactly the leading run of correct marks.
      const expectedPrefix = diagnosis.marks.findIndex((mark) => !mark.correct)
      expect(diagnosis.correctPrefix).toBe(expectedPrefix === -1 ? placed.length : expectedPrefix)

      if (solved) {
        expect(diagnosis.adjacentSwap).toBeNull()
        expect(diagnosis.strandedFinalTile).toBeNull()
        expect(diagnosis.expectedAtFirstError).toBeNull()
        expect(constructionHint(diagnosis, 1, (id) => id)).toBeNull()
        expect(constructionHint(diagnosis, 2, (id) => id)).toBeNull()
        return
      }

      // A swap is only ever claimed when the attempt really is one.
      if (diagnosis.adjacentSwap) {
        assertIsAdjacentSwap(diagnosis, placed, exercise.correctTileIds)
      }
      // A stranded final piece is present, and genuinely not last.
      if (diagnosis.strandedFinalTile) {
        expect(diagnosis.strandedFinalTile).toBe(exercise.correctTileIds.at(-1))
        expect(placed.at(-1)).not.toBe(diagnosis.strandedFinalTile)
      }

      // Both hint levels are actionable for every wrong arrangement, and every
      // tile they name belongs to this exercise.
      const describe = (id: string): string => describeTile(id, exercise.tiles.find((tile) => tile.id === id)?.zh ?? '')
      for (const level of [1, 2] as const) {
        const hint = constructionHint(diagnosis, level, describe)
        expect(hint).not.toBeNull()
        expect(hint!.text.length).toBeGreaterThan(0)
        if (hint!.tileId !== null) {
          expect(exercise.tiles.some((tile) => tile.id === hint!.tileId)).toBe(true)
        }
      }
    },
  )
})

function assertIsAdjacentSwap(diagnosis: ConstructionDiagnosis, placed: readonly string[], correct: readonly string[]): void {
  const wrong = diagnosis.marks.filter((mark) => !mark.correct).map((mark) => mark.index)
  expect(wrong).toHaveLength(2)
  const [a, b] = wrong as [number, number]
  expect(b).toBe(a + 1)
  expect(placed[a]).toBe(correct[b])
  expect(placed[b]).toBe(correct[a])
}

describe('curated tile metadata', () => {
  it('describes every tile in the course, and nothing that is not a tile', () => {
    const tileIds = exercises.flatMap((exercise) => exercise.tiles.map((tile) => tile.id))
    for (const id of tileIds) expect(tileMeta(id)).not.toBeNull()
    expect(Object.keys(CONSTRUCTION_TILES).sort()).toEqual([...tileIds].sort())
  })

  it('points every curated recording at a real, non-reserved source', () => {
    for (const [tileId, meta] of Object.entries(CONSTRUCTION_TILES)) {
      if (!meta.audio) continue
      if (meta.audio.sourceKind === 'target') {
        expect(course.targetById.get(meta.audio.sourceId)).toBeDefined()
      } else if (meta.audio.sourceKind === 'support') {
        const support = course.supportById.get(meta.audio.sourceId)
        expect(support).toBeDefined()
        expect(support!.zh).toBe(exercises.flatMap((e) => e.tiles).find((tile) => tile.id === tileId)!.zh)
      } else {
        const utterance = course.utteranceById.get(meta.audio.sourceId)
        expect(utterance).toBeDefined()
        // Reserved checkpoint lines must never be played back inside a lesson.
        expect(course.reservedUtteranceIds.has(meta.audio.sourceId)).toBe(false)
        expect(utterance!.zh.replace(/[。？！，]/g, '')).toBe(
          exercises.flatMap((e) => e.tiles).find((tile) => tile.id === tileId)!.zh,
        )
      }
    }
  })

  it('gives every construction tile a curated recording source', () => {
    const silent = Object.entries(CONSTRUCTION_TILES).filter(([, meta]) => meta.audio === null).map(([id]) => id)
    expect(silent).toEqual([])
    expect(CONSTRUCTION_TILES['g03-c3']?.audio).toEqual({ sourceKind: 'support', sourceId: 'at-here', variant: 'normal' })
    expect(course.utteranceById.get('05c')?.speechText).toBe('在这里。')
    expect(CONSTRUCTION_TILES['g04-c1']?.audio).toEqual({ sourceKind: 'support', sourceId: 'please', variant: 'normal' })
    expect(CONSTRUCTION_TILES['g04-c2']?.audio).toEqual({ sourceKind: 'support', sourceId: 'again', variant: 'normal' })
    expect(CONSTRUCTION_TILES['g04-c4']?.audio).toEqual({ sourceKind: 'support', sourceId: 'one-time', variant: 'normal' })
  })
})
