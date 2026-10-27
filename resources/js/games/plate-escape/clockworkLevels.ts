import { type Dial, dialSlotPosition } from './dial'
import type { Plate, Point3, PuzzleLevel, Screw, ScrewColor } from './level'

/** A part mounted on the outside of another: one panel thickness out, so their faces just clear. */
const PROUD = 0.27

/** A screw's color is chosen by the solver search; the layout is authored here. */
type Uncolored = Omit<Screw, 'color'>

function colored(screws: readonly Uncolored[], colors: Record<string, ScrewColor>): Screw[] {
  return screws.map((screw) => ({ ...screw, color: colors[screw.id]! }))
}

/** A point on a panel, in world space: its local X/Y, `out` in front of its face. */
function onFace(plate: Pick<Plate, 'position' | 'normal' | 'up'>, x: number, y: number, out = 0): Point3 {
  const [nx, ny, nz] = plate.normal
  const [ux, uy, uz] = plate.up
  // Local X is up × normal.
  const [rx, ry, rz] = [uy * nz - uz * ny, uz * nx - ux * nz, ux * ny - uy * nx]
  return [
    plate.position[0] + rx * x + ux * y + nx * out,
    plate.position[1] + ry * x + uy * y + ny * out,
    plate.position[2] + rz * x + uz * y + nz * out,
  ]
}

/** A pitched roof slope over a gabled case, sloping down toward `side`. */
function roofSlope(id: string, name: string, side: -1 | 1, run: number, rise: number, ridge: number, depth: number, color: string, restsOn: readonly string[]): Plate {
  const length = Math.hypot(run, rise)
  const sin = rise / length
  const cos = run / length
  return {
    id, name, position: [side * run / 2, ridge - rise / 2, 0], size: [depth, length],
    normal: [side * sin, cos, 0], up: [-side * cos, sin, 0], restsOn, finish: 'roof', color,
  }
}

/**
 * Levels 21–25, the clockworks. Linked counterweights arrive here: a weight
 * plate hangs on a cord over pulleys to another part. Take the weight's screws
 * out and it drops to the end of its cord, and the cord pulls the part it
 * drives to a fixed open position, where it covers nothing.
 */
export function createClockworkLevels(): PuzzleLevel[] {
  return [cuckooClock(), liftCage(), drawbridge(), gramophone(), clockworkRobot()]
}

interface Sash {
  weight: { id: string, name: string, at: readonly [number, number], size: readonly [number, number], color: string }
  part: { id: string, name: string, at: readonly [number, number], size: readonly [number, number], finish: Plate['finish'], color: string }
  /** How far the weight drops, and so how far the part rises. */
  travel: number
  /** How high up the wall the two pulleys sit, one above each. */
  pulleys: number
}

/**
 * A weight and the part it lifts, side by side on one wall like a sash window:
 * the cord runs up from the weight over a pulley, across to a pulley above the
 * part and down to it, so the weight drops exactly as far as the part rises.
 */
function sash(host: Plate, { weight, part, travel, pulleys }: Sash): [Plate, Plate] {
  const frame = { normal: host.normal, up: host.up }
  return [
    {
      id: weight.id, name: weight.name, position: onFace(host, ...weight.at, PROUD), size: weight.size, ...frame,
      rail: { along: [0, -1, 0], travel }, host: host.id, finish: 'weight', color: weight.color,
    },
    {
      id: part.id, name: part.name, position: onFace(host, ...part.at, PROUD), size: part.size, ...frame,
      rail: { along: [0, 1, 0], travel }, host: host.id, drivenBy: weight.id, finish: part.finish, color: part.color,
      cord: [onFace(host, weight.at[0], pulleys, PROUD), onFace(host, part.at[0], pulleys, PROUD)],
    },
  ]
}

/**
 * A cuckoo clock on a dresser. The pinecone weight hangs on the case front; its
 * chain runs up over two pulleys to the little door over the cuckoo's perch,
 * like a sash window: the weight drops as far as the door rises.
 */
