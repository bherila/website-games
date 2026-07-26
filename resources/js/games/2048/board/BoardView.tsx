import { type ReactElement } from 'react'

import { useSwipeGesture } from '../../_shared/useSwipeGesture'
import type { Board, Direction, Tile } from '../gameTypes'
import { SWIPE_THRESHOLD_PX } from '../gameTypes'
import { TileView } from './TileView'

interface BoardViewProps {
  board: Board
  /** Tiles absorbed by this move's merges; rendered one animation longer. */
  ghosts: readonly Tile[]
  mergedTileIds: readonly number[]
  spawnedTileId: number | null
  onSwipe: (direction: Direction) => void
}

/**
 * The playfield: a square, container-queried grid of empty cells with the tile
 * layer on top. `touch-action: none` keeps a swipe from scrolling the page or
 * triggering pull-to-refresh, and also suppresses double-tap zoom on the board.
 *
 * The width is `min(100%, calc(100dvh - <chrome>))`, so the board is limited by
 * whichever viewport axis is smaller — square and fully visible on a 375×812
 * phone and on a short desktop window alike, with no measurement code.
 *
 * Swipe tracking is shared with Chick's Challenge via `useSwipeGesture`.
 */
export function BoardView({ board, ghosts, mergedTileIds, onSwipe, spawnedTileId }: BoardViewProps): ReactElement {
  const { boardRef, ...swipeHandlers } = useSwipeGesture({ threshold: SWIPE_THRESHOLD_PX, onSwipe })

  const cells: ReactElement[] = []
  for (let row = 0; row < board.size; row += 1) {
    for (let column = 0; column < board.size; column += 1) {
      cells.push(
        <div
          className="absolute left-0 top-0 p-[3%]"
          key={`cell-${row}-${column}`}
          style={{
            width: `${100 / board.size}%`,
            height: `${100 / board.size}%`,
            transform: `translate(${column * 100}%, ${row * 100}%)`,
          }}
        >
          <div className="h-full w-full rounded-[8%] bg-slate-400/25 dark:bg-white/5" />
        </div>,
      )
    }
  }

  return (
    <div
      aria-label={`${board.size} by ${board.size} board`}
      className="@container relative aspect-square w-[min(100%,calc(100dvh_-_15rem))] touch-none rounded-2xl bg-slate-300/70 p-[1.5%] shadow-inner sm:w-[min(100%,calc(100dvh_-_17rem))] dark:bg-slate-800/80"
      data-testid="board"
      ref={boardRef}
      {...swipeHandlers}
    >
      <div className="relative h-full w-full">
        {cells}
        {/* Live tiles and merge ghosts share one keyed array on purpose: a tile
            absorbed by a merge keeps its DOM node when it becomes a ghost, so
            the CSS transform transition slides it into the survivor instead of
            the node being torn down and re-created at the destination. */}
        {[
          ...board.tiles.map((tile) => ({ tile, ghost: false })),
          ...ghosts.map((tile) => ({ tile, ghost: true })),
        ].map(({ ghost, tile }) => (
          <TileView
            ghost={ghost}
            key={tile.id}
            merged={!ghost && mergedTileIds.includes(tile.id)}
            size={board.size}
            spawned={!ghost && spawnedTileId === tile.id}
            tile={tile}
          />
        ))}
      </div>
    </div>
  )
}
