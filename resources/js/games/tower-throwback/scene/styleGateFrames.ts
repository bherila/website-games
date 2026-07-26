import type { CarState, IncomeTier, ItemKind, Person, ShaftKind, Unit } from '../gameTypes'
import { STYLE_GATE_ATLAS_MANIFEST } from './styleGateManifest.generated'
import type { UnitVisualActivity } from './unitActivity'

export interface StyleGateFrame {
  x: number
  y: number
  w: number
  h: number
  pendingRaster?: true
  targetW?: number
  targetH?: number
}

export type StyleGateDetailLevel = 'detail' | 'summary'

export const STYLE_GATE_ATLAS_WIDTH = STYLE_GATE_ATLAS_MANIFEST.width
export const STYLE_GATE_ATLAS_HEIGHT = STYLE_GATE_ATLAS_MANIFEST.height
export const STYLE_GATE_SUMMARY_VISIBLE_FLOORS = 14

export const STYLE_GATE_FRAMES = STYLE_GATE_ATLAS_MANIFEST.frames satisfies Record<string, StyleGateFrame>

export type StyleGateFrameName = keyof typeof STYLE_GATE_FRAMES

export const STYLE_GATE_BLOWN_UP_DAMAGE_FRAMES = [
  'unit.damage.blownUp.tile',
  'unit.damage.blownUp.variantB.tile',
  'unit.damage.blownUp.variantC.tile',
] as const satisfies readonly StyleGateFrameName[]

export const STYLE_GATE_BURNED_DOWN_DAMAGE_FRAMES = [
  'unit.damage.burnedDown.tile',
  'unit.damage.burnedDown.variantB.tile',
  'unit.damage.burnedDown.variantC.tile',
] as const satisfies readonly StyleGateFrameName[]

export const STYLE_GATE_PENDING_RASTER_FRAMES = [] as const satisfies readonly StyleGateFrameName[]

export const STYLE_GATE_NIAGARA_GORGE_FRAME = 'ambience.niagaraGorge.backdrop' as const satisfies StyleGateFrameName

export function styleGateFrameHasAtlasPixels(frame: StyleGateFrame): boolean {
  return frame.pendingRaster !== true && frame.w > 0 && frame.h > 0
}

export function styleGateFrameNameHasAtlasPixels(name: StyleGateFrameName): boolean {
  return styleGateFrameHasAtlasPixels(STYLE_GATE_FRAMES[name])
}

export function styleGateFrameIsPendingRaster(name: StyleGateFrameName): boolean {
  return (STYLE_GATE_FRAMES[name] as StyleGateFrame).pendingRaster === true
}

const REPEATING_UNIT_FRAMES: Partial<Record<ItemKind, StyleGateFrameName>> = {
  slab: 'unit.slab.tile',
  skylobby: 'unit.skylobby.tile',
  skybridge: 'unit.skybridge.tile',
}

const OCCUPIABLE_UNIT_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>([
  'officeS',
  'officeM',
  'officeL',
  'aptStudio',
  'apt1br',
  'apt2br',
  'aptPenthouse',
  'fastfood',
  'shop',
  'foodCourt',
  'restaurant',
  'fancyRestaurant',
  'fitness',
  'spa',
  'movieTheater',
  'pool',
  'conferenceCenter',
  'eventSpace',
])

const HOTEL_ROOM_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>(['hotel1p', 'hotel2p', 'hotelSuite'])

interface VariantFrameSet {
  occupied: readonly StyleGateFrameName[]
  sleeping: readonly StyleGateFrameName[]
  vacant: readonly StyleGateFrameName[]
}