function cuckooClock(): PuzzleLevel {
  const front: Plate = { id: 'front', name: 'Case front', position: [0, -0.3, 0.7], size: [2.4, 2.4], normal: [0, 0, 1], up: [0, 1, 0], gableRise: 0.8, finish: 'clock', color: '#8a5a36' }
  const door: Plate = {
    id: 'door', name: 'Cuckoo door', position: onFace(front, 0, 0.7, PROUD), size: [0.6, 0.55], normal: [0, 0, 1], up: [0, 1, 0],
    rail: { along: [0, 1, 0], travel: 0.6 }, host: 'front', drivenBy: 'weight',
    // Up from the weight, along under the gable to its peak, then down to the door.
    cord: [onFace(front, -0.75, 0.98, PROUD), onFace(front, 0, 1.66, PROUD)],
    finish: 'case', color: '#c98a4b',
  }
  const weight: Plate = {
    id: 'weight', name: 'Pinecone weight', position: onFace(front, -0.75, -0.3, PROUD), size: [0.56, 0.8], normal: [0, 0, 1], up: [0, 1, 0],
    rail: { along: [0, -1, 0], travel: 0.6 }, host: 'front', finish: 'weight', color: '#5b4330',
    outline: [[-0.2, 0.4], [0.2, 0.4], [0.28, 0.22], [0.27, -0.12], [0.12, -0.38], [-0.12, -0.38], [-0.27, -0.12], [-0.28, 0.22]],
  }
  const plates: Plate[] = [
    front,
    { id: 'back', name: 'Case back', position: [0, -0.3, -0.7], size: [2.4, 2.4], normal: [0, 0, -1], up: [0, 1, 0], gableRise: 0.8, finish: 'case', color: '#7a4e2f' },
    { id: 'left', name: 'Left side', position: [-1.2, -0.3, 0], size: [1.4, 2.4], normal: [-1, 0, 0], up: [0, 1, 0], finish: 'case', color: '#93623c' },
    { id: 'right', name: 'Right side', position: [1.2, -0.3, 0], size: [1.4, 2.4], normal: [1, 0, 0], up: [0, 1, 0], finish: 'case', color: '#93623c' },
    roofSlope('roof-left', 'Left roof slope', -1, 1.45, 0.967, 1.85, 1.8, '#4f6b3a', ['front', 'back']),
    roofSlope('roof-right', 'Right roof slope', 1, 1.45, 0.967, 1.85, 1.8, '#4f6b3a', ['front', 'back']),
    door,
    weight,
  ]
  const screws: Uncolored[] = [
    // The cuckoo's perch, behind its door.
    { id: 'perch', plate: 'front', position: [0, 0.7], blockedBy: ['door'] },
    { id: 'front-1', plate: 'front', position: [0.8, 0.55] },
    { id: 'front-2', plate: 'front', position: [0.75, -0.75] },
    { id: 'back-1', plate: 'back', position: [-0.8, 0.5] },
    { id: 'back-2', plate: 'back', position: [0.8, 0.5] },
    { id: 'back-3', plate: 'back', position: [0, -0.7] },
    { id: 'left-1', plate: 'left', position: [0, 0.55] },
    { id: 'left-2', plate: 'left', position: [0, -0.65] },
    { id: 'right-1', plate: 'right', position: [0, 0.55] },
    { id: 'right-2', plate: 'right', position: [0, -0.65] },
    { id: 'roof-left-1', plate: 'roof-left', position: [-0.5, 0] },
    { id: 'roof-left-2', plate: 'roof-left', position: [0.5, 0] },
    { id: 'roof-right-1', plate: 'roof-right', position: [-0.5, 0] },
    { id: 'roof-right-2', plate: 'roof-right', position: [0.5, 0] },
    { id: 'weight-1', plate: 'weight', position: [0, -0.05] },
  ]
  // The weight and the perch share an opening tray, so dropping the weight pays off at once.
  const colors: Record<string, ScrewColor> = {
    'weight-1': 'blue', perch: 'blue', 'front-1': 'pearl', 'front-2': 'pearl', 'back-1': 'coral', 'back-2': 'blue', 'back-3': 'coral',
    'left-1': 'coral', 'left-2': 'amber', 'right-1': 'mint', 'right-2': 'pearl', 'roof-left-1': 'amber', 'roof-left-2': 'mint',
    'roof-right-1': 'amber', 'roof-right-2': 'mint',
  }
  return {
    id: 21, name: 'Cuckoo Clock', spareCapacity: 3, overflowLoses: true, trayColors: ['mint', 'blue', 'amber', 'coral', 'pearl'], stage: 'dresser',
    introduction: 'The pinecone weight hangs on a chain to the cuckoo\'s door. Take out the weight\'s screw and it drops, and the chain pulls the door open. Nothing else will open it.',
    plates, screws: colored(screws, colors),
  }
}

