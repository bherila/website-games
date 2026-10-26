import { type Dial, dialSlotPosition } from './dial'
import type { Plate, Point3, PuzzleLevel, Screw, ScrewColor } from './level'

/** A part mounted on the outside of another: one panel thickness out, so their faces just clear. */
const PROUD = 0.27
/** How far proud of its host a dial turns: just clear of the heads behind it. */
const DIAL_PROUD = 0.32

/** A level's colors: one per screw id, and the order its trays open in. */
export interface RailwayPalette { screws: Record<string, ScrewColor>, trays: readonly ScrewColor[] }

const cross = (a: Point3, b: Point3): Point3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

/** A point on a plate's face, in world space: local X/Y, and `out` along its normal. */
function onFace(plate: Pick<Plate, 'position' | 'normal' | 'up'>, [x, y]: readonly [number, number], out = 0): Point3 {
  const right = cross(plate.up, plate.normal)
  return [0, 1, 2].map((axis) => plate.position[axis]! + right[axis]! * x + plate.up[axis]! * y + plate.normal[axis]! * out) as unknown as Point3
}

/**
 * A dial turning just proud of its host, centred at `centre` on the host's face,
 * and the heads behind it, one per slot, named `<id>-<slot>`.
 */
function mountDial(host: Plate, id: string, name: string, centre: readonly [number, number], dial: Dial, color: string, colors: Record<string, ScrewColor>): { plate: Plate, heads: Screw[] } {
  const size = (dial.windowRadius + 0.4) * 2
  const plate: Plate = { id, name, position: onFace(host, centre, DIAL_PROUD), size: [size, size], normal: host.normal, up: host.up, host: host.id, dial, finish: 'dial', color }
  const heads = Array.from({ length: dial.stops }, (_, slot): Screw => {
    const [x, y] = dialSlotPosition(dial, slot)
    return { id: `${id}-${slot}`, plate: host.id, color: colors[`${id}-${slot}`]!, position: [centre[0] + x, centre[1] + y], underDial: { dial: id, slot } }
  })
  return { plate, heads }
}

/** The stop pin sits just above a dial's rim, where the stop on the disc catches it. */
const pinAbove = (centre: readonly [number, number], dial: Dial): readonly [number, number] => [centre[0], centre[1] + dial.windowRadius + 0.4 + 0.3]

const paint = (screws: readonly Omit<Screw, 'color'>[], colors: Record<string, ScrewColor>): Screw[] => screws.map((screw) => ({ ...screw, color: colors[screw.id]! }) as Screw)

/** Level 16. A toy engine on a wooden track: a smokebox dial with one window and a stop pin above it. */
export function toySteamEngine({ screws: colors, trays }: RailwayPalette): PuzzleLevel {
  const smokebox: Plate = { id: 'smokebox', name: 'Smokebox front', position: [0, -0.3, 1.3], size: [2.4, 2.5], normal: [0, 0, 1], up: [0, 1, 0], finish: 'loco', color: '#2f3b40' }
  const dial: Dial = { stops: 4, windows: [2], windowRadius: 0.5, pins: ['smokebox-pin'] }
  const centre = [0, -0.2] as const
  const door = mountDial(smokebox, 'smokebox-door', 'Smokebox door', centre, dial, '#c9a64b', colors)
  return {
    id: 16, name: 'Toy Steam Engine', spareCapacity: 3, overflowLoses: true, trayColors: trays, stage: 'toy-track',
    introduction: 'The smokebox door is a dial. The stop pin above it holds it still: take the pin out, then turn the dial to bring its window over each screw behind it.',
    plates: [
      smokebox,
      door.plate,
      { id: 'side-left', name: 'Left boiler side', position: [-1.2, -0.3, 0], size: [2.6, 2.5], normal: [-1, 0, 0], up: [0, 1, 0], finish: 'loco', color: '#b8382f' },
      { id: 'side-right', name: 'Right boiler side', position: [1.2, -0.3, 0], size: [2.6, 2.5], normal: [1, 0, 0], up: [0, 1, 0], finish: 'loco', color: '#b8382f' },
      { id: 'cab-back', name: 'Cab back', position: [0, -0.3, -1.3], size: [2.4, 2.5], normal: [0, 0, -1], up: [0, 1, 0], finish: 'loco', color: '#2f6f4f' },
      { id: 'boiler-top', name: 'Boiler top', position: [0, 1.08, 0], size: [2.6, 2.8], normal: [0, 1, 0], up: [0, 0, -1], restsOn: ['side-left', 'side-right'], finish: 'loco', color: '#2f6f4f' },
      { id: 'chimney', name: 'Chimney', position: [0, 1.75, 0.75], size: [0.9, 1.1], normal: [0, 0, 1], up: [0, 1, 0], outline: [[-0.3, -0.55], [0.3, -0.55], [0.45, 0.55], [-0.45, 0.55]], restsOn: ['boiler-top'], finish: 'loco', color: '#2f3b40' },
    ],
    screws: [
      ...paint([
        { id: 'smokebox-pin', plate: 'smokebox', position: pinAbove(centre, dial) },
        { id: 'side-left-1', plate: 'side-left', position: [-0.6, 0.2] },
        { id: 'side-left-2', plate: 'side-left', position: [0.6, 0.2] },
        { id: 'side-right-1', plate: 'side-right', position: [0, 0.2] },
        { id: 'cab-back-1', plate: 'cab-back', position: [0, 0.2] },
        { id: 'boiler-top-1', plate: 'boiler-top', position: [-0.6, 0.3] },
        { id: 'boiler-top-2', plate: 'boiler-top', position: [0.6, 0.3] },
        { id: 'chimney-1', plate: 'chimney', position: [0, 0.1] },
      ], colors),
      ...door.heads,
    ],
  }
}

