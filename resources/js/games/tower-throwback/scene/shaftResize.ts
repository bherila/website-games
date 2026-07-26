import { shaftDef } from '../engine/catalog'
import { shaftIdAt, unitIdAt } from '../engine/grid'
import { type ShaftResizeResult, validateShaftResize } from '../engine/placement'
import type { EngineCommand, EngineState } from '../gameTypes'

export interface ShaftCapHit {
  end: 'top' | 'bottom'
  shaftId: number
}

export interface ShaftResizeTile {
  floor: number
  x: number
}

export interface ShaftResizeGestureOptions {
  moved: boolean
  toolActive: boolean
}

export function shaftCapAt(state: EngineState, tile: ShaftResizeTile): ShaftCapHit | null {
  if (unitIdAt(state, tile.floor, tile.x) !== 0 || shaftIdAt(state, tile.floor, tile.x) !== 0) {
    return null // a built unit or another shaft owns this tile — the click belongs to it
  }
  for (const shaft of state.shafts) {
    const width = shaftDef(shaft.kind).width
    if (tile.x < shaft.x || tile.x >= shaft.x + width) {
      continue
    }
    if (tile.floor === shaft.topFloor + 1) {
      return { shaftId: shaft.id, end: 'top' }
    }
    if (tile.floor === shaft.bottomFloor - 1) {
      return { shaftId: shaft.id, end: 'bottom' }
    }
  }
  return null
}

export function shaftResizeCommandForDrag(
  state: EngineState,
  cap: ShaftCapHit,
  capFloor: number,
  options: ShaftResizeGestureOptions,
): Extract<EngineCommand, { type: 'resizeShaft' }> | null {
  if (!options.moved || options.toolActive) {
    return null
  }
  const shaft = state.shafts.find((candidate) => candidate.id === cap.shaftId)
  if (!shaft) {
    return null
  }
  return {
    type: 'resizeShaft',
    shaftId: shaft.id,
    bottomFloor: cap.end === 'bottom' ? capFloor + 1 : shaft.bottomFloor,
    topFloor: cap.end === 'top' ? capFloor - 1 : shaft.topFloor,
  }
}

export function shaftResizePreview(
  state: EngineState,
  command: Extract<EngineCommand, { type: 'resizeShaft' }>,
): ShaftResizeResult {
  return validateShaftResize(state, command)
}
