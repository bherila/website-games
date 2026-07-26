import { applyMove } from './applyMove'
import type { GameState, MoveIntent, Position, TileKind } from './types'
import { positionKey } from './types'

/**
 * Weighted-A* solver over the real reducer. Three jobs (docs "Testing"):
 * proves every shipped level solvable and derives its par (tests), powers
 * runtime dead-end detection (stuck prompt), and backs the socket-chokepoint
 * bypass check. Deterministic: fixed intent order, stable heap tie-breaks.
 *
 * The heuristic (manhattan to the nearest remaining chip + remaining chip
 * count, or manhattan to the nearest exit) is not admissible under slides,
 * so found solutions are good but not guaranteed optimal — par is defined as
 * the deterministic solver result, enforced by tests.
 */

export type SolverStatus = 'running' | 'solved' | 'unsolvable' | 'budget'

export interface SolverResult {
  readonly status: Exclude<SolverStatus, 'running'>
  /** U/D/L/R/W input string when status === 'solved'. */
  readonly solution: string | null
  readonly nodesExpanded: number
}

export interface SolverOptions {
  readonly maxNodes?: number
  /** Heuristic weight; 1 = classic A*, higher = greedier/faster. */
  readonly weight?: number
}

const DEFAULT_MAX_NODES = 400_000
const DEFAULT_WEIGHT = 1.5

const INTENTS: readonly MoveIntent[] = ['up', 'down', 'left', 'right', 'wait']

const INTENT_CHARS: Readonly<Record<MoveIntent, string>> = {
  up: 'U',
  down: 'D',
  left: 'L',
  right: 'R',
  wait: 'W',
}

interface SearchNode {
  readonly state: GameState
  readonly moves: number
  readonly path: string
  readonly priority: number
  readonly seq: number
}

export interface SteppingSolver {
  /** Expands up to `nodes` search nodes; call repeatedly until not 'running'. */
  step(nodes: number): SolverStatus
  result(): SolverResult
}

/** One-shot solve. */
export function solve(initial: GameState, options: SolverOptions = {}): SolverResult {
  const solver = createSolver(initial, options)
  while (solver.step(10_000) === 'running') {
    // Runs to completion; callers needing responsiveness use createSolver.
  }

  return solver.result()
}

/**
 * Incremental solver for runtime probes — expand a few thousand nodes per
 * idle slice so the main thread stays responsive.
 */
export function createSolver(initial: GameState, options: SolverOptions = {}): SteppingSolver {
  const maxNodes = options.maxNodes ?? DEFAULT_MAX_NODES
  const weight = options.weight ?? DEFAULT_WEIGHT

  const goals = collectGoals(initial)
  const heap = new MinHeap()
  const visited = new Set<string>()
  let seq = 0
  let expanded = 0
  let status: SolverStatus = 'running'
  let solution: string | null = null

  if (initial.won) {
    status = 'solved'
    solution = ''
  } else if (!initial.alive) {
    status = 'unsolvable'
  } else {
    visited.add(encodeState(initial))
    heap.push({ state: initial, moves: 0, path: '', priority: heuristic(initial, goals) * weight, seq: seq++ })
  }

  return {
    step(nodes: number): SolverStatus {
      if (status !== 'running') {
        return status
      }

      for (let i = 0; i < nodes; i++) {
        const node = heap.pop()
        if (!node) {
          status = 'unsolvable'

          return status
        }

        expanded += 1
        if (expanded > maxNodes) {
          status = 'budget'

          return status
        }

        for (const intent of INTENTS) {
          const result = applyMove(node.state, intent)
          if (!result.accepted || !result.state.alive) {
            continue
          }

          const path = node.path + INTENT_CHARS[intent]
          if (result.state.won) {
            status = 'solved'
            solution = path

            return status
          }

          const key = encodeState(result.state)
          if (visited.has(key)) {
            continue
          }
          visited.add(key)

          const moves = node.moves + 1
          heap.push({
            state: result.state,
            moves,
            path,
            priority: moves + heuristic(result.state, goals) * weight,
            seq: seq++,
          })
        }
      }

      return status
    },
    result(): SolverResult {
      return {
        status: status === 'running' ? 'budget' : status,
        solution,
        nodesExpanded: expanded,
      }
    },
  }
}

/**
 * Socket-chokepoint check: BFS over positions treating ONLY walls and
 * sockets as blocking (doors, water, blocks, everything else passable).
 * If no exit is reachable this way, the socket is a physical cut and no
 * play can bypass chip collection — the guarantee the level tests require.
 */
export function exitReachableWithSocketsSealed(state: GameState): boolean {
  const blocking: readonly TileKind[] = ['wall', 'socket']
  const queue: Position[] = [state.player.pos]
  const seen = new Set<string>([positionKey(state.player.pos)])

  while (queue.length > 0) {
    const pos = queue.shift()
    if (!pos) {
      break
    }

    const tile = tileAtRaw(state, pos)
    if (tile === 'exit') {
      return true
    }

    for (const delta of [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }]) {
      const next = { x: pos.x + delta.x, y: pos.y + delta.y }
      const key = positionKey(next)
      if (seen.has(key)) {
        continue
      }

      const nextTile = tileAtRaw(state, next)
      if (nextTile === null || blocking.includes(nextTile)) {
        continue
      }

      seen.add(key)
      queue.push(next)
    }
  }

  return false
}

interface Goals {
  readonly chipCells: readonly Position[]
  readonly exits: readonly Position[]
}

