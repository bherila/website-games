import type { CarColor, Direction } from '../gameTypes'

export type CarCapacity = 4 | 6 | 10

export interface LevelCarDef {
  /** Required when the level has an explicit `queue`; auto-queue levels get planner-assigned colors. */
  color?: CarColor
  capacity: CarCapacity
  direction: Direction
  /** Top-left-most cell of the car's footprint (same semantics as `Car.position`). */
  x: number
  y: number
  /**
   * Render as a near-black "?" car until its exit lane clears. Only meaningful
   * on cars that start blocked; the engine reveals free cars immediately.
   */
  colorHidden?: boolean
}

export interface LevelTunnelDef {
  direction: Direction
  /** Top-left-most cell of the visible car's footprint when popped out. */
  x: number
  y: number
  /**
   * Stack order, front first; the first entry starts visible on the field.
   * All cars in one tunnel must share a capacity so every pop-out reuses the
   * same footprint (mirrors the random generator's constraint).
   */
  cars: { color?: CarColor, capacity: CarCapacity }[]
}

export interface LevelDef {
  id: number
  /** Short teaching or flavor message shown when the level starts. */
  intro?: string
  /** Difficulty badge + loop-capacity/score modifiers. Defaults to 'regular'. */
  difficulty?: 'regular' | 'hard' | 'super-hard'
  cars: LevelCarDef[]
  tunnels?: LevelTunnelDef[]
  /**
   * Explicit passenger queue, one entry per seat; totals must equal the summed
   * capacity of all cars including tunnel cars. Used for the hand-scripted
   * tutorial levels. Omit to let the deterministic queue planner derive
   * service windows from the level's seed and authored colors get replaced by
   * planner-assigned colors.
   */
  queue?: CarColor[]
}