const VARIANTED_UNIT_FRAMES: Partial<Record<ItemKind, VariantFrameSet>> = {
  officeS: {
    vacant: ['unit.officeS.variantA.vacant', 'unit.officeS.variantB.vacant', 'unit.officeS.variantC.vacant'],
    occupied: ['unit.officeS.variantA.occupied', 'unit.officeS.variantB.occupied', 'unit.officeS.variantC.occupied'],
    sleeping: [],
  },
  officeM: {
    vacant: ['unit.officeM.variantA.vacant', 'unit.officeM.variantB.vacant', 'unit.officeM.variantC.vacant'],
    occupied: ['unit.officeM.variantA.occupied', 'unit.officeM.variantB.occupied', 'unit.officeM.variantC.occupied'],
    sleeping: [],
  },
  officeL: {
    vacant: ['unit.officeL.variantA.vacant', 'unit.officeL.variantB.vacant', 'unit.officeL.variantC.vacant'],
    occupied: ['unit.officeL.variantA.occupied', 'unit.officeL.variantB.occupied', 'unit.officeL.variantC.occupied'],
    sleeping: [],
  },
  aptStudio: {
    vacant: ['unit.aptStudio.variantA.vacant', 'unit.aptStudio.variantB.vacant', 'unit.aptStudio.variantC.vacant'],
    occupied: [
      'unit.aptStudio.variantA.occupied',
      'unit.aptStudio.variantB.occupied',
      'unit.aptStudio.variantC.occupied',
    ],
    sleeping: [
      'unit.aptStudio.variantA.sleeping',
      'unit.aptStudio.variantB.sleeping',
      'unit.aptStudio.variantC.sleeping',
    ],
  },
  apt1br: {
    vacant: ['unit.apt1br.variantA.vacant', 'unit.apt1br.variantB.vacant', 'unit.apt1br.variantC.vacant'],
    occupied: ['unit.apt1br.variantA.occupied', 'unit.apt1br.variantB.occupied', 'unit.apt1br.variantC.occupied'],
    sleeping: ['unit.apt1br.variantA.sleeping', 'unit.apt1br.variantB.sleeping', 'unit.apt1br.variantC.sleeping'],
  },
  apt2br: {
    vacant: ['unit.apt2br.variantA.vacant', 'unit.apt2br.variantB.vacant', 'unit.apt2br.variantC.vacant'],
    occupied: ['unit.apt2br.variantA.occupied', 'unit.apt2br.variantB.occupied', 'unit.apt2br.variantC.occupied'],
    sleeping: ['unit.apt2br.variantA.sleeping', 'unit.apt2br.variantB.sleeping', 'unit.apt2br.variantC.sleeping'],
  },
  aptPenthouse: {
    vacant: [
      'unit.aptPenthouse.variantA.vacant',
      'unit.aptPenthouse.variantB.vacant',
      'unit.aptPenthouse.variantC.vacant',
    ],
    occupied: [
      'unit.aptPenthouse.variantA.occupied',
      'unit.aptPenthouse.variantB.occupied',
      'unit.aptPenthouse.variantC.occupied',
    ],
    sleeping: [
      'unit.aptPenthouse.variantA.sleeping',
      'unit.aptPenthouse.variantB.sleeping',
      'unit.aptPenthouse.variantC.sleeping',
    ],
  },
}

const DYNAMIC_UNIT_KINDS: ReadonlySet<ItemKind> = new Set([...OCCUPIABLE_UNIT_KINDS, ...HOTEL_ROOM_KINDS, 'restroom'])

export const STYLE_GATE_DYNAMIC_UNIT_FRAMES = Object.keys(STYLE_GATE_FRAMES).filter((name): name is StyleGateFrameName => (
  name.startsWith('unit.') && ['.vacant', '.occupied', '.sleeping', '.dirty'].some((suffix) => name.endsWith(suffix))
))

export function styleGateUnitUsesDynamicArt(kind: ItemKind): boolean {
  return DYNAMIC_UNIT_KINDS.has(kind)
}

const SAMPLE_UNIT_FRAMES: Partial<Record<ItemKind, StyleGateFrameName>> = {
  stairs: 'unit.stairs.sample',
  escalator: 'unit.escalator.sample',
  hotelReception: 'unit.hotelReception.sample',
  housekeeping: 'unit.housekeeping.sample',
  trashRoom: 'unit.trashRoom.sample',
  recyclingCenter: 'unit.recyclingCenter.sample',
  parkingRamp: 'unit.parkingRamp.sample',
  parkingSpace: 'unit.parkingSpace.sample',
  subway: 'unit.subway.sample',
  securityOffice: 'unit.securityOffice.sample',
  medicalClinic: 'unit.medicalClinic.sample',
  cathedral: 'unit.cathedral.sample',
  observationDeck: 'unit.observationDeck.sample',
}

