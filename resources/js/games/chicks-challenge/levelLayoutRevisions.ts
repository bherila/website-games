import { TOTAL_LEVELS } from './gameTypes'

/** Bump a level's revision whenever its layout changes; stars remain lifetime awards. */
export const LEVEL_LAYOUT_REVISIONS: Readonly<Record<number, number>> = {
  ...Object.fromEntries(Array.from({ length: TOTAL_LEVELS }, (_, index) => [index + 1, 1])),
  7: 2,
  8: 2,
  12: 2,
  22: 2,
  23: 2,
  24: 2,
  37: 2,
  39: 2,
  40: 2,
}