/** Level 17. A music box: a tune dial with two windows side by side, and a lid that opens clear of everything. */
export function musicBox({ screws: colors, trays }: RailwayPalette): PuzzleLevel {
  const front: Plate = { id: 'front', name: 'Box front', position: [0, -0.25, 1.0], size: [3.2, 2.6], normal: [0, 0, 1], up: [0, 1, 0], finish: 'lacquer', color: '#7a3f2a' }
  const dial: Dial = { stops: 4, windows: [2, 3], windowRadius: 0.5, pins: ['front-pin'] }
  const centre = [-0.5, -0.25] as const
  const tune = mountDial(front, 'tune-dial', 'Tune dial', centre, dial, '#c9a64b', colors)
  return {
    id: 17, name: 'Music Box', spareCapacity: 3, overflowLoses: true, trayColors: trays, stage: 'parlour',
    introduction: 'The tune dial has two windows, so every stop shows two screws behind it. The lid swings up out of the way once its screw is out.',
    plates: [
      front,
      tune.plate,
      { id: 'back', name: 'Box back', position: [0, -0.25, -1.0], size: [3.2, 2.6], normal: [0, 0, -1], up: [0, 1, 0], finish: 'lacquer', color: '#7a3f2a' },
      { id: 'end-left', name: 'Left end', position: [-1.6, -0.25, 0], size: [2.0, 2.6], normal: [-1, 0, 0], up: [0, 1, 0], finish: 'lacquer', color: '#86492f' },
      { id: 'end-right', name: 'Right end', position: [1.6, -0.25, 0], size: [2.0, 2.6], normal: [1, 0, 0], up: [0, 1, 0], finish: 'lacquer', color: '#86492f' },
      // The movement's deck spans the two ends just below the lid, so its screws show once the lid is up.
      { id: 'deck', name: 'Movement deck', position: [0, 0.75, 0], size: [2.9, 1.7], normal: [0, 1, 0], up: [0, 0, -1], restsOn: ['end-left', 'end-right'], finish: 'beam', color: '#b08d3c' },
      // The lid overhangs the back, so it stands clear of it once it swings up on its hinge. Until
      // then it rests on the back, which keeps its screw while the lid is screwed down.
      { id: 'lid', name: 'Lid', position: [0, 1.18, -0.1], size: [3.4, 2.4], normal: [0, 1, 0], up: [0, 0, -1], hinge: 'top', hingeAngle: Math.PI * 0.55, host: 'back', restsOn: ['back'], finish: 'lacquer', color: '#6b3322' },
    ],
    screws: [
      ...paint([
        { id: 'front-pin', plate: 'front', position: pinAbove(centre, dial) },
        { id: 'front-2', plate: 'front', position: [1.0, -0.3] },
        { id: 'back-1', plate: 'back', position: [0, -0.3] },
        { id: 'end-left-1', plate: 'end-left', position: [0, -0.3] },
        { id: 'end-right-1', plate: 'end-right', position: [0, -0.3] },
        { id: 'deck-1', plate: 'deck', position: [-0.8, 0], blockedBy: ['lid'] },
        { id: 'deck-2', plate: 'deck', position: [0.8, 0], blockedBy: ['lid'] },
        { id: 'lid-1', plate: 'lid', position: [-1.1, -0.6] },
      ], colors),
      ...tune.heads,
    ],
  }
}

