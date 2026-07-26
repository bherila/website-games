/**
 * Tile skins. The palette is the classic warm 2048 ramp and is deliberately
 * identical in light and dark mode — the tiles are the light surface in both,
 * and only the board frame and empty cells follow the theme. Class strings are
 * written out literally so Tailwind's scanner keeps them.
 */
const TILE_CLASSES: Readonly<Record<number, string>> = {
  2: 'bg-[#eee4da] text-[#776e65]',
  4: 'bg-[#ede0c8] text-[#776e65]',
  8: 'bg-[#f2b179] text-white',
  16: 'bg-[#f59563] text-white',
  32: 'bg-[#f67c5f] text-white',
  64: 'bg-[#f65e3b] text-white',
  128: 'bg-[#edcf72] text-white',
  256: 'bg-[#edcc61] text-white',
  512: 'bg-[#edc850] text-white',
  1024: 'bg-[#edc53f] text-white',
  2048: 'bg-[#edc22e] text-white',
}

const BEYOND_2048_CLASS = 'bg-[#3c3a32] text-[#f9f6f2]'

export function tileColorClass(value: number): string {
  return TILE_CLASSES[value] ?? BEYOND_2048_CLASS
}

const DIGIT_SCALE: Readonly<Record<number, number>> = { 1: 1, 2: 1, 3: 0.8, 4: 0.62 }

/**
 * Tile label size in container-query width units, so one rule covers every
 * board size and viewport: the board declares `@container`, therefore `cqw` is a
 * percentage of the board's own edge and the type scales with the board instead
 * of with the page. Long numbers step down so 1024 still fits a 6×6 cell.
 */
export function tileFontSize(value: number, size: number): string {
  const digits = String(value).length
  const scale = DIGIT_SCALE[digits] ?? 0.5

  return `${(42 / size * scale).toFixed(2)}cqw`
}
