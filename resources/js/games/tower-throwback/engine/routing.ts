/**
 * Routing — floor-segment graph search with a structureVersion-keyed cache.
 *
 * Nodes are walkable floor segments (TowerGeometry). Edges: enabled shaft
 * stops (passenger shafts; service shafts ONLY for staff journeys — staff ride
 * service elevators exclusively per the spec), stairs (≤
 * TUNING.people.stairsMaxFloors total per journey), escalators, and skybridges.
 * A skybridge is slab-family, so its tiles already merge the floor's segments
 * at the grid level — crossing one is a plain walk leg (the 'skybridge'
 * LegType is reserved for Phase 12 rendering polish).
 *
 * Search is uniform-cost over (elevatorLegs, distance) lexicographically —
 * fewer elevator legs always wins, then shorter walk+climb distance.
 * Deterministic tie-breaks: edges expand in shaft/unit id order and FIFO
 * insertion order settles equal costs. Cached per (fromSegment, toSegment,
 * staff, avoidShaftId), invalidated when structureVersion changes.
 */

import type { EngineState, JourneyLeg, Unit } from '../gameTypes'
import { TUNING } from '../gameTypes'
import { shaftDef } from './catalog'
import { getMap } from './maps'
import { geometryFor, type Segment } from './towerGeometry'

export interface RouteOpts {
  staff?: boolean
  /** Reroute-after-patience-expiry: exclude this one shaft. */
  avoidShaftId?: number
  /**
   * Skip the shared path memo (read AND write). The memo key is segment-based
   * and omits fromX/toX, so a per-endpoint probe (e.g. the catchment UI, which
   * asks from many segment origins) must not seed a path the sim later reuses
   * for the same segment pair with different endpoints. Read-only callers pass
   * this; the structure graph itself is still shared.
   */
  bypassCache?: boolean
}

interface RouteEdge {
  type: 'elevator' | 'stairs' | 'escalator'
  toKey: string
  fromFloor: number
  toFloor: number
  boardX: number
  alightX: number
  shaftId?: number
  stairsFloors: number
}

interface RouteGraph {
  edges: Map<string, RouteEdge[]>
}

interface RoutingCache {
  version: number
  graphs: Map<string, RouteGraph>
  paths: Map<string, RouteEdge[] | null>
}

const cacheMap = new WeakMap<EngineState, RoutingCache>()

function segKey(seg: Segment): string {
  return `${seg.floor}:${seg.x0}`
}

function getCache(state: EngineState): RoutingCache {
  const cached = cacheMap.get(state)
  if (cached && cached.version === state.structureVersion) {
    return cached
  }
  const fresh: RoutingCache = { version: state.structureVersion, graphs: new Map(), paths: new Map() }
  cacheMap.set(state, fresh)
  return fresh
}

function addEdge(edges: Map<string, RouteEdge[]>, fromKey: string, edge: RouteEdge): void {
  const list = edges.get(fromKey)
  if (list) {
    list.push(edge)
  } else {
    edges.set(fromKey, [edge])
  }
}

