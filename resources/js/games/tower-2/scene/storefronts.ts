import { DOOR_STEP, type Facing } from '../engine/building'
import type { UseKind } from '../engine/uses'

export const SIGN_NAMES = ['VEXLU', 'PONVU', 'NYBZO', 'REMMU', 'DOVVI', 'MOSSWINK', '42'] as const
export const LOBBY_SIGN = 6
export const SIGN_WIDTH = 384
export const SIGN_HEIGHT = 96
export const SIGN_PADDING = 4
export const SIGN_STRIDE_X = SIGN_WIDTH + SIGN_PADDING * 2
export const SIGN_STRIDE_Y = SIGN_HEIGHT + SIGN_PADDING * 2

/** Presentation only: stable per saved room id, with no RNG or save fields. */
export function signChoice(use: UseKind, roomId: number): number | null {
  if (!Number.isSafeInteger(roomId) || roomId < 0 || (use !== 'shop' && use !== 'cafe')) return null
  const hash = Math.imul(roomId ^ (roomId >>> 16), 0x9e3779b1) >>> 0
  return (use === 'shop' ? 0 : 3) + hash % 3
}

/** Top-down image coordinates inside a padded sign cell (two columns, four rows). */
export function signUV(index: number, u: number, v: number): readonly [number, number] {
  if (!Number.isInteger(index) || index < 0 || index >= SIGN_NAMES.length) throw new RangeError('Unknown sign face')
  return [
    ((index % 2) * SIGN_STRIDE_X + SIGN_PADDING + 0.5 + u * (SIGN_WIDTH - 1)) / (SIGN_STRIDE_X * 2),
    1 - (Math.floor(index / 2) * SIGN_STRIDE_Y + SIGN_PADDING + 0.5 + v * (SIGN_HEIGHT - 1)) / (SIGN_STRIDE_Y * 4),
  ]
}

export type ScenePoint = readonly [number, number, number]

/** Clockwise wall coordinates, so lettering always reads left-to-right from outside. */
export function wallPoint(x: number, y: number, side: Facing, along: number, height: number, proud: number): ScenePoint {
  if (side === 'south') return [x + along, height, y + 1 + proud]
  if (side === 'north') return [x + 1 - along, height, y - proud]
  if (side === 'east') return [x + 1 + proud, height, y + 1 - along]
  return [x - proud, height, y + along]
}

export function wallFace(x: number, y: number, side: Facing, a: number, b: number, bottom: number, top: number, proud: number): readonly ScenePoint[] {
  return [wallPoint(x, y, side, a, bottom, proud), wallPoint(x, y, side, b, bottom, proud), wallPoint(x, y, side, b, top, proud), wallPoint(x, y, side, a, top, proud)]
}

export function wallNormal(side: Facing): readonly [number, number, number] {
  const step = DOOR_STEP[side]
  return [step.x, 0, step.y]
}
