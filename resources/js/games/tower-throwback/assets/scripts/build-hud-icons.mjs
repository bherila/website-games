import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const iconRoot = path.resolve(__dirname, '..', 'icons')

const c = {
  ink: '#24313b',
  inkSoft: '#4d6372',
  panel: '#fff4d6',
  panelCool: '#e4f4f7',
  panelWarm: '#ffe0b6',
  glass: '#9ed1e8',
  glassLight: '#d9f4fb',
  wood: '#a86b3c',
  gold: '#f2c64f',
  amber: '#f6dd8a',
  green: '#61b574',
  greenDark: '#2f8458',
  teal: '#4db9b1',
  blue: '#5f9ed1',
  red: '#de6150',
  coral: '#e98a67',
  plum: '#77609b',
  gray: '#8d9aa3',
  grayLight: '#d8d6c8',
  white: '#fffaf0',
  dark: '#30353b',
  black: '#1e2328',
}

const bg = {
  structure: '#eee5d0',
  lobby: '#ffe9bd',
  residential: '#dcf0d0',
  commercial: '#dcedff',
  dining: '#ffe1a3',
  hotel: '#eadcff',
  leisure: '#ead8f1',
  service: '#e5dfd1',
  transit: '#d9f0f5',
  elevator: '#e8edf0',
  status: '#fff1bd',
  incident: '#ffd6c8',
}

function attrs(values) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}="${String(value)}"`)
    .join(' ')
}

function tag(name, values, children = '') {
  if (children.length === 0) {
    return `  <${name} ${attrs(values)}/>`
  }
  return `  <${name} ${attrs(values)}>${children}</${name}>`
}

function pathShape(d, fill, extra = {}) {
  return tag('path', { d, fill, ...extra })
}

function strokePath(d, stroke = c.ink, width = 1.35, extra = {}) {
  return pathShape(d, 'none', {
    stroke,
    'stroke-width': width,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    ...extra,
  })
}

function rect(x, y, width, height, fill, extra = {}) {
  return tag('rect', { x, y, width, height, fill, ...extra })
}

function roundRect(x, y, width, height, radius, fill, extra = {}) {
  return rect(x, y, width, height, fill, { rx: radius, ry: radius, ...extra })
}

function circle(cx, cy, r, fill, extra = {}) {
  return tag('circle', { cx, cy, r, fill, ...extra })
}

function ellipse(cx, cy, rx, ry, fill, extra = {}) {
  return tag('ellipse', { cx, cy, rx, ry, fill, ...extra })
}

function line(x1, y1, x2, y2, stroke = c.ink, width = 1.35, extra = {}) {
  return tag('line', {
    x1,
    y1,
    x2,
    y2,
    stroke,
    'stroke-width': width,
    'stroke-linecap': 'round',
    ...extra,
  })
}

function polygon(points, fill, extra = {}) {
  return tag('polygon', { points, fill, ...extra })
}

function badge(fill = c.panel) {
  return [
    pathShape('M4.7 2.8h14.6c1.05 0 1.9.85 1.9 1.9v14.6c0 1.05-.85 1.9-1.9 1.9H4.7a1.9 1.9 0 0 1-1.9-1.9V4.7c0-1.05.85-1.9 1.9-1.9Z', fill, { stroke: c.ink, 'stroke-width': 1.2 }),
    pathShape('M5.7 4.15h12.6c.85 0 1.55.7 1.55 1.55v12.6c0 .85-.7 1.55-1.55 1.55H5.7c-.85 0-1.55-.7-1.55-1.55V5.7c0-.85.7-1.55 1.55-1.55Z', 'none', { stroke: c.white, 'stroke-width': 0.75, opacity: 0.5 }),
  ]
}

function icon(label, shapes, fill = c.panel) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="${label}">`,
    '  <rect width="24" height="24" fill="none"/>',
    ...badge(fill),
    ...shapes,
    '</svg>',
    '',
  ].join('\n')
}

function windowPair(y = 6.2) {
  return [
    roundRect(5.7, y, 5.2, 5.8, 0.8, c.glass, { stroke: c.inkSoft, 'stroke-width': 0.55 }),
    roundRect(13.1, y, 5.2, 5.8, 0.8, c.glass, { stroke: c.inkSoft, 'stroke-width': 0.55 }),
    pathShape(`M6.6 ${y + 1.1}h3.4v1.5H6.6Z`, c.glassLight, { opacity: 0.8 }),
    pathShape(`M14 ${y + 1.1}h3.4v1.5H14Z`, c.glassLight, { opacity: 0.8 }),
  ]
}

function desk(x, y, accent = c.teal) {
  return [
    roundRect(x, y, 5.1, 2.2, 0.5, c.wood, { stroke: c.ink, 'stroke-width': 0.45 }),
    roundRect(x + 0.5, y - 2.3, 2.8, 2, 0.35, accent, { stroke: c.ink, 'stroke-width': 0.45 }),
    line(x + 1.1, y + 2.1, x + 0.6, y + 4.1, c.ink, 0.75),
    line(x + 4, y + 2.1, x + 4.5, y + 4.1, c.ink, 0.75),
  ]
}