function buildGraph(state: EngineState, staff: boolean): RouteGraph {
  const geometry = geometryFor(state)
  const edges = new Map<string, RouteEdge[]>()

  for (const shaft of state.shafts) {
    const service = shaftDef(shaft.kind).serviceOnly === true
    if (service !== staff) {
      continue
    }
    const stopSegs: Array<{ floor: number; seg: Segment }> = []
    for (const floor of shaft.enabledStops) {
      const seg = geometry.segmentOf(state, floor, shaft.x)
      if (seg) {
        stopSegs.push({ floor, seg })
      }
    }
    for (const a of stopSegs) {
      for (const b of stopSegs) {
        if (a.floor === b.floor) {
          continue
        }
        addEdge(edges, segKey(a.seg), {
          type: 'elevator',
          toKey: segKey(b.seg),
          fromFloor: a.floor,
          toFloor: b.floor,
          boardX: shaft.x,
          alightX: shaft.x,
          shaftId: shaft.id,
          stairsFloors: 0,
        })
      }
    }
  }

  for (const unit of state.units) {
    if (unit.kind !== 'stairs' && unit.kind !== 'escalator') {
      continue
    }
    const below = geometry.segmentOf(state, unit.floor, unit.x)
    const above = geometry.segmentOf(state, unit.floor + 1, unit.x)
    if (!below || !above) {
      continue
    }
    const type = unit.kind === 'stairs' ? 'stairs' : 'escalator'
    const stairsFloors = unit.kind === 'stairs' ? 1 : 0
    addEdge(edges, segKey(below), {
      type,
      toKey: segKey(above),
      fromFloor: unit.floor,
      toFloor: unit.floor + 1,
      boardX: unit.x,
      alightX: unit.x,
      stairsFloors,
    })
    addEdge(edges, segKey(above), {
      type,
      toKey: segKey(below),
      fromFloor: unit.floor + 1,
      toFloor: unit.floor,
      boardX: unit.x,
      alightX: unit.x,
      stairsFloors,
    })
  }

  return { edges }
}

function getGraph(state: EngineState, staff: boolean): RouteGraph {
  const cache = getCache(state)
  const key = staff ? 'staff' : 'passenger'
  let graph = cache.graphs.get(key)
  if (!graph) {
    graph = buildGraph(state, staff)
    cache.graphs.set(key, graph)
  }
  return graph
}

interface SearchNode {
  key: string
  x: number
  elevLegs: number
  stairsUsed: number
  dist: number
  path: RouteEdge[]
  seq: number
}

function searchPath(
  state: EngineState,
  fromKey: string,
  fromX: number,
  toKey: string,
  toX: number,
  opts: RouteOpts,
): RouteEdge[] | null {
  const geometry = geometryFor(state)
  const graph = getGraph(state, opts.staff === true)
  const open: SearchNode[] = [{ key: fromKey, x: fromX, elevLegs: 0, stairsUsed: 0, dist: 0, path: [], seq: 0 }]
  const best = new Map<string, number>()
  let seq = 1

  while (open.length > 0) {
    let bestIdx = 0
    for (let i = 1; i < open.length; i++) {
      const a = open[i]!
      const b = open[bestIdx]!
      if (a.elevLegs < b.elevLegs || (a.elevLegs === b.elevLegs && (a.dist < b.dist || (a.dist === b.dist && a.seq < b.seq)))) {
        bestIdx = i
      }
    }
    const node = open.splice(bestIdx, 1)[0]!
    if (node.key === toKey) {
      return node.path
    }
    const visitKey = `${node.key}|${node.elevLegs}|${node.stairsUsed}`
    const seen = best.get(visitKey)
    if (seen !== undefined && seen <= node.dist) {
      continue
    }
    best.set(visitKey, node.dist)

    for (const edge of graph.edges.get(node.key) ?? []) {
      if (edge.shaftId !== undefined && edge.shaftId === opts.avoidShaftId) {
        continue
      }
      const elevLegs = node.elevLegs + (edge.type === 'elevator' ? 1 : 0)
      if (elevLegs > TUNING.routing.maxElevatorLegs) {
        continue
      }
      const stairsUsed = node.stairsUsed + edge.stairsFloors
      if (stairsUsed > TUNING.people.stairsMaxFloors) {
        continue
      }
      let dist = node.dist + geometry.distance({ x: node.x }, { x: edge.boardX }) + Math.abs(edge.toFloor - edge.fromFloor)
      if (edge.toKey === toKey) {
        dist += geometry.distance({ x: edge.alightX }, { x: toX })
      }
      open.push({ key: edge.toKey, x: edge.alightX, elevLegs, stairsUsed, dist, path: [...node.path, edge], seq: seq++ })
    }
  }
  return null
}