/**
 * A cage lift in its shaft. Each landing gate is lifted by its own counterweight
 * on the same wall, one on the front and one on the back; the machine housing on
 * top rests on the side walls.
 */
function liftCage(): PuzzleLevel {
  const iron = '#3f5a5c'
  const front: Plate = { id: 'front', name: 'Shaft front', position: [0, -0.15, 1.0], size: [2.4, 2.8], normal: [0, 0, 1], up: [0, 1, 0], finish: 'case', color: iron }
  const back: Plate = { id: 'back', name: 'Shaft back', position: [0, -0.15, -1.0], size: [2.4, 2.8], normal: [0, 0, -1], up: [0, 1, 0], finish: 'case', color: iron }
  const pair = (host: Plate, side: string, name: string) => sash(host, {
    weight: { id: `${side}-weight`, name: `${name} counterweight`, at: [-0.85, 0.675], size: [0.56, 0.75], color: '#4a4f55' },
    part: { id: `${side}-gate`, name: `${name} gate`, at: [0.1, -0.65], size: [1.0, 1.1], finish: 'guard', color: '#b08d3c' },
    travel: 1.1, pulleys: 1.22,
  })
  const plates: Plate[] = [
    front, back,
    { id: 'left', name: 'Shaft left side', position: [-1.2, -0.15, 0], size: [2.0, 2.8], normal: [-1, 0, 0], up: [0, 1, 0], finish: 'case', color: '#46625f' },
    { id: 'right', name: 'Shaft right side', position: [1.2, -0.15, 0], size: [2.0, 2.8], normal: [1, 0, 0], up: [0, 1, 0], finish: 'case', color: '#46625f' },
    { id: 'housing', name: 'Machine housing', position: [0, 1.38, 0], size: [2.6, 2.2], normal: [0, 1, 0], up: [0, 0, -1], restsOn: ['left', 'right'], finish: 'guard', color: '#7b2d26' },
    ...pair(front, 'front', 'Front'),
    ...pair(back, 'back', 'Back'),
  ]
  const screws: Uncolored[] = [
    // Each gate closes over a screw in the wall behind it.
    { id: 'front-landing', plate: 'front', position: [0.1, -0.65], blockedBy: ['front-gate'] },
    { id: 'front-1', plate: 'front', position: [0.95, 0.85] },
    { id: 'front-2', plate: 'front', position: [0.95, -0.9] },
    { id: 'front-3', plate: 'front', position: [-0.85, -1.15] },
    { id: 'back-landing', plate: 'back', position: [0.1, -0.65], blockedBy: ['back-gate'] },
    { id: 'back-1', plate: 'back', position: [0.95, 0.85] },
    { id: 'back-2', plate: 'back', position: [-0.85, -1.15] },
    { id: 'front-weight-1', plate: 'front-weight', position: [0, -0.05] },
    { id: 'back-weight-1', plate: 'back-weight', position: [0, -0.05] },
    { id: 'left-1', plate: 'left', position: [-0.5, 0.6] },
    { id: 'left-2', plate: 'left', position: [0.5, -0.7] },
    { id: 'right-1', plate: 'right', position: [-0.5, 0.6] },
    { id: 'right-2', plate: 'right', position: [0.5, -0.7] },
    { id: 'housing-1', plate: 'housing', position: [-0.7, 0] },
    { id: 'housing-2', plate: 'housing', position: [0.7, 0] },
  ]
  // Chosen by a solver search over random colorings; see the level's numbers in campaignSolver.test.ts.
  const colors: Record<string, ScrewColor> = {
    'front-landing': 'mint', 'front-1': 'coral', 'front-2': 'blue', 'front-3': 'blue', 'back-landing': 'amber',
    'back-1': 'mint', 'back-2': 'blue', 'front-weight-1': 'amber', 'back-weight-1': 'coral', 'left-1': 'coral',
    'left-2': 'pearl', 'right-1': 'pearl', 'right-2': 'mint', 'housing-1': 'amber', 'housing-2': 'pearl',
  }
  return {
    id: 22, name: 'Lift Cage', spareCapacity: 2, overflowLoses: true, trayColors: ['blue', 'coral', 'pearl', 'amber', 'mint'], stage: 'lobby',
    plates, screws: colored(screws, colors),
  }
}

