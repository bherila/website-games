/**
 * Door-anchored elevator queue geometry shared by both person renderers.
 * Queue positions are presentation-only and never feed back into the engine.
 */

import { shaftDef } from '../engine/catalog'
import { GRID_WIDTH, type Person, type Shaft } from '../gameTypes'
import type { SceneFrame } from './sceneFrame'

export const QUEUE_RENDER_MAX = 20
export const QUEUE_ICON_WIDTH = 0.72
export const QUEUE_ICON_HEIGHT = 0.95
export const QUEUE_ICON_Z = 1.3
export const QUEUE_SLOT_SPACING = 0.72

const QUEUE_DOOR_GAP = 0.2

/** Head at the door, then outward toward the side with the most usable floor. */
export function queueSlotX(shaft: Shaft, rank: number): number {
  const width = shaftDef(shaft.kind).width
  const rightDoor = shaft.x + width
  const leftSpace = shaft.x
  const rightSpace = GRID_WIDTH - rightDoor
  const direction = rightSpace >= leftSpace ? 1 : -1
  const door = direction > 0 ? rightDoor : shaft.x
  const firstCenter = door + direction * (QUEUE_DOOR_GAP + QUEUE_ICON_WIDTH / 2)
  const x = firstCenter + direction * Math.max(0, rank) * QUEUE_SLOT_SPACING
  return Math.max(QUEUE_ICON_WIDTH / 2, Math.min(GRID_WIDTH - QUEUE_ICON_WIDTH / 2, x))
}

export function queueOverflowBadgeX(shaft: Shaft): number {
  return queueSlotX(shaft, QUEUE_RENDER_MAX)
}

/** Resolve a queued person's shaft + queue rank from the frame, or null when not renderable. */
export function resolveQueuedRender(person: Person, frame: SceneFrame): { shaft: Shaft; rank: number } | null {
  const leg = person.legs[person.legIndex]
  const shaft = leg?.type === 'elevator' && leg.shaftId !== undefined ? frame.shaftsById.get(leg.shaftId) : undefined
  const rank = frame.queueRankByPersonId.get(person.id)
  if (!shaft || rank === undefined) {
    return null
  }
  return { shaft, rank }
}
