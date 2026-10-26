import type { Plate, PuzzleLevel, Screw, ScrewColor } from './level'
import { windmillRotor, windmillSails } from './villageLevels'

const recolor = (screws: readonly Screw[], colors: Record<string, ScrewColor>, drop: readonly string[] = []): Screw[] => screws
  .filter((screw) => !drop.includes(screw.id))
  .map((screw) => ({ ...screw, color: colors[screw.id] ?? screw.color }))

const moved = (screws: readonly Screw[], changes: Record<string, Partial<Screw>>): Screw[] => screws.map((screw) => ({ ...screw, ...changes[screw.id] }))

/** A part mounted on the outside of a wall: one panel thickness out, so their faces just clear. */
const PROUD = 0.27

/**
 * Levels 6–10 around the mill. Shared screws arrive first (6–8): one screw
 * through several parts releases them together, so it waits until none of
 * them still carries anything held elsewhere. Hinged panels follow (9–10):
 * a door swings open on its hinge instead of falling, and covers nothing open.
 */
export function createMillLevels(plates: readonly Plate[], screws: readonly Screw[]): PuzzleLevel[] {
  const shell = (roof: string, wall: string): Plate[] => plates.map((plate) => ({ ...plate, color: plate.finish === 'roof' ? roof : wall }))
  const front = 1.25
  const back = -1.25

  const waterwheel: PuzzleLevel = {
    id: 6, name: 'Waterwheel', spareCapacity: 3, overflowLoses: true, trayColors: ['coral', 'mint', 'amber', 'blue'], theme: 'millrace',
    introduction: 'The axle runs through the wheel into the wall, so one screw holds both. It waits until the wheel’s own screw is out, then both let go together. The sluice gate behind the wheel comes last.',
    plates: [
      ...shell('#6f7f5c', '#ead6b3'),
      // The gate stands in the millrace below the axle, not on the wall.
      { id: 'sluice-hatch', name: 'Sluice gate', position: [0, -0.95, front + PROUD], size: [1.4, 0.7], normal: [0, 0, 1], up: [0, 1, 0], finish: 'plank', color: '#8a6a48' },
      { id: 'wheel', name: 'Waterwheel', position: [0, -0.45, 1.95], size: [2.3, 2.3], normal: [0, 0, 1], up: [0, 1, 0], restsOn: ['front'], finish: 'wheel', color: '#9a7046' },
    ],
    screws: [
      ...screws,
      { id: 'wheel-axle', plate: 'wheel', through: ['front'], color: 'amber', position: [0, 0] },
      { id: 'wheel-1', plate: 'wheel', color: 'amber', position: [0, 0.75] },
      { id: 'sluice-hatch-1', plate: 'sluice-hatch', color: 'amber', position: [0.35, -0.05], blockedBy: ['wheel'] },
    ],
  }

  const barn: PuzzleLevel = {
    id: 7, name: 'Barn Doors', spareCapacity: 2, overflowLoses: true, trayColors: ['coral', 'mint', 'amber', 'blue'], theme: 'barn',
    plates: [
      ...shell('#8c4a3c', '#c8664f'),
      { id: 'door-left', name: 'Left barn door', position: [-0.85, -0.6, front + PROUD], size: [1.6, 1.9], normal: [0, 0, 1], up: [0, 1, 0], restsOn: ['front'], finish: 'plank', color: '#b4523f' },
      { id: 'door-right', name: 'Right barn door', position: [0.85, -0.6, front + PROUD], size: [1.6, 1.9], normal: [0, 0, 1], up: [0, 1, 0], restsOn: ['front'], finish: 'plank', color: '#b4523f' },
      { id: 'door-bar', name: 'Door crossbar', position: [0, -0.45, front + PROUD * 2], size: [3.4, 0.5], normal: [0, 0, 1], up: [0, 1, 0], finish: 'beam', color: '#7a4f30' },
    ],
    screws: [
      ...moved(recolor(screws, { 'front-1': 'amber', 'front-2': 'mint', 'left-roof-2': 'amber', 'right-1': 'blue' }), {
        'front-1': { position: [-0.85, -0.75], blockedBy: ['door-left'] },
        'front-2': { position: [0.85, -0.75], blockedBy: ['door-right'] },
      }),
      { id: 'door-left-1', plate: 'door-left', color: 'coral', position: [0, 0.7] },
      { id: 'door-bar-left', plate: 'door-bar', through: ['door-left'], color: 'amber', position: [-0.85, 0] },
      { id: 'door-bar-right', plate: 'door-bar', through: ['door-right'], color: 'mint', position: [0.85, 0] },
    ],
  }

  const sawmill: PuzzleLevel = {
    id: 8, name: 'Sawmill', spareCapacity: 2, overflowLoses: true, trayColors: ['amber', 'coral', 'mint', 'blue'], theme: 'sawmill',
    plates: [
      ...shell('#5d6b74', '#e2cba4'),
      { id: 'saw-guard', name: 'Saw guard', position: [0, -0.5, back - PROUD - 0.03], size: [2.6, 1.3], normal: [0, 0, -1], up: [0, 1, 0], restsOn: ['back'], finish: 'guard', color: '#8e9ba3' },
      { id: 'log-rack', name: 'Log rack', position: [0, -0.6, back - PROUD * 2 - 0.06], size: [3.2, 0.8], normal: [0, 0, -1], up: [0, 1, 0], restsOn: ['saw-guard'], finish: 'rack', color: '#8a5d38' },
    ],
    screws: [
      ...recolor(screws, { 'back-1': 'amber', 'front-2': 'blue', 'left-roof-1': 'amber' }, ['front-1']),
      { id: 'back-2', plate: 'back', color: 'mint', position: [0.7, -0.4], blockedBy: ['saw-guard'] },
      { id: 'saw-guard-1', plate: 'saw-guard', color: 'coral', position: [-1, 0.3] },
      { id: 'log-rack-1', plate: 'log-rack', color: 'amber', position: [1.3, 0] },
      { id: 'saw-bolt', plate: 'log-rack', through: ['saw-guard', 'back'], color: 'mint', position: [0, 0] },
    ],
  }

  const loft: PuzzleLevel = {
    id: 9, name: 'Mill Loft', spareCapacity: 3, overflowLoses: true, trayColors: ['coral', 'blue', 'mint', 'amber'],
    introduction: 'Doors and hatches hang on hinges. Take out their screws and they swing open instead of falling, so you can reach the screws behind them.',
    plates: [
      ...shell('#7a5a44', '#efdcb8'),
      { id: 'loft-door', name: 'Loft door', position: [0, 0.35, front + PROUD], size: [1.2, 1.1], normal: [0, 0, 1], up: [0, 1, 0], hinge: 'left', restsOn: ['front'], finish: 'plank', color: '#a0703f' },
      { id: 'hoist-beam', name: 'Hoist beam', position: [0, 1.2, front + PROUD], size: [1.6, 0.5], normal: [0, 0, 1], up: [0, 1, 0], finish: 'beam', color: '#6e4a2c' },
      { id: 'back-hatch', name: 'Back hatch', position: [0, -0.7, back - PROUD], size: [1.4, 1.0], normal: [0, 0, -1], up: [0, 1, 0], hinge: 'top', restsOn: ['back'], finish: 'plank', color: '#a0703f' },
    ],
    screws: [
      ...moved(recolor(screws, { 'back-1': 'amber', 'front-2': 'amber', 'left-1': 'blue' }, ['front-1']), {
        'front-2': { position: [0, 0.6], blockedBy: ['loft-door'] },
        'back-1': { position: [0, -0.45], blockedBy: ['back-hatch'] },
      }),
      { id: 'loft-door-1', plate: 'loft-door', color: 'coral', position: [0.3, 0] },
      { id: 'hoist-bolt', plate: 'hoist-beam', through: ['front'], color: 'mint', position: [0, 0] },
      { id: 'hoist-beam-1', plate: 'hoist-beam', color: 'coral', position: [0.5, 0] },
      { id: 'back-hatch-1', plate: 'back-hatch', color: 'amber', position: [0.4, 0] },
    ],
  }

  const sails = windmillSails()
  const hill: PuzzleLevel = {
    id: 10, name: 'Windmill Hill', spareCapacity: 2, overflowLoses: true, trayColors: ['coral', 'amber', 'blue', 'mint'], theme: 'windmill', rotor: windmillRotor(sails),
    plates: [
      ...shell('#5f6f7d', '#efe1c4'),
      ...sails,
      // On the side wall: the turning sails sweep most of the front gable.
      { id: 'mill-door', name: 'Mill door', position: [1.8 + PROUD, -0.3, 0.55], size: [1.0, 1.6], normal: [1, 0, 0], up: [0, 1, 0], hinge: 'right', restsOn: ['right'], finish: 'plank', color: '#7a5a3c' },
    ],
    screws: [
      // front-1 sits outside the swept disc, so a passing sail never hides it.
      ...moved(recolor(screws, { 'front-1': 'amber', 'right-1': 'amber', 'back-1': 'mint', 'left-1': 'mint' }, ['front-2', 'left-roof-1', 'right-roof-1']), {
        'front-1': { position: [-1.5, -0.9] },
        'right-1': { blockedBy: ['mill-door'] },
      }),
      ...sails.map((sail): Screw => ({ id: `${sail.id}-1`, plate: sail.id, color: sail.id.slice(5) as ScrewColor, position: [0, 0.4] })),
      // The hub on the outermost sail pins all four and the gable behind them.
      { id: 'mill-hub', plate: 'sail-amber', through: ['sail-blue', 'sail-mint', 'sail-coral', 'front'], color: 'blue', position: [0, -0.75] },
      { id: 'mill-door-1', plate: 'mill-door', color: 'coral', position: [0.25, 0] },
    ],
  }

  return [waterwheel, barn, sawmill, loft, hill]
}