/** Level 18. A station clock on its pedestal: the clock face is a dial; Pearl, the fifth color, arrives. */
export function stationClock({ screws: colors, trays }: RailwayPalette): PuzzleLevel {
  const face: Plate = { id: 'face', name: 'Clock front', position: [0, 0.3, 1.0], size: [2.4, 2.5], normal: [0, 0, 1], up: [0, 1, 0], finish: 'loco', color: '#24413a' }
  const dial: Dial = { stops: 4, windows: [2], windowRadius: 0.5, pins: ['face-pin'] }
  const centre = [0, -0.2] as const
  const clock = mountDial(face, 'clock-face', 'Clock face', centre, dial, '#f1ead8', colors)
  return {
    id: 18, name: 'Station Clock', spareCapacity: 3, overflowLoses: true, trayColors: trays, stage: 'platform',
    introduction: 'Pearl joins the colors: its screws have a hex socket. Five colors share the two trays, so watch the queue.',
    plates: [
      face,
      clock.plate,
      { id: 'back', name: 'Clock back', position: [0, 0.3, -1.0], size: [2.4, 2.5], normal: [0, 0, -1], up: [0, 1, 0], finish: 'loco', color: '#24413a' },
      { id: 'left', name: 'Left side', position: [-1.2, 0.3, 0], size: [2.0, 2.5], normal: [-1, 0, 0], up: [0, 1, 0], finish: 'loco', color: '#2c4d44' },
      { id: 'right', name: 'Right side', position: [1.2, 0.3, 0], size: [2.0, 2.5], normal: [1, 0, 0], up: [0, 1, 0], finish: 'loco', color: '#2c4d44' },
      { id: 'roof', name: 'Clock roof', position: [0, 1.68, 0], size: [2.6, 2.2], normal: [0, 1, 0], up: [0, 0, -1], restsOn: ['left', 'right'], finish: 'loco', color: '#1d332d' },
    ],
    screws: [
      ...paint([
        { id: 'face-pin', plate: 'face', position: pinAbove(centre, dial) },
        { id: 'back-1', plate: 'back', position: [-0.65, 0.5] },
        { id: 'back-2', plate: 'back', position: [0.65, 0.5] },
        { id: 'back-3', plate: 'back', position: [0, -0.5] },
        { id: 'left-1', plate: 'left', position: [-0.45, 0.3] },
        { id: 'left-2', plate: 'left', position: [0.45, -0.4] },
        { id: 'right-1', plate: 'right', position: [-0.45, 0.3] },
        { id: 'right-2', plate: 'right', position: [0.45, -0.4] },
        { id: 'roof-1', plate: 'roof', position: [-0.8, 0.55] },
        { id: 'roof-2', plate: 'roof', position: [0.8, 0.55] },
        { id: 'roof-3', plate: 'roof', position: [0, -0.6] },
      ], colors),
      ...clock.heads,
    ],
  }
}

