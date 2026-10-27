/** Shell geometry only: no leasing, structural simulation, utility service or egress policy. */
export interface PlateTile {
  x: number
  y: number
}

export interface PlateSize {
  width?: number
  depth?: number
}

export interface VerticalFootprint {
  id: string
  kind: 'core' | 'riser' | 'exit-stair'
  x: number
  y: number
  width: number
  depth: number
  bottomFloor: number
  topFloor: number
}

type FloorEdits = Map<number, Uint8Array>

/**
 * Per-floor row-major masks (index = y * width + x). Returned masks and
 * footprints are copies; all edits validate before changing the stored model.
 * Floor numbers may be negative. Grid dimensions are independent parameters.
 */
export class FloorPlateModel {
  readonly width: number
  readonly depth: number
  private readonly plates = new Map<number, Uint8Array>()
  private readonly utilities = new Map<number, Uint8Array>()
  private readonly verticals = new Map<string, VerticalFootprint>()

  constructor({ width = 40, depth = 40 }: PlateSize = {}) {
    positiveInteger(width, 'width')
    positiveInteger(depth, 'depth')
    if (!Number.isSafeInteger(width * depth) || width * depth > 0xffff_ffff) throw new RangeError('Grid is too large for a tile mask')
    this.width = width
    this.depth = depth
  }

  getPlate(floor: number): Uint8Array {
    floorNumber(floor)
    return this.plates.get(floor)?.slice() ?? this.emptyMask()
  }

  getUtilityTiles(floor: number): Uint8Array {
    floorNumber(floor)
    return this.utilities.get(floor)?.slice() ?? this.emptyMask()
  }

  floorNumbers(): number[] {
    return [...this.plates.keys()].sort((a, b) => a - b)
  }

  hasPlate(floor: number, tile: PlateTile): boolean {
    floorNumber(floor)
    const index = this.index(tile)
    return this.plates.get(floor)?.[index] === 1
  }

  paint(floor: number, tiles: Iterable<PlateTile>): void {
    this.editTiles(floor, tiles, 1)
  }

  erase(floor: number, tiles: Iterable<PlateTile>): void {
    this.editTiles(floor, tiles, 0)
  }

  /** Copy only the outline, never utilities or vertical module ranges. */
  inheritFloorBelow(floor: number): void {
    floorNumber(floor)
    floorNumber(floor - 1)
    this.commitPlates(new Map([[floor, this.getPlate(floor - 1)]]))
  }

  /** Remove the same hole on every existing floor in the inclusive range. */
  carveAtrium(bottomFloor: number, topFloor: number, tiles: Iterable<PlateTile>): void {
    floorRange(bottomFloor, topFloor)
    const indices = [...tiles].map((tile) => this.index(tile))
    const edits: FloorEdits = new Map()
    for (const floor of this.floorNumbers()) {
      if (floor < bottomFloor || floor > topFloor) continue
      const plate = this.getPlate(floor)
      for (const index of indices) plate[index] = 0
      edits.set(floor, plate)
    }
    this.commitPlates(edits)
  }

  /** Pure geometric count; callers decide ground-floor exemptions and prices. */
  overhangCount(floor: number): number {
    floorNumber(floor)
    floorNumber(floor - 1)
    const plate = this.plates.get(floor)
    if (!plate) return 0
    const below = this.plates.get(floor - 1)
    let count = 0
    for (let index = 0; index < plate.length; index++) {
      if (plate[index] === 1 && below?.[index] !== 1) count++
    }
    return count
  }

  /** Mark a plant/machine/utility tile separately from the inherited shell. */
  setUtilityTile(floor: number, tile: PlateTile, present = true): void {
    floorNumber(floor)
    const index = this.index(tile)
    if (present && this.plates.get(floor)?.[index] !== 1) throw new RangeError('A utility tile needs a floor plate')
    const mask = this.getUtilityTiles(floor)
    mask[index] = present ? 1 : 0
    for (const vertical of this.verticals.values()) {
      if (vertical.kind === 'core' && vertical.bottomFloor - 1 === floor && !this.hasPlantSupport(vertical, mask)) {
        throw new RangeError(`Core ${vertical.id} needs a plant or utility tile on floor ${floor}`)
      }
    }
    this.storeMask(this.utilities, floor, mask)
  }