const GLASS_BACKED_UNIT_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>([
  'lobby',
  'officeS',
  'officeM',
  'officeL',
  'aptStudio',
  'apt1br',
  'apt2br',
  'aptPenthouse',
  'restroom',
  'fastfood',
  'shop',
  'foodCourt',
  'restaurant',
  'fancyRestaurant',
  'fitness',
  'spa',
  'hotel1p',
  'hotel2p',
  'hotelSuite',
])

export function styleGateRepeatingUnitFrameName(kind: ItemKind): StyleGateFrameName | null {
  return REPEATING_UNIT_FRAMES[kind] ?? null
}

export function styleGateUnitHasGlassBacking(kind: ItemKind): boolean {
  return GLASS_BACKED_UNIT_KINDS.has(kind)
}

export function styleGateUnitArtVariantIndex(unitId: number, variantCount: number): number {
  if (variantCount <= 0) {
    return 0
  }
  const integerId = Number.isFinite(unitId) ? Math.trunc(unitId) : 0
  return ((integerId % variantCount) + variantCount) % variantCount
}

export function styleGateUnitFrameName(
  unit: Pick<Unit, 'id' | 'kind' | 'occupied' | 'dirty'>,
  activity: UnitVisualActivity = unit.occupied ? 'occupied' : 'vacant',
): StyleGateFrameName | null {
  const sampleFrame = SAMPLE_UNIT_FRAMES[unit.kind]
  if (sampleFrame) {
    return sampleFrame
  }

  if (unit.kind === 'restroom') {
    return `unit.restroom.${activity === 'occupied' ? 'occupied' : 'vacant'}` as StyleGateFrameName
  }

  if (HOTEL_ROOM_KINDS.has(unit.kind)) {
    if (unit.dirty) {
      return `unit.${unit.kind}.dirty` as StyleGateFrameName
    }
    const state = unit.occupied ? activity : 'vacant'
    return `unit.${unit.kind}.${state}` as StyleGateFrameName
  }

  const variantFrames = VARIANTED_UNIT_FRAMES[unit.kind]
  if (variantFrames) {
    const requestedFrames = unit.occupied ? variantFrames[activity] : variantFrames.vacant
    const stateFrames = requestedFrames.length > 0 ? requestedFrames : variantFrames.occupied
    return stateFrames[styleGateUnitArtVariantIndex(unit.id, stateFrames.length)] ?? stateFrames[0] ?? null
  }

  if (OCCUPIABLE_UNIT_KINDS.has(unit.kind)) {
    return `unit.${unit.kind}.${unit.occupied && activity !== 'vacant' ? 'occupied' : 'vacant'}` as StyleGateFrameName
  }

  return null
}

export function styleGateDamageFrameName(unit: Pick<Unit, 'id' | 'offline' | 'damageKind'>, column: number): StyleGateFrameName | null {
  if (!unit.offline) {
    return null
  }
  const frames = unit.damageKind === 'fire' ? STYLE_GATE_BURNED_DOWN_DAMAGE_FRAMES : STYLE_GATE_BLOWN_UP_DAMAGE_FRAMES
  return styleGateDamageVariantFrameName(frames, unit.id, column)
}

export function styleGateDamageVariantFrameName(
  frames: readonly StyleGateFrameName[],
  unitId: number,
  column: number,
): StyleGateFrameName | null {
  if (frames.length === 0) {
    return null
  }
  const stableColumn = Number.isFinite(column) ? Math.trunc(column) : 0
  return frames[styleGateUnitArtVariantIndex(unitId + stableColumn, frames.length)] ?? frames[0] ?? null
}

export function styleGateShaftInteriorFrameName(kind: ShaftKind): StyleGateFrameName {
  return `elevator.${kind}.interior` as StyleGateFrameName
}