/** Level 19. A signal box: two selector dials on different faces, and a shutter that drops onto the brick base. */
export function signalBox({ screws: colors, trays }: RailwayPalette): PuzzleLevel {
  const capRun = 1.5
  const capRise = 0.7
  const capLength = Math.hypot(capRun, capRise)
  const front: Plate = { id: 'front', name: 'Cabin front', position: [0, -0.25, 1.1], size: [3.0, 2.6], normal: [0, 0, 1], up: [0, 1, 0], gableRise: capRise, finish: 'plank', color: '#8f3b2e' }
  const side: Plate = { id: 'right', name: 'Right side', position: [1.5, -0.25, 0], size: [2.2, 2.6], normal: [1, 0, 0], up: [0, 1, 0], finish: 'plank', color: '#9a4434' }
  const selector = (pin: string): Dial => ({ stops: 3, windows: [1], windowRadius: 0.45, pins: [pin] })
  const frontCentre = [-0.6, -0.25] as const
  const sideCentre = [0, -0.35] as const
  const up = mountDial(front, 'front-selector', 'Front selector', frontCentre, selector('front-pin'), '#c9a64b', colors)
  const down = mountDial(side, 'side-selector', 'Side selector', sideCentre, selector('right-pin'), '#9fb4bd', colors)
  return {
    id: 19, name: 'Signal Box', spareCapacity: 3, overflowLoses: true, trayColors: trays, stage: 'lineside',
    introduction: 'Two selector dials, each with its own stop pin. Turning one moves only that dial, so choose which selector to work first.',
    plates: [
      front,
      up.plate,
      side,
      down.plate,
      { id: 'left', name: 'Left side', position: [-1.5, -0.25, 0], size: [2.2, 2.6], normal: [-1, 0, 0], up: [0, 1, 0], finish: 'plank', color: '#9a4434' },
      { id: 'back', name: 'Cabin back', position: [0, 0.15, -1.1], size: [3.0, 1.8], normal: [0, 0, -1], up: [0, 1, 0], gableRise: capRise, finish: 'plank', color: '#8f3b2e' },
      { id: 'base-back', name: 'Brick base', position: [0, -1.15, -1.1], size: [3.0, 0.8], normal: [0, 0, -1], up: [0, 1, 0], finish: 'stone', color: '#b5654a' },
      { id: 'shutter', name: 'Window shutter', position: [0.6, 0.4, -1.1 - PROUD], size: [1.2, 0.7], normal: [0, 0, -1], up: [0, 1, 0], rail: { along: [0, -1, 0], travel: 1.5 }, host: 'back', finish: 'plank', color: '#2f5d74' },
      { id: 'roof-left', name: 'Left roof slope', position: [-capRun / 2, 1.42, 0], size: [2.6, capLength], normal: [-capRise / capLength, capRun / capLength, 0], up: [capRun / capLength, capRise / capLength, 0], restsOn: ['front', 'back'], finish: 'roof', color: '#4a5560' },
      { id: 'roof-right', name: 'Right roof slope', position: [capRun / 2, 1.42, 0], size: [2.6, capLength], normal: [capRise / capLength, capRun / capLength, 0], up: [-capRun / capLength, capRise / capLength, 0], restsOn: ['front', 'back'], finish: 'roof', color: '#4a5560' },
    ],
    screws: [
      ...paint([
        { id: 'front-pin', plate: 'front', position: pinAbove(frontCentre, up.plate.dial!) },
        { id: 'right-pin', plate: 'right', position: pinAbove(sideCentre, down.plate.dial!) },
        { id: 'left-1', plate: 'left', position: [0, 0] },
        // The back faces -z, so its local x runs toward -x: the shutter at world x 0.6 is at local -0.6.
        { id: 'back-1', plate: 'back', position: [-0.6, 0.25], blockedBy: ['shutter'] },
        { id: 'shutter-1', plate: 'shutter', position: [0, 0.1] },
        { id: 'base-back-1', plate: 'base-back', position: [-0.6, 0.05], coveredWhenOpen: ['shutter'] },
        { id: 'base-back-2', plate: 'base-back', position: [0.8, 0] },
        { id: 'roof-left-1', plate: 'roof-left', position: [0, 0] },
        { id: 'roof-right-1', plate: 'roof-right', position: [0, 0] },
      ], colors),
      ...up.heads,
      ...down.heads,
    ],
  }
}

/**
 * Level 20. The railway's assessment: an engine and its tender. A coupling pin
 * runs through both drawbars, the tender's body stands on its own drawbar, and
 * the coal hatch on the tender's back drops open over the screw below it.
 */