function materialize(fromFloor: number, fromX: number, toX: number, path: RouteEdge[]): JourneyLeg[] {
  const legs: JourneyLeg[] = []
  let floor = fromFloor
  let x = fromX
  for (const edge of path) {
    if (x !== edge.boardX) {
      legs.push({ type: 'walk', fromFloor: floor, fromX: x, toFloor: floor, toX: edge.boardX })
    }
    const leg: JourneyLeg = {
      type: edge.type,
      fromFloor: edge.fromFloor,
      fromX: edge.boardX,
      toFloor: edge.toFloor,
      toX: edge.alightX,
    }
    if (edge.shaftId !== undefined) {
      leg.shaftId = edge.shaftId
    }
    legs.push(leg)
    floor = edge.toFloor
    x = edge.alightX
  }
  if (x !== toX) {
    legs.push({ type: 'walk', fromFloor: floor, fromX: x, toFloor: floor, toX })
  }
  return legs
}

/**
 * Route between two positions, or null when unreachable. An empty array means
 * "already at the destination". At most TUNING.routing.maxElevatorLegs
 * elevator legs; stairs/escalator legs don't count toward that limit.
 */
export function findRoute(
  state: EngineState,
  fromFloor: number,
  fromX: number,
  toFloor: number,
  toX: number,
  opts: RouteOpts = {},
): JourneyLeg[] | null {
  const geometry = geometryFor(state)
  const fromSeg = geometry.segmentOf(state, fromFloor, fromX)
  const toSeg = geometry.segmentOf(state, toFloor, toX)
  if (!fromSeg || !toSeg) {
    return null
  }
  const fromKey = segKey(fromSeg)
  const toKey = segKey(toSeg)
  if (fromKey === toKey) {
    return fromX === toX ? [] : [{ type: 'walk', fromFloor, fromX, toFloor: fromFloor, toX }]
  }

  const cache = getCache(state)
  const pathKey = `${fromKey}|${toKey}|${opts.staff ? 1 : 0}|${opts.avoidShaftId ?? -1}`
  let path = opts.bypassCache ? undefined : cache.paths.get(pathKey)
  if (path === undefined) {
    path = searchPath(state, fromKey, fromX, toKey, toX, opts)
    if (!opts.bypassCache) {
      cache.paths.set(pathKey, path)
    }
  }
  if (path === null) {
    return null
  }
  return materialize(fromFloor, fromX, toX, path)
}

/**
 * True when the unit can reach any ground-floor segment (street level counts as lobby access).
 * UI callers pass `bypassCache` so a look in the inspector never seeds a path the sim reuses.
 */
export function hasRouteToLobby(state: EngineState, unit: Unit, opts: RouteOpts = {}): boolean {
  const geometry = geometryFor(state)
  const lobbyFloor = getMap(state.mapId).lobbyAnchorFloor
  if (unit.floor === lobbyFloor) {
    return geometry.segmentOf(state, unit.floor, unit.x) !== null
  }
  const lobbySegs = geometry.segments(state).get(lobbyFloor) ?? []
  for (const seg of lobbySegs) {
    if (findRoute(state, unit.floor, unit.x, lobbyFloor, seg.x0, opts) !== null) {
      return true
    }
  }
  return false
}

// ── Load-aware elevator choice ──────────────────────────────────────────────

export interface ElevatorChoice {
  shaftId: number
  /** Extra walk tiles over the route's own elevator (0 for that one). */
  extraWalk: number
}

/**
 * Elevators interchangeable with an elevator leg: passenger (or, for staff,
 * service) shafts with enabled landings on both of the leg's floor segments,
 * costing at most `loadSpreadWalkTiles` more walking between `prevX` (where the
 * rider stands before boarding) and `nextX` (where they head after alighting).
 * Includes the leg's own shaft (extra 0). Shaft id order.
 */
