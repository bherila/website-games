/**
 * Palette — the single source for every scene color, keyed by the active
 * map's paletteTheme. THIS FILE IS THE SPRITE-ATLAS SWAP SEAM: the flat-rect
 * renderer reads nothing but these values, so replacing colors with atlas UV
 * lookups later touches only this module and the mesh builders.
 *
 * World scale constants live here too: 1 tile = 1 world unit in x, one floor
 * = FLOOR_H world units in y.
 */

import * as THREE from 'three'

import type { IncomeTier, ItemKind, Person, ShaftKind, Unit } from '../gameTypes'

export const TILE_W = 1
export const FLOOR_H = 3

export interface TowerPalette {
  skyDay: number
  skyNight: number
  ground: number
  slabEdge: number
  unitBase: Record<ItemKind, number>
  /** Multiplier toward gray for vacant units. */
  vacantDesaturation: number
  dirtyTint: number
  infestedTint: number
  offline: number
  shaft: Record<ShaftKind, number>
  /** Rail translucency per shaft kind (glass elevators render see-through). */
  shaftOpacity: Partial<Record<ShaftKind, number>>
  stopMarker: number
  stopMarkerEnabled: number
  carCabin: number
  /** Cabin brightens while the doors are open. */
  carCabinDoors: number
  person: { irritated: number; vip: number }
  personByTier: Record<IncomeTier, number>
  windowNight: number
  occupancyBar: number
  queueBadge: number
  heatLow: number
  heatMid: number
  heatHigh: number
}

const CITY: TowerPalette = {
  skyDay: 0xb8dcf2,
  skyNight: 0x101830,
  ground: 0x3f464c,
  slabEdge: 0x59656a,
  unitBase: {
    // structure
    slab: 0x8a8580,
    lobby: 0xdde9e7,
    skylobby: 0xd7e7e1,
    skybridge: 0xcce1e5,
    // transit
    stairs: 0x9aa0a8,
    escalator: 0x8f9aa8,
    // office — cool blues/grays
    officeS: 0x7f97ad,
    officeM: 0x6f8aa5,
    officeL: 0x5f7d9d,
    // residential — muted pastels
    aptStudio: 0xb9c7a8,
    apt1br: 0xaec2a0,
    apt2br: 0xa3bd98,
    aptPenthouse: 0x98b890,
    // services
    restroom: 0xb7c4c9,
    housekeeping: 0xa9b8bf,
    trashRoom: 0x8f9a8a,
    recyclingCenter: 0x7f9a80,
    parkingRamp: 0x9a9a9a,
    parkingSpace: 0x8f8f8f,
    securityOffice: 0x8fa3b8,
    medicalClinic: 0xc6d4dc,
    // commerce
    shop: 0x8fb78f,
    fastfood: 0x5aa7a0,
    foodCourt: 0x86ad8f,
    restaurant: 0x8f78a7,
    fancyRestaurant: 0x78638d,
    movieTheater: 0x674c72,
    fitness: 0x73a7a0,
    pool: 0x74aebe,
    spa: 0xa7bfae,
    conferenceCenter: 0x879ec0,
    eventSpace: 0x9a88b8,
    // hotel — deep red accent
    hotelReception: 0xa8524e,
    hotel1p: 0xb06060,
    hotel2p: 0xa85858,
    hotelSuite: 0x9c4c4c,
    // special
    subway: 0x6f6a80,
    cathedral: 0xe6dfc8,
    observationDeck: 0x74b9c3,
  },
  vacantDesaturation: 0.65,
  dirtyTint: 0x8a6f4f,
  infestedTint: 0x7fa050,
  offline: 0x3c3c40,
  shaft: {
    standard: 0x6a7078,
    express: 0x596270,
    service: 0x707866,
    glass: 0x7fb8d8,
  },
  shaftOpacity: { glass: 0.5 },
  stopMarker: 0x4a5058,
  stopMarkerEnabled: 0xd8e2ea,
  carCabin: 0xf2e9d0,
  carCabinDoors: 0xfff6dc,
  person: { irritated: 0xd83a2a, vip: 0xd8a820 },
  // Light silhouettes read against both the day structure and the night dim.
  personByTier: { low: 0xd8d8d8, med: 0xe4e4e4, high: 0xf0f0f0, vip: 0xd8a820 },
  windowNight: 0xffd890,
  occupancyBar: 0x58c078,
  queueBadge: 0xe0442a,
  heatLow: 0x3fae52,
  heatMid: 0xe0c030,
  heatHigh: 0xd83a2a,
}

