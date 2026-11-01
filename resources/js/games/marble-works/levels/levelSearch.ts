import { cellKey, placementProblem, placementSize, remainingCount } from '../board/grid'
import { MARBLE_KINDS } from '../physics/marbles'
import { marbleSchedule, type RunResult, simulateRun } from '../physics/runWorld'
import { type PieceId, PIECES } from '../pieces/pieceCatalog'
import type { Cell, LevelDef, PiecePlacement } from './levelTypes'

/**
 * Searches for the cheapest builds that solve a level — the "shortcut finder" used to
 * check that no level can be won with fewer pieces than intended.
 *
 * The search only tries pieces where a marble actually goes. A piece no marble touches
 * changes nothing, and in any winning build the pieces are first touched in some order
 * p1, p2, …: the run with just p1…pi is identical to the full run until p(i+1) is first
 * touched, so p(i+1) lies on that shorter build's path, after pi's first touch. Growing
 * builds one piece at a time along the path, keeping only builds whose new piece is the
 * last one touched, therefore reaches every winning build exactly once (up to the path
 * sampling resolution). Builds are explored breadth-first, so the first depth that wins
 * is the true minimum when the search is `exhausted`.
 */

export interface SearchOptions {
  /** Largest build to try. */
  maxPieces: number
  /** Stop after this many simulations (the result says whether the space was exhausted). */
  maxRuns?: number
  /** Count a win only when every gem is collected. */
  requireGems?: boolean
  /** Stop expanding deeper once a depth produced a solution. */
  stopAtFirstDepth?: boolean
  /** Keep at most this many solutions. */
  maxSolutions?: number
  /** Which pieces may be placed (default: the level's tray). */
  inventory?: LevelDef['inventory']
  /**
   * Explore the most promising builds first (more marbles home, more gems, longer runs)
   * instead of breadth-first. Finds solutions to big levels quickly but proves no minimum.
   */
  bestFirst?: boolean
}

export interface SearchResult {
  /** Winning builds, smallest first. */
  solutions: PiecePlacement[][]
  /** Smallest winning build size found, or null. */
  minPieces: number | null
  runs: number
  /** True when every build up to the depth reached was tried. */
  exhausted: boolean
  /** Deepest build size fully explored. */
  depthExplored: number
}

interface SearchRun {
  result: RunResult
  /** First-touch step per placement, keyed by `placementKey`. */
  touches: Map<string, number>
}

interface Node {
  placements: PiecePlacement[]
  result: RunResult
  /** First-touch step of the most recently added piece (0 for the empty build). */
  lastTouch: number
}

/** Every orientation (variant × flip) a piece can be placed in. */
export function orientations(pieceId: PieceId): { variant: number; flipped: boolean }[] {
  const piece = PIECES[pieceId]
  const flips = piece.flippable ? [false, true] : [false]

  return piece.variants.flatMap((_, variant) => flips.map((flipped) => ({ variant, flipped })))
}

function placementKey(placement: PiecePlacement): string {
  return `${placement.pieceId}@${placement.col},${placement.row}:${placement.variant}${placement.flipped ? 'f' : ''}`
}

function signature(placements: readonly PiecePlacement[]): string {
  return placements.map(placementKey).sort().join('|')
}

/** Cells a marble's centre came near (within its radius plus a margin) after `fromStep`. */
export function cellsAlongPath(level: LevelDef, result: RunResult, fromStep: number): Cell[] {
  const cells = new Map<string, Cell>()
  const schedule = marbleSchedule(level)
  result.paths.forEach((path, marble) => {
    const steps = result.pathSteps[marble] ?? []
    const kind = schedule[marble]?.kind ?? 'glass'
    const reach = MARBLE_KINDS[kind].radius + 0.08
    path.forEach(([x, y], index) => {
      if ((steps[index] ?? 0) < fromStep) {
        return
      }
      for (const [dx, dy] of [[0, 0], [reach, 0], [-reach, 0], [0, reach], [0, -reach]] as const) {
        const col = Math.floor(x + dx)
        const row = Math.floor(level.rows - (y + dy))
        if (col >= 0 && row >= 0 && col < level.cols && row < level.rows) {
          cells.set(cellKey({ col, row }), { col, row })
        }
      }
    })
  })

  return [...cells.values()]
}

function isWin(level: LevelDef, result: RunResult, requireGems: boolean): boolean {
  return result.status === 'won' && (!requireGems || result.allGems)
}

