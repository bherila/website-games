/**
 * Pure diagnosis of a submitted sentence-construction attempt.
 *
 * Check is only enabled once every tile is placed, so a wrong submission is
 * always a permutation of the right pieces — never a missing or extra one.
 * That keeps the diagnosis small and exact.
 *
 * Everything here describes *the target sentence*: which pieces sit where the
 * line the learner heard puts them. It never claims a different order is
 * ungrammatical Mandarin. General grammar stays in the authored explanation on
 * each exercise, which is the only text in this feature written by a human.
 */

export interface TileMark {
  tileId: string
  index: number
  /** True when this tile sits where the target sentence has it. */
  correct: boolean
}

export interface ConstructionDiagnosis {
  solved: boolean
  marks: readonly TileMark[]
  /** How many leading tiles already match the target order. */
  correctPrefix: number
  /** The two tiles, in submitted order, when the attempt is one adjacent swap away. */
  adjacentSwap: readonly [string, string] | null
  /** The tile the target sentence has at the first position that is wrong. */
  expectedAtFirstError: string | null
  /** A tile that belongs last in the target sentence but was not placed last. */
  strandedFinalTile: string | null
}

export function diagnoseConstruction(placed: readonly string[], correct: readonly string[]): ConstructionDiagnosis {
  const marks = placed.map((tileId, index) => ({ tileId, index, correct: correct[index] === tileId }))
  const solved = placed.length === correct.length && marks.every((mark) => mark.correct)

  let correctPrefix = 0
  while (correctPrefix < placed.length && correct[correctPrefix] === placed[correctPrefix]) correctPrefix += 1

  const firstError = solved ? -1 : correctPrefix
  const expectedAtFirstError = firstError >= 0 ? correct[firstError] ?? null : null

  // Only describe a swap when the attempt really is one: everything else in
  // place and exactly one neighbouring pair exchanged.
  let adjacentSwap: readonly [string, string] | null = null
  if (!solved && placed.length === correct.length) {
    const wrong = marks.filter((mark) => !mark.correct).map((mark) => mark.index)
    if (wrong.length === 2) {
      const [a, b] = wrong as [number, number]
      if (b === a + 1 && placed[a] === correct[b] && placed[b] === correct[a]) {
        adjacentSwap = [placed[a]!, placed[b]!]
      }
    }
  }

  const finalTile = correct[correct.length - 1] ?? null
  const strandedFinalTile = !solved && finalTile !== null && placed[placed.length - 1] !== finalTile && placed.includes(finalTile)
    ? finalTile
    : null

  return { solved, marks, correctPrefix, adjacentSwap, expectedAtFirstError, strandedFinalTile }
}

export interface ConstructionHint {
  text: string
  /** The tile the hint is about, so the UI can offer its pronunciation. */
  tileId: string | null
}

/**
 * `level` 1 orients the learner; level 2 names the move to make. Both are
 * derived, so both talk about the sentence that was heard and nothing wider.
 * `describe` renders a tile as "吗 — ma, the question particle".
 */
export function constructionHint(
  diagnosis: ConstructionDiagnosis,
  level: 1 | 2,
  describe: (tileId: string) => string,
): ConstructionHint | null {
  if (diagnosis.solved) return null

  if (level === 1) {
    // An empty prefix is the case where "the first N are right" says nothing,
    // so give a placement the learner can act on immediately instead.
    if (diagnosis.correctPrefix === 0) {
      return diagnosis.expectedAtFirstError
        ? { text: `The sentence you heard starts with ${describe(diagnosis.expectedAtFirstError)}.`, tileId: diagnosis.expectedAtFirstError }
        : null
    }
    const piece = diagnosis.correctPrefix === 1 ? 'piece' : 'pieces'
    return {
      text: `The first ${diagnosis.correctPrefix} ${piece} match the sentence you heard. Look at what comes after.`,
      tileId: null,
    }
  }

  if (diagnosis.adjacentSwap) {
    const [first, second] = diagnosis.adjacentSwap
    return { text: `${describe(first)} and ${describe(second)} are the right pieces, the wrong way round.`, tileId: second }
  }
  if (diagnosis.strandedFinalTile) {
    return { text: `Move ${describe(diagnosis.strandedFinalTile)} to the end of this sentence.`, tileId: diagnosis.strandedFinalTile }
  }
  if (diagnosis.expectedAtFirstError) {
    const position = diagnosis.correctPrefix + 1
    return { text: `Position ${position} should be ${describe(diagnosis.expectedAtFirstError)}.`, tileId: diagnosis.expectedAtFirstError }
  }
  return null
}
