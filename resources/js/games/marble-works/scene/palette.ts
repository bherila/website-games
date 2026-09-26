import type { PieceFamily } from '../pieces/pieceCatalog'

/** Family colours — shared by the 3D piece meshes and the tray's SVG icons. */
export const FAMILY_COLORS: Readonly<Record<PieceFamily, string>> = {
  track: '#3b82f6',
  ramp: '#2563eb',
  turn: '#f97316',
  tube: '#22d3ee',
  jump: '#ef4444',
  bouncer: '#ec4899',
}

export const TRAMPOLINE_COLOR = '#facc15'
export const FIXED_PIECE_COLOR = '#64748b'
export const OBSTACLE_COLOR = '#334155'
export const PEG_COLOR = '#94a3b8'
export const NO_BUILD_COLOR = '#ef4444'
export const PEGBOARD_COLOR = '#ecd9b4'
export const PEGBOARD_HOLE_COLOR = '#b8966a'
export const FRAME_COLOR = '#b07a44'
export const BASKET_COLOR = '#c68a45'
export const BASKET_DARK_COLOR = '#8a5a2b'
export const DROPPER_COLOR = '#a855f7'
export const MARBLE_TINT = '#dff6ff'
export const MARBLE_SWIRL_COLORS = ['#ef4444', '#f59e0b'] as const
export const GHOST_OK_COLOR = '#22c55e'
export const GHOST_BAD_COLOR = '#ef4444'
export const SELECTION_COLOR = '#fbbf24'