export function searchLevel(level: LevelDef, options: SearchOptions): SearchResult {
  const maxRuns = options.maxRuns ?? Number.POSITIVE_INFINITY
  const requireGems = options.requireGems ?? false
  const maxSolutions = options.maxSolutions ?? 20
  const searchLevelDef: LevelDef = options.inventory ? { ...level, inventory: options.inventory } : level
  const pieceIds = (Object.keys(searchLevelDef.inventory) as PieceId[]).filter((pieceId) => (searchLevelDef.inventory[pieceId] ?? 0) > 0)
  const cache = new Map<string, SearchRun>()
  const solutions: PiecePlacement[][] = []
  let runs = 0
  let budgetHit = false

  const run = (placements: PiecePlacement[]): SearchRun | null => {
    const key = signature(placements)
    const cached = cache.get(key)
    if (cached) {
      return cached
    }
    if (runs >= maxRuns) {
      budgetHit = true
      return null
    }
    runs += 1
    // Simulate in a canonical order so a cached run never depends on how the build was reached.
    const ordered = [...placements].sort((a, b) => placementKey(a).localeCompare(placementKey(b)))
    const result = simulateRun(level, ordered)
    const touches = new Map<string, number>()
    ordered.forEach((placement, index) => {
      const step = result.firstContacts.get(index)
      if (step !== undefined) {
        touches.set(placementKey(placement), step)
      }
    })
    const searchRun = { result, touches }
    cache.set(key, searchRun)

    return searchRun
  }

  const rootRun = run([])
  const root = rootRun?.result
  if (!root) {
    return { solutions, minPieces: null, runs, exhausted: false, depthExplored: -1 }
  }
  if (isWin(level, root, requireGems)) {
    return { solutions: [[]], minPieces: 0, runs, exhausted: true, depthExplored: 0 }
  }

  const expand = (node: Node, onChild: (child: Node, won: boolean) => void): void => {
    const cells = cellsAlongPath(level, node.result, node.lastTouch)
    for (const pieceId of pieceIds) {
      if (remainingCount(searchLevelDef, node.placements, pieceId) <= 0) {
        continue
      }
      for (const orientation of orientations(pieceId)) {
        const { w, h } = placementSize({ pieceId, variant: orientation.variant })
        const anchors = new Map<string, Cell>()
        for (const cell of cells) {
          for (let dy = 0; dy < h; dy += 1) {
            for (let dx = 0; dx < w; dx += 1) {
              const anchor = { col: cell.col - dx, row: cell.row - dy }
              anchors.set(cellKey(anchor), anchor)
            }
          }
        }
        for (const anchor of anchors.values()) {
          if (budgetHit) {
            return
          }
          const candidate: PiecePlacement = { pieceId, ...orientation, ...anchor }
          if (placementProblem(searchLevelDef, node.placements, candidate) !== null) {
            continue
          }
          const placements = [...node.placements, candidate]
          const key = signature(placements)
          if (seen.has(key)) {
            continue
          }
          const searchRun = run(placements)
          if (!searchRun) {
            return
          }
          const { result, touches } = searchRun
          const touch = touches.get(placementKey(candidate))
          // Canonical order: every piece touched, and the new one touched last.
          if (touch === undefined || touch < node.lastTouch || touches.size !== placements.length) {
            continue
          }
          if (Math.max(...touches.values()) !== touch) {
            continue
          }
          seen.add(key)
          onChild({ placements, result, lastTouch: touch }, isWin(level, result, requireGems))
        }
      }
    }
  }

  const seen = new Set<string>()
  let depthExplored = 0
  let minPieces: number | null = null
  const record = (child: Node): void => {
    minPieces = minPieces === null ? child.placements.length : Math.min(minPieces, child.placements.length)
    if (solutions.length < maxSolutions) {
      solutions.push(child.placements)
    }
  }

  if (options.bestFirst) {
    const score = (node: Node): number => (node.result.home * 100) + (node.result.gems * 25) + (node.result.elapsed * 3) - (node.placements.length * 12)
    const open: { node: Node; score: number }[] = [{ node: { placements: [], result: root, lastTouch: 0 }, score: 0 }]
    while (open.length > 0 && !budgetHit && solutions.length < maxSolutions) {
      let best = 0
      for (let i = 1; i < open.length; i += 1) {
        if ((open[i]?.score ?? -Infinity) > (open[best]?.score ?? -Infinity)) {
          best = i
        }
      }
      const [entry] = open.splice(best, 1)
      if (!entry || entry.node.placements.length >= options.maxPieces) {
        continue
      }
      expand(entry.node, (child, won) => {
        if (won) {
          record(child)
        } else {
          open.push({ node: child, score: score(child) })
        }
      })
    }
    solutions.sort((a, b) => a.length - b.length)

    return { solutions, minPieces, runs, exhausted: !budgetHit && open.length === 0, depthExplored: 0 }
  }

  let frontier: Node[] = [{ placements: [], result: root, lastTouch: 0 }]
  for (let depth = 1; depth <= options.maxPieces && frontier.length > 0 && !budgetHit; depth += 1) {
    const next: Node[] = []
    for (const node of frontier) {
      if (budgetHit) {
        break
      }
      expand(node, (child, won) => {
        if (won) {
          record(child)
        } else {
          next.push(child)
        }
      })
    }
    if (!budgetHit) {
      depthExplored = depth
    }
    if (minPieces !== null && options.stopAtFirstDepth) {
      break
    }
    frontier = next
  }

  return { solutions, minPieces, runs, exhausted: !budgetHit, depthExplored }
}
