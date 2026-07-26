import { type CSSProperties, type ReactElement } from 'react'

import { cn } from '@/lib/utils'

import type { BoardSize, Tile } from '../gameTypes'
import { TILE_ANIMATION_MS } from '../gameTypes'
import { tileColorClass, tileFontSize } from './tileStyles'

interface TileViewProps {
  tile: Tile
  size: BoardSize
  /** Doubled this move — plays the merge pop. */
  merged: boolean
  /** Spawned by this move — plays the appear pop. */
  spawned: boolean
  /** Absorbed by a merge: slides into the survivor, then unmounts. */
  ghost: boolean
}

/**
 * One tile, absolutely positioned inside the board and moved with a CSS
 * transform. `translate` percentages resolve against the tile's own box, which
 * is exactly one cell, so `translate(200%, 100%)` is column 2 / row 1 with no
 * pixel math and no re-layout while animating.
 */
export function TileView({ ghost, merged, size, spawned, tile }: TileViewProps): ReactElement {
  const style: CSSProperties = {
    width: `${100 / size}%`,
    height: `${100 / size}%`,
    transform: `translate(${tile.column * 100}%, ${tile.row * 100}%)`,
    transitionProperty: 'transform',
    transitionDuration: `${TILE_ANIMATION_MS}ms`,
    transitionTimingFunction: 'ease-in-out',
    zIndex: ghost ? 1 : 2,
    opacity: ghost ? 0.999 : 1,
  }

  return (
    <div
      aria-hidden={ghost ? true : undefined}
      className="twenty48-tile absolute left-0 top-0 p-[3%] will-change-transform"
      data-column={tile.column}
      data-ghost={ghost ? 'true' : undefined}
      data-row={tile.row}
      data-testid={ghost ? `ghost-tile-${tile.id}` : `tile-${tile.id}`}
      data-value={tile.value}
      style={style}
    >
      <div
        className={cn(
          'flex h-full w-full items-center justify-center rounded-[8%] font-black tabular-nums shadow-sm select-none',
          tileColorClass(tile.value),
          merged && 'twenty48-tile-pop',
          spawned && 'twenty48-tile-appear',
        )}
        style={{ fontSize: tileFontSize(tile.value, size) }}
      >
        {tile.value}
      </div>
    </div>
  )
}
