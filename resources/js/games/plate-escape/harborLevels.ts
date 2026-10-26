import type { PuzzleLevel } from './level'

/** A part mounted on the outside of another: one panel thickness out, so their faces just clear. */
const PROUD = 0.27

/**
 * Levels 11–15 around a harbor. Each is a free-standing object on its own
 * base. Captive covers arrive here: a flap that drops open, or a shutter that
 * slides down its rail, lands over the screws below it and stays there until
 * the part it hangs on comes off.
 */
export function createHarborLevels(): PuzzleLevel[] {
  const stern = 1.75

  // A flat-bottomed pram dinghy: its bottom boards are the base, and both ends are transoms.
  const boat: PuzzleLevel = {
    id: 11, name: 'Rowing Boat', spareCapacity: 3, overflowLoses: true, trayColors: ['coral', 'mint', 'blue', 'amber'], stage: 'jetty',
    introduction: 'The bait flap on the stern drops open when its screw comes out and rests on its catch over whatever is below it. It comes away with the batten it hangs from.',
    plates: [
      { id: 'port', name: 'Port side', position: [0, -0.85, 1.1], size: [3.5, 1.2], normal: [0, 0, 1], up: [0, 1, 0], outline: [[-1.55, -0.6], [1.5, -0.6], [1.75, 0.55], [-1.7, 0.6]], finish: 'hull', color: '#3f7f9b' },
      { id: 'starboard', name: 'Starboard side', position: [0, -0.85, -1.1], size: [3.5, 1.2], normal: [0, 0, -1], up: [0, 1, 0], outline: [[-1.5, -0.6], [1.55, -0.6], [1.7, 0.6], [-1.75, 0.55]], finish: 'hull', color: '#3f7f9b' },
      { id: 'transom', name: 'Stern transom', position: [stern, -0.85, 0], size: [2.0, 1.2], normal: [1, 0, 0], up: [0, 1, 0], outline: [[-0.85, -0.6], [0.85, -0.6], [1.0, 0.6], [-1.0, 0.6]], finish: 'hull', color: '#e9e1cf' },
      { id: 'bow', name: 'Bow transom', position: [-1.8, -0.75, 0], size: [1.8, 1.0], normal: [-1, 0, 0], up: [0, 1, 0], outline: [[-0.65, -0.5], [0.65, -0.5], [0.85, 0.5], [-0.85, 0.5]], finish: 'hull', color: '#e9e1cf' },
      { id: 'thwart', name: 'Rowing seat', position: [0.2, -0.55, 0], size: [1.9, 0.55], normal: [0, 1, 0], up: [1, 0, 0], restsOn: ['port', 'starboard'], finish: 'plank', color: '#b98a58' },
      // Across the top of the transom; the bait flap stands in front of it and drops over the transom below.
      { id: 'batten', name: 'Stern batten', position: [stern + PROUD, -0.4, 0], size: [1.7, 0.6], normal: [1, 0, 0], up: [0, 1, 0], finish: 'beam', color: '#8a6040' },
      { id: 'bait-flap', name: 'Bait flap', position: [stern + PROUD * 2, -0.35, 0], size: [1.0, 0.7], normal: [1, 0, 0], up: [0, 1, 0], hinge: 'bottom', hingeAngle: Math.PI, host: 'batten', finish: 'plank', color: '#c9a36b' },
    ],
    screws: [
      { id: 'port-1', plate: 'port', color: 'amber', position: [-1.1, 0.1] },
      { id: 'port-2', plate: 'port', color: 'mint', position: [0, 0] },
      { id: 'port-3', plate: 'port', color: 'amber', position: [1.1, 0.05] },
      { id: 'starboard-1', plate: 'starboard', color: 'mint', position: [-1.0, 0] },
      { id: 'starboard-2', plate: 'starboard', color: 'amber', position: [1.0, 0.1] },
      { id: 'bow-1', plate: 'bow', color: 'blue', position: [-0.5, 0.15] },
      { id: 'bow-2', plate: 'bow', color: 'coral', position: [0.5, 0.15] },
      // Below the flap's hinge: the open flap hangs over it until the batten comes off.
      { id: 'transom-1', plate: 'transom', color: 'blue', position: [0, -0.2], coveredWhenOpen: ['bait-flap'] },
      { id: 'thwart-1', plate: 'thwart', color: 'coral', position: [-0.6, 0] },
      { id: 'thwart-2', plate: 'thwart', color: 'mint', position: [0.6, 0] },
      { id: 'batten-1', plate: 'batten', color: 'blue', position: [0, 0.05], blockedBy: ['bait-flap'] },
      { id: 'bait-flap-1', plate: 'bait-flap', color: 'coral', position: [0, 0.1] },
    ],
  }

  // A glazed lantern room on its stone base, capped like a little house; storm shutters ride on rails.
  const capRun = 1.2
  const capRise = 0.6
  const capLength = Math.hypot(capRun, capRise)
  const lantern: PuzzleLevel = {
    id: 12, name: 'Lighthouse Lantern', spareCapacity: 3, overflowLoses: true, trayColors: ['blue', 'coral', 'amber', 'mint'], stage: 'pier',
    introduction: 'Storm shutters ride on rails. Free one and it drops to the bottom of its rail, over whatever is there, until the glass it hangs on comes off.',
    plates: [
      { id: 'glass-front', name: 'Front glazing', position: [0, 0.1, 1.0], size: [2.0, 1.6], normal: [0, 0, 1], up: [0, 1, 0], gableRise: capRise, translucent: true, restsOn: ['base-front'], finish: 'glass-wall', color: '#bfe3ee' },
      { id: 'glass-back', name: 'Back glazing', position: [0, 0.1, -1.0], size: [2.0, 1.6], normal: [0, 0, -1], up: [0, 1, 0], gableRise: capRise, translucent: true, restsOn: ['base-back'], finish: 'glass-wall', color: '#bfe3ee' },
      { id: 'glass-left', name: 'Left glazing', position: [-1.0, 0.1, 0], size: [2.0, 1.6], normal: [-1, 0, 0], up: [0, 1, 0], translucent: true, finish: 'glass-wall', color: '#bfe3ee' },
      { id: 'glass-right', name: 'Right glazing', position: [1.0, 0.1, 0], size: [2.0, 1.6], normal: [1, 0, 0], up: [0, 1, 0], translucent: true, finish: 'glass-wall', color: '#bfe3ee' },
      { id: 'cap-left', name: 'Left cap slope', position: [-capRun / 2, 1.22, 0], size: [2.3, capLength], normal: [-capRise / capLength, capRun / capLength, 0], up: [capRun / capLength, capRise / capLength, 0], restsOn: ['glass-front', 'glass-back'], finish: 'roof', color: '#b2453b' },
      { id: 'cap-right', name: 'Right cap slope', position: [capRun / 2, 1.22, 0], size: [2.3, capLength], normal: [capRise / capLength, capRun / capLength, 0], up: [-capRun / capLength, capRise / capLength, 0], restsOn: ['glass-front', 'glass-back'], finish: 'roof', color: '#b2453b' },
      { id: 'base-front', name: 'Front base', position: [0, -1.1, 1.05], size: [2.4, 0.8], normal: [0, 0, 1], up: [0, 1, 0], finish: 'stone', color: '#d9d2c3' },
      { id: 'base-back', name: 'Back base', position: [0, -1.1, -1.05], size: [2.4, 0.8], normal: [0, 0, -1], up: [0, 1, 0], finish: 'stone', color: '#d9d2c3' },
      { id: 'shutter-front', name: 'Front storm shutter', position: [0, 0.45, 1.0 + PROUD], size: [1.2, 0.7], normal: [0, 0, 1], up: [0, 1, 0], rail: { along: [0, -1, 0], travel: 1.4 }, host: 'glass-front', finish: 'plank', color: '#2f5d74' },
      { id: 'shutter-back', name: 'Back storm shutter', position: [0, 0.45, -1.0 - PROUD], size: [1.2, 0.7], normal: [0, 0, -1], up: [0, 1, 0], rail: { along: [0, -1, 0], travel: 1.4 }, host: 'glass-back', finish: 'plank', color: '#2f5d74' },
    ],
    screws: [
      { id: 'glass-front-1', plate: 'glass-front', color: 'blue', position: [0.3, 0.35], blockedBy: ['shutter-front'] },
      { id: 'glass-back-1', plate: 'glass-back', color: 'amber', position: [0.3, 0.35], blockedBy: ['shutter-back'] },
      { id: 'glass-left-1', plate: 'glass-left', color: 'mint', position: [0.45, 0.3] },
      { id: 'glass-right-1', plate: 'glass-right', color: 'amber', position: [0.45, 0.3] },
      { id: 'cap-left-1', plate: 'cap-left', color: 'coral', position: [0, 0] },
      { id: 'cap-right-1', plate: 'cap-right', color: 'coral', position: [0, 0] },
      { id: 'shutter-front-1', plate: 'shutter-front', color: 'coral', position: [0, 0.1] },
      { id: 'shutter-back-1', plate: 'shutter-back', color: 'mint', position: [0, 0.1] },
      // Under the bottom of each rail: a dropped shutter lands over it.
      { id: 'base-front-1', plate: 'base-front', color: 'blue', position: [0, 0.05], coveredWhenOpen: ['shutter-front'] },
      { id: 'base-front-2', plate: 'base-front', color: 'mint', position: [-0.9, 0] },
      { id: 'base-back-1', plate: 'base-back', color: 'blue', position: [0, 0.05], coveredWhenOpen: ['shutter-back'] },
      { id: 'base-back-2', plate: 'base-back', color: 'amber', position: [-0.9, 0] },
    ],
  }

  return [boat, lantern]
}