function bed(x, y, accent = c.blue) {
  return [
    roundRect(x, y, 7.4, 4.2, 0.8, c.white, { stroke: c.ink, 'stroke-width': 0.6 }),
    pathShape(`M${x + 0.5} ${y + 2.1}h6.4v2.1H${x + 0.5}Z`, accent),
    circle(x + 1.5, y + 1.1, 0.75, c.amber),
  ]
}

function plant(x, y, scale = 1) {
  return [
    pathShape(`M${x + 1.4 * scale} ${y + 5.4 * scale}h${2.4 * scale}v${3 * scale}h${-2.4 * scale}Z`, c.wood),
    ellipse(x + 2.6 * scale, y + 3.6 * scale, 2.5 * scale, 2.1 * scale, c.green, { stroke: c.ink, 'stroke-width': 0.45 }),
    ellipse(x + 1.2 * scale, y + 4.6 * scale, 1.7 * scale, 1.3 * scale, c.greenDark),
    ellipse(x + 4 * scale, y + 4.5 * scale, 1.8 * scale, 1.25 * scale, c.greenDark),
  ]
}

function people(count, y = 14.5) {
  const centers = count === 1 ? [12] : count === 2 ? [9, 15] : [7.5, 12, 16.5]
  return centers.flatMap((cx, i) => [
    circle(cx, y, 0.9, i === 0 ? c.gold : i === 1 ? c.teal : c.coral, { stroke: c.ink, 'stroke-width': 0.45 }),
    strokePath(`M${cx} ${y + 1.1}v2.2`, c.ink, 0.8),
  ])
}

function elevatorCab(accent = c.gold, glass = c.grayLight) {
  return [
    roundRect(6.1, 4.2, 11.8, 15.7, 1.5, c.gray, { stroke: c.ink, 'stroke-width': 1.05 }),
    roundRect(7.6, 5.9, 8.8, 11.9, 1.05, glass, { stroke: c.inkSoft, 'stroke-width': 0.7 }),
    line(12, 6.1, 12, 17.7, c.inkSoft, 0.8),
    circle(18.5, 11, 1.1, c.dark),
    circle(18.5, 11, 0.45, accent),
    circle(18.5, 14, 1.1, c.dark),
    circle(18.5, 14, 0.45, accent),
  ]
}

function car(cx = 12, cy = 14.2, fill = c.blue) {
  return [
    pathShape(`M${cx - 5.6} ${cy + 1.8}h11.2l-.8-3.7-2.6-2.4h-5.2l-2.6 2.4Z`, fill, { stroke: c.ink, 'stroke-width': 0.8, 'stroke-linejoin': 'round' }),
    pathShape(`M${cx - 2.8} ${cy - 1.2}h5.4l1.35 1.4h-8.1Z`, c.glassLight),
    circle(cx - 3.4, cy + 2, 1.1, c.black),
    circle(cx + 3.4, cy + 2, 1.1, c.black),
  ]
}

function cloche() {
  return [
    ellipse(12, 14.3, 6.5, 2.1, c.grayLight, { stroke: c.ink, 'stroke-width': 0.75 }),
    pathShape('M6.4 14.3a5.6 5.6 0 0 1 11.2 0Z', c.gold, { stroke: c.ink, 'stroke-width': 0.7 }),
    circle(12, 8.4, 1, c.gold, { stroke: c.ink, 'stroke-width': 0.55 }),
    line(5.8, 17.2, 18.2, 17.2, c.ink, 1),
  ]
}

function star(cx = 12, cy = 11, r = 5.9, fill = c.gold) {
  const points = []
  for (let i = 0; i < 10; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    const radius = i % 2 === 0 ? r : r * 0.45
    points.push(`${(cx + Math.cos(angle) * radius).toFixed(2)},${(cy + Math.sin(angle) * radius).toFixed(2)}`)
  }
  return polygon(points.join(' '), fill, { stroke: c.ink, 'stroke-width': 0.75, 'stroke-linejoin': 'round' })
}

function speedBars(count, fill) {
  return Array.from({ length: count }, (_, i) => roundRect(5 + i * 3.2, 17 - i * 1.7, 2.35, 1.9 + i * 1.7, 0.65, fill, { stroke: c.ink, 'stroke-width': 0.45 }))
}

function heatGrid(colors) {
  return colors.flatMap((fill, i) => {
    const x = 6 + (i % 3) * 4.6
    const y = 7 + Math.floor(i / 3) * 5
    return [roundRect(x, y, 3.6, 3.6, 0.85, fill, { stroke: c.ink, 'stroke-width': 0.45 })]
  })
}

