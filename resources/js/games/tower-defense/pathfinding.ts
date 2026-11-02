import { COLS, ROWS } from './gameTypes'

export const UNREACHABLE = Number.POSITIVE_INFINITY

export function cellIndex(col: number, row: number): number {
  return (row * COLS) + col
}

export function inBounds(col: number, row: number): boolean {
  return col >= 0 && col < COLS && row >= 0 && row < ROWS
}

const SQRT2 = Math.SQRT2
/** Orthogonal steps first, so ties walk straight rather than zigzag. */
const STEPS: readonly (readonly [number, number, number])[] = [
  [0, 1, 1], [1, 0, 1], [0, -1, 1], [-1, 0, 1],
  [1, 1, SQRT2], [-1, 1, SQRT2], [1, -1, SQRT2], [-1, -1, SQRT2],
]

export interface FieldRules {
  /** Cost of standing on a cell; Infinity means it cannot be entered. */
  cost: (index: number) => number
  /** Whether a diagonal step may squeeze past this cell's corner. */
  blocksCorner: (index: number) => boolean
}

/**
 * Cost to reach any of `goals` from every cell (a Dijkstra flow field). Walkers descend it.
 * A step pays the cost of the cell it enters, so a building on the way counts once.
 */
export function computeField(goals: readonly number[], rules: FieldRules): Float64Array {
  const field = new Float64Array(COLS * ROWS).fill(UNREACHABLE)
  const heap = new MinHeap()
  for (const goal of goals) {
    field[goal] = 0
    heap.push(goal, 0)
  }
  for (let entry = heap.pop(); entry; entry = heap.pop()) {
    const [index, distance] = entry
    if (distance > (field[index] ?? UNREACHABLE)) {
      continue
    }
    const col = index % COLS
    const row = Math.floor(index / COLS)
    const enterCost = rules.cost(index)
    for (const [dx, dy, length] of STEPS) {
      const nextCol = col + dx
      const nextRow = row + dy
      if (!inBounds(nextCol, nextRow)) {
        continue
      }
      const next = cellIndex(nextCol, nextRow)
      if (!Number.isFinite(rules.cost(next))) {
        continue
      }
      if (dx !== 0 && dy !== 0 && (rules.blocksCorner(cellIndex(col, nextRow)) || rules.blocksCorner(cellIndex(nextCol, row)))) {
        continue
      }
      const total = distance + (length * enterCost)
      if (total < (field[next] ?? UNREACHABLE)) {
        field[next] = total
        heap.push(next, total)
      }
    }
  }

  return field
}

/**
 * The neighbouring cell on the cheapest way down the field, or null at a goal or a dead end.
 * Scores include entering the cell: a wall one step from the exit is not cheap just because
 * the far side of it is close.
 */
export function bestStep(field: Float64Array, col: number, row: number, rules: FieldRules): { col: number; row: number } | null {
  const here = field[cellIndex(col, row)] ?? UNREACHABLE
  let best: { col: number; row: number } | null = null
  let bestScore = UNREACHABLE
  for (const [dx, dy, length] of STEPS) {
    const nextCol = col + dx
    const nextRow = row + dy
    if (!inBounds(nextCol, nextRow)) {
      continue
    }
    if (dx !== 0 && dy !== 0 && (rules.blocksCorner(cellIndex(col, nextRow)) || rules.blocksCorner(cellIndex(nextCol, row)))) {
      continue
    }
    const next = cellIndex(nextCol, nextRow)
    const value = field[next] ?? UNREACHABLE
    const score = value + (length * rules.cost(next))
    if (value < here && score < bestScore) {
      bestScore = score
      best = { col: nextCol, row: nextRow }
    }
  }

  return best
}

class MinHeap {
  private readonly items: (readonly [number, number])[] = []

  push(value: number, priority: number): void {
    const items = this.items
    items.push([value, priority])
    let index = items.length - 1
    while (index > 0) {
      const parent = (index - 1) >> 1
      const parentItem = items[parent]
      const item = items[index]
      if (!parentItem || !item || parentItem[1] <= item[1]) {
        break
      }
      items[parent] = item
      items[index] = parentItem
      index = parent
    }
  }

  pop(): readonly [number, number] | undefined {
    const items = this.items
    const top = items[0]
    const last = items.pop()
    if (items.length === 0 || !last) {
      return top
    }
    items[0] = last
    let index = 0
    for (;;) {
      const left = (index * 2) + 1
      const right = left + 1
      let smallest = index
      const smallestPriority = (position: number): number => items[position]?.[1] ?? UNREACHABLE
      if (left < items.length && smallestPriority(left) < smallestPriority(smallest)) {
        smallest = left
      }
      if (right < items.length && smallestPriority(right) < smallestPriority(smallest)) {
        smallest = right
      }
      if (smallest === index) {
        break
      }
      const a = items[index]
      const b = items[smallest]
      if (!a || !b) {
        break
      }
      items[index] = b
      items[smallest] = a
      index = smallest
    }

    return top
  }
}
