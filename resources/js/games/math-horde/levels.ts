import { applyGateOp, FIRE_INTERVAL, FIRE_RANGE, MAX_VOLLEY_SHOTS } from './gameEngine'
import type { GatePairDef, GateSideDef, HordeDef, LevelDef } from './gameTypes'
import { MAX_ARMY_SIZE, TOTAL_LEVELS } from './gameTypes'
import { runGreedyPilot } from './pilot'
import { createRng, pickWeighted, randomInt, type Rng, uniform } from './rng'

const LEVEL_SEED_BASE = 0x5eed
const HORDE_LANES = [-1.5, 0, 1.5] as const

/**
 * Gate-pair archetypes. Every archetype keeps at least one side survivable
 * (sub only ever appears opposite a mul or div side), so no pair is
 * forced-lethal regardless of the values rolled.
 */
type PairArchetype = 'teach' | 'goodVsBad' | 'bestOfGoods' | 'lesserOfEvils'

interface TimelineGate {
  kind: 'gate'
  progressAt: number
  index: number
  z: number
  archetype: PairArchetype
}

interface TimelineHorde {
  kind: 'horde'
  progressAt: number
  z: number
  lane: number
  speed: number
  boss: false
}

interface TimelineBoss {
  kind: 'boss'
  progressAt: number
  z: number
}

type TimelineEntry = TimelineGate | TimelineHorde | TimelineBoss

function addValue(rng: Rng, id: number): number {
  return Math.min(30, 2 + randomInt(rng, 3 + id * 2))
}

function subValue(rng: Rng, id: number): number {
  return 2 + randomInt(rng, Math.min(14, 1 + id))
}

function mulValue(): number {
  return 2
}

function divValue(rng: Rng, id: number): number {
  return id >= 7 && rng() < 0.35 ? 3 : 2
}

function buildSides(rng: Rng, id: number, archetype: PairArchetype, armyEst: number): { left: GateSideDef; right: GateSideDef } {
  let strong: GateSideDef
  let weak: GateSideDef
  switch (archetype) {
    case 'teach': {
      if (rng() < 0.4) {
        strong = { op: 'mul', value: mulValue() }
        weak = { op: 'add', value: addValue(rng, id) }
      } else {
        const high = addValue(rng, id)
        strong = { op: 'add', value: Math.min(30, high + 1 + randomInt(rng, 4)) }
        weak = { op: 'add', value: Math.max(1, Math.min(high, strong.value - 1)) }
      }
      break
    }
    case 'goodVsBad': {
      strong = rng() < 0.5 ? { op: 'mul', value: mulValue() } : { op: 'add', value: addValue(rng, id) }
      weak = rng() < 0.5 ? { op: 'sub', value: subValue(rng, id) } : { op: 'div', value: divValue(rng, id) }
      break
    }
    case 'bestOfGoods': {
      strong = { op: 'mul', value: mulValue() }
      weak = { op: 'add', value: Math.max(2, Math.min(30, armyEst + randomInt(rng, 9) - 4)) }
      break
    }
    case 'lesserOfEvils': {
      strong = { op: 'sub', value: Math.min(subValue(rng, id), Math.max(2, armyEst - 2)) }
      weak = { op: 'div', value: divValue(rng, id) }
      break
    }
  }

  return rng() < 0.5 ? { left: strong, right: weak } : { left: weak, right: strong }
}

function chooseArchetypes(rng: Rng, id: number, pairCount: number): PairArchetype[] {
  if (id <= 2) {
    const archetypes = Array.from({ length: pairCount }, (): PairArchetype => 'teach')
    archetypes[1 + randomInt(rng, pairCount - 1)] = 'bestOfGoods'

    return archetypes
  }

  let evilsUsed = false
  const archetypes = Array.from({ length: pairCount }, (): PairArchetype => {
    const archetype = pickWeighted<PairArchetype>(rng, [
      { value: 'goodVsBad', weight: 40 },
      { value: 'bestOfGoods', weight: 35 },
      { value: 'lesserOfEvils', weight: id >= 5 && !evilsUsed ? 15 : 0 },
      { value: 'teach', weight: 10 },
    ])
    if (archetype === 'lesserOfEvils') {
      evilsUsed = true
    }

    return archetype
  })
  if (!archetypes.includes('bestOfGoods')) {
    archetypes[archetypes.length - 1] = 'bestOfGoods'
  }
  if (!archetypes.some((archetype) => archetype === 'goodVsBad' || archetype === 'lesserOfEvils')) {
    archetypes[1] = 'goodVsBad'
  }

  return archetypes
}

