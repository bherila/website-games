import { applyMove } from '../engine/applyMove'
import { boardFromValues, boardValues } from '../engine/board'
import type { BoardSize, Direction } from '../gameTypes'
import { BOARD_SIZES } from '../gameTypes'

function move(values: readonly (readonly number[])[], direction: Direction): number[][] {
  return boardValues(applyMove(boardFromValues(values), direction).board)
}

describe('applyMove', () => {
  it('slides tiles to the swiped edge in every direction', () => {
    const board = [
      [0, 0, 2, 0],
      [0, 0, 0, 0],
      [0, 4, 0, 0],
      [0, 0, 0, 0],
    ]

    expect(move(board, 'left')).toEqual([
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [4, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    expect(move(board, 'right')).toEqual([
      [0, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 4],
      [0, 0, 0, 0],
    ])
    expect(move(board, 'up')).toEqual([
      [0, 4, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    expect(move(board, 'down')).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 4, 2, 0],
    ])
  })

  it('merges equal neighbours and scores the merged value', () => {
    const outcome = applyMove(boardFromValues([
      [2, 2, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]), 'left')

    expect(boardValues(outcome.board)[0]).toEqual([4, 0, 0, 0])
    expect(outcome.gained).toBe(4)
    expect(outcome.merges).toBe(1)
    expect(outcome.moved).toBe(true)
  })

  it('never merges a tile twice in one move', () => {
    expect(move([
      [2, 2, 2, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ], 'left')[0]).toEqual([4, 4, 0, 0])

    expect(move([
      [4, 4, 8, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ], 'left')[0]).toEqual([8, 8, 0, 0])
  })

  it('merges the pair nearest the swiped edge when three tiles line up', () => {
    expect(move([
      [2, 2, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ], 'left')[0]).toEqual([4, 2, 0, 0])

    expect(move([
      [2, 2, 2, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ], 'right')[0]).toEqual([0, 0, 2, 4])
  })

  it('scores every merge in a multi-line move', () => {
    const outcome = applyMove(boardFromValues([
      [2, 2, 4, 4],
      [8, 8, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]), 'left')

    expect(outcome.gained).toBe(4 + 8 + 16)
    expect(outcome.merges).toBe(3)
  })

  it('reports an unchanged board as not moved', () => {
    const outcome = applyMove(boardFromValues([
      [2, 4, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]), 'left')

    expect(outcome.moved).toBe(false)
    expect(outcome.gained).toBe(0)
    expect(outcome.absorbed).toEqual([])
  })

  it('keeps the leading tile id through a merge and reports the absorbed tile at the merge cell', () => {
    const board = boardFromValues([
      [2, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    const leading = board.tiles[0]
    const trailing = board.tiles[1]
    const outcome = applyMove(board, 'left')

    expect(outcome.board.tiles).toEqual([{ id: leading?.id, value: 4, row: 0, column: 0 }])
    expect(outcome.mergedTileIds).toEqual([leading?.id])
    expect(outcome.absorbed).toEqual([{ id: trailing?.id, value: 2, row: 0, column: 0 }])
  })

  it('preserves ids of tiles that only slide', () => {
    const board = boardFromValues([
      [0, 0, 0, 2],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ])
    const outcome = applyMove(board, 'left')

    expect(outcome.board.tiles[0]?.id).toBe(board.tiles[0]?.id)
    expect(outcome.board.nextTileId).toBe(board.nextTileId)
  })

  it('applies the same semantics on every supported board size', () => {
    for (const size of BOARD_SIZES) {
      const values = Array.from({ length: size }, () => Array.from({ length: size }, () => 0))
      const firstRow = values[0]
      if (!firstRow) {
        throw new Error('unreachable')
      }
      firstRow[size - 2] = 2
      firstRow[size - 1] = 2

      const outcome = applyMove(boardFromValues(values), 'right')
      const resultRow = boardValues(outcome.board)[0]

      expect(outcome.gained).toBe(4)
      expect(resultRow?.[size - 1]).toBe(4)
      expect(resultRow?.filter((value) => value > 0)).toHaveLength(1)
      expect(outcome.board.size).toBe(size satisfies BoardSize)
    }
  })

  it('merges whole columns without leaking tiles between lines', () => {
    expect(move([
      [2, 4, 0],
      [2, 4, 0],
      [2, 4, 0],
    ], 'up')).toEqual([
      [4, 8, 0],
      [2, 4, 0],
      [0, 0, 0],
    ])
  })
})
