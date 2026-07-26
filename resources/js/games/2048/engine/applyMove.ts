import type { Board, Direction, MoveOutcome, Tile } from '../gameTypes'

/**
 * The move reducer — pure, DOM-free, and the single source of truth for 2048's
 * slide/merge semantics:
 *
 * - every tile slides as far as it can toward the swiped edge;
 * - two equal neighbours merge into one tile of double the value;
 * - a tile produced by a merge cannot merge again in the same move (so a row of
 *   `2 2 2 2` swiped left becomes `4 4`, never `8`);
 * - when three equal tiles line up, the pair nearest the swiped edge merges.
 *
 * The surviving tile of a merge keeps the leading tile's id so the renderer can
 * animate it; the absorbed tile is reported separately, already repositioned
 * onto the merge cell, so it can slide in and then unmount.
 */
export function applyMove(board: Board, direction: Direction): MoveOutcome {
  const horizontal = direction === 'left' || direction === 'right'
  const towardsOrigin = direction === 'left' || direction === 'up'
  const tiles: Tile[] = []
  const absorbed: Tile[] = []
  const mergedTileIds: number[] = []
  let gained = 0
  let merges = 0
  let moved = false

  for (let line = 0; line < board.size; line += 1) {
    const lineTiles = board.tiles
      .filter((tile) => (horizontal ? tile.row : tile.column) === line)
      .sort((left, right) => {
        const leftIndex = horizontal ? left.column : left.row
        const rightIndex = horizontal ? right.column : right.row

        return towardsOrigin ? leftIndex - rightIndex : rightIndex - leftIndex
      })

    let slot = 0
    for (let index = 0; index < lineTiles.length; index += 1) {
      const tile = lineTiles[index]
      if (!tile) {
        continue
      }

      const destination = towardsOrigin ? slot : board.size - 1 - slot
      const row = horizontal ? line : destination
      const column = horizontal ? destination : line
      const follower = lineTiles[index + 1]

      if (follower && follower.value === tile.value) {
        const value = tile.value * 2
        tiles.push({ id: tile.id, value, row, column })
        absorbed.push({ ...follower, row, column })
        mergedTileIds.push(tile.id)
        gained += value
        merges += 1
        moved = true
        index += 1
      } else {
        if (tile.row !== row || tile.column !== column) {
          moved = true
        }
        tiles.push({ ...tile, row, column })
      }

      slot += 1
    }
  }

  return {
    board: { size: board.size, tiles, nextTileId: board.nextTileId },
    gained,
    moved,
    merges,
    absorbed,
    mergedTileIds,
  }
}