export function locomotive({ screws: colors, trays }: RailwayPalette): PuzzleLevel {
  const smokebox: Plate = { id: 'smokebox', name: 'Smokebox front', position: [2.5, -0.3, 0], size: [2.0, 2.5], normal: [1, 0, 0], up: [0, 1, 0], finish: 'loco', color: '#2f3b40' }
  const dial: Dial = { stops: 4, windows: [2], windowRadius: 0.5, pins: ['smokebox-pin'] }
  const centre = [0, -0.2] as const
  const door = mountDial(smokebox, 'smokebox-door', 'Smokebox door', centre, dial, '#c9a64b', colors)
  const tenderEnd = -2.3
  return {
    id: 20, name: 'Locomotive', spareCapacity: 3, overflowLoses: true, trayColors: trays, stage: 'railway',
    plates: [
      smokebox,
      door.plate,
      { id: 'engine-near', name: 'Engine near side', position: [1.3, -0.3, 1.0], size: [2.4, 2.5], normal: [0, 0, 1], up: [0, 1, 0], finish: 'loco', color: '#2f6f4f' },
      { id: 'engine-far', name: 'Engine far side', position: [1.3, -0.3, -1.0], size: [2.4, 2.5], normal: [0, 0, -1], up: [0, 1, 0], finish: 'loco', color: '#2f6f4f' },
      { id: 'boiler-top', name: 'Boiler top', position: [1.3, 1.08, 0], size: [2.2, 2.6], normal: [0, 1, 0], up: [-1, 0, 0], restsOn: ['engine-near', 'engine-far'], finish: 'loco', color: '#24563d' },
      // The drawbars overlap in the gap between engine and tender; the coupling pin drops through both.
      { id: 'engine-drawbar', name: 'Engine drawbar', position: [-0.3, -1.0, 0], size: [1.0, 0.8], normal: [0, 1, 0], up: [-1, 0, 0], finish: 'beam', color: '#3d4a52' },
      { id: 'tender-drawbar', name: 'Tender drawbar', position: [-0.45, -1.38, 0], size: [1.3, 0.8], normal: [0, 1, 0], up: [-1, 0, 0], finish: 'beam', color: '#56636b' },
      { id: 'tender-near', name: 'Tender near side', position: [-1.5, -0.55, 0.95], size: [1.6, 2.0], normal: [0, 0, 1], up: [0, 1, 0], restsOn: ['tender-drawbar'], finish: 'loco', color: '#2f6f4f' },
      { id: 'tender-far', name: 'Tender far side', position: [-1.5, -0.55, -0.95], size: [1.6, 2.0], normal: [0, 0, -1], up: [0, 1, 0], restsOn: ['tender-drawbar'], finish: 'loco', color: '#2f6f4f' },
      { id: 'tender-back', name: 'Tender back', position: [tenderEnd, -0.55, 0], size: [1.9, 2.0], normal: [-1, 0, 0], up: [0, 1, 0], finish: 'loco', color: '#24563d' },
      { id: 'bunker-rail', name: 'Bunker rail', position: [tenderEnd - PROUD, -0.4, 0], size: [1.5, 0.6], normal: [-1, 0, 0], up: [0, 1, 0], finish: 'beam', color: '#3d4a52' },
      { id: 'coal-hatch', name: 'Coal hatch', position: [tenderEnd - PROUD * 2, -0.35, 0], size: [1.0, 0.7], normal: [-1, 0, 0], up: [0, 1, 0], hinge: 'bottom', hingeAngle: Math.PI, host: 'bunker-rail', finish: 'plank', color: '#4b3a2c' },
    ],
    screws: [
      ...paint([
        { id: 'smokebox-pin', plate: 'smokebox', position: pinAbove(centre, dial) },
        { id: 'engine-near-1', plate: 'engine-near', position: [0, 0.2] },
        { id: 'engine-far-1', plate: 'engine-far', position: [0, 0.2] },
        { id: 'boiler-top-1', plate: 'boiler-top', position: [-0.6, 0.4] },
        { id: 'boiler-top-2', plate: 'boiler-top', position: [0.6, -0.4] },
        { id: 'coupling-pin', plate: 'engine-drawbar', through: ['tender-drawbar'], position: [0, 0] },
        { id: 'tender-near-1', plate: 'tender-near', position: [0, 0.2] },
        { id: 'tender-far-1', plate: 'tender-far', position: [0, 0.2] },
        // Below the hatch's hinge: the open hatch hangs over it until the bunker rail comes off.
        { id: 'tender-back-1', plate: 'tender-back', position: [0, -0.5], coveredWhenOpen: ['coal-hatch'] },
        { id: 'bunker-rail-1', plate: 'bunker-rail', position: [0, 0.05], blockedBy: ['coal-hatch'] },
        { id: 'coal-hatch-1', plate: 'coal-hatch', position: [0, 0.1] },
      ], colors),
      ...door.heads,
    ],
  }
}

