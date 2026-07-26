/**
 * Elevator stop presentation helpers — pure seams shared by the Three.js
 * structure layer and TowerScene pointer input. Keeping label visibility and
 * click-to-command mapping here makes the SimTower-style floor stop overlay
 * testable without a WebGL renderer or DOM pointer events.
 */

import { shaftDef } from '../engine/catalog'
import { floorLabel } from '../floorLabels'
import type { EngineCommand, EngineState, Shaft } from '../gameTypes'

export interface ElevatorStopLabel {
  shaftId: number
  floor: number
  label: string
  x: number
  width: number
}

export interface TilePoint {
  floor: number
  x: number
}

export interface StopToggleClickOptions {
  moved: boolean
  toolActive: boolean
}

/** Enabled stops are the only stops that receive floor-number labels. */
export function elevatorStopLabels(shafts: Shaft[]): ElevatorStopLabel[] {
  return shafts.flatMap((shaft) => {
    const def = shaftDef(shaft.kind)
    return shaft.enabledStops.map((floor) => ({
      shaftId: shaft.id,
      floor,
      label: floorLabel(floor),
      x: shaft.x + def.width / 2,
      width: def.width,
    }))
  })
}

/** Plain-click mapping: shaft column clicks toggle the clicked floor if it is a candidate landing. */
export function stopToggleCommandAt(state: EngineState, tile: TilePoint): Extract<EngineCommand, { type: 'setStopEnabled' }> | null {
  const shaft = state.shafts.find((candidate) => {
    const def = shaftDef(candidate.kind)
    const withinX = tile.x >= candidate.x && tile.x < candidate.x + def.width
    return withinX && candidate.stops.includes(tile.floor)
  })
  if (!shaft) {
    return null
  }
  return {
    type: 'setStopEnabled',
    shaftId: shaft.id,
    floor: tile.floor,
    enabled: !shaft.enabledStops.includes(tile.floor),
  }
}

/** Toggle only for plain clicks; drags and active build tools keep their existing behavior. */
export function stopToggleCommandForClick(
  state: EngineState,
  tile: TilePoint,
  options: StopToggleClickOptions,
): Extract<EngineCommand, { type: 'setStopEnabled' }> | null {
  if (options.moved || options.toolActive) {
    return null
  }
  return stopToggleCommandAt(state, tile)
}
