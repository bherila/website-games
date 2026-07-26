import { ITEM_DEFS, SHAFT_DEFS } from '../../engine/catalog'
import type { CarState, IncomeTier, ItemKind, Person, ShaftKind, Unit } from '../../gameTypes'
import { createStyleGateFrameGeometry } from '../styleGateArt'
import {
  STYLE_GATE_ATLAS_HEIGHT,
  STYLE_GATE_ATLAS_WIDTH,
  STYLE_GATE_BLOWN_UP_DAMAGE_FRAMES,
  STYLE_GATE_BURNED_DOWN_DAMAGE_FRAMES,
  STYLE_GATE_DYNAMIC_UNIT_FRAMES,
  STYLE_GATE_FRAMES,
  STYLE_GATE_NIAGARA_GORGE_FRAME,
  STYLE_GATE_PENDING_RASTER_FRAMES,
  STYLE_GATE_SUMMARY_VISIBLE_FLOORS,
  styleGateCarBodyFrameName,
  styleGateCarOccupancy,
  styleGateCloudFrameName,
  styleGateDamageFrameName,
  styleGateDamageVariantFrameName,
  type StyleGateDetailLevel,
  styleGateDetailLevelForVisibleFloors,
  styleGateDoorFrameName,
  type StyleGateFrame,
  styleGateFrameHasAtlasPixels,
  styleGateFrameIsPendingRaster,
  type StyleGateFrameName,
  styleGateFrameNameHasAtlasPixels,
  styleGatePersonFrameName,
  styleGatePersonReadsIrritated,
  styleGateRepeatingUnitFrameName,
  styleGateShaftBottomCapFrameName,
  styleGateShaftInteriorFrameName,
  styleGateShaftTopCapFrameName,
  styleGateStopPlateFrameName,
  styleGateUnitArtVariantIndex,
  styleGateUnitFrameName,
  styleGateUnitHasGlassBacking,
  styleGateUnitUsesDynamicArt,
} from '../styleGateFrames'

declare const __dirname: string
declare const require: (id: 'fs') => { readFileSync(path: string, encoding: 'utf8'): string }

// Canonical, exhaustive runtime member lists. Deriving from the type-checked
// `Record<Union, …>` catalogs / `satisfies Record<Union, true>` maps means adding
// a new ShaftKind/ItemKind/IncomeTier/CarState/detail level fails type-checking
// until it is registered here — so the cast-blind-spot guard below can never
// silently skip a new union member.
const ALL_ITEM_KINDS = Object.keys(ITEM_DEFS) as ItemKind[]
const ALL_SHAFT_KINDS = Object.keys(SHAFT_DEFS) as ShaftKind[]
const ALL_INCOME_TIERS = Object.keys({
  low: true,
  med: true,
  high: true,
  vip: true,
} as const satisfies Record<IncomeTier, true>) as IncomeTier[]
const ALL_CAR_STATES = Object.keys({
  idle: true,
  moving: true,
  doors: true,
} as const satisfies Record<CarState, true>) as CarState[]
const ALL_DETAIL_LEVELS = Object.keys({
  detail: true,
  summary: true,
} as const satisfies Record<StyleGateDetailLevel, true>) as StyleGateDetailLevel[]
const ROLE_PERSON_FRAMES = [
  'person.staff.sample',
  'person.staff.summary',
  'person.housekeeper.sample',
  'person.housekeeper.summary',
] as const satisfies readonly StyleGateFrameName[]
const AMBIENCE_FRAMES = [
  'ambience.groundHorizon.strip',
  'ambience.nightStars.tile',
  STYLE_GATE_NIAGARA_GORGE_FRAME,
] as const satisfies readonly StyleGateFrameName[]

function unit(
  partial: Pick<Unit, 'kind'> & Partial<Pick<Unit, 'id' | 'occupied' | 'dirty' | 'offline' | 'damageKind'>>,
): Pick<Unit, 'id' | 'kind' | 'occupied' | 'dirty' | 'offline' | 'damageKind'> {
  return {
    id: partial.id ?? 300,
    kind: partial.kind,
    occupied: partial.occupied ?? false,
    dirty: partial.dirty ?? false,
    offline: partial.offline ?? false,
    damageKind: partial.damageKind ?? null,
  }
}

