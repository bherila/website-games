/**
 * Pure board-orientation math for Chick's Challenge — no DOM, no React.
 *
 * Levels are not all square (the shipped pack ranges from 7x13 to 12x5), so on a
 * mismatched viewport the board can be rendered rotated a quarter turn to buy a
 * substantially larger tile size. Two independent pieces live here:
 *
 * 1. `chooseQuarterTurns` — the rotation *decision* (whether a quarter turn buys
 *    enough tile size, plus a symmetric hysteresis band so the board never
 *    oscillates).
 * 2. `rotatedTurnsForDeviceAngle` — the rotation *direction*, derived from
 *    `screen.orientation.angle` so the board comes out world-upright whichever way
 *    the phone was turned (clockwise fallback when the angle is unknown).
 * 3. `rotateIntent` — the input *remap*, so a swipe / D-pad press toward what the
 *    player sees as "up" still steps the chick that way once the board is rotated.
 *
 * All are unit-tested in `__tests__/orientation.test.ts`.
 */

import type { Direction, MoveIntent } from '../engine/types'
import { MIN_PX_PER_TILE, pxPerTileToFitBoard, type Viewport } from '../scene/cameraRig'

/** Clockwise quarter turns applied to the rendered board. Only 0, 1 and 3 are chosen at runtime. */
export type QuarterTurns = 0 | 1 | 2 | 3

/**
 * The two rotations a turned board can render at, in clockwise quarter turns:
 * `1` = 90 deg clockwise (board-up renders at screen-right),
 * `3` = 90 deg counter-clockwise (board-up renders at screen-left).
 */
export type RotatedQuarterTurns = 1 | 3

/** Rotations the auto/manual decision can produce: upright, or a quarter turn either way. */
export type BoardQuarterTurns = 0 | RotatedQuarterTurns

/**
 * Device-only board-rotation preference (raw localStorage, never account-synced —
 * same class of setting as the mute toggle). `auto` is the default.
 */
export type BoardOrientationPreference = 'auto' | 'upright' | 'rotated'

export const BOARD_ORIENTATION_PREFERENCES: readonly BoardOrientationPreference[] = ['auto', 'rotated', 'upright']

/**
 * Minimum tile-size gain before the auto decision flips, applied symmetrically
 * in both directions (rotate only at >= +15% tile size; un-rotate only at
 * >= +15% the other way). The band between the two is sticky, which is what
 * keeps the board from flipping back and forth when a phone is held near 45
 * degrees or when mobile browser chrome shows/hides (a few percent of height).
 */
export const ROTATE_GAIN_THRESHOLD = 1.15

/**
 * Tile size at which an upright board is already comfortable to read, so trading
 * a familiar orientation for even more pixels is a bad deal. Twice the scene's
 * legibility floor (`MIN_PX_PER_TILE`): rotation exists to rescue cramped boards
 * on phones, not to maximise pixels on a desktop monitor.
 */
export const COMFORTABLE_PX_PER_TILE = 2 * MIN_PX_PER_TILE

/**
 * Direction a turned board defaults to when the device orientation is unknown —
 * the behaviour before the angle was consulted at all, and the fallback for every
 * browser that does not expose `screen.orientation` (and for jsdom).
 */
export const DEFAULT_ROTATED_QUARTER_TURNS: RotatedQuarterTurns = 1

/**
 * The `screen.orientation.angle` value that means "the device has been turned
 * CLOCKWISE from its natural orientation" — i.e. its top edge now points to the
 * world's right.
 *
 * **This single constant is the whole angle convention; flip it to 90 to reverse
 * the mapping** if a real device disagrees (the API's angle is the screen's
 * rotation relative to natural, and while 270 is the near-universal reading of a
 * clockwise turn — matching the legacy `window.orientation === -90` — it is not
 * guaranteed uniform across devices).
 *
 * Why the sign matters: the direction only has an observable effect while the CSS
 * viewport is *not* following the device (rotation lock, or a portrait-locked
 * install), because otherwise the browser has already made screen-up = world-up.
 * In that locked frame screen-up points wherever the device's top edge points, so
 * a device turned clockwise (top edge to the world's right) needs the board turned
 * counter-clockwise for board-up to come out world-up, and vice versa.
 */
export const DEVICE_ANGLE_TURNED_CLOCKWISE = 270