function createLevel(id: number): LevelDef {
  const rng = createRng(LEVEL_SEED_BASE + id * 101)
  const forwardSpeed = 5.5 + id * 0.1
  const length = 110 + id * 10
  const startingArmy = 5
  const pairCount = id <= 4 ? 4 : id <= 8 ? 5 : 6
  const firstGateZ = 16
  const lastGateZ = length - 30
  const gateSpacing = (lastGateZ - firstGateZ) / (pairCount - 1)
  const hasBoss = id % 3 === 0

  const entries: TimelineEntry[] = []
  const archetypes = chooseArchetypes(rng, id, pairCount)
  for (let index = 0; index < pairCount; index += 1) {
    const z = firstGateZ + index * gateSpacing
    entries.push({ kind: 'gate', progressAt: z, index, z, archetype: archetypes[index]! })
  }

  const hordesPerGap = id <= 2 ? 1 : 2
  for (let gap = 0; gap < pairCount; gap += 1) {
    const gapStart = firstGateZ + gap * gateSpacing
    const gapEnd = gap === pairCount - 1 ? length - 22 : gapStart + gateSpacing
    for (let slot = 0; slot < hordesPerGap; slot += 1) {
      const z = gapStart + ((slot + 1) / (hordesPerGap + 1)) * (gapEnd - gapStart)
      const blocker = id >= 4 && rng() < 0.3
      const speed = blocker ? 0 : uniform(rng, 0.4, 0.9) + id * 0.03
      const lane = HORDE_LANES[randomInt(rng, HORDE_LANES.length)]!
      entries.push({ kind: 'horde', progressAt: (z * forwardSpeed) / (forwardSpeed + speed), z, lane, speed, boss: false })
    }
  }

  const bossSpeed = 0.6
  if (hasBoss) {
    const z = length - 10
    entries.push({ kind: 'boss', progressAt: (z * forwardSpeed) / (forwardSpeed + bossSpeed), z })
  }

  entries.sort((a, b) => a.progressAt - b.progressAt)

  const gatePairs: GatePairDef[] = []
  const hordes: HordeDef[] = []
  let armyEst = startingArmy
  let hordeIndex = 0
  for (const entry of entries) {
    if (entry.kind === 'gate') {
      const sides = buildSides(rng, id, entry.archetype, armyEst)
      gatePairs.push({ id: `l${id}-g${entry.index}`, z: entry.z, left: sides.left, right: sides.right })
      armyEst = Math.max(applyGateOp(armyEst, sides.left), applyGateOp(armyEst, sides.right))
    } else if (entry.kind === 'horde') {
      if (armyEst < 4) {
        continue
      }
      const count = Math.max(2, Math.min(120, armyEst * 2 - 1, Math.round(armyEst * uniform(rng, 0.45, 0.8))))
      hordes.push({ id: `l${id}-h${hordeIndex}`, x: entry.lane, z: entry.z, count, speed: entry.speed })
      hordeIndex += 1
      armyEst -= Math.ceil(count / 2)
    } else {
      const tier = id / 3
      const engageSeconds = FIRE_RANGE / (forwardSpeed + bossSpeed)
      const killsBeforeContact = Math.floor((Math.min(MAX_VOLLEY_SHOTS, Math.ceil(armyEst * 0.5)) / FIRE_INTERVAL) * engageSeconds)
      const count = Math.max(5, Math.min(
        Math.round(armyEst * 1.1) + Math.floor(killsBeforeContact * 0.35),
        armyEst - 1 + Math.floor(killsBeforeContact * 0.5),
      ))
      hordes.push({
        id: `l${id}-boss`,
        x: 0,
        z: entry.z,
        count,
        speed: bossSpeed,
        boss: true,
        pulseInterval: 2.4 - tier * 0.2,
        pulseDamage: 1 + Math.floor(tier / 2),
      })
      armyEst = Math.max(1, armyEst - Math.round(count * 0.25))
    }
  }

  gatePairs.sort((a, b) => a.z - b.z)
  const draft: LevelDef = {
    id,
    name: hasBoss ? `Boss Sector ${id / 3}` : `Neon Sector ${id}`,
    length,
    forwardSpeed,
    startingArmy,
    gatePairs,
    hordes,
    starArmyThresholds: [2, 3],
  }
  const pilot = runGreedyPilot(draft)
  const survivorBenchmark = pilot.status === 'won' ? pilot.armySize : Math.max(2, armyEst)
  const twoStars = Math.max(2, Math.ceil(survivorBenchmark * 0.35))
  const threeStars = Math.min(MAX_ARMY_SIZE, Math.max(twoStars + 1, Math.ceil(survivorBenchmark * 0.6)))

  return { ...draft, starArmyThresholds: [twoStars, threeStars] }
}

export const LEVELS: readonly LevelDef[] = Array.from({ length: TOTAL_LEVELS }, (_, index) => createLevel(index + 1))

export function levelById(id: number): LevelDef | null {
  return LEVELS.find((level) => level.id === id) ?? null
}
