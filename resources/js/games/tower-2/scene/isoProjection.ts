export interface Point2 {
  x: number
  y: number
}

export interface FloorPoint extends Point2 {
  floor: number
}

export type QuarterTurn = 0 | 1 | 2 | 3

export interface IsoProjectionOptions {
  /** World-space edge length of one tile. */
  tileSize?: number
  /** World-space vertical separation of floors, in the same units as tileSize. */
  floorHeight?: number
  /** Screen pixels per world unit. */
  zoom?: number
  /** Positive turns map world (x, y) to view (-y, x), about the world origin. */
  rotation?: QuarterTurn
  /** Screen position of world (0, 0, floor 0); use this for panning. */
  origin?: Readonly<Point2>
}

export interface FloorRectangle extends FloorPoint {
  width: number
  depth: number
}

export interface ScreenBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
  width: number
  height: number
}

function rotate(point: Readonly<Point2>, rotation: QuarterTurn): Point2 {
  switch (rotation) {
    case 0: return { x: point.x, y: point.y }
    case 1: return { x: -point.y, y: point.x }
    case 2: return { x: -point.x, y: -point.y }
    case 3: return { x: point.y, y: -point.x }
  }
}

function positive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and positive`)
}

/**
 * An orthographic isometric camera, independent of any renderer. World x/y are
 * horizontal tile coordinates and floor is vertical; screen x is right, y down.
 * The camera looks toward the origin from positive view x/y/z, with equal axis
 * foreshortening. tileToScreen accepts continuous coordinates: integers are tile
 * corners, and (x + 0.5, y + 0.5) is a tile's centre.
 *
 * Defaults use world units throughout; set zoom to the desired pixels per unit.
 * No site dimensions, floor range or clipping are assumed.
 */
export function createIsoProjection(options: IsoProjectionOptions = {}) {
  const { tileSize = 1, floorHeight = 1, zoom = 1, rotation = 0 } = options
  // Copy the pan so mutating the caller's options cannot change this projection.
  const { x: originX, y: originY } = options.origin ?? { x: 0, y: 0 }
  positive(tileSize, 'tileSize')
  positive(floorHeight, 'floorHeight')
  positive(zoom, 'zoom')
  if (![0, 1, 2, 3].includes(rotation)) throw new RangeError('rotation must be 0, 1, 2 or 3')
  if (!Number.isFinite(originX) || !Number.isFinite(originY)) throw new RangeError('origin must be finite')

  const inverseRotation = ((4 - rotation) % 4) as QuarterTurn
  const sqrt2 = Math.sqrt(2)
  const sqrt3 = Math.sqrt(3)
  const sqrt6 = Math.sqrt(6)
  const vertical = Math.sqrt(2 / 3)

  function tileToScreen(point: Readonly<FloorPoint>): Point2 {
    const view = rotate(point, rotation)
    return {
      x: originX + (view.x - view.y) * tileSize / sqrt2 * zoom,
      y: originY + ((view.x + view.y) * tileSize / sqrt6 - point.floor * floorHeight * vertical) * zoom,
    }
  }

  /** Intersect the orthographic view ray with the requested floor's plane. */
  function screenToFloor(point: Readonly<Point2>, floor: number): FloorPoint {
    const screenX = (point.x - originX) / zoom
    const screenY = (point.y - originY) / zoom
    // Screen basis vectors are (1,-1,0)/sqrt(2), (1,1,-2)/sqrt(6).
    // Their span is the image plane through the origin. All view rays run along
    // (1,1,1), so moving to the target z adds the same amount to view x/y.
    const rayZ = -screenY * vertical
    const toFloor = floor * floorHeight - rayZ
    const hit = rotate({
      x: (screenX / sqrt2 + screenY / sqrt6 + toFloor) / tileSize,
      y: (-screenX / sqrt2 + screenY / sqrt6 + toFloor) / tileSize,
    }, inverseRotation)
    return { ...hit, floor }
  }

  /**
   * Tiles use half-open world intervals [x,x+1) × [y,y+1), including negatives.
   * Snap within 1e-9 tiles of an integer to absorb inverse-projection roundoff
   * at shared edges; points further to either side retain their containing tile.
   */
  function screenToTile(point: Readonly<Point2>, floor: number): FloorPoint {
    const hit = screenToFloor(point, floor)
    const containingTile = (value: number) => {
      const integer = Math.round(value)
      return Math.abs(value - integer) <= 1e-9 ? integer + 0 : Math.floor(value)
    }
    return { x: containingTile(hit.x), y: containingTile(hit.y), floor }
  }

  /**
   * Ascending keys draw far to near. This is camera depth, not screen y: height
   * contributes positively, so sprites on the same view ray order correctly.
   * Equal keys are coplanar; callers may use a stable entity id for exact ties.
   */
  function depthSortKey(point: Readonly<FloorPoint>): number {
    const view = rotate(point, rotation)
    return ((view.x + view.y) * tileSize + point.floor * floorHeight) / sqrt3
  }

  /** Bounds of a rectangular plate envelope, including its outer tile edges. */
  function floorBounds(rectangle: Readonly<FloorRectangle>): ScreenBounds {
    if (!Number.isFinite(rectangle.width) || rectangle.width < 0
      || !Number.isFinite(rectangle.depth) || rectangle.depth < 0) {
      throw new RangeError('width and depth must be finite and nonnegative')
    }
    const corners = [
      tileToScreen(rectangle),
      tileToScreen({ x: rectangle.x + rectangle.width, y: rectangle.y, floor: rectangle.floor }),
      tileToScreen({ x: rectangle.x, y: rectangle.y + rectangle.depth, floor: rectangle.floor }),
      tileToScreen({ x: rectangle.x + rectangle.width, y: rectangle.y + rectangle.depth, floor: rectangle.floor }),
    ]
    const minX = Math.min(...corners.map(point => point.x))
    const maxX = Math.max(...corners.map(point => point.x))
    const minY = Math.min(...corners.map(point => point.y))
    const maxY = Math.max(...corners.map(point => point.y))
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
  }

  return { tileToScreen, screenToFloor, screenToTile, depthSortKey, floorBounds }
}

export type FloorVisibility = 'solid' | 'ghosted' | 'hidden'

export interface CutawayBands {
  /** Number of solid floors immediately below/above the always-solid active floor. */
  solidBelow?: number
  solidAbove?: number
  /** Additional ghosted floors beyond each solid band; Infinity keeps all. */
  ghostBelow?: number
  ghostAbove?: number
}

/**
 * Presentation classification only; no opacity or gameplay policy. By default
 * the active floor is solid, lower floors are ghosted and upper floors hidden.
 * Callers can choose finite bands or include neighbours above the active floor.
 */
export function floorVisibility(floor: number, activeFloor: number, bands: CutawayBands = {}): FloorVisibility {
  const { solidBelow = 0, solidAbove = 0, ghostBelow = Infinity, ghostAbove = 0 } = bands
  if (!Number.isInteger(floor) || !Number.isInteger(activeFloor)) throw new RangeError('floors must be integers')
  for (const count of [solidBelow, solidAbove, ghostBelow, ghostAbove]) {
    if (count !== Infinity && (!Number.isInteger(count) || count < 0)) {
      throw new RangeError('cutaway bands must be nonnegative integers or Infinity')
    }
  }
  if (floor === activeFloor) return 'solid'
  const distance = Math.abs(floor - activeFloor)
  const solid = floor < activeFloor ? solidBelow : solidAbove
  const ghost = floor < activeFloor ? ghostBelow : ghostAbove
  if (distance <= solid) return 'solid'
  return distance <= solid + ghost ? 'ghosted' : 'hidden'
}