/** The four angles `screen.orientation.angle` reports; anything else is snapped to the nearest. */
export type DeviceOrientationAngle = 0 | 90 | 180 | 270

/**
 * Snaps a raw `screen.orientation.angle` to the nearest quarter turn, or `null`
 * for a value that cannot be interpreted at all (missing API, `NaN`, Infinity).
 */
export function normaliseDeviceAngle(angle: number | null | undefined): DeviceOrientationAngle | null {
  if (typeof angle !== 'number' || !Number.isFinite(angle)) {
    return null
  }

  const quarters = ((Math.round(angle / 90) % 4) + 4) % 4

  return (quarters * 90) as DeviceOrientationAngle
}

/**
 * Which way a turned board should rotate for the given device angle. Never
 * throws and never returns 0: this chooses the *direction* of a rotation, it
 * never decides *whether* to rotate (that stays purely geometric, in
 * `chooseQuarterTurns`). An unreadable angle falls back to clockwise, so the
 * board still rotates exactly when it used to.
 *
 * Natural and upside-down portrait (0 / 180) have no world-upright answer — a
 * quarter turn is sideways either way — so they keep the clockwise default too.
 */
export function rotatedTurnsForDeviceAngle(angle: number | null | undefined): RotatedQuarterTurns {
  return normaliseDeviceAngle(angle) === DEVICE_ANGLE_TURNED_CLOCKWISE ? 3 : DEFAULT_ROTATED_QUARTER_TURNS
}

export interface BoardSize {
  readonly cols: number
  readonly rows: number
}

export interface Box {
  readonly width: number
  readonly height: number
}

/**
 * Tile size (px) achievable for `board` inside `viewport` at the given rotation.
 * A quarter turn swaps which board axis is measured against which viewport axis;
 * the board itself always renders unrotated inside a box whose dimensions are
 * swapped before the CSS rotation is applied (see BoardRotor.tsx).
 */
export function tilePxForRotation(viewport: Viewport, board: BoardSize, quarterTurns: QuarterTurns): number {
  const swapped = quarterTurns % 2 === 1

  return pxPerTileToFitBoard(viewport, swapped ? board.rows : board.cols, swapped ? board.cols : board.rows)
}

export interface OrientationDecision {
  readonly viewport: Box
  readonly board: BoardSize
  /** The rotation currently applied — the hysteresis anchor. */
  readonly current: BoardQuarterTurns
  readonly preference: BoardOrientationPreference
  /**
   * Which way to turn when the rule decides to rotate — from
   * `rotatedTurnsForDeviceAngle`. Only the *direction* comes from the device; the
   * rotate/don't-rotate decision below is unaffected by it.
   */
  readonly rotatedTurns?: RotatedQuarterTurns
  readonly gainThreshold?: number
  readonly minPxPerTile?: number
  readonly comfortablePxPerTile?: number
}

/**
 * The rotation rule, in order:
 *
 * 1. A manual preference always wins.
 * 2. A square board never rotates (a quarter turn cannot change its fit).
 * 3. **Fit gate** — rotate only if the rotated orientation shows the whole board
 *    at the `MIN_PX_PER_TILE` legibility floor. Boards too big to fit either way
 *    are handled by the scene's follow camera, whose visible tile count is fixed
 *    (`MIN_TILES_ACROSS`), so rotating such a board buys no context at all and
 *    only disorients the player.
 * 4. **Comfort ceiling** — never rotate a board that is already comfortable
 *    upright (`COMFORTABLE_PX_PER_TILE`), which is what keeps desktop windows
 *    unrotated even where a quarter turn would technically add pixels.
 * 5. **Gain + hysteresis** — flip only when the other orientation yields at least
 *    `gainThreshold` times the current orientation's tile size, applied
 *    symmetrically so the band between the two is sticky.
 *
 * Whether to rotate is decided purely from geometry; `rotatedTurns` only picks
 * which way a rotation goes, so an unknown device angle can never leave a board
 * unrotated that would otherwise have turned. Degenerate inputs (unmeasured
 * viewport, no board) hold the current rotation rather than snapping to upright.
 */