function person(
  partial: Pick<Person, 'tier'> & Partial<Pick<Person, 'id' | 'vip' | 'purpose'>>,
): Pick<Person, 'id' | 'tier' | 'vip' | 'purpose'> {
  return {
    id: partial.id ?? 1,
    tier: partial.tier,
    vip: partial.vip ?? false,
    purpose: partial.purpose ?? 'shopping',
  }
}

interface StyleGateManifest {
  width: number
  height: number
  padding: number
  ppu: number
  sourceScale: number
  frames: Record<string, StyleGateFrame>
}

describe('style-gate frame selection', () => {
  it('keeps runtime frame constants in sync with the generated atlas manifest', () => {
    const manifest = JSON.parse(
      require('fs').readFileSync(
        `${__dirname}/../../assets/sprites/style-gate.json`,
        'utf8',
      ) as string,
    ) as StyleGateManifest

    expect(manifest.ppu).toBe(64)
    expect(manifest.sourceScale).toBe(4)
    expect(STYLE_GATE_ATLAS_WIDTH).toBe(manifest.width)
    expect(STYLE_GATE_ATLAS_HEIGHT).toBe(manifest.height)
    expect(STYLE_GATE_FRAMES).toEqual(manifest.frames)
  })

  it('leaves repeatable structural units to the renderer tiler', () => {
    expect(styleGateUnitFrameName(unit({ kind: 'lobby' }))).toBeNull()
    expect(styleGateRepeatingUnitFrameName('lobby')).toBeNull()
    expect(styleGateUnitFrameName(unit({ kind: 'slab' }))).toBeNull()
    expect(styleGateRepeatingUnitFrameName('slab')).toBe('unit.slab.tile')
    expect(styleGateUnitFrameName(unit({ kind: 'skylobby' }))).toBeNull()
    expect(styleGateRepeatingUnitFrameName('skylobby')).toBe('unit.skylobby.tile')
    expect(styleGateUnitFrameName(unit({ kind: 'skybridge' }))).toBeNull()
    expect(styleGateRepeatingUnitFrameName('skybridge')).toBe('unit.skybridge.tile')
  })

  it('registers lobby decor overlays at native atlas aspect', () => {
    expect(STYLE_GATE_FRAMES['unit.lobby.decor.tree']).toEqual(expect.objectContaining({ w: 144, h: 192 }))
    expect(STYLE_GATE_FRAMES['unit.lobby.decor.bench']).toEqual(expect.objectContaining({ w: 192, h: 96 }))
    expect(STYLE_GATE_FRAMES['unit.lobby.decor.frontDesk']).toEqual(expect.objectContaining({ w: 192, h: 96 }))
    expect(STYLE_GATE_FRAMES['unit.lobby.decor.plant']).toEqual(expect.objectContaining({ w: 64, h: 96 }))
  })

  it('registers damage overlay frames in the generated atlas', () => {
    for (const frameName of STYLE_GATE_BLOWN_UP_DAMAGE_FRAMES) {
      expect(STYLE_GATE_FRAMES[frameName]).toEqual(expect.objectContaining({ w: 64, h: 192 }))
      expect(styleGateFrameNameHasAtlasPixels(frameName)).toBe(true)
    }
    expect(STYLE_GATE_FRAMES['unit.damage.burnedDown.tile']).toEqual(expect.objectContaining({ w: 64, h: 192 }))

    const manifest = JSON.parse(
      require('fs').readFileSync(
        `${__dirname}/../../assets/sprites/style-gate.json`,
        'utf8',
      ) as string,
    ) as StyleGateManifest
    const packedBottom = Math.max(
      ...Object.values(STYLE_GATE_FRAMES)
        .filter(styleGateFrameHasAtlasPixels)
        .map((frame) => frame.y + frame.h),
    )
    expect(STYLE_GATE_ATLAS_HEIGHT).toBe(packedBottom + manifest.padding)
  })

  it('selects a deterministic blown-up damage tile for every unit column', () => {
    const damaged = unit({ kind: 'officeS', id: 3, offline: true })

    expect(styleGateDamageFrameName(unit({ kind: 'officeS', id: 3 }), 0)).toBeNull()
    expect(styleGateDamageFrameName(damaged, 0)).toBe('unit.damage.blownUp.tile')
    expect(styleGateDamageFrameName(damaged, 1)).toBe('unit.damage.blownUp.variantB.tile')
    expect(styleGateDamageFrameName(damaged, 2)).toBe('unit.damage.blownUp.variantC.tile')
    expect(styleGateDamageFrameName(damaged, 3)).toBe('unit.damage.blownUp.tile')
    expect(styleGateDamageFrameName(unit({ kind: 'officeS', id: -1, offline: true }), 1)).toBe('unit.damage.blownUp.tile')
  })

  it('selects deterministic art variants for office and residential units', () => {
    const variedKinds: readonly ItemKind[] = [
      'officeS',
      'officeM',
      'officeL',
      'aptStudio',
      'apt1br',
      'apt2br',
      'aptPenthouse',
    ]

    for (const kind of variedKinds) {
      expect(styleGateUnitFrameName(unit({ kind, id: 300 }))).toBe(`unit.${kind}.variantA.vacant`)
      expect(styleGateUnitFrameName(unit({ kind, id: 301 }))).toBe(`unit.${kind}.variantB.vacant`)
      expect(styleGateUnitFrameName(unit({ kind, id: 302 }))).toBe(`unit.${kind}.variantC.vacant`)
      expect(styleGateUnitFrameName(unit({ kind, id: 302, occupied: true }))).toBe(`unit.${kind}.variantC.occupied`)
      const adjacentFrames = [300, 301, 302].map((id) => styleGateUnitFrameName(unit({ kind, id })))
      expect(new Set(adjacentFrames).size).toBe(3)
    }

    expect(styleGateUnitArtVariantIndex(300, 3)).toBe(0)
    expect(styleGateUnitArtVariantIndex(301, 3)).toBe(1)
    expect(styleGateUnitArtVariantIndex(302, 3)).toBe(2)
    expect(styleGateUnitArtVariantIndex(-1, 3)).toBe(2)
    expect(styleGateUnitArtVariantIndex(1, 0)).toBe(0)
    expect(styleGateUnitFrameName(unit({ kind: 'apt1br', id: 301, occupied: true }), 'sleeping')).toBe(
      'unit.apt1br.variantB.sleeping',
    )
  })

  it('selects vacant and occupied samples for non-varied occupiable units', () => {
    const occupiableKinds: readonly ItemKind[] = [
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
    ]

    for (const kind of occupiableKinds) {
      expect(styleGateUnitFrameName(unit({ kind }))).toBe(`unit.${kind}.vacant`)
      expect(styleGateUnitFrameName(unit({ kind, occupied: true }))).toBe(`unit.${kind}.occupied`)
    }
  })

  it('selects single samples for service, transit, and special units', () => {
    const sampleKinds: readonly ItemKind[] = [
      'stairs',
      'escalator',
      'hotelReception',
      'housekeeping',
      'trashRoom',
      'recyclingCenter',
      'parkingRamp',
      'parkingSpace',
      'subway',
      'securityOffice',
      'medicalClinic',
      'cathedral',
      'observationDeck',
    ]

    for (const kind of sampleKinds) {
      expect(styleGateUnitFrameName(unit({ kind }))).toBe(`unit.${kind}.sample`)
    }
  })

  it('prefers the dirty hotel room sample over occupancy', () => {
    for (const kind of ['hotel1p', 'hotel2p', 'hotelSuite'] as const) {
      expect(styleGateUnitFrameName(unit({ kind }))).toBe(`unit.${kind}.vacant`)
      expect(styleGateUnitFrameName(unit({ kind, occupied: true }))).toBe(`unit.${kind}.occupied`)
      expect(styleGateUnitFrameName(unit({ kind, occupied: true }), 'sleeping')).toBe(`unit.${kind}.sleeping`)
      expect(styleGateUnitFrameName(unit({ kind, occupied: true, dirty: true }))).toBe(`unit.${kind}.dirty`)
    }
  })

  it('keeps damage art separate from structure frame selection', () => {
    expect(styleGateDamageFrameName(unit({ kind: 'officeS', offline: true }), 0)).toBe('unit.damage.blownUp.tile')
    expect(styleGateDamageFrameName(unit({ kind: 'officeS', offline: true, damageKind: 'fire' }), 1)).toBe(
      'unit.damage.burnedDown.variantB.tile',
    )
    expect(styleGateDamageFrameName(unit({ kind: 'officeS', offline: false }), 0)).toBeNull()
    expect(styleGateUnitFrameName(unit({ kind: 'officeS', occupied: true, offline: true }))).toBe('unit.officeS.variantA.occupied')
    expect(styleGateUnitFrameName(unit({ kind: 'restroom', offline: true }))).toBe('unit.restroom.vacant')
  })

  it('cycles both damage frame sets deterministically by unit and tile column', () => {
    expect(STYLE_GATE_BLOWN_UP_DAMAGE_FRAMES).toHaveLength(3)
    expect(STYLE_GATE_BURNED_DOWN_DAMAGE_FRAMES).toHaveLength(3)
    expect([0, 1, 2].map((column) => styleGateDamageVariantFrameName(STYLE_GATE_BURNED_DOWN_DAMAGE_FRAMES, 9, column))).toEqual([
      'unit.damage.burnedDown.tile',
      'unit.damage.burnedDown.variantB.tile',
      'unit.damage.burnedDown.variantC.tile',
    ])
    expect(styleGateDamageVariantFrameName([], 9, 0)).toBeNull()
  })

  it('backs transparent window units with runtime glass color', () => {
    expect(styleGateUnitHasGlassBacking('lobby')).toBe(true)
    expect(styleGateUnitHasGlassBacking('officeS')).toBe(true)
    expect(styleGateUnitHasGlassBacking('apt2br')).toBe(true)
    expect(styleGateUnitHasGlassBacking('hotelSuite')).toBe(true)
    expect(styleGateUnitHasGlassBacking('subway')).toBe(false)
    expect(styleGateUnitHasGlassBacking('parkingSpace')).toBe(false)
  })

  it('registers every activity-swapped unit frame for dynamic rendering', () => {
    expect(styleGateUnitUsesDynamicArt('officeS')).toBe(true)
    expect(styleGateUnitUsesDynamicArt('aptStudio')).toBe(true)
    expect(styleGateUnitUsesDynamicArt('fastfood')).toBe(true)
    expect(styleGateUnitUsesDynamicArt('hotelSuite')).toBe(true)
    expect(styleGateUnitUsesDynamicArt('restroom')).toBe(true)
    expect(STYLE_GATE_DYNAMIC_UNIT_FRAMES).toContain('unit.restroom.occupied')
    expect(STYLE_GATE_DYNAMIC_UNIT_FRAMES).toContain('unit.aptStudio.variantA.sleeping')
    expect(STYLE_GATE_DYNAMIC_UNIT_FRAMES).toContain('unit.hotelSuite.sleeping')
    expect(STYLE_GATE_DYNAMIC_UNIT_FRAMES.every(styleGateFrameNameHasAtlasPixels)).toBe(true)
  })

  it('selects elevator style-gate frames for every shaft kind', () => {
    const shaftKinds: ShaftKind[] = ['standard', 'express', 'service', 'glass']
    for (const kind of shaftKinds) {
      expect(styleGateShaftInteriorFrameName(kind)).toBe(`elevator.${kind}.interior`)
      expect(styleGateShaftTopCapFrameName(kind)).toBe(`elevator.${kind}.cap.top`)
      expect(styleGateShaftBottomCapFrameName(kind)).toBe(`elevator.${kind}.cap.bottom`)
      const capacity = SHAFT_DEFS[kind].carCapacity
      expect(styleGateCarBodyFrameName(kind, 0, capacity)).toBe(`elevator.${kind}.car.empty`)
      expect(styleGateCarBodyFrameName(kind, 1, capacity)).toBe(`elevator.${kind}.car.single`)
      expect(styleGateCarBodyFrameName(kind, 2, capacity)).toBe(`elevator.${kind}.car.double`)
      expect(styleGateCarBodyFrameName(kind, capacity - 1, capacity)).toBe(`elevator.${kind}.car.crowded`)
      expect(styleGateCarBodyFrameName(kind, capacity, capacity)).toBe(`elevator.${kind}.car.full`)
      expect(styleGateStopPlateFrameName(kind, true)).toBe(`elevator.${kind}.plate.enabled`)
      expect(styleGateStopPlateFrameName(kind, false)).toBe(`elevator.${kind}.plate.disabled`)
      expect(styleGateDoorFrameName(kind, 'idle')).toBe(`elevator.${kind}.doors.closed`)
      expect(styleGateDoorFrameName(kind, 'moving')).toBe(`elevator.${kind}.doors.closed`)
      expect(styleGateDoorFrameName(kind, 'doors')).toBe(`elevator.${kind}.doors.open`)
    }
  })

  it('selects simplified elevator frames for zoomed-out summary detail', () => {
    const capacity = SHAFT_DEFS.standard.carCapacity
    expect(styleGateCarBodyFrameName('standard', 0, capacity, 'summary')).toBe('elevator.standard.car.empty.summary')
    expect(styleGateCarBodyFrameName('standard', 1, capacity, 'summary')).toBe('elevator.standard.car.single.summary')
    expect(styleGateCarBodyFrameName('standard', 2, capacity, 'summary')).toBe('elevator.standard.car.double.summary')
    expect(styleGateCarBodyFrameName('standard', capacity - 1, capacity, 'summary')).toBe('elevator.standard.car.crowded.summary')
    expect(styleGateCarBodyFrameName('standard', capacity, capacity, 'summary')).toBe('elevator.standard.car.full.summary')
    expect(styleGateDoorFrameName('glass', 'idle', 'summary')).toBe('elevator.glass.doors.closed.summary')
    expect(styleGateDoorFrameName('glass', 'doors', 'summary')).toBe('elevator.glass.doors.open.summary')
  })

  it('selects all person tier samples', () => {
    expect(styleGatePersonFrameName(person({ tier: 'low' }))).toBe('person.low.sample')
    expect(styleGatePersonFrameName(person({ tier: 'med' }))).toBe('person.med.sample')
    expect(styleGatePersonFrameName(person({ tier: 'high' }))).toBe('person.high.sample')
    expect(styleGatePersonFrameName(person({ tier: 'vip' }))).toBe('person.vip.sample')
    expect(styleGatePersonFrameName(person({ tier: 'low', vip: true }))).toBe('person.vip.sample')
    expect(styleGatePersonFrameName(person({ id: 2, tier: 'med' }))).toBe('person.med.variantB.sample')
    expect(styleGatePersonFrameName(person({ tier: 'low', purpose: 'trashHaul' }))).toBe('person.staff.sample')
    expect(styleGatePersonFrameName(person({ tier: 'low', purpose: 'housekeeping' }))).toBe('person.housekeeper.sample')
  })

  it('selects simplified people frames for zoomed-out summary detail', () => {
    expect(styleGatePersonFrameName(person({ tier: 'low' }), 'summary')).toBe('person.low.summary')
    expect(styleGatePersonFrameName(person({ tier: 'med' }), 'summary')).toBe('person.med.summary')
    expect(styleGatePersonFrameName(person({ tier: 'high' }), 'summary')).toBe('person.high.summary')
    expect(styleGatePersonFrameName(person({ tier: 'vip' }), 'summary')).toBe('person.vip.summary')
    expect(styleGatePersonFrameName(person({ tier: 'low', vip: true }), 'summary')).toBe('person.vip.summary')
    expect(styleGatePersonFrameName(person({ id: 2, tier: 'high' }), 'summary')).toBe('person.high.variantB.summary')
    expect(styleGatePersonFrameName(person({ tier: 'low', purpose: 'trashHaul' }), 'summary')).toBe('person.staff.summary')
    expect(styleGatePersonFrameName(person({ tier: 'low', purpose: 'housekeeping' }), 'summary')).toBe('person.housekeeper.summary')
  })

  it('flags irritated people for the atlas per-instance tint path', () => {
    expect(styleGatePersonReadsIrritated({ irritated: true })).toBe(true)
    expect(styleGatePersonReadsIrritated({ irritated: false })).toBe(false)
  })

  it('has no pending raster manifest slots', () => {
    expect(STYLE_GATE_PENDING_RASTER_FRAMES).toEqual([])
  })

  it('packs staff and housekeeper people into the atlas', () => {
    for (const frameName of ROLE_PERSON_FRAMES) {
      expect(STYLE_GATE_FRAMES[frameName]).toEqual(expect.objectContaining({ w: 40, h: 76 }))
      expect(styleGateFrameIsPendingRaster(frameName)).toBe(false)
      expect(styleGateFrameNameHasAtlasPixels(frameName)).toBe(true)
    }
  })

  it('packs the ambience frames and cloud variants into the atlas', () => {
    expect(STYLE_GATE_FRAMES['ambience.groundHorizon.strip']).toEqual(expect.objectContaining({ w: 512, h: 192 }))
    expect(STYLE_GATE_FRAMES['ambience.nightStars.tile']).toEqual(expect.objectContaining({ w: 512, h: 256 }))
    expect(STYLE_GATE_FRAMES[STYLE_GATE_NIAGARA_GORGE_FRAME]).toEqual(expect.objectContaining({ w: 1536, h: 1024 }))
    for (const frameName of AMBIENCE_FRAMES) {
      expect(styleGateFrameIsPendingRaster(frameName)).toBe(false)
      expect(styleGateFrameNameHasAtlasPixels(frameName)).toBe(true)
    }
    expect([0, 1, 2].map(styleGateCloudFrameName)).toEqual([
      'ambience.cloud.sample',
      'ambience.cloud.variantB',
      'ambience.cloud.variantC',
    ])
  })

  it('creates textured geometry for formerly pending frames', () => {
    for (const frameName of [...ROLE_PERSON_FRAMES, ...AMBIENCE_FRAMES]) {
      const geometry = createStyleGateFrameGeometry(frameName)
      expect(geometry).not.toBeNull()
      geometry?.dispose()
    }
  })

  it('switches to summary detail only after the visible-floor threshold', () => {
    expect(styleGateDetailLevelForVisibleFloors(STYLE_GATE_SUMMARY_VISIBLE_FLOORS)).toBe('detail')
    expect(styleGateDetailLevelForVisibleFloors(STYLE_GATE_SUMMARY_VISIBLE_FLOORS + 0.1)).toBe('summary')
  })

  // The selector helpers build frame names by template string + `as StyleGateFrameName`,
  // which bypasses the type checker. Exhaustively drive every enum member (see the
  // canonical lists above) and assert each resolved name is a real atlas key, so a future
  // union member or a dropped atlas frame fails here instead of silently rendering an
  // invisible sprite at runtime (frame() only warns once and returns null).
  it('resolves every enum-driven frame name to a real atlas frame', () => {
    const has = (name: string): boolean => Object.prototype.hasOwnProperty.call(STYLE_GATE_FRAMES, name)
    const realOrNull = (name: string | null): boolean => name === null || has(name)

    for (const kind of ALL_SHAFT_KINDS) {
      const capacity = SHAFT_DEFS[kind].carCapacity
      expect(has(styleGateShaftInteriorFrameName(kind))).toBe(true)
      expect(has(styleGateShaftTopCapFrameName(kind))).toBe(true)
      expect(has(styleGateShaftBottomCapFrameName(kind))).toBe(true)
      for (const detail of ALL_DETAIL_LEVELS) {
        for (const passengerCount of [0, 1, 2, capacity - 1, capacity]) {
          expect(has(styleGateCarBodyFrameName(kind, passengerCount, capacity, detail))).toBe(true)
        }
        for (const state of ALL_CAR_STATES) {
          expect(has(styleGateDoorFrameName(kind, state, detail))).toBe(true)
        }
      }
      expect(has(styleGateStopPlateFrameName(kind, true))).toBe(true)
      expect(has(styleGateStopPlateFrameName(kind, false))).toBe(true)
    }

    for (const tier of ALL_INCOME_TIERS) {
      for (const detail of ALL_DETAIL_LEVELS) {
        expect(has(styleGatePersonFrameName(person({ tier }), detail))).toBe(true)
      }
    }

    // Unit + repeating-unit selectors return null for unstyled kinds; every non-null
    // must resolve, covering the `unit.${kind}.*` casts too.
    for (const kind of ALL_ITEM_KINDS) {
      expect(realOrNull(styleGateRepeatingUnitFrameName(kind))).toBe(true)
      expect(realOrNull(styleGateUnitFrameName(unit({ kind })))).toBe(true)
      expect(realOrNull(styleGateUnitFrameName(unit({ kind, occupied: true })))).toBe(true)
      expect(realOrNull(styleGateUnitFrameName(unit({ kind, occupied: true, dirty: true })))).toBe(true)
    }
  })

  it('maps car occupancy boundaries without consulting engine state', () => {
    expect(styleGateCarOccupancy(0, 8)).toBe('empty')
    expect(styleGateCarOccupancy(1, 8)).toBe('single')
    expect(styleGateCarOccupancy(2, 8)).toBe('double')
    expect(styleGateCarOccupancy(7, 8)).toBe('crowded')
    expect(styleGateCarOccupancy(8, 8)).toBe('full')
    expect(styleGateCarOccupancy(9, 8)).toBe('full')
  })
})