/**
 * A gatehouse on an island. Its drawbridge lies down over the stone apron in
 * front of the gate; the counterweight beside the arch hauls it up against the
 * gate, clear of every screw. The apron rests on the gatehouse's sill.
 */
function drawbridge(): PuzzleLevel {
  const stone = '#b9b1a0'
  const front: Plate = { id: 'front', name: 'Gatehouse front', position: [0, -0.35, 0.8], size: [2.6, 2.4], normal: [0, 0, 1], up: [0, 1, 0], finish: 'gatehouse', color: stone }
  // The hinge stands a little proud of the wall, so the raised bridge and its iron straps clear it.
  const hinge = { y: -1.0, z: 0.8 + PROUD + 0.08 }
  const plates: Plate[] = [
    front,
    { id: 'back', name: 'Gatehouse back', position: [0, -0.35, -0.8], size: [2.6, 2.4], normal: [0, 0, -1], up: [0, 1, 0], finish: 'stone', color: stone },
    { id: 'left', name: 'Left tower wall', position: [-1.3, -0.35, 0], size: [1.6, 2.4], normal: [-1, 0, 0], up: [0, 1, 0], finish: 'stone', color: '#c4bcab' },
    { id: 'right', name: 'Right tower wall', position: [1.3, -0.35, 0], size: [1.6, 2.4], normal: [1, 0, 0], up: [0, 1, 0], finish: 'stone', color: '#c4bcab' },
    { id: 'battlements', name: 'Battlements', position: [0, 0.98, 0], size: [2.8, 1.8], normal: [0, 1, 0], up: [0, 0, -1], restsOn: ['left', 'right'], finish: 'stone', color: '#a39b8a' },
    { id: 'apron', name: 'Stone apron', position: [0, -1.42, 1.95], size: [2.4, 1.9], normal: [0, 1, 0], up: [0, 0, 1], restsOn: ['front'], finish: 'stone', color: '#cfc6b4' },
    {
      id: 'bridge', name: 'Drawbridge', position: [0, hinge.y, hinge.z + 0.8], size: [1.2, 1.6], normal: [0, 1, 0], up: [0, 0, 1],
      hinge: 'bottom', hingeAngle: Math.PI / 2, host: 'front', drivenBy: 'weight',
      // Up beside the arch, across above it, then down to the bridge's far end.
      cord: [onFace(front, -1.0, 1.1, PROUD), onFace(front, 0, 1.1, PROUD)],
      finish: 'plank', color: '#8a6040',
    },
    { id: 'weight', name: 'Counterweight', position: onFace(front, -1.0, 0.6, PROUD), size: [0.52, 0.7], normal: [0, 0, 1], up: [0, 1, 0], rail: { along: [0, -1, 0], travel: 1.0 }, host: 'front', finish: 'weight', color: '#4a4f55' },
  ]
  const screws: Uncolored[] = [
    // Beside the arch, clear of the raised bridge and above the apron.
    { id: 'front-1', plate: 'front', position: [1.0, 0.8] },
    { id: 'front-2', plate: 'front', position: [1.0, 0.2] },
    { id: 'front-3', plate: 'front', position: [1.0, -0.4] },
    // Under the lowered bridge; the apron's local X runs toward -x.
    { id: 'apron-near', plate: 'apron', position: [0.25, -0.25], blockedBy: ['bridge'] },
    { id: 'apron-far', plate: 'apron', position: [-0.25, 0.45], blockedBy: ['bridge'] },
    { id: 'apron-side', plate: 'apron', position: [0.92, 0.5] },
    { id: 'weight-1', plate: 'weight', position: [0, 0] },
    { id: 'back-1', plate: 'back', position: [-0.7, 0.4] },
    { id: 'back-2', plate: 'back', position: [0.7, -0.6] },
    { id: 'left-1', plate: 'left', position: [0, 0.5] },
    { id: 'left-2', plate: 'left', position: [0, -0.7] },
    { id: 'right-1', plate: 'right', position: [0, 0.5] },
    { id: 'right-2', plate: 'right', position: [0, -0.7] },
    { id: 'battlements-1', plate: 'battlements', position: [-0.8, 0] },
    { id: 'battlements-2', plate: 'battlements', position: [0.8, 0] },
  ]
  // Chosen by a solver search over random colorings; see the level's numbers in campaignSolver.test.ts.
  const colors: Record<string, ScrewColor> = {
    'front-1': 'coral', 'front-2': 'mint', 'front-3': 'pearl', 'apron-near': 'mint', 'apron-far': 'coral',
    'apron-side': 'blue', 'weight-1': 'mint', 'back-1': 'pearl', 'back-2': 'blue', 'left-1': 'coral',
    'left-2': 'amber', 'right-1': 'amber', 'right-2': 'blue', 'battlements-1': 'pearl', 'battlements-2': 'amber',
  }
  return {
    id: 23, name: 'Drawbridge', spareCapacity: 2, overflowLoses: true, trayColors: ['amber', 'blue', 'pearl', 'mint', 'coral'], stage: 'moat',
    plates, screws: colored(screws, colors),
  }
}

