import type { BoardSize } from './grid'

/** Empty margin around the board, in cells (room for the wooden frame). */
export const BOARD_MARGIN_CELLS = 0.45

/** CSS-pixel placement of the board inside the canvas container. */
export interface BoardLayout {
  /** Container size. */
  width: number
  height: number
  /** Size of one cell in CSS px. */
  cellSize: number
  /** Top-left corner of cell (0, 0) in container CSS px. */
  left: number
  top: number
}

/** Contain-fits the board (plus its frame margin) in the container, centred. */
export function computeBoardLayout(board: BoardSize, width: number, height: number): BoardLayout {
  const cellSize = Math.max(1, Math.min(
    width / (board.cols + (BOARD_MARGIN_CELLS * 2)),
    height / (board.rows + (BOARD_MARGIN_CELLS * 2)),
  ))

  return {
    width,
    height,
    cellSize,
    left: (width - (board.cols * cellSize)) / 2,
    top: (height - (board.rows * cellSize)) / 2,
  }
}

/** Container px → world units (+y up, board spans x∈[0, cols], y∈[0, rows]). */
export function screenToWorld(board: BoardSize, layout: BoardLayout, x: number, y: number): [number, number] {
  return [(x - layout.left) / layout.cellSize, board.rows - ((y - layout.top) / layout.cellSize)]
}

/** World → container px. */
export function worldToScreen(board: BoardSize, layout: BoardLayout, x: number, y: number): [number, number] {
  return [layout.left + (x * layout.cellSize), layout.top + ((board.rows - y) * layout.cellSize)]
}

/**
 * Orthographic frustum matching `computeBoardLayout`. Bounds are relative to the camera,
 * which sits over the board centre (cols / 2, rows / 2).
 */
export function orthoFrustum(layout: BoardLayout): { left: number; right: number; top: number; bottom: number } {
  const halfW = layout.width / layout.cellSize / 2
  const halfH = layout.height / layout.cellSize / 2

  return { left: -halfW, right: halfW, top: halfH, bottom: -halfH }
}