function collectGoals(state: GameState): Goals {
  const chipCells: Position[] = []
  const exits: Position[] = []
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const tile = state.tiles[y * state.width + x]
      if (tile === 'chip') {
        chipCells.push({ x, y })
      } else if (tile === 'exit') {
        exits.push({ x, y })
      }
    }
  }

  return { chipCells, exits }
}

function heuristic(state: GameState, goals: Goals): number {
  const { pos } = state.player

  if (state.chipsRemaining > 0) {
    let nearest = Number.MAX_SAFE_INTEGER
    for (const cell of goals.chipCells) {
      if (tileAtRaw(state, cell) !== 'chip') {
        continue
      }
      const distance = Math.abs(cell.x - pos.x) + Math.abs(cell.y - pos.y)
      if (distance < nearest) {
        nearest = distance
      }
    }

    return (nearest === Number.MAX_SAFE_INTEGER ? 0 : nearest) + state.chipsRemaining
  }

  let nearest = Number.MAX_SAFE_INTEGER
  for (const exit of goals.exits) {
    const distance = Math.abs(exit.x - pos.x) + Math.abs(exit.y - pos.y)
    if (distance < nearest) {
      nearest = distance
    }
  }

  return nearest === Number.MAX_SAFE_INTEGER ? 0 : nearest
}

/**
 * Compact dedupe key: player + entities + inventory + every mutated tile.
 * Tile scan is O(cells) but cells ≤ 1024 and mutation lists stay short.
 */
function encodeState(state: GameState): string {
  const parts: string[] = [`p${state.player.pos.x},${state.player.pos.y}`]

  const blocks = state.blocks
    .map((block) => `${block.pos.x},${block.pos.y}`)
    .sort()
  if (blocks.length > 0) {
    parts.push(`b${blocks.join(';')}`)
  }

  if (state.monsters.length > 0) {
    parts.push(
      `m${state.monsters.map((monster) => `${monster.kind[0] ?? ''}${monster.pos.x},${monster.pos.y}${monster.facing[0] ?? ''}`).join(';')}`,
    )
  }

  parts.push(`k${state.keys.red}${state.keys.green}${state.keys.blue}${state.keys.yellow}`)
  parts.push(
    `o${Number(state.boots.flippers)}${Number(state.boots.fireBoots)}${Number(state.boots.skates)}${Number(state.boots.suctionBoots)}`,
  )

  const mutations: string[] = []
  for (let index = 0; index < state.tiles.length; index++) {
    const tile = state.tiles[index]
    if (!tile || tile === 'floor' || tile === 'wall') {
      continue
    }
    if (isMutableTile(tile)) {
      mutations.push(`${index}${tile === 'toggleOpen' ? 'o' : tile === 'toggleClosed' ? 'c' : tile === 'chip' ? 'h' : 'x'}`)
    }
  }
  if (mutations.length > 0) {
    parts.push(`t${mutations.join(';')}`)
  }

  return parts.join('|')
}

/**
 * Tiles whose presence can change over a run (consumed, flipped, raised).
 * Static kinds (ice, force floors, buttons, exits…) never mutate and are
 * excluded from the key to keep it short.
 */
function isMutableTile(tile: TileKind): boolean {
  switch (tile) {
    case 'chip':
    case 'socket':
    case 'keyRed':
    case 'keyGreen':
    case 'keyBlue':
    case 'keyYellow':
    case 'doorRed':
    case 'doorGreen':
    case 'doorBlue':
    case 'doorYellow':
    case 'water':
    case 'dirt':
    case 'flippers':
    case 'fireBoots':
    case 'skates':
    case 'suctionBoots':
    case 'popup':
    case 'toggleOpen':
    case 'toggleClosed':
      return true
    default:
      return false
  }
}

function tileAtRaw(state: GameState, pos: Position): TileKind | null {
  if (pos.x < 0 || pos.y < 0 || pos.x >= state.width || pos.y >= state.height) {
    return null
  }

  return state.tiles[pos.y * state.width + pos.x] ?? null
}

/** Binary min-heap with stable (priority, seq) ordering for determinism. */
class MinHeap {
  private readonly items: SearchNode[] = []

  push(node: SearchNode): void {
    this.items.push(node)
    let index = this.items.length - 1
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (this.less(index, parent)) {
        this.swap(index, parent)
        index = parent
      } else {
        break
      }
    }
  }

  pop(): SearchNode | null {
    const top = this.items[0]
    if (!top) {
      return null
    }

    const last = this.items.pop()
    if (this.items.length > 0 && last) {
      this.items[0] = last
      let index = 0
      for (;;) {
        const left = index * 2 + 1
        const right = left + 1
        let smallest = index
        if (left < this.items.length && this.less(left, smallest)) {
          smallest = left
        }
        if (right < this.items.length && this.less(right, smallest)) {
          smallest = right
        }
        if (smallest === index) {
          break
        }
        this.swap(index, smallest)
        index = smallest
      }
    }

    return top
  }

  private less(a: number, b: number): boolean {
    const nodeA = this.items[a]
    const nodeB = this.items[b]
    if (!nodeA || !nodeB) {
      return false
    }
    if (nodeA.priority !== nodeB.priority) {
      return nodeA.priority < nodeB.priority
    }
    if (nodeA.moves !== nodeB.moves) {
      return nodeA.moves > nodeB.moves
    }

    return nodeA.seq < nodeB.seq
  }

  private swap(a: number, b: number): void {
    const nodeA = this.items[a]
    const nodeB = this.items[b]
    if (nodeA && nodeB) {
      this.items[a] = nodeB
      this.items[b] = nodeA
    }
  }
}