/**
 * A cabinet gramophone. The collar on the front turns to show the screws behind
 * it once its stop pin is out; on the back, a counterweight lifts the record
 * hatch. Two routes into the same cabinet.
 */
function gramophone(): PuzzleLevel {
  const walnut = '#6b4329'
  const front: Plate = { id: 'front', name: 'Cabinet front', position: [0, -0.35, 0.9], size: [2.8, 2.4], normal: [0, 0, 1], up: [0, 1, 0], finish: 'case', color: walnut }
  const back: Plate = { id: 'back', name: 'Cabinet back', position: [0, -0.35, -0.9], size: [2.8, 2.4], normal: [0, 0, -1], up: [0, 1, 0], finish: 'case', color: walnut }
  const collarCentre = [-0.5, -0.3] as const
  const collar: Dial = { stops: 4, windows: [2], windowRadius: 0.45, pins: ['collar-pin'] }
  const plates: Plate[] = [
    front, back,
    { id: 'left', name: 'Left side', position: [-1.4, -0.35, 0], size: [1.8, 2.4], normal: [-1, 0, 0], up: [0, 1, 0], finish: 'case', color: '#74492d' },
    { id: 'right', name: 'Right side', position: [1.4, -0.35, 0], size: [1.8, 2.4], normal: [1, 0, 0], up: [0, 1, 0], finish: 'case', color: '#74492d' },
    { id: 'lid', name: 'Lid', position: [0, 0.98, 0], size: [3.0, 2.0], normal: [0, 1, 0], up: [0, 0, -1], restsOn: ['left', 'right'], finish: 'turntable', color: '#5a3722' },
    { id: 'collar', name: 'Collar', position: onFace(front, ...collarCentre, 0.32), size: [1.6, 1.6], normal: [0, 0, 1], up: [0, 1, 0], host: 'front', dial: collar, finish: 'dial', color: '#c9a64b' },
    ...sash(back, {
      weight: { id: 'weight', name: 'Counterweight', at: [-0.85, 0.55], size: [0.56, 0.75], color: '#4a4f55' },
      part: { id: 'hatch', name: 'Record hatch', at: [0.3, -0.5], size: [0.9, 0.9], finish: 'case', color: '#8a5a36' },
      travel: 1.0, pulleys: 1.1,
    }),
  ]
  const behind = Array.from({ length: collar.stops }, (_, slot): Uncolored => {
    const [x, y] = dialSlotPosition(collar, slot)
    return { id: `collar-${slot}`, plate: 'front', position: [collarCentre[0] + x, collarCentre[1] + y], underDial: { dial: 'collar', slot } }
  })
  const screws: Uncolored[] = [
    // The stop pin, just above the collar's rim.
    { id: 'collar-pin', plate: 'front', position: [collarCentre[0], 0.85] },
    ...behind,
    { id: 'front-1', plate: 'front', position: [0.9, 0.6] },
    { id: 'front-2', plate: 'front', position: [0.9, -0.7] },
    { id: 'hatch-under', plate: 'back', position: [0.3, -0.5], blockedBy: ['hatch'] },
    { id: 'back-1', plate: 'back', position: [1.05, 0.7] },
    { id: 'back-2', plate: 'back', position: [1.05, -0.8] },
    { id: 'weight-1', plate: 'weight', position: [0, -0.05] },
    { id: 'left-1', plate: 'left', position: [0, 0.2] },
    { id: 'right-1', plate: 'right', position: [0, 0.2] },
    { id: 'lid-1', plate: 'lid', position: [1.15, -0.65] },
    { id: 'lid-2', plate: 'lid', position: [1.15, 0.6] },
  ]
  // Chosen by a solver search over random colorings; see the level's numbers in campaignSolver.test.ts.
  const colors: Record<string, ScrewColor> = {
    'collar-pin': 'coral', 'collar-0': 'blue', 'collar-1': 'blue', 'collar-2': 'pearl', 'collar-3': 'coral',
    'front-1': 'coral', 'front-2': 'mint', 'hatch-under': 'amber', 'back-1': 'blue', 'back-2': 'mint',
    'weight-1': 'pearl', 'left-1': 'amber', 'right-1': 'pearl', 'lid-1': 'amber', 'lid-2': 'mint',
  }
  return {
    id: 24, name: 'Gramophone', spareCapacity: 2, overflowLoses: true, trayColors: ['mint', 'blue', 'pearl', 'coral', 'amber'], stage: 'music-room',
    plates, screws: colored(screws, colors),
  }
}

