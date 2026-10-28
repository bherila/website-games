/**
 * What each tool previews and does at a tile, kept pure so the canvas only
 * translates pointers into tiles. Drag tools act on the rectangle between the
 * press and the pointer; room and core tools act on a click.
 */
import type { Building, EditResult } from './engine/building'
import type { PlateTile } from './engine/floorPlate'
import { CORE_SIZE, USE_KINDS, type UseKind, USES } from './engine/uses'
import type { Preview } from './scene/Tower2Renderer'

export type ToolId = 'select' | 'plate' | 'erase' | 'atrium' | 'corridor' | 'core' | UseKind

export interface ToolDef {
  id: ToolId
  label: string
  /** Keyboard shortcut, shown on the button. */
  key: string
  hint: string
}

export const TOOLS: readonly ToolDef[] = [
  { id: 'select', label: 'Select', key: '1', hint: 'Tap a room or core to inspect it' },
  { id: 'plate', label: 'Floor', key: '2', hint: 'Drag to paint floor plate' },
  { id: 'erase', label: 'Clear', key: '3', hint: 'Drag to clear plate, corridors and rooms' },
  { id: 'atrium', label: 'Atrium', key: '4', hint: 'Drag to cut a void from this floor up' },
  { id: 'corridor', label: 'Corridor', key: '5', hint: 'Drag to draw corridors on open plate' },
  { id: 'core', label: 'Core', key: '6', hint: 'Tap to place a 2×2 core; it stretches over free floors' },
  ...USE_KINDS.map((use, i): ToolDef => ({ id: use, label: USES[use].label, key: String((7 + i) % 10), hint: `Tap beside a corridor to place a ${USES[use].label.toLowerCase()} (${USES[use].width}×${USES[use].depth}). Turn or R rotates it.` })),
]

const RECT_TOOLS: ReadonlySet<ToolId> = new Set(['plate', 'erase', 'atrium', 'corridor'])

export function isRectTool(tool: ToolId): boolean {
  return RECT_TOOLS.has(tool)
}

export function isUseTool(tool: ToolId): tool is UseKind {
  return (USE_KINDS as string[]).includes(tool)
}

export interface ToolAction {
  preview: Preview | null
  /** Why the action would be refused, or what it would do. */
  hint: string | null
  commit: ((building: Building) => EditResult) | null
}

export function rectTiles(a: PlateTile, b: PlateTile): { x: number, y: number, width: number, depth: number, tiles: PlateTile[] } {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const width = Math.abs(a.x - b.x) + 1
  const depth = Math.abs(a.y - b.y) + 1
  const tiles: PlateTile[] = []
  for (let ty = y; ty < y + depth; ty++) for (let tx = x; tx < x + width; tx++) tiles.push({ x: tx, y: ty })
  return { x, y, width, depth, tiles }
}

/** The footprint origin that centres a room or core on the hovered tile. */
export function centredOrigin(hover: PlateTile, width: number, depth: number): PlateTile {
  return { x: hover.x - Math.floor((width - 1) / 2), y: hover.y - Math.floor((depth - 1) / 2) }
}

export function toolAction(building: Building, tool: ToolId, floor: number, hover: PlateTile | null, anchor: PlateTile | null, rotated: boolean): ToolAction {
  const none: ToolAction = { preview: null, hint: null, commit: null }
  if (!hover || tool === 'select') return none

  if (isRectTool(tool)) {
    const rect = rectTiles(anchor ?? hover, hover)
    const inside = rect.tiles.filter(({ x, y }) => building.inBounds(x, y))
    const uses = inside.map(({ x, y }) => building.tileUse(floor, x, y))
    let hint: string | null = null
    if (tool === 'plate') hint = inside.length === 0 ? 'Paint inside the site' : null
    if (tool === 'corridor' && !uses.includes('plate')) hint = 'Corridors go on open floor plate'
    if ((tool === 'erase' || tool === 'atrium') && uses.every((use) => use === 'empty')) hint = 'Nothing to clear here'
    if ((tool === 'erase' || tool === 'atrium') && uses.includes('core')) hint = 'A core stands here. Select it to shorten or remove it first.'
    const preview: Preview = { kind: 'rect', floor, x: rect.x, y: rect.y, width: rect.width, depth: rect.depth, valid: hint === null, tone: tool === 'erase' || tool === 'atrium' ? 'erase' : 'paint' }
    const commit = (target: Building): EditResult => {
      if (tool === 'plate') return target.paintPlate(floor, inside)
      if (tool === 'corridor') return target.paintCorridor(floor, inside)
      if (tool === 'atrium') return target.carveAtrium(floor, inside)
      return target.erase(floor, inside)
    }
    return { preview, hint, commit }
  }

  if (tool === 'core') {
    const origin = centredOrigin(hover, CORE_SIZE, CORE_SIZE)
    const check = building.checkCore(floor, origin.x, origin.y)
    return {
      preview: { kind: 'core', floor, x: origin.x, y: origin.y, size: CORE_SIZE, bottomFloor: check.bottomFloor, topFloor: check.topFloor, valid: check.ok },
      hint: check.ok ? `Core over floors ${check.bottomFloor}–${check.topFloor}` : check.reason ?? null,
      commit: (target) => target.placeCore(floor, origin.x, origin.y),
    }
  }

  if (!isUseTool(tool)) return none
  const use = tool
  const def = USES[use]
  const origin = centredOrigin(hover, rotated ? def.depth : def.width, rotated ? def.width : def.depth)
  const check = building.checkRoom(use, floor, origin.x, origin.y, rotated)
  return {
    preview: { kind: 'room', floor, x: origin.x, y: origin.y, width: check.width, depth: check.depth, use, valid: check.ok, door: check.door?.tile ?? null },
    hint: check.ok ? null : check.reason ?? null,
    commit: (target) => target.placeRoom(use, floor, origin.x, origin.y, rotated),
  }
}