  placeVerticalFootprint(footprint: VerticalFootprint): void {
    this.validateFootprint(footprint)
    if (this.verticals.has(footprint.id)) throw new RangeError('Vertical footprint id already exists')
    this.requirePlateCoverage(footprint)
    if (footprint.kind === 'core') {
      floorNumber(footprint.bottomFloor - 1)
      if (!this.hasPlantSupport(footprint, this.utilities.get(footprint.bottomFloor - 1))) {
        throw new RangeError(`Core ${footprint.id} needs a plant or utility tile on floor ${footprint.bottomFloor - 1}`)
      }
    }
    this.verticals.set(footprint.id, { ...footprint })
  }

  removeVerticalFootprint(id: string): boolean {
    return this.verticals.delete(id)
  }

  /** Explicit placement order is stable; selecting a floor never extends a range. */
  verticalFootprintsAt(floor: number): VerticalFootprint[] {
    floorNumber(floor)
    return [...this.verticals.values()]
      .filter((vertical) => floor >= vertical.bottomFloor && floor <= vertical.topFloor)
      .map((vertical) => ({ ...vertical }))
  }

  private emptyMask(): Uint8Array {
    return new Uint8Array(this.width * this.depth)
  }

  private index({ x, y }: PlateTile): number {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.depth) {
      throw new RangeError('Tile is outside the floor grid')
    }
    return y * this.width + x
  }

  private editTiles(floor: number, tiles: Iterable<PlateTile>, value: 0 | 1): void {
    floorNumber(floor)
    const indices = [...tiles].map((tile) => this.index(tile))
    const plate = this.getPlate(floor)
    for (const index of indices) plate[index] = value
    this.commitPlates(new Map([[floor, plate]]))
  }

  private validateFootprint(footprint: VerticalFootprint): void {
    if (!footprint.id || !['core', 'riser', 'exit-stair'].includes(footprint.kind)) throw new RangeError('Invalid vertical footprint')
    positiveInteger(footprint.width, 'footprint width')
    positiveInteger(footprint.depth, 'footprint depth')
    this.index(footprint)
    this.index({ x: footprint.x + footprint.width - 1, y: footprint.y + footprint.depth - 1 })
    floorRange(footprint.bottomFloor, footprint.topFloor)
  }

  private hasPlantSupport(footprint: VerticalFootprint, mask?: Uint8Array): boolean {
    if (!mask) return false
    for (let y = footprint.y; y < footprint.y + footprint.depth; y++) {
      for (let x = footprint.x; x < footprint.x + footprint.width; x++) {
        if (mask[y * this.width + x] === 1) return true
      }
    }
    return false
  }

  private requirePlateCoverage(footprint: VerticalFootprint, edits?: FloorEdits): void {
    for (let floor = footprint.bottomFloor; floor <= footprint.topFloor; floor++) {
      const plate = edits?.get(floor) ?? this.plates.get(floor)
      for (let y = footprint.y; y < footprint.y + footprint.depth; y++) {
        for (let x = footprint.x; x < footprint.x + footprint.width; x++) {
          if (plate?.[y * this.width + x] !== 1) throw new RangeError(`Vertical footprint ${footprint.id} needs plate on floor ${floor}`)
        }
      }
    }
  }

  private commitPlates(edits: FloorEdits): void {
    for (const [floor, plate] of edits) {
      const utilities = this.utilities.get(floor)
      if (utilities?.some((value, index) => value === 1 && plate[index] !== 1)) {
        throw new RangeError('Remove utility tiles before erasing their floor plate')
      }
    }
    for (const vertical of this.verticals.values()) this.requirePlateCoverage(vertical, edits)
    for (const [floor, plate] of edits) this.storeMask(this.plates, floor, plate)
  }

  private storeMask(target: Map<number, Uint8Array>, floor: number, mask: Uint8Array): void {
    if (mask.some((value) => value !== 0)) target.set(floor, mask)
    else target.delete(floor)
  }
}

function floorNumber(floor: number): void {
  if (!Number.isSafeInteger(floor)) throw new RangeError('Floor must be a safe integer')
}

function floorRange(bottom: number, top: number): void {
  floorNumber(bottom)
  floorNumber(top)
  if (bottom > top) throw new RangeError('Bottom floor must not exceed top floor')
}

function positiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive safe integer`)
}