/**
 * The clockworks' assessment: a tin robot. Its drive weight on its back lifts
 * the spring-box hatch; its visor slides down its rail onto its chest; and each
 * arm is pinned through the shoulder bolt to the side behind it.
 */
function clockworkRobot(): PuzzleLevel {
  const tin = '#8fa3ad'
  const back: Plate = { id: 'back', name: 'Back plate', position: [0, -0.6, -0.75], size: [2.2, 1.9], normal: [0, 0, -1], up: [0, 1, 0], finish: 'tin', color: tin }
  const face: Plate = { id: 'face', name: 'Face', position: [0, 1.26, 0.75], size: [1.3, 1.3], normal: [0, 0, 1], up: [0, 1, 0], restsOn: ['shoulders'], finish: 'head', color: '#b7c4ca' }
  const visorTravel = 1.06
  const arm = (side: -1 | 1): Plate => ({
    id: side < 0 ? 'arm-left' : 'arm-right', name: side < 0 ? 'Left arm' : 'Right arm', position: [side * (1.1 + PROUD), -0.3, 0], size: [0.6, 1.2],
    normal: [side, 0, 0], up: [0, 1, 0], finish: 'tin', color: '#c0573f',
  })
  const plates: Plate[] = [
    { id: 'chest', name: 'Chest', position: [0, -0.6, 0.75], size: [2.2, 1.9], normal: [0, 0, 1], up: [0, 1, 0], finish: 'tin', color: tin },
    back,
    { id: 'left', name: 'Left side', position: [-1.1, -0.6, 0], size: [1.5, 1.9], normal: [-1, 0, 0], up: [0, 1, 0], finish: 'tin', color: '#9fb2bb' },
    { id: 'right', name: 'Right side', position: [1.1, -0.6, 0], size: [1.5, 1.9], normal: [1, 0, 0], up: [0, 1, 0], finish: 'tin', color: '#9fb2bb' },
    { id: 'shoulders', name: 'Shoulders', position: [0, 0.48, 0], size: [2.4, 1.6], normal: [0, 1, 0], up: [0, 0, -1], restsOn: ['left', 'right'], finish: 'tin', color: '#7d929c' },
    face,
    { id: 'visor', name: 'Visor', position: onFace(face, 0, -0.2, PROUD), size: [1.0, 0.55], normal: [0, 0, 1], up: [0, 1, 0], rail: { along: [0, -1, 0], travel: visorTravel }, host: 'face', finish: 'guard', color: '#2f3b42' },
    arm(-1), arm(1),
    ...sash(back, {
      weight: { id: 'weight', name: 'Drive weight', at: [-0.75, 0.4], size: [0.52, 0.65], color: '#4a4f55' },
      part: { id: 'hatch', name: 'Spring-box hatch', at: [0.3, -0.35], size: [0.9, 0.8], finish: 'tin', color: '#d9a132' },
      travel: 0.7, pulleys: 0.88,
    }),
  ]
  const screws: Uncolored[] = [
    // The visor lands over this one once it slides down.
    { id: 'chest-1', plate: 'chest', position: [-0.25, 0.6], coveredWhenOpen: ['visor'] },
    { id: 'chest-2', plate: 'chest', position: [0.7, -0.5] },
    { id: 'spring-box', plate: 'back', position: [0.3, -0.35], blockedBy: ['hatch'] },
    { id: 'weight-1', plate: 'weight', position: [0, 0] },
    // Each shoulder bolt pins its arm to the side behind it.
    { id: 'shoulder-left', plate: 'arm-left', through: ['left'], position: [0, 0.3] },
    { id: 'arm-left-1', plate: 'arm-left', position: [0, -0.3] },
    { id: 'shoulder-right', plate: 'arm-right', through: ['right'], position: [0, 0.3] },
    { id: 'arm-right-1', plate: 'arm-right', position: [0, -0.3] },
    { id: 'left-1', plate: 'left', position: [0, -0.65] },
    { id: 'right-1', plate: 'right', position: [0, -0.65] },
    { id: 'shoulders-1', plate: 'shoulders', position: [-0.85, 0.3] },
    { id: 'shoulders-2', plate: 'shoulders', position: [0.85, 0.3] },
    { id: 'face-1', plate: 'face', position: [0, 0.4] },
    { id: 'face-eye', plate: 'face', position: [-0.25, -0.2], blockedBy: ['visor'] },
    { id: 'visor-1', plate: 'visor', position: [0.25, 0] },
  ]
  // Chosen by a solver search over random colorings; see the level's numbers in campaignSolver.test.ts.
  const colors: Record<string, ScrewColor> = {
    'chest-1': 'coral', 'chest-2': 'pearl', 'spring-box': 'amber', 'weight-1': 'amber', 'shoulder-left': 'blue',
    'arm-left-1': 'mint', 'shoulder-right': 'blue', 'arm-right-1': 'coral', 'left-1': 'blue', 'right-1': 'pearl',
    'shoulders-1': 'amber', 'shoulders-2': 'mint', 'face-1': 'coral', 'face-eye': 'pearl', 'visor-1': 'mint',
  }
  return {
    id: 25, name: 'Clockwork Robot', spareCapacity: 2, overflowLoses: true, trayColors: ['coral', 'mint', 'pearl', 'blue', 'amber'], stage: 'toyshop',
    plates, screws: colored(screws, colors),
  }
}