export function equivalentElevators(
  state: EngineState,
  leg: JourneyLeg,
  prevX: number,
  nextX: number,
  opts: { staff?: boolean; avoidShaftId?: number } = {},
): ElevatorChoice[] {
  const geometry = geometryFor(state)
  if (leg.type !== 'elevator' || leg.shaftId === undefined) {
    return []
  }
  const fromSeg = geometry.segmentOf(state, leg.fromFloor, leg.fromX)
  const toSeg = geometry.segmentOf(state, leg.toFloor, leg.toX)
  if (!fromSeg || !toSeg) {
    return []
  }
  const walk = (x: number): number => geometry.distance({ x: prevX }, { x }) + geometry.distance({ x }, { x: nextX })
  const baseline = walk(leg.fromX)
  const choices: ElevatorChoice[] = []
  for (const shaft of state.shafts) {
    if (shaft.id === opts.avoidShaftId || (shaftDef(shaft.kind).serviceOnly === true) !== (opts.staff === true)) {
      continue
    }
    if (!shaft.enabledStops.includes(leg.fromFloor) || !shaft.enabledStops.includes(leg.toFloor)) {
      continue
    }
    const a = geometry.segmentOf(state, leg.fromFloor, shaft.x)
    const b = geometry.segmentOf(state, leg.toFloor, shaft.x)
    if (!a || !b || segKey(a) !== segKey(fromSeg) || segKey(b) !== segKey(toSeg)) {
      continue
    }
    const extraWalk = walk(shaft.x) - baseline
    if (shaft.id === leg.shaftId || extraWalk <= TUNING.routing.loadSpreadWalkTiles) {
      choices.push({ shaftId: shaft.id, extraWalk: Math.max(0, extraWalk) })
    }
  }
  return choices
}

/**
 * Re-pick each elevator leg of a planned journey among its equivalent
 * elevators by current load (fewest riders already planned onto it), then
 * extra walk, then shaft id — so one shaft no longer carries every rider just
 * because the route search breaks distance ties toward the lowest id (and its
 * segment-pair memo then repeats that choice for everyone). Walk legs are
 * rebuilt around the chosen columns. Deterministic: `loadOf` is a pure
 * function of the people list, and ties fall to shaft ids.
 */
export function spreadElevatorLegs(
  state: EngineState,
  fromX: number,
  toX: number,
  legs: JourneyLeg[],
  loadOf: (shaftId: number) => number,
  opts: { staff?: boolean; avoidShaftId?: number } = {},
): JourneyLeg[] {
  const fixed = legs.filter((leg) => leg.type !== 'walk')
  if (!fixed.some((leg) => leg.type === 'elevator')) {
    return legs
  }
  let changed = false
  let x = fromX
  for (let i = 0; i < fixed.length; i += 1) {
    const leg = fixed[i]!
    const nextX = fixed[i + 1]?.fromX ?? toX
    if (leg.type === 'elevator') {
      const choices = equivalentElevators(state, leg, x, nextX, opts)
      if (choices.length < 2) {
        x = leg.toX
        continue
      }
      let best: ElevatorChoice | null = null
      let bestLoad = Infinity
      for (const choice of choices) {
        const load = loadOf(choice.shaftId)
        if (load < bestLoad || (load === bestLoad && best !== null && choice.extraWalk < best.extraWalk)) {
          best = choice
          bestLoad = load
        }
      }
      if (best && best.shaftId !== leg.shaftId) {
        const shaft = state.shafts.find((candidate) => candidate.id === best.shaftId)!
        fixed[i] = { ...leg, fromX: shaft.x, toX: shaft.x, shaftId: shaft.id }
        changed = true
      }
    }
    x = fixed[i]!.toX
  }
  if (!changed) {
    return legs
  }
  const rebuilt: JourneyLeg[] = []
  let floor = legs[0]!.fromFloor
  x = fromX
  for (const leg of fixed) {
    if (x !== leg.fromX) {
      rebuilt.push({ type: 'walk', fromFloor: floor, fromX: x, toFloor: floor, toX: leg.fromX })
    }
    rebuilt.push(leg)
    floor = leg.toFloor
    x = leg.toX
  }
  if (x !== toX) {
    rebuilt.push({ type: 'walk', fromFloor: floor, fromX: x, toFloor: floor, toX })
  }
  return rebuilt
}
