import type { ReactElement } from 'react'

import { type PieceId, PIECES, pieceVariant, type Vec2 } from '../pieces/pieceCatalog'
import { FAMILY_COLORS, TRAMPOLINE_COLOR } from '../scene/palette'

interface PieceIconProps {
  pieceId: PieceId
  variant?: number
  flipped?: boolean
  className?: string
  /** Grey the icon out (used-up tray cards). */
  muted?: boolean
}

const PAD = 0.12

/**
 * Tray silhouette drawn straight from the catalog's wall polylines — the same data the
 * physics and the 3D meshes use — so the icon always matches the real piece.
 */
export function PieceIcon({ pieceId, variant = 0, flipped = false, className, muted = false }: PieceIconProps): ReactElement {
  const piece = PIECES[pieceId]
  const shape = pieceVariant(pieceId, variant)
  const size = Math.max(shape.w, shape.h)
  const offsetX = (size - shape.w) / 2
  const offsetY = (size - shape.h) / 2
  const color = muted ? '#94a3b8' : piece.id === 'trampoline' ? TRAMPOLINE_COLOR : FAMILY_COLORS[piece.family]
  const toSvg = ([x, y]: Vec2): string => {
    const localX = flipped ? shape.w - x : x
    return `${(offsetX + localX).toFixed(3)},${(size - offsetY - y).toFixed(3)}`
  }
  const strokeWidth = size * 0.11

  return (
    <svg
      aria-hidden="true"
      className={className}
      data-piece-icon={pieceId}
      viewBox={`${-PAD * size} ${-PAD * size} ${size * (1 + (PAD * 2))} ${size * (1 + (PAD * 2))}`}
    >
      <rect fill="none" height={size} rx={size * 0.08} stroke={muted ? '#cbd5e1' : '#e2e8f0'} strokeDasharray={`${size * 0.04} ${size * 0.06}`} strokeWidth={size * 0.02} width={size} x={0} y={0} />
      {piece.family === 'tube' && shape.walls.length === 2 && (
        <polygon
          fill={color}
          opacity={0.22}
          points={[...(shape.walls[0]?.points ?? []), ...[...(shape.walls[1]?.points ?? [])].reverse()].map(toSvg).join(' ')}
        />
      )}
      {shape.walls.map((wall) => (
        <polyline
          fill="none"
          key={wall.points.map((point) => point.join(',')).join(' ')}
          points={wall.points.map(toSvg).join(' ')}
          stroke={piece.id === 'trampoline' && !muted ? '#1f2937' : color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth * ((wall.thickness ?? 0.1) / 0.1)}
        />
      ))}
      {piece.id === 'trampoline' && (
        <g stroke={color} strokeLinecap="round" strokeWidth={strokeWidth}>
          <line x1={offsetX + 0.08} x2={offsetX + 0.08} y1={size - offsetY - 0.22} y2={size - offsetY} />
          <line x1={offsetX + 0.92} x2={offsetX + 0.92} y1={size - offsetY - 0.22} y2={size - offsetY} />
        </g>
      )}
      {piece.behavior?.kind === 'launcher' && (
        <g fill={color} stroke={color} strokeLinecap="round" strokeWidth={strokeWidth * 0.6} transform={`translate(${offsetX + 0.3} ${size - offsetY - 0.35}) rotate(${flipped ? -(180 - piece.behavior.angleDeg) : -piece.behavior.angleDeg})`}>
          <line x1={0} x2={0.42} y1={0} y2={0} />
          <polygon points="0.5,0 0.34,-0.1 0.34,0.1" />
        </g>
      )}
    </svg>
  )
}
