import { cellCenter } from '../board/grid'
import type { LevelDef, PiecePlacement } from '../levels/levelTypes'
import { levelWalls, pegPosition } from '../physics/runWorld'
import type { Vec2 } from '../pieces/pieceCatalog'

/**
 * ASCII picture of a level, its walls and a marble path — attached to failing
 * solution tests so a broken level can be diagnosed from the CI log alone.
 * `#` walls, `█` blocks, `o` pegs, `*` marble path, `S` dropper, `G` basket.
 */
export function renderBoardAscii(level: LevelDef, placements: readonly PiecePlacement[], path: readonly Vec2[]): string {
  const sx = 6
  const sy = 3
  const width = level.cols * sx
  const height = level.rows * sy
  const grid: string[][] = Array.from({ length: height }, (_, row) => Array.from({ length: width }, (_, col) => (col % sx === 0 && row % sy === 0 ? '·' : ' ')))
  const plot = (x: number, y: number, glyph: string): void => {
    const col = Math.floor(x * sx)
    const row = Math.floor((level.rows - y) * sy)
    const line = grid[row]
    if (line && col >= 0 && col < width) {
      line[col] = glyph
    }
  }
  for (const block of level.blocks) {
    for (let x = block.col; x < block.col + block.w; x += 1 / sx) {
      for (let y = level.rows - block.row - block.h; y < level.rows - block.row; y += 1 / sy) {
        plot(x + 0.01, y + 0.01, '█')
      }
    }
  }
  for (const peg of level.pegs) {
    const [x, y] = pegPosition(level, peg)
    plot(x, y, 'o')
  }
  for (const wall of levelWalls(level, placements)) {
    for (let i = 0; i < wall.points.length - 1; i += 1) {
      const [x0, y0] = wall.points[i] as Vec2
      const [x1, y1] = wall.points[i + 1] as Vec2
      for (let t = 0; t <= 1; t += 0.02) {
        plot(x0 + ((x1 - x0) * t), y0 + ((y1 - y0) * t), '#')
      }
    }
  }
  for (const [x, y] of path) {
    plot(x, y, '*')
  }
  const [sxw, syw] = cellCenter(level, level.start)
  plot(sxw, syw, 'S')
  const [gx, gy] = cellCenter(level, level.goal)
  plot(gx, gy - 0.2, 'G')

  return grid.map((line) => line.join('')).join('\n')
}