/** Niagara Falls — hand-picked limestone, river, mist, moss, and hotel hues. */
const FALLS: TowerPalette = {
  skyDay: 0xa9dbe2,
  skyNight: 0x0d2030,
  ground: 0x334c4c,
  slabEdge: 0x78918d,
  unitBase: {
    slab: 0x879a96,
    lobby: 0xdbeeed,
    skylobby: 0xcce6e2,
    skybridge: 0xb8dce1,
    stairs: 0x91a5a5,
    escalator: 0x809a9b,
    officeS: 0x789aa5,
    officeM: 0x698e9b,
    officeL: 0x587f8e,
    aptStudio: 0xb9c9b5,
    apt1br: 0xafc2aa,
    apt2br: 0xa3bba0,
    aptPenthouse: 0x96b395,
    restroom: 0xb8ccca,
    housekeeping: 0xa7bbb7,
    trashRoom: 0x778c80,
    recyclingCenter: 0x688c78,
    parkingRamp: 0x8a9693,
    parkingSpace: 0x7d8a87,
    securityOffice: 0x7795a0,
    medicalClinic: 0xc2d8d5,
    shop: 0x79aa86,
    fastfood: 0x4da59c,
    foodCourt: 0x72a986,
    restaurant: 0x7f82a4,
    fancyRestaurant: 0x6b7194,
    movieTheater: 0x545c7f,
    fitness: 0x58a39b,
    pool: 0x43a9ba,
    spa: 0x8db7aa,
    conferenceCenter: 0x748fa9,
    eventSpace: 0x807caa,
    hotelReception: 0x2f8290,
    hotel1p: 0x3d919c,
    hotel2p: 0x348996,
    hotelSuite: 0x287989,
    subway: 0x586974,
    cathedral: 0xd9d4bf,
    observationDeck: 0x49a5ad,
  },
  vacantDesaturation: 0.58,
  dirtyTint: 0x806a4c,
  infestedTint: 0x668e48,
  offline: 0x303a3d,
  shaft: {
    standard: 0x607579,
    express: 0x506b73,
    service: 0x66796b,
    glass: 0x70bdd0,
  },
  shaftOpacity: { glass: 0.46 },
  stopMarker: 0x3d5559,
  stopMarkerEnabled: 0xe3f1ef,
  carCabin: 0xe5f0ed,
  carCabinDoors: 0xf5fcf8,
  person: { irritated: 0xd94a32, vip: 0xe0b642 },
  personByTier: { low: 0xd4dfdc, med: 0xe0e9e6, high: 0xf1f5ed, vip: 0xe0b642 },
  windowNight: 0xffdda0,
  occupancyBar: 0x4dbb83,
  queueBadge: 0xe35a36,
  heatLow: 0x31a65c,
  heatMid: 0xe2c348,
  heatHigh: 0xd94a32,
}

const PALETTES: Record<string, TowerPalette> = { city: CITY, falls: FALLS }

/**
 * Palette for a map's `paletteTheme`.
 *
 * An unregistered theme falls back to CITY so the scene still renders, but it
 * reports once to the console: a silent fallback made a missing palette look
 * like a rendering bug (the whole map drawn in New York's colours) rather than
 * a missing asset, which is exactly the wrong signal when adding a new map.
 */
export function getPalette(theme: string): TowerPalette {
  const palette = PALETTES[theme]
  if (palette) {
    return palette
  }
  if (!reportedMissingThemes.has(theme)) {
    reportedMissingThemes.add(theme)
    console.warn(`getPalette: no palette registered for theme "${theme}"; falling back to the city palette.`)
  }
  return CITY
}

const reportedMissingThemes = new Set<string>()

/** Registered theme keys — used by the map-registry consistency test. */
export function registeredPaletteThemes(): readonly string[] {
  return Object.keys(PALETTES)
}

const scratch = new THREE.Color()
const scratchB = new THREE.Color()

/** Unit fill color with state variants applied (vacant/dirty/infested/offline). */
export function unitFillColor(palette: TowerPalette, unit: Unit): number {
  if (unit.offline) {
    return palette.offline
  }
  scratch.setHex(palette.unitBase[unit.kind])
  if (unit.infested) {
    scratch.lerp(scratchB.setHex(palette.infestedTint), 0.55)
  } else if (unit.dirty) {
    scratch.lerp(scratchB.setHex(palette.dirtyTint), 0.45)
  }
  if (!unit.occupied && !unit.infested) {
    const gray = (scratch.r + scratch.g + scratch.b) / 3
    scratch.lerp(scratchB.setRGB(gray, gray, gray), palette.vacantDesaturation)
  }
  return scratch.getHex()
}

export function personColor(palette: TowerPalette, person: Person): number {
  if (person.irritated) {
    return palette.person.irritated
  }
  if (person.vip) {
    return palette.person.vip
  }
  return palette.personByTier[person.tier]
}

/** Sky color for a minute-of-day: night ↔ day with dawn/dusk ramps. */
export function skyColorAt(palette: TowerPalette, minuteOfDay: number): number {
  return scratch
    .setHex(palette.skyNight)
    .lerp(scratchB.setHex(palette.skyDay), daylightAt(minuteOfDay))
    .getHex()
}

/** 0 = full night, 1 = full day; ramps 05:30–07:00 and 18:30–20:30. */
export function daylightAt(minuteOfDay: number): number {
  const dawnStart = 5.5 * 60
  const dawnEnd = 7 * 60
  const duskStart = 18.5 * 60
  const duskEnd = 20.5 * 60
  if (minuteOfDay < dawnStart || minuteOfDay >= duskEnd) {
    return 0
  }
  if (minuteOfDay < dawnEnd) {
    return (minuteOfDay - dawnStart) / (dawnEnd - dawnStart)
  }
  if (minuteOfDay < duskStart) {
    return 1
  }
  return 1 - (minuteOfDay - duskStart) / (duskEnd - duskStart)
}

/** Warm lit-window tint applied to occupied units at night. */
export function nightWindowColor(palette: TowerPalette, base: number, darkness: number): number {
  return scratch.setHex(base).lerp(scratchB.setHex(palette.windowNight), 0.45 * darkness).getHex()
}
