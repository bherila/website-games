import { cellKey, footprintCells, placementProblem, reservedCells } from '../board/grid'
import { PIECES } from '../pieces/pieceCatalog'
import type { Cell, LevelDef, PiecePlacement } from './levelTypes'

function inBounds(level: LevelDef, cell: Cell): boolean {
  return cell.col >= 0 && cell.row >= 0 && cell.col < level.cols && cell.row < level.rows
}

/** Static checks for a level definition. Returns human-readable problems (empty = valid). */
export function validateLevel(level: LevelDef): string[] {
  const problems: string[] = []
  const where = `Level ${level.id}`

  if (level.cols < 3 || level.rows < 3 || level.cols > 10 || level.rows > 12) {
    problems.push(`${where}: board ${level.cols}×${level.rows} is outside 3–10 × 3–12.`)
  }

  const singles: [string, Cell][] = [
    ['start', level.start],
    ['goal', level.goal],
    ...level.pegs.map((peg, index): [string, Cell] => [`peg ${index}`, peg]),
    ...level.noBuild.map((cell, index): [string, Cell] => [`no-build ${index}`, cell]),
  ]
  for (const [label, cell] of singles) {
    if (!inBounds(level, cell)) {
      problems.push(`${where}: ${label} (${cellKey(cell)}) is off the board.`)
    }
  }

  const claimed = new Map<string, string>()
  const claim = (cell: Cell, label: string): void => {
    const key = cellKey(cell)
    const owner = claimed.get(key)
    if (owner) {
      problems.push(`${where}: ${label} overlaps ${owner} at (${key}).`)
    }
    claimed.set(key, label)
  }

  singles.forEach(([label, cell]) => claim(cell, label))
  level.blocks.forEach((block, index) => {
    for (let row = block.row; row < block.row + block.h; row += 1) {
      for (let col = block.col; col < block.col + block.w; col += 1) {
        if (!inBounds(level, { col, row })) {
          problems.push(`${where}: block ${index} runs off the board.`)
        }
        claim({ col, row }, `block ${index}`)
      }
    }
  })
  level.fixed.forEach((fixed, index) => {
    for (const cell of footprintCells(fixed)) {
      if (!inBounds(level, cell)) {
        problems.push(`${where}: fixed piece ${index} runs off the board.`)
      }
      claim(cell, `fixed piece ${index}`)
    }
  })

  const inventoryTotal = Object.values(level.inventory).reduce((sum, count) => sum + (count ?? 0), 0)
  if (inventoryTotal < 1) {
    problems.push(`${where}: inventory is empty.`)
  }

  const placed: PiecePlacement[] = []
  for (const placement of level.solution) {
    const problem = placementProblem(level, placed, placement)
    if (problem) {
      problems.push(`${where}: solution piece ${placement.pieceId} at (${placement.col},${placement.row}) is illegal: ${problem}.`)
    }
    if (placement.variant >= PIECES[placement.pieceId].variants.length) {
      problems.push(`${where}: solution piece ${placement.pieceId} uses a missing variant.`)
    }
    placed.push(placement)
  }

  if (level.par.three < level.solution.length) {
    problems.push(`${where}: 3-star par (${level.par.three}) is below the reference solution (${level.solution.length}).`)
  }
  if (level.par.two < level.par.three) {
    problems.push(`${where}: 2-star par must be ≥ 3-star par.`)
  }

  if (level.tutorial) {
    const reserved = reservedCells(level)
    if (reserved.has(cellKey(level.tutorial.cell))) {
      problems.push(`${where}: tutorial cell is not buildable.`)
    }
    const matches = level.solution.some((placement) => placement.pieceId === level.tutorial?.pieceId
      && placement.col === level.tutorial.cell.col
      && placement.row === level.tutorial.cell.row)
    if (!matches) {
      problems.push(`${where}: tutorial step does not match the reference solution.`)
    }
  }

  return problems
}