export function chooseQuarterTurns({
  viewport,
  board,
  current,
  preference,
  rotatedTurns = DEFAULT_ROTATED_QUARTER_TURNS,
  gainThreshold = ROTATE_GAIN_THRESHOLD,
  minPxPerTile = MIN_PX_PER_TILE,
  comfortablePxPerTile = COMFORTABLE_PX_PER_TILE,
}: OrientationDecision): BoardQuarterTurns {
  if (preference === 'upright') {
    return 0
  }
  // 'rotated' means "turned the device-appropriate way", not "turned clockwise".
  if (preference === 'rotated') {
    return rotatedTurns
  }

  const upright = tilePxForRotation(viewport, board, 0)
  const rotated = tilePxForRotation(viewport, board, 1)
  if (upright <= 0 || rotated <= 0) {
    return current
  }

  // A square board renders identically at either rotation, so a quarter turn can
  // never buy tile size — and the symmetric hysteresis band below would otherwise
  // hold such a board rotated forever once it got there.
  if (board.cols === board.rows) {
    return 0
  }

  // Hysteresis anchors on "is the board turned", not on which way it is turned:
  // re-turning the same board the other way is not a fit change.
  const isRotated = current !== 0

  // The fit floor is relaxed by the same margin while already rotated, so a board
  // sitting right on the floor cannot oscillate as browser chrome shows and hides.
  const fitFloor = isRotated ? minPxPerTile / gainThreshold : minPxPerTile
  if (rotated < fitFloor) {
    return 0
  }

  // Mirror relaxation on the comfort ceiling: an already-rotated board needs the
  // upright view to be comfortable by the same margin before it flips back.
  const comfortCeiling = isRotated ? comfortablePxPerTile * gainThreshold : comfortablePxPerTile
  if (upright >= comfortCeiling) {
    return 0
  }

  if (!isRotated) {
    return rotated >= upright * gainThreshold ? rotatedTurns : 0
  }

  return upright >= rotated * gainThreshold ? 0 : rotatedTurns
}

/** Cycle order for the toolbar toggle: auto -> rotated -> upright -> auto. */
export function cycleBoardOrientationPreference(preference: BoardOrientationPreference): BoardOrientationPreference {
  const index = BOARD_ORIENTATION_PREFERENCES.indexOf(preference)

  return BOARD_ORIENTATION_PREFERENCES[(index + 1) % BOARD_ORIENTATION_PREFERENCES.length] ?? 'auto'
}

/** Directions in clockwise screen order — the basis for the quarter-turn remap. */
const CLOCKWISE_DIRECTIONS: readonly Direction[] = ['up', 'right', 'down', 'left']

/**
 * Maps a *screen-space* intent (what the player swiped / which D-pad arrow they
 * pressed) to the *board-space* intent the engine consumes, given how many
 * clockwise quarter turns the board is rendered with.
 *
 * A clockwise board rotation of 90 deg renders board-`right` pointing at screen-down,
 * so the inverse rotation applies to the intent: screen-`up` becomes board-`left`.
 * The modular arithmetic covers all four rotations, so the counter-clockwise board
 * (3 quarter turns) is the mirror mapping — screen-`up` becomes board-`right` —
 * with no special case. `wait` is rotation-invariant. Accepts any integer (mod 4)
 * so the round trip `rotateIntent(rotateIntent(i, n), 4 - n)` is the identity.
 */
export function rotateIntent(intent: MoveIntent, quarterTurns: number): MoveIntent {
  if (intent === 'wait') {
    return 'wait'
  }

  const index = CLOCKWISE_DIRECTIONS.indexOf(intent)
  if (index < 0) {
    return intent
  }

  const turns = ((Math.trunc(quarterTurns) % 4) + 4) % 4

  return CLOCKWISE_DIRECTIONS[(index - turns + 4) % 4] ?? intent
}

/**
 * Clamps a measured element box to the visual viewport, so the board never sizes
 * itself into area hidden behind mobile browser chrome or an on-screen keyboard
 * (`100dvh` handles the steady state; `visualViewport` handles the transient one).
 * Conservative on purpose: it only ever shrinks the box, and never mixes
 * coordinate spaces.
 */
export function clampBoxToVisualViewport(box: Box, visual: Box | null | undefined): Box {
  if (!visual || visual.width <= 0 || visual.height <= 0) {
    return box
  }

  return {
    width: Math.min(box.width, visual.width),
    height: Math.min(box.height, visual.height),
  }
}
