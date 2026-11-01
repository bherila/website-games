import { cellCenter } from '../board/grid'
import type { LevelDef, PiecePlacement } from '../levels/levelTypes'
import { levelWalls, marbleSchedule, pegPosition } from '../physics/runWorld'
import type { Vec2 } from '../pieces/pieceCatalog'

const PATH_GLYPHS = ['*', '+', '~', '^', '%', '&'] as const
const KIND_GLYPHS = { glass: 'g', mini: 'm', steel: 's' } as const

/**
 * ASCII picture of a level, its walls and the marbles' paths — attached to failing
 * solution tests so a broken level can be diagnosed from the CI log alone.
 * `#` walls, `█` blocks, `o` pegs, `$` gems, `S` droppers, `G` baskets (`Gs` = steel only),
 * and one path glyph per marble in release order (`*`, `+`, `~`, …).
 */
export function renderBoardAscii(level: LevelDef, placements: readonly PiecePlacement[], paths: readonly (readonly Vec2[])[]): string {
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
  const label = (x: number, y: number, text: string): void => {
    // Labels are ASCII (`S`, `G` and kind letters), so splitting by UTF-16 unit is exact.
    text.split('').forEach((glyph, index) => plot(x + (index / sx), y, glyph))
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
  for (const gem of level.gems) {
    const [x, y] = cellCenter(level, gem)
    plot(x, y, '$')
  }
  paths.forEach((path, marble) => {
    for (const [x, y] of path) {
      plot(x, y, PATH_GLYPHS[marble % PATH_GLYPHS.length] ?? '*')
    }
  })
  const schedule = marbleSchedule(level)
  level.droppers.forEach((dropper, index) => {
    const [x, y] = cellCenter(level, dropper.cell)
    const kinds = schedule.filter((marble) => marble.dropper === index).map((marble) => KIND_GLYPHS[marble.kind]).join('')
    label(x - 0.3, y + 0.25, `S${kinds}`)
  })
  for (const basket of level.baskets) {
    const [x, y] = cellCenter(level, basket.cell)
    label(x - 0.15, y - 0.2, `G${basket.accepts ? KIND_GLYPHS[basket.accepts] : ''}`)
  }

  return grid.map((line) => line.join('').trimEnd()).join('\n')
}
