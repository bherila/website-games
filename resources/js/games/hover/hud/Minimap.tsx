import { type ReactElement, type RefObject } from 'react'

export interface MinimapProps {
  canvasRef: RefObject<HTMLCanvasElement | null>
  widthPx: number
  heightPx: number
}

/**
 * Presentational canvas surface for the minimap. Drawing happens in the game
 * loop via drawMinimap(ctx, ...) against canvasRef.current — this component
 * only owns sizing and layout.
 */
export function Minimap({ canvasRef, widthPx, heightPx }: MinimapProps): ReactElement {
  const dpr = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1)

  return (
    <canvas
      ref={canvasRef}
      width={Math.round(widthPx * dpr)}
      height={Math.round(heightPx * dpr)}
      role="img"
      aria-label="Minimap"
      className="rounded-lg border border-white/20 shadow-lg"
      style={{ display: 'block', width: widthPx, height: heightPx }}
    />
  )
}
