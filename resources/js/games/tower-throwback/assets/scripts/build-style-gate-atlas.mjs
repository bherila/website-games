import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from '@playwright/test'

// Milestone 1 now uses deterministic SVG masters instead of local-only
// imagegen sheets. The committed runtime output remains a WebP atlas, but
// the source SVG gives the art gate a reviewable and reproducible before/after.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const assetRoot = path.resolve(__dirname, '..')
const sourceRoot = path.join(assetRoot, 'source')
const spriteRoot = path.join(assetRoot, 'sprites')

const sourceSvgOut = path.join(sourceRoot, 'style-gate-vivid.svg')
const atlasOut = path.join(spriteRoot, 'style-gate.webp')
const manifestOut = path.join(spriteRoot, 'style-gate.json')
const runtimeManifestOut = path.join(assetRoot, '..', 'scene', 'styleGateManifest.generated.ts')

const scale = 4
const baseAtlasWidth = 512
const atlasWidth = baseAtlasWidth * scale
const padding = 2 * scale

const palette = {
  outline: '#223142',
  outlineSoft: '#395062',
  cream: '#f1ecdf',
  creamShade: '#c6c0b1',
  peach: '#e7cbc4',
  wood: '#876d5b',
  floor: '#b9c2ba',
  floorDark: '#728279',
  glass: '#d7f8ff',
  glassDeep: '#92d8ef',
  skyReflection: '#f4feff',
  leaf: '#39a86b',
  leafDark: '#247d4f',
  leafLight: '#72c989',
  gold: '#e7c75d',
  coral: '#d96f73',
  teal: '#39b8ad',
  blue: '#6aa9f0',
  lavender: '#aaa0d8',
  shadow: '#5d5b56',
  nightWarm: '#ffd986',
  cloud: '#ffffff',
  cloudShade: '#cdeaff',
  tomato: '#c85a55',
  ketchup: '#a94c4a',
  mustard: '#d6b74d',
  bun: '#c88e61',
  cheese: '#f3ce62',
  lettuce: '#68b35f',
  soda: '#7fc8d6',
  plum: '#705173',
  aubergine: '#463047',
  sage: '#8fb996',
  mint: '#bde7d7',
  olive: '#8a9a5b',
  rust: '#9f6d58',
  copper: '#987862',
  rose: '#d98290',
  porcelain: '#f6f4e8',
  tileBlue: '#8cc7cf',
  tileGreen: '#9fc9a8',
  ink: '#172238',
}

const elevatorKinds = ['standard', 'express', 'service', 'glass']
const elevatorOccupancyStates = ['empty', 'single', 'double', 'crowded', 'full']
const personTiers = ['low', 'med', 'high', 'vip']
const artVariants = ['variantA', 'variantB', 'variantC']
const officeUnits = [
  { kind: 'officeS', w: 96 },
  { kind: 'officeM', w: 144 },
  { kind: 'officeL', w: 192 },
]
const residentialUnits = [
  { kind: 'aptStudio', w: 64 },
  { kind: 'apt1br', w: 96 },
  { kind: 'apt2br', w: 128 },
  { kind: 'aptPenthouse', w: 256 },
]
const commerceUnits = [
  { kind: 'shop', w: 128 },
  { kind: 'foodCourt', w: 256 },
  { kind: 'restaurant', w: 160 },
  { kind: 'fancyRestaurant', w: 192 },
  { kind: 'fitness', w: 192 },
  { kind: 'spa', w: 192 },
]
const largeVenueUnits = [
  { kind: 'movieTheater', w: 320, h: 96 },
  { kind: 'pool', w: 320, h: 96 },
  { kind: 'conferenceCenter', w: 384, h: 96 },
  { kind: 'eventSpace', w: 480, h: 96 },
]
const hotelUnits = [
  { kind: 'hotel2p', w: 96 },
  { kind: 'hotelSuite', w: 160 },
]
const serviceUnits = [
  { kind: 'hotelReception', w: 160 },
  { kind: 'housekeeping', w: 128 },
  { kind: 'trashRoom', w: 96 },
  { kind: 'recyclingCenter', w: 320 },
  { kind: 'parkingRamp', w: 96 },
  { kind: 'parkingSpace', w: 32 },
  { kind: 'subway', w: 480 },
  { kind: 'securityOffice', w: 160 },
  { kind: 'medicalClinic', w: 192 },
]

const frames = [
  { name: 'unit.slab.tile', base: { w: 16, h: 48 }, draw: (box) => drawStructureTile(box, 'slab') },
  { name: 'unit.lobby.tile', base: { w: 16, h: 48 }, draw: drawLobbyTile },
  { name: 'unit.lobby.decor.tree', base: { w: 36, h: 48 }, draw: drawLobbyTree },
  { name: 'unit.lobby.decor.bench', base: { w: 48, h: 24 }, draw: drawLobbyBench },
  { name: 'unit.lobby.decor.frontDesk', base: { w: 48, h: 24 }, draw: drawLobbyFrontDesk },
  { name: 'unit.lobby.decor.plant', base: { w: 16, h: 24 }, draw: drawLobbyPlant },
  { name: 'unit.skylobby.tile', base: { w: 16, h: 48 }, draw: (box) => drawStructureTile(box, 'skylobby') },
  { name: 'unit.skybridge.tile', base: { w: 16, h: 48 }, draw: (box) => drawStructureTile(box, 'skybridge') },
  { name: 'unit.stairs.sample', base: { w: 32, h: 48 }, draw: drawStairs },
  { name: 'unit.escalator.sample', base: { w: 64, h: 48 }, draw: drawEscalator },
  ...officeUnits.flatMap(({ kind, w }) => artVariants.flatMap((variant) => [
    { name: `unit.${kind}.${variant}.vacant`, base: { w, h: 48 }, draw: (box) => drawOffice(box, false, variant) },
    { name: `unit.${kind}.${variant}.occupied`, base: { w, h: 48 }, draw: (box) => drawOffice(box, true, variant) },
  ])),
  ...residentialUnits.flatMap(({ kind, w }) => artVariants.flatMap((variant) => [
    { name: `unit.${kind}.${variant}.vacant`, base: { w, h: 48 }, draw: (box) => drawResidentialUnit(box, 'vacant', kind, variant) },
    { name: `unit.${kind}.${variant}.occupied`, base: { w, h: 48 }, draw: (box) => drawResidentialUnit(box, 'occupied', kind, variant) },
    { name: `unit.${kind}.${variant}.sleeping`, base: { w, h: 48 }, draw: (box) => drawResidentialUnit(box, 'sleeping', kind, variant) },
  ])),
  { name: 'unit.restroom.vacant', base: { w: 64, h: 48 }, draw: (box) => drawRestroom(box, false) },
  { name: 'unit.restroom.occupied', base: { w: 64, h: 48 }, draw: (box) => drawRestroom(box, true) },
  { name: 'unit.fastfood.vacant', base: { w: 192, h: 48 }, draw: (box) => drawFastFood(box, false) },
  { name: 'unit.fastfood.occupied', base: { w: 192, h: 48 }, draw: (box) => drawFastFood(box, true) },
  ...commerceUnits.flatMap(({ kind, w }) => [
    { name: `unit.${kind}.vacant`, base: { w, h: 48 }, draw: (box) => drawCommerce(box, false, kind) },
    { name: `unit.${kind}.occupied`, base: { w, h: 48 }, draw: (box) => drawCommerce(box, true, kind) },
  ]),
  ...largeVenueUnits.flatMap(({ kind, w, h }) => [
    { name: `unit.${kind}.vacant`, base: { w, h }, draw: (box) => drawLargeVenue(box, false, kind) },
    { name: `unit.${kind}.occupied`, base: { w, h }, draw: (box) => drawLargeVenue(box, true, kind) },
  ]),
  { name: 'unit.hotel1p.vacant', base: { w: 64, h: 48 }, draw: (box) => drawApartment(box, 'vacant') },
  { name: 'unit.hotel1p.occupied', base: { w: 64, h: 48 }, draw: (box) => drawApartment(box, 'occupied') },
  { name: 'unit.hotel1p.sleeping', base: { w: 64, h: 48 }, draw: (box) => drawApartment(box, 'sleeping') },
  { name: 'unit.hotel1p.dirty', base: { w: 64, h: 48 }, draw: (box) => drawApartment(box, 'dirty') },
  ...hotelUnits.flatMap(({ kind, w }) => [
    { name: `unit.${kind}.vacant`, base: { w, h: 48 }, draw: (box) => drawApartment(box, 'vacant') },
    { name: `unit.${kind}.occupied`, base: { w, h: 48 }, draw: (box) => drawApartment(box, 'occupied') },
    { name: `unit.${kind}.sleeping`, base: { w, h: 48 }, draw: (box) => drawApartment(box, 'sleeping') },
    { name: `unit.${kind}.dirty`, base: { w, h: 48 }, draw: (box) => drawApartment(box, 'dirty') },
  ]),
  ...serviceUnits.map(({ kind, w }) => ({
    name: `unit.${kind}.sample`,
    base: { w, h: 48 },
    draw: (box) => drawService(box, kind),
  })),
  { name: 'unit.cathedral.sample', base: { w: 480, h: 96 }, draw: drawCathedral },
  { name: 'unit.observationDeck.sample', base: { w: 384, h: 96 }, draw: (box) => drawRasterSource(box, 'unit.observationDeck.webp') },
  ...elevatorKinds.flatMap((kind) => [
    { name: `elevator.${kind}.interior`, base: { w: 32, h: 48 }, draw: (box) => drawElevatorInterior(box, kind) },
    { name: `elevator.${kind}.cap.top`, base: { w: 32, h: 48 }, draw: (box) => drawElevatorCap(box, 'top', kind) },
    { name: `elevator.${kind}.cap.bottom`, base: { w: 32, h: 48 }, draw: (box) => drawElevatorCap(box, 'bottom', kind) },
    ...elevatorOccupancyStates.map((occupancy) => ({
      name: `elevator.${kind}.car.${occupancy}`,
      base: { w: 32, h: 48 },
      draw: (box) => drawElevatorCar(box, occupancy, 'detail', kind),
    })),
    { name: `elevator.${kind}.doors.closed`, base: { w: 32, h: 48 }, draw: (box) => drawElevatorDoors(box, false, 'detail', kind) },
    { name: `elevator.${kind}.doors.open`, base: { w: 32, h: 48 }, draw: (box) => drawElevatorDoors(box, true, 'detail', kind) },
    ...elevatorOccupancyStates.map((occupancy) => ({
      name: `elevator.${kind}.car.${occupancy}.summary`,
      base: { w: 32, h: 48 },
      draw: (box) => drawElevatorCar(box, occupancy, 'summary', kind),
    })),
    { name: `elevator.${kind}.doors.closed.summary`, base: { w: 32, h: 48 }, draw: (box) => drawElevatorDoors(box, false, 'summary', kind) },
    { name: `elevator.${kind}.doors.open.summary`, base: { w: 32, h: 48 }, draw: (box) => drawElevatorDoors(box, true, 'summary', kind) },
    { name: `elevator.${kind}.plate.enabled`, base: { w: 32, h: 12 }, draw: (box) => drawElevatorStopPlate(box, true, kind) },
    { name: `elevator.${kind}.plate.disabled`, base: { w: 32, h: 12 }, draw: (box) => drawElevatorStopPlate(box, false, kind) },
  ]),
  ...personTiers.flatMap((tier) => [
    { name: `person.${tier}.sample`, base: { w: 10, h: 19 }, draw: (box) => drawPerson(box, tier, 'detail', 0) },
    { name: `person.${tier}.summary`, base: { w: 10, h: 19 }, draw: (box) => drawPerson(box, tier, 'summary', 0) },
    { name: `person.${tier}.variantB.sample`, base: { w: 10, h: 19 }, draw: (box) => drawPerson(box, tier, 'detail', 1) },
    { name: `person.${tier}.variantB.summary`, base: { w: 10, h: 19 }, draw: (box) => drawPerson(box, tier, 'summary', 1) },
  ]),
  { name: 'person.staff.sample', base: { w: 10, h: 19 }, draw: (box) => drawPerson(box, 'staff', 'detail', 0) },
  { name: 'person.staff.summary', base: { w: 10, h: 19 }, draw: (box) => drawPerson(box, 'staff', 'summary', 0) },
  { name: 'person.housekeeper.sample', base: { w: 10, h: 19 }, draw: (box) => drawPerson(box, 'housekeeper', 'detail', 0) },
  { name: 'person.housekeeper.summary', base: { w: 10, h: 19 }, draw: (box) => drawPerson(box, 'housekeeper', 'summary', 0) },
  { name: 'ambience.cloud.sample', base: { w: 64, h: 24 }, draw: (box) => drawCloud(box, 0) },
  { name: 'ambience.cloud.variantB', base: { w: 48, h: 20 }, draw: (box) => drawCloud(box, 1) },
  { name: 'ambience.cloud.variantC', base: { w: 80, h: 28 }, draw: (box) => drawCloud(box, 2) },
  { name: 'ambience.groundHorizon.strip', base: { w: 128, h: 48 }, draw: drawGroundHorizon },
  { name: 'ambience.nightStars.tile', base: { w: 128, h: 64 }, draw: drawNightStars },
  { name: 'ambience.niagaraGorge.backdrop', base: { w: 384, h: 256 }, draw: (box) => drawRasterSource(box, 'ambience.niagaraGorge.v3.webp') },
  { name: 'unit.damage.blownUp.tile', base: { w: 16, h: 48 }, draw: (box) => drawRasterSource(box, 'unit.damage.blownUp.tile.png') },
  { name: 'unit.damage.blownUp.variantB.tile', base: { w: 16, h: 48 }, draw: (box) => drawRasterSource(box, 'unit.damage.blownUp.variantB.tile.png') },
  { name: 'unit.damage.blownUp.variantC.tile', base: { w: 16, h: 48 }, draw: (box) => drawRasterSource(box, 'unit.damage.blownUp.variantC.tile.png') },
  { name: 'unit.damage.burnedDown.tile', base: { w: 16, h: 48 }, draw: (box) => drawRasterSource(box, 'unit.damage.burnedDown.tile.png') },
  { name: 'unit.damage.burnedDown.variantB.tile', base: { w: 16, h: 48 }, draw: (box) => drawRasterSource(box, 'unit.damage.burnedDown.variantB.tile.png') },
  { name: 'unit.damage.burnedDown.variantC.tile', base: { w: 16, h: 48 }, draw: (box) => drawRasterSource(box, 'unit.damage.burnedDown.variantC.tile.png') },
]

