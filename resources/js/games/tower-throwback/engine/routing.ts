/**
 * Routing — floor-segment graph search with a structureVersion-keyed cache.
 *
 * Nodes are walkable floor segments (grid.getSegments). Edges: enabled shaft
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
import { getSegments, type Segment } from './grid'
import { getMap } from './maps'

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

function segmentAt(state: EngineState, floor: number, x: number): Segment | null {
  const runs = getSegments(state).get(floor)
  if (!runs) {
    return null
  }
  return runs.find((run) => x >= run.x0 && x <= run.x1) ?? null
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
  const edges = new Map<string, RouteEdge[]>()

  for (const shaft of state.shafts) {
    const service = shaftDef(shaft.kind).serviceOnly === true
    if (service !== staff) {
      continue
    }
    const stopSegs: Array<{ floor: number; seg: Segment }> = []
    for (const floor of shaft.enabledStops) {
      const seg = segmentAt(state, floor, shaft.x)
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
    const below = segmentAt(state, unit.floor, unit.x)
    const above = segmentAt(state, unit.floor + 1, unit.x)
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
      let dist = node.dist + Math.abs(node.x - edge.boardX) + Math.abs(edge.toFloor - edge.fromFloor)
      if (edge.toKey === toKey) {
        dist += Math.abs(edge.alightX - toX)
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
  const fromSeg = segmentAt(state, fromFloor, fromX)
  const toSeg = segmentAt(state, toFloor, toX)
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

/** True when the unit can reach any ground-floor segment (street level counts as lobby access). */
export function hasRouteToLobby(state: EngineState, unit: Unit): boolean {
  const lobbyFloor = getMap(state.mapId).lobbyAnchorFloor
  if (unit.floor === lobbyFloor) {
    return segmentAt(state, unit.floor, unit.x) !== null
  }
  const lobbySegs = getSegments(state).get(lobbyFloor) ?? []
  for (const seg of lobbySegs) {
    if (findRoute(state, unit.floor, unit.x, lobbyFloor, seg.x0) !== null) {
      return true
    }
  }
  return false
}
