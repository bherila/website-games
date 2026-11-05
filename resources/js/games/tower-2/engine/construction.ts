/** Coarse shell rules: no loads, columns or collapse, and no spending until the economy arrives. */
export const OVERHANG_REACH = 3
export const BASE_TILE_COST = 100
export const HEIGHT_TILE_COST = 10
/** An unsupported tile adds twice its ordinary price (three times the supported price in total). */
export const OVERHANG_PREMIUM = 2

export interface FloorConstruction {
  area: number
  overhang: number
  outOfReach: number
  maxReach: number
  premium: number
  cost: number
  /** Steps through this floor's plate to a tile directly on plate below; Infinity means no support. */
  distances: Float64Array
}

/** Multi-source, orthogonal flood fill: diagonal contact and disconnected islands never provide support. */
export function floorConstruction(plate: Uint8Array, below: Uint8Array, width: number, floor: number): FloorConstruction {
  const distances = new Float64Array(plate.length).fill(Infinity)
  const queue: number[] = []
  let area = 0
  let overhang = 0
  for (let index = 0; index < plate.length; index++) {
    if (plate[index] !== 1) continue
    area++
    if (floor <= 0 || below[index] === 1) {
      distances[index] = 0
      queue.push(index)
    } else overhang++
  }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head]!
    const x = index % width
    const neighbours = [index - width, index + width]
    if (x > 0) neighbours.push(index - 1)
    if (x < width - 1) neighbours.push(index + 1)
    for (const next of neighbours) {
      if (next < 0 || next >= plate.length || plate[next] !== 1 || distances[next] !== Infinity) continue
      distances[next] = distances[index]! + 1
      queue.push(next)
    }
  }
  let outOfReach = 0
  let maxReach = 0
  for (let index = 0; index < plate.length; index++) {
    if (plate[index] !== 1) continue
    maxReach = Math.max(maxReach, distances[index]!)
    if (distances[index]! > OVERHANG_REACH) outOfReach++
  }
  const tileCost = BASE_TILE_COST + HEIGHT_TILE_COST * Math.abs(floor)
  const premium = overhang * tileCost * OVERHANG_PREMIUM
  return { area, overhang, outOfReach, maxReach, premium, cost: area * tileCost + premium, distances }
}

export function formatCost(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`
}