function packFrames() {
  let x = padding
  let y = padding
  let rowHeight = 0
  const placements = []

  for (const frame of frames) {
    const w = frame.base.w * scale
    const h = frame.base.h * scale
    if (x + w + padding > atlasWidth) {
      x = padding
      y += rowHeight + padding
      rowHeight = 0
    }
    placements.push({ ...frame, x, y, w, h })
    x += w + padding
    rowHeight = Math.max(rowHeight, h)
  }

  return {
    width: atlasWidth,
    height: y + rowHeight + padding,
    placements,
  }
}

function attrs(values) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}="${String(value)}"`)
    .join(' ')
}

function tag(name, values, children = '') {
  if (children.length === 0) {
    return `<${name} ${attrs(values)}/>`
  }
  return `<${name} ${attrs(values)}>${children}</${name}>`
}

function rect(x, y, w, h, fill, extra = {}) {
  return tag('rect', { x, y, width: w, height: h, fill, ...extra })
}

function roundedRect(x, y, w, h, radius, fill, extra = {}) {
  return rect(x, y, w, h, fill, { rx: radius, ry: radius, ...extra })
}

function circle(cx, cy, r, fill, extra = {}) {
  return tag('circle', { cx, cy, r, fill, ...extra })
}

function line(x1, y1, x2, y2, stroke, width, extra = {}) {
  return tag('line', { x1, y1, x2, y2, stroke, 'stroke-width': width, 'stroke-linecap': 'round', ...extra })
}

function svgPath(d, fill, extra = {}) {
  return tag('path', { d, fill, ...extra })
}

function rectPath(x, y, w, h) {
  return `M${x} ${y}H${x + w}V${y + h}H${x}Z`
}

function panelWithHoles(x, y, w, h, holes, fill, extra = {}) {
  return svgPath([rectPath(x, y, w, h), ...holes.map((hole) => rectPath(hole.x, hole.y, hole.w, hole.h))].join(' '), fill, {
    'fill-rule': 'evenodd',
    ...extra,
  })
}

function group(children, extra = {}) {
  return tag('g', extra, children.join(''))
}

function drawRasterSource(box, fileName) {
  const sourcePath = path.join(sourceRoot, fileName)
  const data = readFileSync(sourcePath).toString('base64')
  const mimeType = fileName.endsWith('.webp') ? 'image/webp' : 'image/png'
  return tag('image', {
    x: box.x,
    y: box.y,
    width: box.w,
    height: box.h,
    href: `data:${mimeType};base64,${data}`,
    preserveAspectRatio: 'none',
  })
}

function frameBorder({ x, y, w, h }) {
  return [
    rect(x, y, w, h, 'none', { stroke: palette.outline, 'stroke-width': 4 }),
    rect(x + 3, y + 3, w - 6, h - 6, 'none', { stroke: palette.outlineSoft, 'stroke-width': 2, opacity: 0.45 }),
  ]
}

function drawTallGlass(x, y, w, h, columns) {
  const gap = 8
  const paneW = (w - gap * (columns - 1)) / columns
  const panes = []
  for (let i = 0; i < columns; i += 1) {
    const px = x + i * (paneW + gap)
    panes.push(rect(px, y, paneW, h, palette.glass, { opacity: 0.25 }))
    panes.push(rect(px + paneW * 0.12, y + 8, paneW * 0.25, h - 18, palette.skyReflection, { opacity: 0.36 }))
    panes.push(line(px + paneW, y, px + paneW, y + h, palette.outlineSoft, 3, { opacity: 0.55 }))
  }
  return panes
}

function tallGlassHoles(x, y, w, h, columns) {
  const gap = 8
  const paneW = (w - gap * (columns - 1)) / columns
  const holes = []
  for (let i = 0; i < columns; i += 1) {
    holes.push({ h, w: paneW, x: x + i * (paneW + gap), y })
  }
  return holes
}

function drawPlant(cx, baseY, scaleFactor = 1) {
  const trunkW = 5 * scaleFactor
  return [
    rect(cx - trunkW / 2, baseY - 34 * scaleFactor, trunkW, 34 * scaleFactor, palette.wood),
    circle(cx - 10 * scaleFactor, baseY - 45 * scaleFactor, 14 * scaleFactor, palette.leafDark),
    circle(cx + 8 * scaleFactor, baseY - 51 * scaleFactor, 16 * scaleFactor, palette.leaf),
    circle(cx, baseY - 64 * scaleFactor, 14 * scaleFactor, palette.leafLight),
    rect(cx - 18 * scaleFactor, baseY - 10 * scaleFactor, 36 * scaleFactor, 10 * scaleFactor, palette.floorDark),
    rect(cx - 14 * scaleFactor, baseY - 20 * scaleFactor, 28 * scaleFactor, 12 * scaleFactor, palette.creamShade),
  ]
}

function drawPendantLight(cx, topY, shadeY, shadeColor = palette.mustard) {
  return [
    line(cx, topY, cx, shadeY, palette.outlineSoft, 3, { opacity: 0.72 }),
    svgPath(`M${cx - 13} ${shadeY}H${cx + 13}L${cx + 8} ${shadeY + 12}H${cx - 8}Z`, shadeColor),
    circle(cx, shadeY + 15, 5, palette.nightWarm, { opacity: 0.7 }),
  ]
}

function drawFoodTray(cx, tableY, scaleFactor = 1) {
  const trayW = 44 * scaleFactor
  const trayH = 9 * scaleFactor
  return [
    rect(cx - trayW / 2, tableY - 20 * scaleFactor, trayW, trayH, palette.porcelain),
    circle(cx - 11 * scaleFactor, tableY - 26 * scaleFactor, 6 * scaleFactor, palette.bun),
    rect(cx - 17 * scaleFactor, tableY - 24 * scaleFactor, 12 * scaleFactor, 3 * scaleFactor, palette.lettuce),
    rect(cx - 16 * scaleFactor, tableY - 21 * scaleFactor, 12 * scaleFactor, 3 * scaleFactor, palette.ketchup),
    rect(cx + 2 * scaleFactor, tableY - 28 * scaleFactor, 12 * scaleFactor, 12 * scaleFactor, palette.mustard),
    rect(cx + 6 * scaleFactor, tableY - 33 * scaleFactor, 4 * scaleFactor, 5 * scaleFactor, palette.ketchup),
    rect(cx + 20 * scaleFactor, tableY - 31 * scaleFactor, 8 * scaleFactor, 16 * scaleFactor, palette.soda),
    line(cx + 22 * scaleFactor, tableY - 37 * scaleFactor, cx + 29 * scaleFactor, tableY - 44 * scaleFactor, palette.outlineSoft, 2, { opacity: 0.72 }),
  ]
}

function drawRoundTable(cx, tableY, occupied, accent = palette.teal) {
  const children = [
    circle(cx, tableY - 11, 20, palette.wood),
    circle(cx, tableY - 14, 17, palette.porcelain),
    rect(cx - 5, tableY + 1, 10, 15, palette.shadow, { opacity: 0.78 }),
    rect(cx - 22, tableY + 15, 44, 6, palette.floorDark, { opacity: 0.58 }),
    circle(cx - 6, tableY - 17, 5, accent),
    circle(cx + 8, tableY - 13, 4, palette.mustard),
  ]
  if (occupied) {
    children.push(...drawInteriorPerson(cx - 34, tableY + 9, palette.coral, 'seated'))
    children.push(...drawInteriorPerson(cx + 34, tableY + 9, palette.sage, 'seated'))
  }
  return children
}

function drawInteriorPerson(cx, floorY, body = palette.teal, pose = 'standing') {
  const seated = pose === 'seated'
  const headY = floorY - (seated ? 38 : 52)
  const torsoY = headY + 8
  const torsoH = seated ? 22 : 28
  const children = [
    circle(cx, headY, 8, '#6a4b38'),
    roundedRect(cx - 10, torsoY, 20, torsoH, 8, body),
    line(cx - 7, torsoY + 8, cx - 16, torsoY + (seated ? 18 : 24), palette.creamShade, 5),
    line(cx + 7, torsoY + 8, cx + 16, torsoY + (seated ? 18 : 24), palette.creamShade, 5),
  ]
  if (seated) {
    children.push(line(cx - 5, torsoY + torsoH, cx - 13, floorY - 3, palette.outlineSoft, 6))
    children.push(line(cx + 5, torsoY + torsoH, cx + 13, floorY - 3, palette.outlineSoft, 6))
  } else {
    children.push(line(cx - 5, torsoY + torsoH, cx - 7, floorY - 2, palette.outlineSoft, 6))
    children.push(line(cx + 5, torsoY + torsoH, cx + 7, floorY - 2, palette.outlineSoft, 6))
  }
  return children
}

function drawSleepingPerson(x, bedY, bedW, accent = palette.blue) {
  return [
    circle(x + bedW * 0.2, bedY + 13, 9, '#6a4b38'),
    roundedRect(x + bedW * 0.28, bedY + 7, bedW * 0.62, 22, 11, accent, { opacity: 0.92 }),
    line(x + bedW * 0.88, bedY + 5, x + bedW * 0.94, bedY - 2, palette.nightWarm, 3, { opacity: 0.76 }),
  ]
}

function drawShelves(x, y, w, accent = palette.mustard) {
  return [
    rect(x, y, w, 8, palette.wood),
    rect(x, y + 24, w, 8, palette.wood),
    rect(x + 6, y - 16, 18, 16, accent),
    rect(x + 32, y - 20, 14, 20, palette.rose),
    rect(x + 54, y - 13, 22, 13, palette.mint),
    rect(x + 10, y + 7, 14, 17, palette.teal),
    rect(x + 34, y + 11, 20, 13, palette.gold),
    rect(x + 62, y + 5, 13, 19, palette.plum),
  ]
}

function drawServiceCart(x, y, bodyColor = palette.teal) {
  return [
    rect(x, y, 54, 24, bodyColor),
    rect(x + 5, y + 5, 44, 6, palette.porcelain, { opacity: 0.75 }),
    rect(x + 8, y - 14, 17, 14, palette.creamShade),
    rect(x + 29, y - 18, 13, 18, palette.mint),
    circle(x + 11, y + 28, 6, palette.outlineSoft),
    circle(x + 43, y + 28, 6, palette.outlineSoft),
  ]
}

function drawStructureTile(box, kind) {
  const { x, y, w, h } = box
  const floorH = 18
  const fill = kind === 'skybridge' ? '#d9eff4' : kind === 'skylobby' ? '#e9f0df' : '#d8d6cc'
  const accent = kind === 'skybridge' ? palette.teal : kind === 'skylobby' ? palette.gold : palette.outlineSoft
  const children = [
    rect(x, y + 8, w, h - 16, fill),
    rect(x, y + h - floorH, w, floorH, kind === 'slab' ? '#bcc4bf' : palette.floor),
    line(x, y + 8, x + w, y + 8, palette.outline, 3),
    line(x, y + h - 8, x + w, y + h - 8, palette.outline, 3),
    rect(x + w * 0.18, y + h - floorH - 7, w * 0.64, 5, accent, { opacity: 0.72 }),
  ]
  if (kind === 'skylobby') {
    children.push(rect(x + w * 0.28, y + 20, w * 0.44, h - 52, palette.glass, { opacity: 0.38 }))
  }
  if (kind === 'skybridge') {
    children.push(rect(x + w * 0.2, y + 16, w * 0.6, h - 44, palette.glass, { opacity: 0.46 }))
  }
  return group(children)
}

function drawLobbyTile(box) {
  const { x, y, w, h } = box
  const floorH = 22
  const window = { h: h - floorH - 22, w: w - 16, x: x + 8, y: y + 12 }
  return group([
    panelWithHoles(x, y + 4, w, h - 8, [window], '#f4efe2'),
    rect(window.x, window.y, window.w, window.h, palette.glass, { opacity: 0.2 }),
    rect(window.x + window.w * 0.15, window.y + 8, window.w * 0.24, window.h - 16, palette.skyReflection, {
      opacity: 0.38,
    }),
    rect(window.x + window.w * 0.58, window.y + 10, window.w * 0.16, window.h - 20, '#b8eaf4', { opacity: 0.18 }),
    line(x + w, y + 8, x + w, y + h - floorH - 8, palette.outlineSoft, 2, { opacity: 0.34 }),
    rect(x + 4, y + h - floorH - 4, w - 8, floorH, palette.floor),
    rect(x, y + h - floorH - 6, w, 5, palette.wood, { opacity: 0.32 }),
    line(x, y + 4, x + w, y + 4, palette.outline, 3),
    line(x, y + h - 4, x + w, y + h - 4, palette.outline, 3),
  ])
}

function drawLobbyTree(box) {
  const { x, y, w, h } = box
  return group([
    ...drawPlant(x + w * 0.5, y + h - 14, 1.55),
    rect(x + w * 0.1, y + h - 8, w * 0.8, 7, palette.floorDark, { opacity: 0.55 }),
  ])
}

function drawLobbyBench(box) {
  const { x, y, w, h } = box
  return group([
    rect(x + w * 0.08, y + h * 0.45, w * 0.84, h * 0.18, palette.teal),
    rect(x + w * 0.13, y + h * 0.62, w * 0.74, h * 0.16, palette.wood),
    rect(x + w * 0.2, y + h * 0.78, w * 0.08, h * 0.18, palette.shadow, { opacity: 0.8 }),
    rect(x + w * 0.72, y + h * 0.78, w * 0.08, h * 0.18, palette.shadow, { opacity: 0.8 }),
  ])
}

function drawLobbyFrontDesk(box) {
  const { x, y, w, h } = box
  const deskY = y + h * 0.5
  return group([
    rect(x + w * 0.1, deskY, w * 0.8, h * 0.26, palette.wood),
    rect(x + w * 0.16, deskY - h * 0.1, w * 0.68, h * 0.14, palette.creamShade),
    rect(x + w * 0.2, deskY + h * 0.08, w * 0.22, h * 0.07, palette.mustard, { opacity: 0.78 }),
    rect(x + w * 0.54, deskY + h * 0.07, w * 0.24, h * 0.08, palette.teal, { opacity: 0.82 }),
    rect(x + w * 0.18, deskY - h * 0.26, w * 0.16, h * 0.18, palette.ink, { opacity: 0.84 }),
    rect(x + w * 0.2, deskY - h * 0.24, w * 0.12, h * 0.1, palette.soda, { opacity: 0.76 }),
    circle(x + w * 0.68, deskY - h * 0.13, h * 0.08, palette.gold),
    rect(x + w * 0.66, deskY - h * 0.06, w * 0.04, h * 0.14, palette.wood),
    rect(x + w * 0.2, y + h * 0.82, w * 0.6, h * 0.06, palette.floorDark, { opacity: 0.5 }),
  ])
}

function drawLobbyPlant(box) {
  const { x, y, w, h } = box
  return group([
    ...drawPlant(x + w * 0.5, y + h - 6, 0.78),
    rect(x + w * 0.16, y + h - 5, w * 0.68, 5, palette.floorDark, { opacity: 0.45 }),
  ])
}

function drawStairs(box) {
  const { x, y, w, h } = box
  const children = [
    rect(x + 4, y + 4, w - 8, h - 8, '#e4dfcc'),
    rect(x + 4, y + h - 28, w - 8, 24, palette.floor),
  ]
  const steps = 7
  for (let i = 0; i < steps; i += 1) {
    const px = x + 18 + i * ((w - 44) / steps)
    const py = y + h - 42 - i * 16
    children.push(rect(px, py, (w - 48) / steps + 9, 7, palette.outlineSoft, { opacity: 0.82 }))
    children.push(rect(px + 4, py - 8, 5, 8, palette.outlineSoft, { opacity: 0.5 }))
  }
  children.push(line(x + 14, y + h - 38, x + w - 18, y + 28, palette.teal, 5, { opacity: 0.9 }))
  children.push(...frameBorder(box))
  return group(children)
}

function drawEscalator(box) {
  const { x, y, w, h } = box
  const children = [
    rect(x + 4, y + 4, w - 8, h - 8, '#e9e0c7'),
    rect(x + 4, y + h - 28, w - 8, 24, palette.floor),
    line(x + 22, y + h - 38, x + w - 24, y + 40, palette.outlineSoft, 10, { opacity: 0.85 }),
    line(x + 22, y + h - 52, x + w - 24, y + 26, palette.teal, 5, { opacity: 0.95 }),
    line(x + 34, y + h - 24, x + w - 18, y + 54, palette.gold, 4, { opacity: 0.8 }),
    rect(x + 18, y + h - 40, 26, 12, palette.floorDark),
    rect(x + w - 46, y + 32, 26, 12, palette.floorDark),
    ...frameBorder(box),
  ]
  return group(children)
}

function drawDesk(x, y, w, occupied) {
  return [
    roundedRect(x, y, w, 9, 4, occupied ? palette.wood : palette.creamShade),
    roundedRect(x + 4, y + 9, 7, 18, 3, palette.shadow, { opacity: 0.8 }),
    roundedRect(x + w - 11, y + 9, 7, 18, 3, palette.shadow, { opacity: 0.8 }),
    roundedRect(x + w * 0.55, y - 22, 26, 18, 5, occupied ? '#26364b' : '#89b5cc'),
    roundedRect(x + w * 0.55 + 4, y - 18, 18, 10, 3, occupied ? palette.teal : palette.glassDeep, { opacity: occupied ? 1 : 0.6 }),
  ]
}

function drawMonitor(x, y, active, accent = palette.teal) {
  return [
    roundedRect(x, y, 30, 20, 5, active ? palette.ink : '#86a9bc'),
    roundedRect(x + 4, y + 4, 22, 11, 3, active ? accent : palette.glassDeep, { opacity: active ? 0.92 : 0.55 }),
    rect(x + 12, y + 20, 6, 8, palette.shadow, { opacity: 0.75 }),
  ]
}

function drawOfficeChair(cx, y, color) {
  return [
    roundedRect(cx - 10, y - 19, 20, 18, 8, color),
    roundedRect(cx - 7, y - 1, 14, 13, 6, palette.shadow, { opacity: 0.75 }),
  ]
}

function drawSofa(x, y, w, color) {
  return [
    roundedRect(x, y - 24, w, 24, 10, color),
    roundedRect(x + 5, y - 35, w - 10, 16, 8, color, { opacity: 0.9 }),
    roundedRect(x + 10, y, 10, 10, 4, palette.shadow, { opacity: 0.78 }),
    roundedRect(x + w - 20, y, 10, 10, 4, palette.shadow, { opacity: 0.78 }),
  ]
}

function drawOffice(box, occupied, variant) {
  const { x, y, w, h } = box
  const floorY = y + h - 28
  const wall = occupied ? palette.cream : '#f3e7cf'
  const variantIndex = artVariants.indexOf(variant)
  const windowCount = Math.max(2, Math.min(4, Math.round(w / 230)))
  const windowGap = 22
  const windowW = (w - 56 - windowGap * (windowCount - 1)) / windowCount
  const windows = []
  const children = []
  for (let i = 0; i < windowCount; i += 1) {
    const px = x + 24 + i * (windowW + windowGap)
    windows.push({ h: 94, w: windowW, x: px, y: y + 18 })
  }
  children.push(panelWithHoles(x + 4, y + 4, w - 8, h - 8, windows, wall))
  children.push(rect(x + 8, y + 12, w - 16, 72, '#000000', { opacity: 0.04 }))
  for (const window of windows) {
    const px = window.x
    children.push(rect(px, y + 18, windowW, 94, palette.glass, { opacity: occupied ? 0.3 : 0.42 }))
    children.push(rect(px + 5, y + 22, windowW * 0.28, 82, palette.skyReflection, { opacity: 0.22 }))
    children.push(line(px + windowW, y + 18, px + windowW, y + 112, palette.outlineSoft, 3, { opacity: 0.75 }))
  }
  children.push(rect(x + 4, floorY, w - 8, 24, palette.floor))
  children.push(rect(x + 4, y + 4, w - 8, 12, occupied ? palette.copper : palette.creamShade))

  if (variantIndex === 1) {
    const tableX = x + w * 0.3
    const tableW = w * 0.42
    children.push(rect(tableX, floorY - 38, tableW, 18, palette.wood))
    children.push(rect(tableX + 10, floorY - 32, tableW - 20, 6, palette.porcelain, { opacity: 0.8 }))
    for (let i = 0; i < 4; i += 1) {
      children.push(...drawOfficeChair(tableX + tableW * (0.18 + i * 0.2), floorY - 40, i % 2 === 0 ? palette.sage : palette.lavender))
    }
    children.push(rect(x + w * 0.12, y + 44, w * 0.2, 34, '#dce7e7'))
    children.push(rect(x + w * 0.14, y + 50, w * 0.16, 6, palette.teal, { opacity: occupied ? 0.8 : 0.45 }))
    children.push(rect(x + w * 0.78, floorY - 58, w * 0.08, 42, palette.creamShade))
    children.push(rect(x + w * 0.79, floorY - 48, w * 0.06, 6, palette.coral, { opacity: occupied ? 0.86 : 0.46 }))
    children.push(...drawPlant(x + w * 0.88, floorY + 12, 0.6))
  } else if (variantIndex === 2) {
    children.push(...drawDesk(x + w * 0.12, floorY - 12, Math.min(104, w * 0.26), occupied))
    children.push(...drawSofa(x + w * 0.52, floorY - 2, Math.min(132, w * 0.26), occupied ? palette.teal : palette.sage))
    children.push(rect(x + w * 0.45, floorY - 62, w * 0.06, 44, palette.creamShade, { opacity: 0.82 }))
    children.push(rect(x + w * 0.74, floorY - 56, w * 0.1, 36, palette.wood))
    children.push(rect(x + w * 0.75, floorY - 48, w * 0.08, 6, palette.gold, { opacity: occupied ? 0.88 : 0.5 }))
    children.push(...drawPlant(x + w * 0.36, floorY + 12, 0.72))
    children.push(...drawMonitor(x + w * 0.18, floorY - 58, occupied, palette.gold))
  } else {
    children.push(rect(x + w * 0.2, y + 102, w * 0.16, 12, palette.sage, { opacity: 0.85 }))
    children.push(rect(x + w * 0.68, y + 98, w * 0.15, 15, palette.rose, { opacity: occupied ? 0.8 : 0.48 }))
    children.push(...drawDesk(x + 32, floorY - 10, Math.min(92, w * 0.24), occupied))
    children.push(...drawDesk(x + w - Math.min(132, w * 0.32), floorY - 10, Math.min(92, w * 0.24), occupied))
    children.push(rect(x + w * 0.47, floorY - 38, 28, 38, occupied ? palette.coral : palette.lavender))
    children.push(rect(x + w * 0.49, floorY - 55, 20, 17, occupied ? palette.gold : palette.glassDeep, { opacity: occupied ? 1 : 0.55 }))
    children.push(...drawPlant(x + w * 0.5, floorY + 12, 0.65))
  }
  if (occupied) {
    children.push(...drawInteriorPerson(x + w * 0.34, floorY, palette.blue, 'seated'))
    if (w >= 520) {
      children.push(...drawInteriorPerson(x + w * 0.72, floorY, palette.coral, variantIndex === 1 ? 'seated' : 'standing'))
    }
  }
  children.push(...frameBorder(box))
  return group(children)
}

function drawKitchenette(x, y, w, occupied) {
  return [
    rect(x, y - 34, w, 30, occupied ? palette.gold : palette.teal),
    rect(x + w * 0.08, y - 49, w * 0.34, 16, palette.porcelain, { opacity: 0.86 }),
    rect(x + w * 0.54, y - 48, w * 0.34, 15, palette.creamShade, { opacity: 0.9 }),
    rect(x + w * 0.12, y - 24, w * 0.16, 8, palette.tileBlue, { opacity: 0.85 }),
    rect(x, y - 4, w, 7, palette.wood),
  ]
}

function drawDiningSet(cx, y, occupied) {
  return [
    circle(cx, y - 18, 17, palette.wood),
    circle(cx, y - 20, 14, palette.porcelain),
    rect(cx - 4, y - 4, 8, 15, palette.shadow, { opacity: 0.7 }),
    circle(cx - 26, y - 20, 8, occupied ? palette.coral : palette.sage),
    circle(cx + 26, y - 20, 8, occupied ? palette.gold : palette.lavender),
  ]
}

function drawStudio(box, state, variant) {
  const { x, y, w, h } = box
  const floorY = y + h - 28
  const variantIndex = artVariants.indexOf(variant)
  const occupied = state !== 'vacant'
  const sleeping = state === 'sleeping'
  const windows = [
    { h: 92, w: w * 0.28, x: x + 12, y: y + 16 },
    { h: 94, w: w * 0.3, x: x + w * 0.6, y: y + 14 },
  ]
  const wall = sleeping ? '#ddd9e6' : occupied ? '#f4edd8' : '#e8dfd1'
  const children = [
    panelWithHoles(x + 4, y + 4, w - 8, h - 8, windows, wall),
    rect(windows[0].x, windows[0].y, windows[0].w, windows[0].h, palette.glass, { opacity: occupied ? 0.34 : 0.44 }),
    rect(windows[1].x, windows[1].y, windows[1].w, windows[1].h, palette.glass, { opacity: occupied ? 0.32 : 0.42 }),
    rect(windows[0].x + 6, windows[0].y + 7, windows[0].w * 0.24, windows[0].h - 14, palette.skyReflection, {
      opacity: 0.22,
    }),
    rect(windows[1].x + 6, windows[1].y + 7, windows[1].w * 0.24, windows[1].h - 14, palette.skyReflection, {
      opacity: 0.2,
    }),
    line(windows[0].x + windows[0].w, windows[0].y, windows[0].x + windows[0].w, windows[0].y + windows[0].h, palette.outlineSoft, 3, {
      opacity: 0.7,
    }),
    line(windows[1].x + windows[1].w, windows[1].y, windows[1].x + windows[1].w, windows[1].y + windows[1].h, palette.outlineSoft, 3, {
      opacity: 0.7,
    }),
    rect(x + 4, floorY, w - 8, 24, palette.floor),
  ]

  if (variantIndex === 1) {
    children.push(...drawSofa(x + 26, floorY - 2, w * 0.33, occupied ? palette.teal : palette.sage))
    children.push(rect(x + w * 0.5, floorY - 58, w * 0.12, 34, palette.ink, { opacity: 0.78 }))
    children.push(rect(x + w * 0.52, floorY - 52, w * 0.08, 18, palette.glassDeep, { opacity: occupied ? 0.7 : 0.45 }))
    children.push(...drawKitchenette(x + w * 0.68, floorY - 2, w * 0.2, occupied))
    children.push(...drawPlant(x + w * 0.46, floorY + 12, 0.5))
  } else if (variantIndex === 2) {
    children.push(rect(x + 22, floorY - 30, w * 0.34, 28, occupied ? '#e9cab2' : '#dfcfbf'))
    children.push(rect(x + 28, floorY - 39, w * 0.13, 16, palette.cream))
    children.push(rect(x + 22, floorY - 6, w * 0.34, 8, palette.wood))
    children.push(rect(x + w * 0.48, floorY - 52, w * 0.04, 48, palette.creamShade, { opacity: 0.85 }))
    children.push(...drawDiningSet(x + w * 0.68, floorY - 2, occupied))
    children.push(...drawKitchenette(x + w * 0.78, floorY - 2, w * 0.14, occupied))
  } else {
    children.push(rect(x + 28, floorY - 30, w * 0.36, 28, occupied ? '#e9cab2' : '#dfcfbf'))
    children.push(rect(x + 34, floorY - 38, w * 0.13, 16, palette.cream))
    children.push(rect(x + 28, floorY - 6, w * 0.36, 8, palette.wood))
    children.push(...drawKitchenette(x + w * 0.54, floorY - 2, w * 0.32, occupied))
    children.push(...drawPlant(x + w * 0.47, floorY + 12, 0.55))
  }

  if (sleeping) {
    const sleepX = variantIndex === 1 ? x + 26 : x + 24
    const sleepW = variantIndex === 1 ? w * 0.33 : w * 0.34
    children.push(...drawSleepingPerson(sleepX, floorY - 32, sleepW, palette.lavender))
  } else if (occupied) {
    children.push(...drawInteriorPerson(x + w * 0.62, floorY, palette.coral, variantIndex === 2 ? 'seated' : 'standing'))
  }
  children.push(...frameBorder(box))
  return group(children)
}

function drawResidentialUnit(box, state, kind, variant) {
  if (kind === 'aptStudio') {
    return drawStudio(box, state, variant)
  }
  return drawResidential(box, state, kind, variant)
}

function drawResidential(box, state, kind, variant) {
  const { x, y, w, h } = box
  const floorY = y + h - 28
  const variantIndex = artVariants.indexOf(variant)
  const occupied = state !== 'vacant'
  const sleeping = state === 'sleeping'
  const windowCount = kind === 'aptPenthouse' ? 4 : kind === 'apt2br' ? 3 : 2
  const gap = 18
  const windowW = (w - 40 - gap * (windowCount - 1)) / windowCount
  const windows = []
  for (let i = 0; i < windowCount; i += 1) {
    windows.push({ h: 88, w: windowW, x: x + 20 + i * (windowW + gap), y: y + 16 + (i % 2) * 2 })
  }
  const children = [panelWithHoles(x + 4, y + 4, w - 8, h - 8, windows, sleeping ? '#dad7e4' : occupied ? '#f4ecd7' : '#e7ded0')]
  for (const window of windows) {
    children.push(rect(window.x, window.y, window.w, window.h, palette.glass, { opacity: occupied ? 0.34 : 0.43 }))
    children.push(rect(window.x + 5, window.y + 7, window.w * 0.24, window.h - 14, palette.skyReflection, { opacity: 0.2 }))
    children.push(line(window.x + window.w, window.y, window.x + window.w, window.y + window.h, palette.outlineSoft, 3, { opacity: 0.65 }))
  }
  children.push(rect(x + 4, floorY, w - 8, 24, palette.floor))
  if (variantIndex === 1) {
    children.push(...drawSofa(x + w * 0.16, floorY - 2, w * 0.22, occupied ? palette.teal : palette.sage))
    children.push(rect(x + w * 0.43, floorY - 54, w * 0.12, 32, palette.ink, { opacity: 0.76 }))
    children.push(rect(x + w * 0.45, floorY - 49, w * 0.08, 17, palette.glassDeep, { opacity: occupied ? 0.7 : 0.45 }))
    children.push(...drawKitchenette(x + w * 0.62, floorY - 2, w * 0.2, occupied))
    children.push(...drawDiningSet(x + w * 0.84, floorY - 2, occupied))
  } else if (variantIndex === 2) {
    children.push(rect(x + w * 0.12, floorY - 34, w * 0.22, 32, occupied ? '#e9cab2' : '#dfcfbf'))
    children.push(rect(x + w * 0.14, floorY - 43, w * 0.08, 16, palette.cream))
    children.push(rect(x + w * 0.42, floorY - 46, w * 0.16, 30, occupied ? palette.gold : palette.teal))
    children.push(rect(x + w * 0.42, floorY - 7, w * 0.42, 7, palette.wood))
    children.push(rect(x + w * 0.66, floorY - 36, w * 0.16, 24, palette.mint, { opacity: 0.8 }))
    children.push(...drawPlant(x + w * 0.9, floorY + 12, kind === 'aptPenthouse' ? 0.75 : 0.58))
  } else {
    children.push(rect(x + w * 0.18, floorY - 4, w * 0.28, 5, palette.rose, { opacity: occupied ? 0.78 : 0.45 }))
    children.push(rect(x + w * 0.55, floorY - 24, w * 0.22, 18, palette.mint, { opacity: 0.78 }))
    children.push(rect(x + w * 0.55, floorY - 37, w * 0.22, 10, palette.porcelain, { opacity: 0.82 }))
    children.push(rect(x + 26, floorY - 34, w * 0.22, 32, occupied ? '#e9cab2' : '#dfcfbf'))
    children.push(rect(x + 30, floorY - 42, w * 0.08, 16, palette.cream))
    children.push(rect(x + w * 0.35, floorY - 28, w * 0.18, 20, occupied ? palette.sage : palette.lavender))
    children.push(rect(x + w * 0.76, floorY - 42, w * 0.12, 38, occupied ? palette.mustard : palette.teal))
    children.push(rect(x + w * 0.28, floorY - 7, w * 0.56, 7, palette.wood))
    children.push(...drawPlant(x + w - 32, floorY + 12, kind === 'aptPenthouse' ? 0.75 : 0.55))
  }
  if (kind === 'aptPenthouse') {
    children.push(rect(x + w * 0.08, y + 20, w * 0.84, 10, palette.mustard, { opacity: 0.52 }))
    children.push(rect(x + w * 0.78, floorY - 36, w * 0.12, 26, palette.rust, { opacity: occupied ? 1 : 0.68 }))
    children.push(rect(x + w * 0.44, floorY - 48, w * 0.12, 40, palette.plum, { opacity: 0.78 }))
  }
  if (sleeping) {
    const sleepX = variantIndex === 1 ? x + w * 0.16 : variantIndex === 2 ? x + w * 0.12 : x + 26
    const sleepW = w * 0.22
    children.push(...drawSleepingPerson(sleepX, floorY - 34, sleepW, palette.blue))
  } else if (occupied) {
    children.push(...drawInteriorPerson(x + w * 0.62, floorY, palette.teal, variantIndex === 1 ? 'seated' : 'standing'))
    if (kind === 'aptPenthouse') {
      children.push(...drawInteriorPerson(x + w * 0.82, floorY, palette.gold, 'seated'))
    }
  }
  children.push(...frameBorder(box))
  return group(children)
}

function drawRestroom(box, occupied) {
  const { x, y, w, h } = box
  const floorY = y + h - 28
  const windows = [
    { h: 54, w: w * 0.26, x: x + 14, y: y + 18 },
    { h: 54, w: w * 0.26, x: x + w - 14 - w * 0.26, y: y + 18 },
  ]
  const children = [
    panelWithHoles(x + 4, y + 4, w - 8, h - 8, windows, '#dff0ec'),
    rect(windows[0].x, windows[0].y, windows[0].w, windows[0].h, palette.glass, { opacity: 0.5 }),
    rect(windows[1].x, windows[1].y, windows[1].w, windows[1].h, palette.glass, { opacity: 0.5 }),
    rect(x + 4, floorY, w - 8, 24, '#9bc0b5'),
    rect(x + 4, y + 92, w - 8, 6, '#b7d9d0', { opacity: 0.9 }),
    rect(x + 34, y + 84, 56, floorY - 84, '#8fb5ae'),
    rect(x + 98, y + 84, 56, floorY - 84, '#8fb5ae'),
    rect(x + 160, y + 96, 34, 44, palette.cream),
    rect(x + 202, y + 92, 34, 48, palette.cream),
    rect(x + 165, y + 72, 24, 18, palette.glassDeep, { opacity: 0.55 }),
    rect(x + 207, y + 70, 24, 18, palette.glassDeep, { opacity: 0.55 }),
    rect(x + 22, floorY - 8, w - 44, 5, palette.outlineSoft, { opacity: 0.4 }),
    ...frameBorder(box),
  ]
  if (occupied) {
    children.splice(-1, 0, ...drawInteriorPerson(x + w * 0.68, floorY, palette.teal, 'standing'))
  }
  return group(children)
}

function drawFastFood(box, occupied) {
  const { x, y, w, h } = box
  const floorY = y + h - 28
  const storefront = [
    { x: x + 28, y: y + 28, w: w * 0.2, h: 48 },
    { x: x + w * 0.34, y: y + 28, w: w * 0.2, h: 48 },
    { x: x + w * 0.76, y: y + 28, w: w * 0.16, h: 48 },
  ]
  const wall = occupied ? '#e7f4ea' : '#e4ece7'
  const header = occupied ? '#2f8f86' : '#739e9c'
  const counter = occupied ? '#dfe8e6' : '#d3dcda'
  const children = [
    panelWithHoles(x + 4, y + 4, w - 8, h - 8, storefront, wall),
    rect(x + 4, y + 4, w - 8, 18, header),
    rect(x + w * 0.42, y + 8, w * 0.16, 8, palette.porcelain, { opacity: 0.92 }),
    rect(x + w * 0.45, y + 10, w * 0.1, 3, palette.mustard, { opacity: 0.82 }),
    rect(x + w * 0.45, y + 13, w * 0.1, 2, palette.lettuce, { opacity: 0.78 }),
    rect(x + 24, y + 22, w - 48, 7, palette.mustard, { opacity: 0.56 }),
    ...storefront.flatMap((pane, i) => [
      rect(pane.x, pane.y, pane.w, pane.h, palette.glass, { opacity: i === 1 && occupied ? 0.22 : 0.3 }),
      rect(pane.x + pane.w * 0.14, pane.y + 6, pane.w * 0.28, pane.h - 12, palette.skyReflection, { opacity: 0.34 }),
      line(pane.x + pane.w, pane.y, pane.x + pane.w, pane.y + pane.h, palette.outlineSoft, 3, { opacity: 0.5 }),
    ]),
    rect(x + 4, floorY, w - 8, 24, palette.floor),
    rect(x + 38, floorY - 74, w * 0.13, 19, '#243346'),
    rect(x + w * 0.22, floorY - 74, w * 0.13, 19, '#31425a'),
    rect(x + w * 0.39, floorY - 74, w * 0.13, 19, '#26364b'),
    rect(x + 46, floorY - 69, w * 0.06, 4, palette.mustard, { opacity: 0.86 }),
    rect(x + w * 0.24, floorY - 69, w * 0.06, 4, palette.soda, { opacity: 0.86 }),
    rect(x + w * 0.41, floorY - 69, w * 0.06, 4, palette.coral, { opacity: 0.8 }),
    rect(x + 32, floorY - 49, w * 0.48, 24, counter),
    rect(x + 38, floorY - 56, w * 0.46, 7, '#9fb8b5', { opacity: 0.82 }),
    rect(x + 54, floorY - 39, w * 0.14, 12, palette.porcelain, { opacity: 0.9 }),
    rect(x + 68, floorY - 48, 28, 9, palette.mustard, { opacity: 0.8 }),
    rect(x + w * 0.3, floorY - 43, 22, 16, palette.soda, { opacity: 0.8 }),
    rect(x + w * 0.55, floorY - 58, 44, 34, palette.soda, { opacity: 0.82 }),
    rect(x + w * 0.57, floorY - 66, 28, 10, palette.porcelain, { opacity: 0.85 }),
    rect(x + w * 0.68, floorY - 54, w * 0.24, 17, occupied ? palette.teal : palette.sage),
    rect(x + w * 0.69, floorY - 37, w * 0.22, 8, palette.wood),
    rect(x + w * 0.68, floorY - 18, w * 0.1, 7, palette.wood),
    rect(x + w * 0.82, floorY - 18, w * 0.1, 7, palette.wood),
    ...drawPendantLight(x + w * 0.61, y + 22, y + 58, palette.teal),
    ...drawPendantLight(x + w * 0.78, y + 22, y + 58, palette.mustard),
    ...drawFoodTray(x + w * 0.74, floorY - 10, 0.58),
    ...drawFoodTray(x + w * 0.88, floorY - 10, 0.54),
    ...drawPlant(x + 28, floorY + 12, 0.42),
    ...drawPlant(x + w - 28, floorY + 12, 0.42),
  ]
  if (occupied) {
    children.push(...drawInteriorPerson(x + w * 0.24, floorY, palette.teal, 'standing'))
    children.push(...drawInteriorPerson(x + w * 0.48, floorY, palette.blue, 'standing'))
    children.push(...drawInteriorPerson(x + w * 0.79, floorY, palette.sage, 'seated'))
  }
  children.push(...frameBorder(box))
  return group(children)
}

function drawCommerce(box, occupied, kind) {
  const { x, y, w, h } = box
  const floorY = y + h - 28
  const isFood = ['foodCourt', 'restaurant', 'fancyRestaurant'].includes(kind)
  const isQuiet = ['spa', 'fitness'].includes(kind)
  const columnCount = Math.max(2, Math.min(5, Math.round(w / 170)))
  const storefront = tallGlassHoles(x + 22, y + 20, w - 44, 74, columnCount)
  const wall = kind === 'shop' ? '#e8eedf' : kind === 'spa' ? '#edf2df' : kind === 'fitness' ? '#e5eff1' : isFood ? '#eee6dc' : '#e5e8e0'
  const accent = kind === 'fancyRestaurant' ? palette.plum : kind === 'restaurant' ? palette.sage : kind === 'foodCourt' ? palette.teal : isQuiet ? palette.sage : palette.mustard
  const children = [
    panelWithHoles(x + 4, y + 4, w - 8, h - 8, storefront, wall),
    rect(x + 4, y + 4, w - 8, 16, accent),
    ...drawTallGlass(x + 22, y + 20, w - 44, 74, columnCount),
    rect(x + 4, floorY, w - 8, 24, palette.floor),
    rect(x + 30, floorY - 34, w - 60, 14, occupied ? (isFood ? palette.teal : palette.mustard) : palette.creamShade),
  ]

  if (kind === 'shop') {
    children.push(...drawShelves(x + 52, floorY - 68, Math.min(110, w * 0.24), palette.mustard))
    children.push(...drawShelves(x + w * 0.54, floorY - 66, Math.min(120, w * 0.24), palette.sage))
    children.push(rect(x + w * 0.35, floorY - 28, w * 0.14, 22, palette.wood))
    children.push(rect(x + w * 0.36, floorY - 48, w * 0.1, 20, palette.porcelain))
    if (occupied) {
      children.push(circle(x + w * 0.42, floorY - 58, 7, palette.olive))
      children.push(circle(x + w * 0.78, floorY - 26, 7, palette.rose))
    }
  } else if (kind === 'foodCourt') {
    for (let i = 0; i < 4; i += 1) {
      const standX = x + 60 + i * ((w - 120) / 4)
      children.push(rect(standX, floorY - 61, w * 0.15, 18, [palette.teal, palette.sage, palette.plum, palette.gold][i % 4]))
      children.push(rect(standX + 8, floorY - 42, w * 0.12, 10, palette.porcelain, { opacity: 0.86 }))
      children.push(...drawFoodTray(standX + w * 0.08, floorY - 6, 0.55))
    }
  } else if (kind === 'restaurant' || kind === 'fancyRestaurant') {
    const tableCount = kind === 'fancyRestaurant' ? 3 : 2
    for (let i = 0; i < tableCount; i += 1) {
      const px = x + w * (0.28 + i * (0.44 / Math.max(1, tableCount - 1)))
      children.push(...drawPendantLight(px, y + 20, y + 58, kind === 'fancyRestaurant' ? palette.plum : palette.mustard))
      children.push(...drawRoundTable(px, floorY - 9, occupied, kind === 'fancyRestaurant' ? palette.rose : palette.sage))
      if (kind === 'fancyRestaurant') {
        children.push(rect(px - 8, floorY - 39, 5, 13, palette.aubergine))
        children.push(circle(px - 5.5, floorY - 42, 5, palette.rose, { opacity: 0.75 }))
      }
    }
  } else if (kind === 'fitness') {
    children.push(rect(x + w * 0.18, y + 42, w * 0.64, 34, palette.glassDeep, { opacity: 0.2 }))
    children.push(rect(x + w * 0.2, floorY - 44, w * 0.2, 9, palette.outlineSoft, { opacity: 0.72 }))
    children.push(circle(x + w * 0.18, floorY - 40, 14, palette.sage, { opacity: 0.85 }))
    children.push(circle(x + w * 0.42, floorY - 40, 14, palette.sage, { opacity: 0.85 }))
    children.push(rect(x + w * 0.58, floorY - 35, w * 0.22, 9, palette.plum, { opacity: 0.82 }))
    children.push(rect(x + w * 0.63, floorY - 60, w * 0.12, 25, palette.outlineSoft, { opacity: 0.7 }))
  } else if (kind === 'spa') {
    children.push(rect(x + w * 0.28, floorY - 34, w * 0.22, 15, palette.mint))
    children.push(rect(x + w * 0.54, floorY - 37, w * 0.22, 18, palette.porcelain))
    children.push(circle(x + w * 0.65, floorY - 52, 18, palette.tileBlue, { opacity: 0.72 }))
    children.push(rect(x + w * 0.12, floorY - 7, w * 0.7, 5, palette.sage, { opacity: 0.6 }))
    children.push(...drawPlant(x + w * 0.18, floorY + 12, 0.7))
    children.push(...drawPlant(x + w * 0.82, floorY + 12, 0.7))
  }
  if (occupied && kind !== 'restaurant' && kind !== 'fancyRestaurant') {
    children.push(...drawInteriorPerson(x + w * 0.46, floorY, palette.coral, kind === 'spa' ? 'seated' : 'standing'))
    if (w >= 640) {
      children.push(...drawInteriorPerson(x + w * 0.72, floorY, palette.teal, kind === 'foodCourt' ? 'seated' : 'standing'))
    }
  }
  children.push(...frameBorder(box))
  return group(children)
}

function drawLargeVenue(box, occupied, kind) {
  const { x, y, w, h } = box
  if (kind === 'pool') {
    return drawPool(box, occupied)
  }
  const floorY = y + h - 30
  const topY = y + 12
  const wall = kind === 'movieTheater' ? '#332f41' : kind === 'eventSpace' ? '#e7e4ef' : '#e6e8de'
  const children = [
    rect(x + 4, y + 4, w - 8, h - 8, wall),
    rect(x + 4, floorY, w - 8, 26, palette.floor),
    rect(x + 20, topY, w - 40, 22, kind === 'movieTheater' ? palette.coral : palette.teal, { opacity: 0.92 }),
  ]
  const bayCount = Math.max(2, Math.min(5, Math.floor(w / 280)))
  for (let i = 0; i < bayCount; i += 1) {
    const bayW = (w - 60) / bayCount
    const px = x + 30 + i * bayW
    children.push(rect(px + 8, y + 54, bayW - 16, h - 108, palette.glass, { opacity: kind === 'movieTheater' ? 0.1 : 0.24 }))
    children.push(rect(px + 16, floorY - 28, bayW - 32, 12, i % 2 === 0 ? palette.gold : palette.teal, { opacity: occupied ? 0.95 : 0.65 }))
  }
  if (kind === 'conferenceCenter' || kind === 'eventSpace') {
    children.push(rect(x + w * 0.22, floorY - 70, w * 0.56, 24, palette.wood))
    children.push(rect(x + w * 0.25, floorY - 62, w * 0.5, 8, palette.porcelain, { opacity: 0.8 }))
    for (let i = 0; i < 6; i += 1) {
      children.push(circle(x + w * (0.25 + i * 0.1), floorY - 82, 8, occupied ? palette.sage : palette.creamShade))
    }
    if (kind === 'eventSpace') {
      children.push(rect(x + w * 0.18, y + h * 0.3, w * 0.64, h * 0.18, palette.plum, { opacity: 0.8 }))
      children.push(rect(x + w * 0.38, y + h * 0.36, w * 0.24, h * 0.06, palette.mustard, { opacity: 0.82 }))
    }
  }
  if (kind === 'movieTheater') {
    children.push(rect(x + w * 0.18, y + h * 0.36, w * 0.64, h * 0.22, '#141a25', { opacity: 0.9 }))
    children.push(rect(x + w * 0.22, y + h * 0.4, w * 0.56, h * 0.08, palette.gold, { opacity: occupied ? 0.9 : 0.45 }))
    for (let row = 0; row < 3; row += 1) {
      children.push(rect(x + w * 0.2, floorY - 94 + row * 22, w * 0.6, 8, row % 2 === 0 ? palette.tomato : palette.plum, { opacity: 0.8 }))
    }
    children.push(rect(x + w * 0.08, floorY - 42, w * 0.12, 14, palette.mustard, { opacity: 0.78 }))
  }
  if (occupied && (kind === 'conferenceCenter' || kind === 'eventSpace')) {
    children.push(...drawInteriorPerson(x + w * 0.34, floorY, palette.teal, 'seated'))
    children.push(...drawInteriorPerson(x + w * 0.66, floorY, palette.coral, 'seated'))
  }
  children.push(...frameBorder(box))
  return group(children)
}

function drawPool(box, occupied) {
  const { x, y, w, h } = box
  const floorY = y + h - 30
  const children = [
    rect(x + 4, y + 4, w - 8, h - 8, '#edf3e0'),
    rect(x + 4, floorY, w - 8, 26, palette.floor),
    rect(x + 28, y + 54, w - 56, h - 104, '#72d4df', { opacity: 0.82 }),
    rect(x + 36, y + 64, w - 72, 8, palette.skyReflection, { opacity: 0.5 }),
    rect(x + 36, y + h - 80, w - 72, 7, palette.skyReflection, { opacity: 0.38 }),
    rect(x + 28, y + 54, w - 56, h - 104, 'none', { stroke: palette.outlineSoft, 'stroke-width': 6, opacity: 0.75 }),
  ]
  if (occupied) {
    for (let i = 0; i < 5; i += 1) {
      children.push(circle(x + w * (0.22 + i * 0.14), y + h * 0.45, 8, i % 2 === 0 ? palette.coral : palette.gold))
    }
  }
  children.push(...drawPlant(x + 36, floorY + 10, 0.65))
  children.push(...drawPlant(x + w - 36, floorY + 10, 0.65))
  children.push(...frameBorder(box))
  return group(children)
}

function drawService(box, kind) {
  const { x, y, w, h } = box
  const floorY = y + h - 28
  const colors = {
    hotelReception: [palette.mustard, '#f1eee0'],
    housekeeping: [palette.sage, '#e4f4ee'],
    trashRoom: [palette.rust, '#e5ded2'],
    recyclingCenter: [palette.leaf, '#dff2dc'],
    parkingRamp: [palette.outlineSoft, '#c8ced1'],
    parkingSpace: [palette.outlineSoft, '#d5d8d8'],
    subway: [palette.blue, '#d9ecf4'],
    securityOffice: [palette.outlineSoft, '#dfe6e8'],
    medicalClinic: [palette.coral, '#e9f5f3'],
  }[kind] ?? [palette.teal, '#e7e0cf']
  const [accent, wall] = colors
  const children = [
    rect(x + 4, y + 4, w - 8, h - 8, wall),
    rect(x + 4, y + 4, w - 8, 14, accent, { opacity: 0.88 }),
    rect(x + 4, floorY, w - 8, 24, palette.floor),
  ]
  const bayCount = Math.max(1, Math.min(3, Math.floor(w / 160)))
  for (let i = 0; i < bayCount; i += 1) {
    const bayW = (w - 40) / bayCount
    const px = x + 20 + i * bayW
    children.push(rect(px + 6, y + 34, bayW - 12, 46, palette.glass, { opacity: 0.18 }))
    children.push(rect(px + bayW * 0.25, floorY - 28, bayW * 0.5, 16, accent, { opacity: 0.7 }))
  }
  if (kind === 'hotelReception') {
    children.push(rect(x + w * 0.22, floorY - 44, w * 0.48, 22, palette.wood))
    children.push(rect(x + w * 0.25, floorY - 55, w * 0.42, 12, palette.porcelain, { opacity: 0.88 }))
    children.push(circle(x + w * 0.3, floorY - 62, 6, palette.mustard))
    children.push(rect(x + w * 0.72, floorY - 36, w * 0.08, 28, palette.plum))
    children.push(...drawPlant(x + w * 0.14, floorY + 12, 0.58))
  } else if (kind === 'housekeeping') {
    children.push(...drawServiceCart(x + w * 0.35, floorY - 34, palette.sage))
    children.push(rect(x + w * 0.16, floorY - 48, w * 0.18, 10, palette.porcelain, { opacity: 0.82 }))
    children.push(rect(x + w * 0.18, floorY - 60, w * 0.14, 12, palette.mint))
  } else if (kind === 'trashRoom') {
    children.push(rect(x + w * 0.22, floorY - 46, w * 0.18, 38, palette.rust))
    children.push(rect(x + w * 0.46, floorY - 42, w * 0.18, 34, palette.outlineSoft))
    children.push(rect(x + w * 0.7, floorY - 38, w * 0.12, 30, palette.shadow, { opacity: 0.82 }))
  } else if (kind === 'recyclingCenter') {
    for (let i = 0; i < 5; i += 1) {
      const px = x + w * (0.18 + i * 0.14)
      children.push(rect(px, floorY - 42, w * 0.08, 34, i % 2 === 0 ? palette.leaf : palette.soda))
      children.push(rect(px + 4, floorY - 48, w * 0.08 - 8, 6, palette.outlineSoft, { opacity: 0.72 }))
    }
    children.push(line(x + w * 0.16, floorY - 58, x + w * 0.82, floorY - 58, palette.outlineSoft, 5, { opacity: 0.66 }))
  } else if (kind === 'subway') {
    children.push(rect(x + 36, floorY - 54, w - 72, 30, palette.outlineSoft))
    children.push(rect(x + 50, floorY - 48, w - 100, 10, palette.blue))
    for (let i = 0; i < 6; i += 1) {
      const px = x + 76 + i * ((w - 152) / 6)
      children.push(rect(px, floorY - 78, (w - 160) / 7, 24, palette.soda, { opacity: 0.72 }))
    }
  } else if (kind === 'parkingRamp' || kind === 'parkingSpace') {
    children.push(line(x + 20, floorY - 22, x + w - 20, floorY - 48, palette.gold, 5, { opacity: 0.75 }))
    children.push(rect(x + w * 0.24, floorY - 36, w * 0.34, 18, palette.ink, { opacity: 0.78 }))
    children.push(circle(x + w * 0.28, floorY - 16, 7, palette.outline))
    children.push(circle(x + w * 0.52, floorY - 16, 7, palette.outline))
  } else if (kind === 'securityOffice') {
    children.push(rect(x + w * 0.24, floorY - 66, w * 0.16, 32, palette.ink))
    children.push(rect(x + w * 0.44, floorY - 66, w * 0.16, 32, palette.ink))
    children.push(rect(x + w * 0.28, floorY - 58, w * 0.08, 14, palette.soda, { opacity: 0.72 }))
    children.push(rect(x + w * 0.48, floorY - 58, w * 0.08, 14, palette.sage, { opacity: 0.72 }))
    children.push(rect(x + w * 0.32, floorY - 24, w * 0.34, 9, palette.wood))
  } else if (kind === 'medicalClinic') {
    children.push(rect(x + w * 0.2, floorY - 42, w * 0.32, 14, palette.porcelain))
    children.push(rect(x + w * 0.2, floorY - 28, w * 0.32, 8, palette.tileBlue))
    children.push(circle(x + w * 0.64, floorY - 52, 12, palette.porcelain))
    children.push(rect(x + w * 0.48, y + 42, w * 0.04, 42, palette.coral))
    children.push(rect(x + w * 0.42, y + 57, w * 0.16, 12, palette.coral))
  }
  children.push(...frameBorder(box))
  return group(children)
}

function drawCathedral(box) {
  const { x, y, w, h } = box
  const floorY = y + h - 30
  const children = [
    rect(x + 4, y + 4, w - 8, h - 8, '#e9e4d5'),
    rect(x + 4, floorY, w - 8, 26, palette.floor),
    rect(x + 20, y + 18, w - 40, 18, palette.gold, { opacity: 0.72 }),
  ]
  const arches = 8
  for (let i = 0; i < arches; i += 1) {
    const archW = (w - 64) / arches
    const px = x + 32 + i * archW
    children.push(rect(px + 8, y + 58, archW - 16, h - 126, palette.glass, { opacity: 0.28 }))
    children.push(circle(px + archW / 2, y + 58, (archW - 18) / 2, palette.glass, { opacity: 0.28 }))
    children.push(rect(px + archW * 0.46, y + 58, archW * 0.08, h - 126, palette.skyReflection, { opacity: 0.24 }))
  }
  children.push(rect(x + w * 0.47, floorY - 56, w * 0.06, 40, palette.wood))
  children.push(rect(x + w * 0.42, floorY - 42, w * 0.16, 10, palette.wood))
  children.push(...frameBorder(box))
  return group(children)
}

function drawBed(x, y, w, dirty) {
  return [
    roundedRect(x, y, w, 32, 12, dirty ? '#d89a83' : '#f7d7b3'),
    roundedRect(x + 6, y + 5, w * 0.28, 14, 7, dirty ? '#c77d73' : palette.cream),
    roundedRect(x, y + 28, w, 8, 4, palette.wood),
  ]
}

function drawApartment(box, state) {
  const { x, y, w, h } = box
  const dirty = state === 'dirty'
  const occupied = state === 'occupied' || state === 'sleeping'
  const sleeping = state === 'sleeping'
  const windows = [
    { h: 82, w: w * 0.28, x: x + 10, y: y + 18 },
    { h: 84, w: w * 0.3, x: x + w * 0.58, y: y + 16 },
  ]
  const children = [
    panelWithHoles(x + 4, y + 4, w - 8, h - 8, windows, dirty ? '#e5b6a5' : sleeping ? '#dad7e4' : '#f2ead9'),
    rect(windows[0].x, windows[0].y, windows[0].w, windows[0].h, palette.glass, { opacity: dirty ? 0.28 : 0.42 }),
    rect(windows[1].x, windows[1].y, windows[1].w, windows[1].h, palette.glass, { opacity: dirty ? 0.24 : 0.4 }),
    rect(x + 17, y + 24, w * 0.1, 66, palette.skyReflection, { opacity: 0.22 }),
    rect(x + w * 0.64, y + 22, w * 0.1, 66, palette.skyReflection, { opacity: 0.2 }),
    rect(x + 4, y + h - 28, w - 8, 24, dirty ? '#9f7864' : palette.floor),
    ...drawBed(x + 28, y + h - 66, w * 0.42, dirty),
    rect(x + w - 66, y + h - 74, 28, 46, occupied ? palette.gold : palette.teal),
    rect(x + w - 76, y + h - 28, 54, 8, palette.wood),
    ...drawPlant(x + w - 34, y + h - 20, 0.52),
  ]
  if (occupied || dirty) {
    children.push(rect(x + 20, y + h - 20, 28, 8, dirty ? palette.coral : palette.blue))
    children.push(rect(x + w - 108, y + h - 16, 18, 8, dirty ? palette.shadow : palette.lavender))
  }
  if (dirty) {
    children.push(rect(x + w * 0.47, y + h - 21, 22, 8, '#6f5b4d'))
    children.push(rect(x + w * 0.5, y + h - 34, 18, 10, '#9d6f5e'))
  }
  if (sleeping) {
    children.push(...drawSleepingPerson(x + 28, y + h - 66, w * 0.42, palette.lavender))
  } else if (occupied) {
    children.push(...drawInteriorPerson(x + w * 0.7, y + h - 28, palette.gold, 'standing'))
  }
  children.push(...frameBorder(box))
  return group(children)
}

function elevatorPalette(kind) {
  if (kind === 'express') {
    return { accent: palette.gold, cabin: '#fff0c8', door: '#9bb0c8', panel: '#3f4f68' }
  }
  if (kind === 'service') {
    return { accent: palette.coral, cabin: '#e6e0d7', door: '#9baaa5', panel: '#59605c' }
  }
  if (kind === 'glass') {
    return { accent: palette.teal, cabin: '#dff8ff', door: '#a9ddec', panel: '#315566' }
  }
  return { accent: palette.teal, cabin: '#fff1c9', door: '#8db9c8', panel: palette.outlineSoft }
}

function drawElevatorInterior(box, kind) {
  const { x, y, w, h } = box
  const colors = elevatorPalette(kind)
  return group([
    rect(x + 8, y + 4, w - 16, h - 8, colors.cabin, { opacity: kind === 'glass' ? 0.34 : 0.48 }),
    line(x + w / 2, y + 8, x + w / 2, y + h - 8, colors.panel, kind === 'express' ? 5 : 4, { opacity: 0.65 }),
    rect(x + 14, y + h - 26, w - 28, 14, palette.floor, { opacity: 0.8 }),
    rect(x + 20, y + 20, w - 40, 8, colors.accent, { opacity: 0.85 }),
    ...frameBorder(box),
  ])
}

function drawElevatorCap(box, position, kind) {
  const { x, y, w, h } = box
  const colors = elevatorPalette(kind)
  const machineY = position === 'top' ? y + 44 : y + h - 72
  return group([
    rect(x + 8, y + 8, w - 16, h - 16, kind === 'glass' ? '#d8f4f9' : '#d7e5e8', {
      opacity: kind === 'glass' ? 0.68 : 1,
    }),
    rect(x + 22, machineY, w - 44, 28, colors.panel),
    circle(x + w * 0.38, machineY + 14, 11, colors.accent),
    circle(x + w * 0.62, machineY + 14, 11, kind === 'service' ? palette.blue : palette.gold),
    rect(x + 20, position === 'top' ? y + h - 30 : y + 22, w - 40, 10, palette.floorDark),
    ...frameBorder(box),
  ])
}

function drawElevatorCar(box, occupancy, detail, kind) {
  const { x, y, w, h } = box
  const colors = elevatorPalette(kind)
  const children = [
    rect(x + 18, y + 26, w - 36, h - 54, detail === 'summary' ? '#f5e8cc' : colors.cabin),
    rect(x + 24, y + 34, w - 48, h - 70, palette.glass, { opacity: kind === 'glass' ? 0.45 : detail === 'summary' ? 0.22 : 0.34 }),
    rect(x + 18, y + h - 36, w - 36, 10, palette.floorDark),
    rect(x + 26, y + h - 52, w - 52, 7, colors.accent, { opacity: 0.8 }),
    rect(x + 18, y + 26, w - 36, h - 54, 'none', { stroke: palette.outline, 'stroke-width': detail === 'summary' ? 8 : 5 }),
  ]
  const detailCounts = { empty: 0, single: 1, double: 2, crowded: 4, full: 6 }
  const summaryCounts = { empty: 0, single: 1, double: 2, crowded: 3, full: 4 }
  const count = (detail === 'summary' ? summaryCounts : detailCounts)[occupancy]
  if (count > 0) {
    for (let i = 0; i < count; i += 1) {
      const px = x + 42 + i * ((w - 84) / Math.max(1, count - 1))
      children.push(rect(px - 6, y + h - 68, 12, 34, i % 3 === 0 ? palette.teal : i % 3 === 1 ? palette.coral : palette.blue))
      children.push(circle(px, y + h - 78, 8, '#6a4b38'))
    }
  }
  if (occupancy === 'full') {
    children.push(roundedRect(x + w - 58, y + 38, 28, 14, 4, palette.coral))
    children.push(rect(x + w - 52, y + 42, 4, 7, palette.cream))
    children.push(rect(x + w - 45, y + 42, 4, 7, palette.cream))
    children.push(rect(x + w - 38, y + 42, 4, 7, palette.cream))
  }
  return group(children)
}

function drawElevatorDoors(box, open, detail, kind) {
  const { x, y, w, h } = box
  const colors = elevatorPalette(kind)
  const children = []
  const doorW = open ? (w - 44) * 0.22 : (w - 44) / 2
  children.push(rect(x + 22, y + 30, doorW, h - 62, colors.door, { opacity: kind === 'glass' ? 0.42 : detail === 'summary' ? 0.5 : 0.62 }))
  children.push(rect(x + w - 22 - doorW, y + 30, doorW, h - 62, colors.door, { opacity: kind === 'glass' ? 0.42 : detail === 'summary' ? 0.5 : 0.62 }))
  if (!open) {
    children.push(line(x + w / 2, y + 32, x + w / 2, y + h - 32, palette.outline, detail === 'summary' ? 5 : 3))
  }
  children.push(rect(x + 20, y + 28, w - 40, h - 58, 'none', { stroke: palette.outline, 'stroke-width': detail === 'summary' ? 7 : 4 }))
  return group(children)
}

function drawElevatorStopPlate(box, enabled, kind) {
  const { x, y, w, h } = box
  const colors = elevatorPalette(kind)
  return group([
    roundedRect(x + 3, y + 3, w - 6, h - 6, 5, enabled ? colors.panel : palette.shadow, {
      opacity: enabled ? 0.96 : 0.55,
      stroke: palette.outline,
      'stroke-width': 3,
    }),
    circle(x + 14, y + h / 2, 4, enabled ? colors.accent : palette.outlineSoft),
    rect(x + 24, y + h / 2 - 2, w - 38, 4, enabled ? palette.cream : palette.creamShade, { opacity: enabled ? 0.92 : 0.45 }),
  ])
}

function drawPerson(box, tier, detail, variant) {
  const { x, y, w, h } = box
  const cx = x + w / 2
  const body = tier === 'staff'
    ? palette.rust
    : tier === 'housekeeper'
      ? palette.teal
      : tier === 'vip'
        ? palette.gold
        : tier === 'high'
          ? palette.teal
          : tier === 'med'
            ? palette.blue
            : '#8bb37c'
  const accent = tier === 'staff'
    ? palette.gold
    : tier === 'housekeeper'
      ? palette.porcelain
      : tier === 'vip'
        ? palette.coral
        : tier === 'high'
          ? palette.gold
          : tier === 'med'
            ? palette.teal
            : palette.creamShade
  const skin = variant === 1 ? '#8a5f44' : '#6a4b38'
  if (detail === 'summary') {
    return group([
      circle(cx, y + 12, 8, tier === 'vip' ? palette.gold : skin),
      roundedRect(cx - 9, y + 20, 18, h - 28, 8, body),
      roundedRect(cx - 10, y + h - 10, 7, 8, 3, palette.outlineSoft),
      roundedRect(cx + 3, y + h - 10, 7, 8, 3, palette.outlineSoft),
    ])
  }
  const children = [
    circle(cx, y + 11, 8, skin),
    roundedRect(cx - 10, y + 20, 20, 30, 9, body),
    roundedRect(cx - 8, y + 26, 16, 6, 3, accent),
    line(cx - 8, y + 25, cx - 13, y + 48, palette.creamShade, 6),
    line(cx + 8, y + 25, cx + 13, y + 48, palette.creamShade, 6),
    line(cx - 5, y + 49, cx - 6, y + h - 3, palette.outlineSoft, 7),
    line(cx + 5, y + 49, cx + 6, y + h - 3, palette.outlineSoft, 7),
    tier === 'vip' ? circle(cx + 8, y + 7, 4, palette.gold) : '',
  ]
  if (variant === 1) {
    children.push(rect(cx - 9, y + 4, 18, 4, palette.aubergine))
  }
  if (tier === 'staff') {
    children.push(rect(cx + 11, y + 30, 5, 25, palette.copper))
  }
  if (tier === 'housekeeper') {
    children.push(circle(cx + 15, y + 50, 7, palette.outlineSoft))
    children.push(rect(cx + 11, y + 36, 11, 15, palette.mint))
  }
  return group(children)
}

function drawCloud(box, variant) {
  const { x, y, w, h } = box
  const lift = variant === 1 ? h * 0.08 : variant === 2 ? -h * 0.04 : 0
  return group([
    circle(x + w * 0.22, y + h * 0.62, h * 0.22, palette.cloudShade, { opacity: 0.9 }),
    circle(x + w * 0.36, y + h * 0.44 + lift, h * (variant === 1 ? 0.24 : 0.3), palette.cloud),
    circle(x + w * 0.54, y + h * 0.36 - lift, h * (variant === 2 ? 0.42 : 0.36), palette.cloud),
    circle(x + w * 0.72, y + h * 0.55, h * 0.26, palette.cloud),
    rect(x + w * 0.2, y + h * 0.58, w * 0.6, h * 0.22, palette.cloud),
  ])
}

function drawGroundHorizon(box) {
  const { x, y, w, h } = box
  const skyline = []
  const heights = [0.28, 0.42, 0.34, 0.58, 0.38, 0.5, 0.3, 0.46]
  for (let i = 0; i < heights.length; i += 1) {
    const buildingW = w / heights.length + 2
    const buildingH = h * heights[i]
    skyline.push(rect(x + i * (w / heights.length), y + h - buildingH - h * 0.18, buildingW, buildingH, i % 2 === 0 ? '#83939a' : '#6e8088', { opacity: 0.72 }))
  }
  return group([
    ...skyline,
    rect(x, y + h * 0.78, w, h * 0.22, '#556560'),
    rect(x, y + h * 0.84, w, h * 0.16, '#3f4f48'),
    ...Array.from({ length: 12 }, (_, i) => circle(x + (i + 0.5) * (w / 12), y + h * (0.76 + (i % 3) * 0.035), h * 0.055, i % 2 === 0 ? palette.leafDark : palette.leaf, { opacity: 0.9 })),
  ])
}

function drawNightStars(box) {
  const { x, y, w, h } = box
  const children = []
  for (let i = 0; i < 42; i += 1) {
    const sx = x + ((i * 47 + 13) % 127) / 128 * w
    const sy = y + ((i * 29 + 7) % 63) / 64 * h
    const radius = i % 11 === 0 ? 2.2 : i % 4 === 0 ? 1.5 : 1
    children.push(circle(sx, sy, radius, i % 5 === 0 ? palette.nightWarm : palette.cloud, { opacity: i % 3 === 0 ? 0.82 : 0.62 }))
    if (i % 11 === 0) {
      children.push(line(sx - 4, sy, sx + 4, sy, palette.cloud, 1.5, { opacity: 0.65 }))
      children.push(line(sx, sy - 4, sx, sy + 4, palette.cloud, 1.5, { opacity: 0.65 }))
    }
  }
  return group(children)
}

function buildSvg(packed) {
  const children = []
  for (const frame of packed.placements) {
    const box = { x: frame.x, y: frame.y, w: frame.w, h: frame.h }
    children.push(frame.draw(box))
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${packed.width}" height="${packed.height}" viewBox="0 0 ${packed.width} ${packed.height}" shape-rendering="geometricPrecision">
  <rect width="100%" height="100%" fill="none"/>
  ${children.join('\n  ')}
</svg>
`
}

