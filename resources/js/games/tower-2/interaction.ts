/**
 * What each tool previews and does at a tile, kept pure so the canvas only
 * translates pointers into tiles. Drag tools act on the rectangle between the
 * press and the pointer; room and core tools act on a click.
 */
import { type Building, type EditResult, type Facing, type Room, roomFootprint } from './engine/building'
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
  { id: 'select', label: 'Select', key: '1', hint: 'Tap a room or core to inspect it; drag a room to move it' },
  { id: 'plate', label: 'Floor', key: '2', hint: 'Drag to paint floor plate' },
  { id: 'erase', label: 'Clear', key: '3', hint: 'Drag to clear plate, corridors and rooms' },
  { id: 'atrium', label: 'Atrium', key: '4', hint: 'Drag to cut a void from this floor up' },
  { id: 'corridor', label: 'Corridor', key: '5', hint: 'Drag to draw corridors on open plate' },
  { id: 'core', label: 'Core', key: '6', hint: 'Tap to place a 2×2 core; it stretches over free floors' },
  ...USE_KINDS.map((use, i): ToolDef => ({ id: use, label: USES[use].label, key: String((7 + i) % 10), hint: `Place a ${USES[use].label.toLowerCase()} with its door (the arrow) on a corridor${use === 'shop' || use === 'cafe' ? ', or facing out on the street floor' : ''}. Turn or R rotates it.` })),
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

/**
 * Where a turned room sits so it pivots about its centre. When that spot is
 * blocked the caller can fall back to the room's own corner.
 */
export function turnedInPlace(room: Room, facing: Facing): PlateTile[] {
  const { width, depth } = roomFootprint(room.use, facing)
  const centred = { x: Math.round(room.x + room.width / 2 - width / 2), y: Math.round(room.y + room.depth / 2 - depth / 2) }
  return centred.x === room.x && centred.y === room.y ? [centred] : [centred, { x: room.x, y: room.y }]
}

/** The footprint origin that centres a room or core on the hovered tile. */
export function centredOrigin(hover: PlateTile, width: number, depth: number): PlateTile {
  return { x: hover.x - Math.floor((width - 1) / 2), y: hover.y - Math.floor((depth - 1) / 2) }
}

export function toolAction(building: Building, tool: ToolId, floor: number, hover: PlateTile | null, anchor: PlateTile | null, facing: Facing): ToolAction {
  const none: ToolAction = { preview: null, hint: null, commit: null }
  if (!hover) return none

  if (tool === 'select') {
    // Dragging a room moves it, keeping the grab point under the pointer.
    const room = anchor ? building.roomAt(floor, anchor.x, anchor.y) : undefined
    if (!room || !anchor || (hover.x === anchor.x && hover.y === anchor.y)) return none
    const x = room.x + hover.x - anchor.x
    const y = room.y + hover.y - anchor.y
    const check = building.checkRoom(room.use, floor, x, y, room.facing, room.id)
    return {
      preview: roomPreview(room.use, floor, x, y, room.facing, check),
      hint: check.ok ? null : check.reason ?? null,
      commit: (target) => target.moveRoom(room.id, x, y, room.facing),
    }
  }

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
  const footprint = roomFootprint(use, facing)
  const origin = centredOrigin(hover, footprint.width, footprint.depth)
  const check = building.checkRoom(use, floor, origin.x, origin.y, facing)
  return {
    preview: roomPreview(use, floor, origin.x, origin.y, facing, check),
    hint: check.ok ? (check.door?.storefront ? 'Storefront: its door opens onto the street' : null) : check.reason ?? null,
    commit: (target) => target.placeRoom(use, floor, origin.x, origin.y, facing),
  }
}

function roomPreview(use: UseKind, floor: number, x: number, y: number, facing: Facing, check: ReturnType<Building['checkRoom']>): Preview {
  return { kind: 'room', floor, x, y, width: check.width, depth: check.depth, use, facing, valid: check.ok, door: check.door?.tile ?? null, storefront: check.door?.storefront ?? false }
}