export function styleGateShaftTopCapFrameName(kind: ShaftKind): StyleGateFrameName {
  return `elevator.${kind}.cap.top` as StyleGateFrameName
}

export function styleGateShaftBottomCapFrameName(kind: ShaftKind): StyleGateFrameName {
  return `elevator.${kind}.cap.bottom` as StyleGateFrameName
}

export type StyleGateCarOccupancy = 'empty' | 'single' | 'double' | 'crowded' | 'full'

export function styleGateCarOccupancy(passengerCount: number, capacity: number): StyleGateCarOccupancy {
  if (passengerCount <= 0) {
    return 'empty'
  }
  if (capacity > 0 && passengerCount >= capacity) {
    return 'full'
  }
  if (passengerCount === 1) {
    return 'single'
  }
  if (passengerCount === 2) {
    return 'double'
  }
  return 'crowded'
}

export function styleGateCarBodyFrameName(
  kind: ShaftKind,
  passengerCount: number,
  capacity: number,
  detailLevel: StyleGateDetailLevel = 'detail',
): StyleGateFrameName {
  const occupancy = styleGateCarOccupancy(passengerCount, capacity)
  if (detailLevel === 'summary') {
    return `elevator.${kind}.car.${occupancy}.summary` as StyleGateFrameName
  }
  return `elevator.${kind}.car.${occupancy}` as StyleGateFrameName
}

export function styleGateDoorFrameName(
  kind: ShaftKind,
  state: CarState,
  detailLevel: StyleGateDetailLevel = 'detail',
): StyleGateFrameName {
  if (detailLevel === 'summary') {
    return `elevator.${kind}.doors.${state === 'doors' ? 'open' : 'closed'}.summary` as StyleGateFrameName
  }
  return `elevator.${kind}.doors.${state === 'doors' ? 'open' : 'closed'}` as StyleGateFrameName
}

export function styleGatePersonFrameName(
  person: Pick<Person, 'id' | 'tier' | 'vip' | 'purpose'>,
  detailLevel: StyleGateDetailLevel = 'detail',
): StyleGateFrameName {
  const suffix = detailLevel === 'summary' ? 'summary' : 'sample'
  if (person.purpose === 'housekeeping') {
    return `person.housekeeper.${suffix}` as StyleGateFrameName
  }
  if (person.purpose === 'trashHaul') {
    return `person.staff.${suffix}` as StyleGateFrameName
  }
  const tier: IncomeTier = person.vip ? 'vip' : person.tier
  const variant = styleGateUnitArtVariantIndex(person.id - 1, 2) === 0 ? '' : '.variantB'
  return `person.${tier}${variant}.${suffix}` as StyleGateFrameName
}

export function styleGateStopPlateFrameName(kind: ShaftKind, enabled: boolean): StyleGateFrameName {
  return `elevator.${kind}.plate.${enabled ? 'enabled' : 'disabled'}` as StyleGateFrameName
}

/**
 * Whether the atlas person path should tint this person as irritated. The atlas
 * keeps the tier/role sprite frame and multiplies a per-instance irritated red
 * over it, matching the fallback renderer's `personColor` (which also lets
 * irritation win over the VIP colour). This is the shared predicate so the two
 * renderers agree on who reads as irritated.
 */
export function styleGatePersonReadsIrritated(person: Pick<Person, 'irritated'>): boolean {
  return person.irritated === true
}

export function styleGateCloudFrameName(index: number): StyleGateFrameName {
  const frames = ['ambience.cloud.sample', 'ambience.cloud.variantB', 'ambience.cloud.variantC'] as const satisfies readonly StyleGateFrameName[]
  return frames[styleGateUnitArtVariantIndex(index, frames.length)] ?? frames[0]
}

export function styleGateDetailLevelForVisibleFloors(visibleFloors: number): StyleGateDetailLevel {
  return visibleFloors > STYLE_GATE_SUMMARY_VISIBLE_FLOORS ? 'summary' : 'detail'
}