async function renderWebp(svg, width, height) {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  const result = await page.evaluate(
    async ({ dataUrl, width, height }) => {
      function loadImage(src) {
        return new Promise((resolve, reject) => {
          const image = new Image()
          image.onload = () => resolve(image)
          image.onerror = reject
          image.src = src
        })
      }

      const image = await loadImage(dataUrl)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      context.clearRect(0, 0, width, height)
      context.imageSmoothingEnabled = true
      context.drawImage(image, 0, 0)
      return canvas.toDataURL('image/webp', 0.96)
    },
    { dataUrl, width, height },
  )
  await browser.close()
  return Buffer.from(result.replace(/^data:image\/webp;base64,/, ''), 'base64')
}

function runtimeManifestSource(manifest) {
  return `// Generated by assets/scripts/build-style-gate-atlas.mjs. Do not edit.\n\nexport const STYLE_GATE_ATLAS_MANIFEST = ${JSON.stringify(manifest, null, 2)} as const\n`
}

async function main() {
  const packed = packFrames()
  const svg = buildSvg(packed)
  const manifestFrames = Object.fromEntries(packed.placements.map((frame) => [
    frame.name,
    {
      x: frame.x,
      y: frame.y,
      w: frame.w,
      h: frame.h,
    },
  ]))
  const manifest = {
    image: 'style-gate.webp',
    width: packed.width,
    height: packed.height,
    ppu: 16 * scale,
    sourceScale: scale,
    padding,
    frames: manifestFrames,
  }

  await Promise.all([mkdir(sourceRoot, { recursive: true }), mkdir(spriteRoot, { recursive: true }), mkdir(path.dirname(runtimeManifestOut), { recursive: true })])
  await writeFile(sourceSvgOut, svg)
  await writeFile(atlasOut, await renderWebp(svg, packed.width, packed.height))
  await writeFile(manifestOut, `${JSON.stringify(manifest, null, 2)}\n`)
  await writeFile(runtimeManifestOut, runtimeManifestSource(manifest))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