/** Colors chosen by a search through the solver (see the railway tests for each level's numbers). */
export const RAILWAY_PALETTES: Record<16 | 17 | 18 | 19 | 20, RailwayPalette> = {
  16: {
    trays: ['mint', 'blue', 'amber', 'coral'],
    screws: {
      'smokebox-pin': 'blue', 'side-left-1': 'amber', 'side-left-2': 'coral', 'side-right-1': 'amber', 'cab-back-1': 'coral', 'boiler-top-1': 'amber', 'boiler-top-2': 'blue', 'chimney-1': 'mint',
      'smokebox-door-0': 'mint', 'smokebox-door-1': 'blue', 'smokebox-door-2': 'coral', 'smokebox-door-3': 'mint',
    },
  },
  17: {
    trays: ['mint', 'amber', 'coral', 'blue'],
    screws: {
      'front-pin': 'coral', 'front-2': 'amber', 'back-1': 'mint', 'end-left-1': 'blue', 'end-right-1': 'mint', 'deck-1': 'coral', 'deck-2': 'coral', 'lid-1': 'amber',
      'tune-dial-0': 'amber', 'tune-dial-1': 'mint', 'tune-dial-2': 'blue', 'tune-dial-3': 'blue',
    },
  },
  18: {
    trays: ['blue', 'coral', 'pearl', 'amber', 'mint'],
    screws: {
      'face-pin': 'blue', 'back-1': 'blue', 'back-2': 'pearl', 'back-3': 'blue', 'left-1': 'pearl', 'left-2': 'pearl', 'right-1': 'amber', 'right-2': 'amber', 'roof-1': 'coral', 'roof-2': 'mint', 'roof-3': 'coral',
      'clock-face-0': 'amber', 'clock-face-1': 'mint', 'clock-face-2': 'coral', 'clock-face-3': 'mint',
    },
  },
  19: {
    trays: ['pearl', 'mint', 'amber', 'coral', 'blue'],
    screws: {
      'front-pin': 'mint', 'right-pin': 'amber', 'left-1': 'pearl', 'back-1': 'blue', 'shutter-1': 'coral', 'base-back-1': 'amber', 'base-back-2': 'mint', 'roof-left-1': 'coral', 'roof-right-1': 'mint',
      'front-selector-0': 'amber', 'front-selector-1': 'coral', 'front-selector-2': 'pearl', 'side-selector-0': 'blue', 'side-selector-1': 'pearl', 'side-selector-2': 'blue',
    },
  },
  20: {
    trays: ['pearl', 'blue', 'amber', 'coral', 'mint'],
    screws: {
      'smokebox-pin': 'pearl', 'engine-near-1': 'coral', 'engine-far-1': 'amber', 'boiler-top-1': 'mint', 'boiler-top-2': 'blue', 'coupling-pin': 'coral', 'tender-near-1': 'pearl', 'tender-far-1': 'coral',
      'tender-back-1': 'blue', 'bunker-rail-1': 'mint', 'coal-hatch-1': 'amber', 'smokebox-door-0': 'pearl', 'smokebox-door-1': 'mint', 'smokebox-door-2': 'amber', 'smokebox-door-3': 'blue',
    },
  },
}

/** Levels 16–20 on the railway: dials, each held by a stop pin until it comes out. */
export function createRailwayLevels(palettes = RAILWAY_PALETTES): PuzzleLevel[] {
  return [toySteamEngine(palettes[16]), musicBox(palettes[17]), stationClock(palettes[18]), signalBox(palettes[19]), locomotive(palettes[20])]
}