const icons = {
  'slab.svg': icon('Floor', [
    strokePath('M5 8.6h14M5 12.2h14M5 15.8h14', c.ink, 1.25),
    pathShape('M6 7.3h12v2.1H6Zm1.3 3.6h9.4V13H7.3Zm-1.3 3.6h12v2.2H6Z', c.grayLight),
    pathShape('M8 6.2c2.5-1 5.8-1 8 0', c.white, { opacity: 0.7 }),
  ], bg.structure),
  'lobby.svg': icon('Lobby', [
    ...windowPair(5.5),
    pathShape('M8.2 18.2v-5.1a3.8 3.8 0 0 1 7.6 0v5.1Z', c.wood, { stroke: c.ink, 'stroke-width': 0.75 }),
    circle(14.5, 15.5, 0.35, c.gold),
    ...plant(4.6, 10.5, 0.75),
    ...plant(15.6, 10.5, 0.75),
  ], bg.lobby),
  'skylobby.svg': icon('Skylobby', [
    pathShape('M6 5.9h12v4.1H6Z', c.glass, { stroke: c.inkSoft, 'stroke-width': 0.6 }),
    pathShape('M8 7.1c1.8-1.9 4.6-2 6.5-.2 1-.5 2.4-.2 3.1.8', c.glassLight, { opacity: 0.95 }),
    strokePath('M6.2 13.4h11.6', c.wood, 1.6),
    ...plant(5.6, 10.8, 0.85),
    ...people(2, 14.4),
  ], bg.lobby),
  'skybridge.svg': icon('Skybridge', [
    roundRect(4.5, 6.4, 4.1, 12, 0.8, c.grayLight, { stroke: c.ink, 'stroke-width': 0.7 }),
    roundRect(15.4, 6.4, 4.1, 12, 0.8, c.grayLight, { stroke: c.ink, 'stroke-width': 0.7 }),
    pathShape('M7.7 11.1h8.6v4.2H7.7Z', c.glass, { stroke: c.ink, 'stroke-width': 0.7 }),
    strokePath('M8 12.4h8M8 14h8', c.glassLight, 0.75),
  ], bg.transit),
  'stairs.svg': icon('Stairs', [
    pathShape('M6 17.3h3v-2.4h3v-2.4h3v-2.4h3V7.7h1.5v11.1H6Z', c.grayLight, { stroke: c.ink, 'stroke-width': 0.8, 'stroke-linejoin': 'round' }),
    strokePath('M6.4 8.2c2.5-2.2 5.4-2.2 8 0', c.gold, 1),
  ], bg.structure),
  'escalator.svg': icon('Escalator', [
    strokePath('M6 16.8 17.8 7', c.ink, 3.5),
    strokePath('M6 16.8 17.8 7', c.grayLight, 2.2),
    strokePath('M5.3 13.8 14.1 6.5', c.gold, 1),
    circle(16.8, 6.3, 1.25, c.gold, { stroke: c.ink, 'stroke-width': 0.55 }),
    circle(7.1, 17.4, 1.25, c.gold, { stroke: c.ink, 'stroke-width': 0.55 }),
  ], bg.structure),
  'officeS.svg': icon('Small office', [
    ...windowPair(5.3),
    ...desk(9.4, 15.2),
  ], bg.commercial),
  'officeM.svg': icon('Medium office', [
    ...windowPair(5.1),
    ...desk(6.2, 15.3),
    ...desk(13.3, 15.3, c.blue),
    strokePath('M9 12.7h6', c.gold, 0.9),
  ], bg.commercial),
  'officeL.svg': icon('Large office', [
    ...windowPair(5),
    ...desk(5.4, 15.4),
    ...desk(11.2, 15.4, c.blue),
    ...desk(16.1, 15.4, c.green),
    strokePath('M6 12.4h12', c.gold, 0.9),
  ], bg.commercial),
  'aptStudio.svg': icon('Studio apartment', [
    ...windowPair(5.6),
    ...bed(5.9, 14.2, c.green),
    pathShape('M15.2 13.4h3.2v4h-3.2Z', c.wood, { stroke: c.ink, 'stroke-width': 0.45 }),
  ], bg.residential),
  'apt1br.svg': icon('One bedroom apartment', [
    ...windowPair(5.7),
    ...bed(5.4, 14.3, c.green),
    roundRect(14.1, 13.4, 4.2, 4.2, 0.8, c.teal, { stroke: c.ink, 'stroke-width': 0.5 }),
    strokePath('M13.7 12.1h4.7', c.gold, 0.9),
  ], bg.residential),
  'apt2br.svg': icon('Two bedroom apartment', [
    ...windowPair(5.8),
    ...bed(4.8, 14.5, c.green),
    ...bed(12.7, 14.5, c.blue),
    line(12, 13.1, 12, 18.6, c.inkSoft, 0.7),
  ], bg.residential),
  'aptPenthouse.svg': icon('Penthouse apartment', [
    strokePath('M6 6.5h12', c.gold, 1.5),
    ...windowPair(7.1),
    ...bed(5, 14.6, c.plum),
    ...plant(15.2, 10.5, 0.8),
    pathShape('M15.7 5.3 18 3.8l2.3 1.5-2.3 1.5Z', c.gold, { stroke: c.ink, 'stroke-width': 0.45 }),
  ], bg.residential),
  'restroom.svg': icon('Restroom', [
    roundRect(6, 8, 4.7, 8.5, 1.1, c.white, { stroke: c.ink, 'stroke-width': 0.75 }),
    pathShape('M7.1 15.7h4.8c0 2-1.3 3.1-3.1 3.1s-1.7-1.2-1.7-3.1Z', c.grayLight, { stroke: c.ink, 'stroke-width': 0.55 }),
    roundRect(13.2, 9, 5, 3.6, 1.4, c.glassLight, { stroke: c.ink, 'stroke-width': 0.75 }),
    pathShape('M15.7 12.4v4.2', 'none', { stroke: c.ink, 'stroke-width': 1.1, 'stroke-linecap': 'round' }),
    circle(17.6, 15.5, 0.7, c.blue),
  ], bg.service),
  'shop.svg': icon('Shop', [
    pathShape('M5.7 8h12.6l1.2 3.2H4.5Z', c.coral, { stroke: c.ink, 'stroke-width': 0.75, 'stroke-linejoin': 'round' }),
    strokePath('M7 8v3.1M10.3 8v3.1M13.7 8v3.1M17 8v3.1', c.white, 0.8),
    pathShape('M8.2 12.1h7.6l.7 6H7.5Z', c.gold, { stroke: c.ink, 'stroke-width': 0.75 }),
    strokePath('M9.5 12.3c.1-2 4.9-2 5 0', c.ink, 0.85),
  ], bg.commercial),
  'fastfood.svg': icon('Fast food', [
    pathShape('M6.6 11.4c.2-2.5 2.5-4.1 5.4-4.1s5.2 1.6 5.4 4.1Z', c.amber, { stroke: c.ink, 'stroke-width': 0.75 }),
    pathShape('M6.2 12.4h11.6v1.7H6.2Z', c.green),
    pathShape('M6.3 14.2h11.4v2.5H6.3Z', c.wood, { stroke: c.ink, 'stroke-width': 0.65 }),
    pathShape('M8.3 17.1h7.4c-.3 1.4-1.6 2.2-3.7 2.2s-3.4-.8-3.7-2.2Z', c.gold, { stroke: c.ink, 'stroke-width': 0.65 }),
    pathShape('M17.7 8h2.3l-.6 8.9h-2.1Z', c.red, { stroke: c.ink, 'stroke-width': 0.55 }),
    line(18.7, 6.1, 19.8, 8.2, c.ink, 0.65),
  ], bg.dining),
  'foodCourt.svg': icon('Food court', [
    roundRect(5.2, 7.1, 3.9, 5.5, 0.7, c.red, { stroke: c.ink, 'stroke-width': 0.55 }),
    roundRect(10.1, 6.4, 3.8, 6.2, 0.7, c.gold, { stroke: c.ink, 'stroke-width': 0.55 }),
    roundRect(14.9, 7.1, 3.9, 5.5, 0.7, c.teal, { stroke: c.ink, 'stroke-width': 0.55 }),
    pathShape('M6 15.2h12l-1.2 3.4H7.2Z', c.wood, { stroke: c.ink, 'stroke-width': 0.75, 'stroke-linejoin': 'round' }),
    circle(9, 14.6, 0.75, c.white),
    circle(12, 14.2, 0.75, c.green),
    circle(15, 14.6, 0.75, c.coral),
  ], bg.dining),
  'restaurant.svg': icon('Restaurant', [
    circle(11, 13.3, 4.25, c.white, { stroke: c.ink, 'stroke-width': 0.75 }),
    circle(11, 13.3, 2.2, c.teal),
    line(5.5, 8.2, 5.5, 18, c.ink, 0.9),
    line(4.4, 8.2, 6.6, 8.2, c.ink, 0.85),
    line(4.7, 10.2, 6.3, 10.2, c.ink, 0.75),
    line(17, 8.2, 17, 18, c.ink, 0.9),
    pathShape('M17 8.2c2.7 1.5 2.2 4.8 0 5.5Z', c.gold, { stroke: c.ink, 'stroke-width': 0.55 }),
  ], bg.dining),
  'fancyRestaurant.svg': icon('Fancy restaurant', [
    ...cloche(),
    pathShape('M6.4 8.2c1.1-.7 2.4-.7 3.4 0M14.2 8.2c1.1-.7 2.4-.7 3.4 0', 'none', { stroke: c.plum, 'stroke-width': 1, 'stroke-linecap': 'round' }),
  ], bg.dining),
  'movieTheater.svg': icon('Movie theater', [
    roundRect(5.2, 6.1, 13.6, 7.7, 1, c.dark, { stroke: c.ink, 'stroke-width': 0.8 }),
    pathShape('M7 7.5h10v4.8H7Z', c.blue),
    circle(8.1, 17, 1.05, c.red, { stroke: c.ink, 'stroke-width': 0.45 }),
    circle(12, 16.5, 1.05, c.red, { stroke: c.ink, 'stroke-width': 0.45 }),
    circle(15.9, 17, 1.05, c.red, { stroke: c.ink, 'stroke-width': 0.45 }),
    pathShape('M6.5 18.3h11', 'none', { stroke: c.ink, 'stroke-width': 1.5, 'stroke-linecap': 'round' }),
  ], bg.leisure),
  'fitness.svg': icon('Fitness center', [
    line(6.2, 13, 17.8, 13, c.ink, 1.7),
    roundRect(4.7, 10.5, 2.5, 5, 0.7, c.gray, { stroke: c.ink, 'stroke-width': 0.55 }),
    roundRect(16.8, 10.5, 2.5, 5, 0.7, c.gray, { stroke: c.ink, 'stroke-width': 0.55 }),
    circle(12, 8.1, 1.4, c.teal, { stroke: c.ink, 'stroke-width': 0.55 }),
    strokePath('M10.4 16.7h3.2M12 9.6v6.9', c.ink, 1.05),
  ], bg.leisure),
  'pool.svg': icon('Pool', [
    pathShape('M5.2 13.8c1.5-1.2 3-.1 4.5 0s3-1.2 4.5 0 3 .1 4.5 0v4.2H5.2Z', c.blue, { stroke: c.ink, 'stroke-width': 0.75 }),
    strokePath('M5.2 11.5c1.5-1.2 3-.1 4.5 0s3-1.2 4.5 0 3 .1 4.5 0', c.glassLight, 1.1),
    strokePath('M7.3 7.5v7.5M10.3 7.5v7.5M7.3 9.6h3', c.ink, 0.9),
    ...plant(15.2, 5.8, 0.7),
  ], bg.leisure),
  'spa.svg': icon('Spa', [
    strokePath('M8.2 8.5c-1-1.2-.9-2.5.3-3.5M12 8.5c-1-1.2-.9-2.5.3-3.5M15.8 8.5c-1-1.2-.9-2.5.3-3.5', c.teal, 0.9),
    pathShape('M6.5 15.1c2.5-4.7 8.5-4.7 11 0-2.3 3.9-8.7 3.9-11 0Z', c.green, { stroke: c.ink, 'stroke-width': 0.75 }),
    pathShape('M12 11.4c1.2 1 1.2 4.7 0 5.8-1.2-1.1-1.2-4.8 0-5.8Z', c.white, { opacity: 0.75 }),
  ], bg.leisure),
  'conferenceCenter.svg': icon('Conference center', [
    ellipse(12, 13.7, 6.5, 2.7, c.wood, { stroke: c.ink, 'stroke-width': 0.75 }),
    ...people(3, 8.7),
    ...people(3, 17),
    line(7.1, 13.7, 16.9, 13.7, c.inkSoft, 0.7),
  ], bg.commercial),
  'eventSpace.svg': icon('Event space', [
    pathShape('M5.4 7h13.2v7.2H5.4Z', c.plum, { stroke: c.ink, 'stroke-width': 0.75 }),
    pathShape('M8.2 7v7.2M15.8 7v7.2', 'none', { stroke: c.red, 'stroke-width': 1.1 }),
    pathShape('M7.2 17.2h9.6v1.6H7.2Z', c.wood, { stroke: c.ink, 'stroke-width': 0.6 }),
    circle(8.5, 15.4, 0.8, c.gold),
    circle(12, 15.2, 0.8, c.gold),
    circle(15.5, 15.4, 0.8, c.gold),
  ], bg.leisure),
  'hotelReception.svg': icon('Hotel reception', [
    roundRect(6.1, 13.1, 11.8, 4.2, 0.8, c.wood, { stroke: c.ink, 'stroke-width': 0.75 }),
    circle(9.1, 11.6, 1.1, c.gold, { stroke: c.ink, 'stroke-width': 0.5 }),
    pathShape('M11.5 11.5h4.9l1.1 1.6h-7.1Z', c.gold, { stroke: c.ink, 'stroke-width': 0.55, 'stroke-linejoin': 'round' }),
    strokePath('M7.3 8.2h5.3c.8-1.3 2.5-1.3 3.3 0h1.4', c.ink, 1),
    ...plant(16, 7.4, 0.62),
  ], bg.hotel),
  'hotel1p.svg': icon('Single hotel room', [
    ...windowPair(5.7),
    ...bed(7.8, 14.1, c.blue),
    pathShape('M16.4 13.5h1.8v3.8h-1.8Z', c.wood, { stroke: c.ink, 'stroke-width': 0.45 }),
  ], bg.hotel),
  'hotel2p.svg': icon('Double hotel room', [
    ...windowPair(5.8),
    ...bed(4.9, 14.4, c.blue),
    ...bed(12.5, 14.4, c.green),
  ], bg.hotel),
  'hotelSuite.svg': icon('Hotel suite', [
    ...windowPair(5.6),
    ...bed(5.2, 14.2, c.plum),
    roundRect(13.8, 12.4, 4.5, 5.2, 0.9, c.teal, { stroke: c.ink, 'stroke-width': 0.5 }),
    strokePath('M14.2 10.8h3.8', c.gold, 1),
  ], bg.hotel),
  'housekeeping.svg': icon('Housekeeping', [
    roundRect(6, 11.2, 8.9, 6.3, 1, c.grayLight, { stroke: c.ink, 'stroke-width': 0.75 }),
    circle(8, 18, 0.9, c.dark),
    circle(13.2, 18, 0.9, c.dark),
    roundRect(7.1, 8.5, 5.8, 3.4, 0.75, c.white, { stroke: c.ink, 'stroke-width': 0.55 }),
    line(16.4, 8.1, 18.4, 18.2, c.wood, 1.1),
    pathShape('M16.6 7.5h3.2', 'none', { stroke: c.teal, 'stroke-width': 2.2, 'stroke-linecap': 'round' }),
  ], bg.hotel),
  'trashRoom.svg': icon('Trash room', [
    pathShape('M7.2 9.5h9.6l-.8 9H8Z', c.gray, { stroke: c.ink, 'stroke-width': 0.8, 'stroke-linejoin': 'round' }),
    pathShape('M8.1 7.5h7.8M10.2 7.5l.5-1.4h2.6l.5 1.4', 'none', { stroke: c.ink, 'stroke-width': 1, 'stroke-linecap': 'round' }),
    line(10, 11, 10.4, 16.6, c.inkSoft, 0.75),
    line(14, 11, 13.6, 16.6, c.inkSoft, 0.75),
    circle(16.8, 17.5, 1.2, c.red, { stroke: c.ink, 'stroke-width': 0.45 }),
  ], bg.service),
  'recyclingCenter.svg': icon('Recycling center', [
    strokePath('M12 6.3 15.4 9h-2.1l-1.2 2.1M15.7 13.2 14 17.2l-1.2-1.9h-2.5M8.8 15.7 6.8 12l2.2.1 1.3-2.3', c.greenDark, 1.35),
    circle(12, 12.2, 5.6, c.green, { opacity: 0.18 }),
    roundRect(5.3, 17.3, 13.4, 1.4, 0.5, c.teal),
  ], bg.service),
  'parkingRamp.svg': icon('Parking ramp', [
    ...car(12.5, 15.2, c.blue),
    strokePath('M5.2 15.6c4.4-6.1 8.5-6.8 13.5-6.8', c.ink, 1.8),
    strokePath('M5.2 17.9h13.5', c.ink, 1.3),
  ], bg.transit),
  'parkingSpace.svg': icon('Parking space', [
    ...car(12, 13.8, c.teal),
    strokePath('M5.3 7.1v11.4M18.7 7.1v11.4M7.4 8.2h9.2', c.white, 1),
    strokePath('M7.4 18h9.2', c.white, 1),
  ], bg.transit),
  'subway.svg': icon('Subway station', [
    roundRect(6, 6.2, 12, 10.8, 2, c.teal, { stroke: c.ink, 'stroke-width': 0.85 }),
    roundRect(7.4, 8, 3.7, 3.2, 0.7, c.glassLight),
    roundRect(12.9, 8, 3.7, 3.2, 0.7, c.glassLight),
    circle(8.6, 14.3, 0.9, c.gold),
    circle(15.4, 14.3, 0.9, c.gold),
    strokePath('M6 19h12M8 17.4l-2 2M16 17.4l2 2', c.ink, 0.9),
  ], bg.transit),
  'securityOffice.svg': icon('Security office', [
    pathShape('M12 5.6 17.8 8v4.3c0 3.7-2.2 5.7-5.8 7-3.6-1.3-5.8-3.3-5.8-7V8Z', c.blue, { stroke: c.ink, 'stroke-width': 0.8 }),
    circle(12, 12.2, 2.9, c.dark),
    circle(12, 12.2, 1.25, c.glassLight),
    strokePath('M12 8.7v-1.4M12 17v-1.4M15.5 12.2h1.4M7.1 12.2h1.4', c.gold, 0.8),
  ], bg.service),
  'medicalClinic.svg': icon('Medical clinic', [
    roundRect(6, 7.1, 12, 10.8, 2, c.white, { stroke: c.ink, 'stroke-width': 0.85 }),
    pathShape('M10.5 9.2h3v3h3v3h-3v3h-3v-3h-3v-3h3Z', c.red),
    circle(17.7, 7.4, 1.1, c.blue, { stroke: c.ink, 'stroke-width': 0.45 }),
  ], bg.service),
  'cathedral.svg': icon('Cathedral', [
    pathShape('M6.2 18.4V10.3L12 5l5.8 5.3v8.1Z', '#d9c7a6', { stroke: c.ink, 'stroke-width': 0.8, 'stroke-linejoin': 'round' }),
    pathShape('M10 18.4v-4.2a2 2 0 0 1 4 0v4.2Z', c.wood, { stroke: c.ink, 'stroke-width': 0.55 }),
    pathShape('M8.4 11.4a1.4 2.5 0 0 1 2.8 0v3H8.4Zm4.4 0a1.4 2.5 0 0 1 2.8 0v3h-2.8Z', c.plum),
    line(12, 4.3, 12, 7.1, c.gold, 1),
    line(10.8, 5.3, 13.2, 5.3, c.gold, 0.9),
  ], bg.leisure),
  'standard-elevator.svg': icon('Standard elevator', elevatorCab(c.gold), bg.elevator),
  'express-elevator.svg': icon('Express elevator', [
    ...elevatorCab(c.gold),
    pathShape('M14.1 6.3 10.3 12h2.4l-2.1 5.5 4.4-6.6h-2.5Z', c.gold, { stroke: c.ink, 'stroke-width': 0.45, 'stroke-linejoin': 'round' }),
  ], bg.elevator),
  'service-elevator.svg': icon('Service elevator', [
    ...elevatorCab(c.coral),
    strokePath('M9 8.3 15.7 15M14 7.9l1.8 1.8M8.2 13.9 10 15.7', c.coral, 1.45),
  ], bg.elevator),
  'glass-elevator.svg': icon('Glass elevator', [
    ...elevatorCab(c.teal, c.glass),
    strokePath('M9.5 7.2 8.5 9M15.3 12.4 14 14.9M10.5 16.2h3', c.white, 0.9),
  ], bg.elevator),
  'toolbar-build.svg': icon('Build mode', [
    pathShape('M6.4 16.5h5.3v-4.2h4.1v4.2h1.8V9.9L12 5.7 6.4 9.9Z', c.gold, { stroke: c.ink, 'stroke-width': 0.8, 'stroke-linejoin': 'round' }),
    strokePath('M13.9 6.3 18.4 3.7l1.2 2.1-4.4 2.6', c.wood, 1.4),
    circle(18.8, 3.8, 0.9, c.gray, { stroke: c.ink, 'stroke-width': 0.45 }),
  ], bg.status),
  'toolbar-run.svg': icon('Run mode', [
    pathShape('M8 6.2v11.6l10-5.8Z', c.green, { stroke: c.ink, 'stroke-width': 1.1, 'stroke-linejoin': 'round' }),
    circle(12, 12, 7.6, c.green, { opacity: 0.16 }),
  ], bg.status),
  'toolbar-financials.svg': icon('Financials', [
    ...speedBars(4, c.green),
    strokePath('M5.4 7.2h13.2M5.4 10.1h8.6', c.ink, 1),
    pathShape('M17.7 7.2c-2 .2-3.3 1.4-3.6 3.1-.4 2.6 1.9 4 4.3 4.3', 'none', { stroke: c.gold, 'stroke-width': 1.4, 'stroke-linecap': 'round' }),
  ], bg.status),
  'toolbar-saves.svg': icon('Save and load', [
    pathShape('M6.2 5.4h10.2l1.4 1.5v11.7H6.2Z', c.blue, { stroke: c.ink, 'stroke-width': 0.9, 'stroke-linejoin': 'round' }),
    pathShape('M8 6.6h6.2v4.2H8Z', c.white),
    pathShape('M8.4 14.1h7.2v4H8.4Z', c.grayLight, { stroke: c.ink, 'stroke-width': 0.45 }),
    circle(15.8, 8.3, 0.8, c.dark),
  ], bg.status),
  'toolbar-sound-on.svg': icon('Sound on', [
    pathShape('M5.3 10.1h3.2l4.1-3.2v10.2l-4.1-3.2H5.3Z', c.teal, { stroke: c.ink, 'stroke-width': 0.8, 'stroke-linejoin': 'round' }),
    strokePath('M15 9.1c1.6 1.5 1.6 4.3 0 5.8M17.5 7.2c2.7 2.8 2.7 6.7 0 9.6', c.gold, 1.15),
  ], bg.status),
  'toolbar-sound-off.svg': icon('Sound off', [
    pathShape('M5.3 10.1h3.2l4.1-3.2v10.2l-4.1-3.2H5.3Z', c.gray, { stroke: c.ink, 'stroke-width': 0.8, 'stroke-linejoin': 'round' }),
    strokePath('M16.1 9.2 20 15.1M20 9.2l-3.9 5.9', c.red, 1.5),
  ], bg.status),
  'toolbar-pause.svg': icon('Pause speed', [
    roundRect(7.4, 6, 3.7, 12, 1, c.gold, { stroke: c.ink, 'stroke-width': 0.9 }),
    roundRect(13, 6, 3.7, 12, 1, c.gold, { stroke: c.ink, 'stroke-width': 0.9 }),
  ], bg.status),
  'toolbar-speed-1.svg': icon('Speed one', [
    ...speedBars(1, c.green),
    pathShape('M8 9.8h6.2l-2.6-2.6M14.2 9.8l-2.6 2.6', 'none', { stroke: c.ink, 'stroke-width': 1.3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  ], bg.status),
  'toolbar-speed-2.svg': icon('Speed two', [
    ...speedBars(2, c.green),
    pathShape('M7.2 9.2h4.2L9.6 7.4M11.4 9.2 9.6 11M13.2 9.2h4.2l-1.8-1.8M17.4 9.2 15.6 11', 'none', { stroke: c.ink, 'stroke-width': 1.05, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  ], bg.status),
  'toolbar-speed-4.svg': icon('Speed four', [
    ...speedBars(4, c.gold),
    strokePath('M6.5 8.2h11', c.ink, 1.15),
    pathShape('M15.5 6.3 18.2 8.2l-2.7 1.9Z', c.ink),
  ], bg.status),
  'toolbar-speed-8.svg': icon('Speed eight', [
    ...speedBars(5, c.coral),
    strokePath('M5.8 7.9h12.4', c.ink, 1.15),
    pathShape('M16.2 5.9 19.2 7.9l-3 2Z', c.ink),
  ], bg.status),
  'toolbar-speed-16.svg': icon('Speed sixteen', [
    ...speedBars(5, c.red),
    strokePath('M5.5 7.7h13', c.ink, 1.15),
    pathShape('M16.5 5.5 20 7.7l-3.5 2.2Z', c.ink),
    strokePath('M6.2 5.6h6.8', c.gold, 1),
  ], bg.status),
  'overlay-none.svg': icon('No overlay', [
    roundRect(6.2, 7.1, 11.6, 9.8, 1.2, c.grayLight, { stroke: c.ink, 'stroke-width': 0.8 }),
    strokePath('M5.7 17.8 18.3 6.2', c.red, 1.5),
  ], bg.status),
  'overlay-noise.svg': icon('Noise overlay', [
    ...heatGrid([c.green, c.gold, c.red, c.green, c.gold, c.red]),
    strokePath('M6 18.5h12', c.ink, 0.9),
  ], bg.status),
  'overlay-congestion.svg': icon('Congestion overlay', [
    ...heatGrid([c.green, c.gold, c.red, c.gold, c.red, c.red]),
    strokePath('M7 7c3 5 7 5 10 10', c.ink, 0.8, { opacity: 0.7 }),
  ], bg.status),
  'star.svg': icon('Star rating', [star(12, 12, 6.1), circle(12, 12, 1.2, c.amber)], bg.status),
  'star-progress.svg': icon('Star progress', [
    star(8.3, 9, 3.2),
    roundRect(5.7, 15.4, 12.6, 2.8, 1.4, c.dark),
    roundRect(6.4, 16.1, 7.8, 1.4, 0.7, c.gold),
    circle(17.6, 16.8, 1.6, c.gold, { stroke: c.ink, 'stroke-width': 0.5 }),
  ], bg.status),
  'tower-crown.svg': icon('Tower status crown', [
    pathShape('M6.2 10.4 9 7.4l3 3.2 3-5 2.8 4.8v5.7H6.2Z', c.gold, { stroke: c.ink, 'stroke-width': 0.8, 'stroke-linejoin': 'round' }),
    roundRect(6.6, 16, 10.8, 2.1, 0.65, c.amber, { stroke: c.ink, 'stroke-width': 0.55 }),
    circle(9, 10.7, 0.8, c.white),
    circle(15, 10.7, 0.8, c.white),
  ], bg.status),
  'vip.svg': icon('VIP', [
    circle(12, 7.2, 2.2, c.gold, { stroke: c.ink, 'stroke-width': 0.75 }),
    pathShape('M8.1 18.6v-5.1c0-2.3 1.6-3.6 3.9-3.6s3.9 1.3 3.9 3.6v5.1Z', c.plum, { stroke: c.ink, 'stroke-width': 0.8 }),
    pathShape('M8.2 11.2h7.6l-1.1 3.5-2.7-1.5-2.7 1.5Z', c.gold),
    strokePath('M6.1 7.8 4.7 5.7M17.9 7.8l1.4-2.1', c.gold, 1.1),
  ], bg.status),
  'incident-warning.svg': icon('Warning', [
    pathShape('M12 5.3 19.1 18H4.9Z', c.gold, { stroke: c.ink, 'stroke-width': 0.9, 'stroke-linejoin': 'round' }),
    line(12, 9.8, 12, 14.1, c.ink, 1.6),
    circle(12, 16.2, 0.85, c.ink),
  ], bg.incident),
  'incident-bomb-threat.svg': icon('Bomb threat', [
    circle(11, 14.4, 4.7, c.dark, { stroke: c.ink, 'stroke-width': 0.8 }),
    pathShape('M12.8 9.6c1.1-2.8 3.8-3.6 5.5-1.8', 'none', { stroke: c.wood, 'stroke-width': 1.1, 'stroke-linecap': 'round' }),
    circle(18.8, 7.4, 1.15, c.red, { stroke: c.ink, 'stroke-width': 0.45 }),
    strokePath('M8.8 12.5c1.1-.8 2.7-.9 4.3 0', c.grayLight, 0.8),
  ], bg.incident),
  'incident-cockroach.svg': icon('Cockroach infestation', [
    ellipse(12, 13.2, 4.2, 5.2, c.wood, { stroke: c.ink, 'stroke-width': 0.8 }),
    ellipse(12, 8.5, 2.6, 2.3, c.wood, { stroke: c.ink, 'stroke-width': 0.65 }),
    strokePath('M8.2 10.7 5.5 8.3M15.8 10.7l2.7-2.4M7.9 13.5H5.1M16.1 13.5h2.8M8.6 16.4l-2.4 2M15.4 16.4l2.4 2', c.ink, 0.85),
    line(12, 9.7, 12, 18, c.inkSoft, 0.65),
  ], bg.incident),
  'incident-repair.svg': icon('Repair incident', [
    strokePath('M7 17.2 16.8 7.4', c.wood, 2),
    pathShape('M15.1 5.7c1.5-1 3.2-.8 4.2.1l-2.2 2.2 1.1 1.1 2.2-2.2c.9 1 .9 2.8-.1 4.2-1.1 1.6-3.5 1.9-5.2.2s-1.6-4.4 0-5.6Z', c.grayLight, { stroke: c.ink, 'stroke-width': 0.55 }),
    circle(7, 17.2, 1.7, c.coral, { stroke: c.ink, 'stroke-width': 0.55 }),
  ], bg.incident),
  'incident-request.svg': icon('Tenant request', [
    pathShape('M6.2 6.2h11.6v9.5h-5L9 18.8v-3.1H6.2Z', c.white, { stroke: c.ink, 'stroke-width': 0.8, 'stroke-linejoin': 'round' }),
    circle(9.4, 11, 0.8, c.blue),
    circle(12, 11, 0.8, c.gold),
    circle(14.6, 11, 0.8, c.green),
  ], bg.incident),
  'incident-vacancy.svg': icon('Vacancy', [
    pathShape('M6.2 18.3V8.4h11.6v9.9', c.white, { stroke: c.ink, 'stroke-width': 0.8 }),
    pathShape('M8.6 18.3v-6.4h6.8v6.4', c.grayLight, { stroke: c.ink, 'stroke-width': 0.65 }),
    strokePath('M6.4 7.7h11.2M8.5 5.7h7', c.red, 1.3),
    circle(13.9, 15.4, 0.45, c.gold),
  ], bg.incident),
}

await mkdir(iconRoot, { recursive: true })
await Promise.all(
  Object.entries(icons).map(([fileName, contents]) => writeFile(path.join(iconRoot, fileName), contents, 'utf8')),
)

console.log(`Wrote ${Object.keys(icons).length} Tower Throwback HUD icons.`)
