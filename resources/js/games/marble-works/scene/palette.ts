import type { MarbleKind } from '../physics/marbles'
import type { PieceFamily } from '../pieces/pieceCatalog'

/** Family colours — shared by the 3D piece meshes and the tray's SVG icons. */
export const FAMILY_COLORS: Readonly<Record<PieceFamily, string>> = {
  track: '#3b82f6',
  ramp: '#2563eb',
  turn: '#f97316',
  tube: '#22d3ee',
  jump: '#ef4444',
  bouncer: '#ec4899',
  sorter: '#8b5cf6',
  glass: '#7dd3fc',
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
/** How each marble kind looks; `badge` also colours its basket and HUD chip. */
export const MARBLE_STYLES: Readonly<Record<MarbleKind, { tint: string; attenuation: string; swirl: readonly string[]; badge: string }>> = {
  glass: { tint: '#f0fbff', attenuation: '#cdeefe', swirl: ['#ef4444', '#f59e0b'], badge: '#38bdf8' },
  mini: { tint: '#ecfdf5', attenuation: '#34d399', swirl: ['#10b981'], badge: '#10b981' },
  steel: { tint: '#d6dde6', attenuation: '#ffffff', swirl: [], badge: '#64748b' },
}
export const GEM_COLOR = '#f43f5e'
export const GLASS_PIECE_TINT = '#bae6fd'
/** The bright rim that makes head-on glass read as glass. */
export const GLASS_PIECE_EDGE = '#0ea5e9'
export const GHOST_OK_COLOR = '#22c55e'
export const GHOST_BAD_COLOR = '#ef4444'
export const SELECTION_COLOR = '#fbbf24'
