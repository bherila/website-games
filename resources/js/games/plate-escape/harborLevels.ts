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

  // A sea chest on a boathouse bench: two captive covers, each burying a different screw.
  const chestFront = 0.9
  const chestEnd = 1.5
  const chest: PuzzleLevel = {
    id: 13, name: 'Sea Chest', spareCapacity: 2, overflowLoses: true, trayColors: ['mint', 'amber', 'coral', 'blue'], stage: 'workbench',
    plates: [
      { id: 'front', name: 'Chest front', position: [0, -0.9, chestFront], size: [3.0, 1.3], normal: [0, 0, 1], up: [0, 1, 0], finish: 'plank', color: '#7c4f32' },
      { id: 'back', name: 'Chest back', position: [0, -0.9, -chestFront], size: [3.0, 1.3], normal: [0, 0, -1], up: [0, 1, 0], finish: 'plank', color: '#7c4f32' },
      { id: 'end-left', name: 'Left end', position: [-chestEnd, -0.9, 0], size: [1.8, 1.3], normal: [-1, 0, 0], up: [0, 1, 0], finish: 'plank', color: '#865838' },
      { id: 'end-right', name: 'Right end', position: [chestEnd, -0.9, 0], size: [1.8, 1.3], normal: [1, 0, 0], up: [0, 1, 0], finish: 'plank', color: '#865838' },
      { id: 'lid', name: 'Chest lid', position: [0, -0.12, 0], size: [3.2, 2.0], normal: [0, 1, 0], up: [0, 0, -1], restsOn: ['front', 'back'], finish: 'plank', color: '#6b4329' },
      // The lock plate on the front carries the hasp; freed, the hasp drops down its staple onto the front.
      { id: 'lock-plate', name: 'Lock plate', position: [0, -0.45, chestFront + PROUD], size: [0.9, 0.55], normal: [0, 0, 1], up: [0, 1, 0], finish: 'guard', color: '#b08d3c' },
      { id: 'hasp', name: 'Hasp', position: [0, -0.45, chestFront + PROUD * 2], size: [0.6, 0.7], normal: [0, 0, 1], up: [0, 1, 0], rail: { along: [0, -1, 0], travel: 0.65 }, host: 'lock-plate', finish: 'guard', color: '#c9a64b' },
      // The handle cleat on the right end carries a flap that drops over the end below it.
      { id: 'cleat', name: 'Handle cleat', position: [chestEnd + PROUD, -0.45, 0], size: [1.2, 0.6], normal: [1, 0, 0], up: [0, 1, 0], finish: 'beam', color: '#5e3b24' },
      { id: 'end-flap', name: 'End flap', position: [chestEnd + PROUD * 2, -0.4, 0], size: [1.0, 0.7], normal: [1, 0, 0], up: [0, 1, 0], hinge: 'bottom', hingeAngle: Math.PI, host: 'cleat', finish: 'plank', color: '#a87447' },
    ],
    screws: [
      { id: 'lid-1', plate: 'lid', color: 'mint', position: [-0.9, 0] },
      { id: 'lid-2', plate: 'lid', color: 'coral', position: [0.9, 0] },
      { id: 'front-low', plate: 'front', color: 'blue', position: [0, -0.2], coveredWhenOpen: ['hasp'] },
      { id: 'front-2', plate: 'front', color: 'coral', position: [1.05, 0.1] },
      { id: 'back-1', plate: 'back', color: 'mint', position: [-0.9, 0.1] },
      { id: 'back-2', plate: 'back', color: 'blue', position: [0.9, 0.1] },
      { id: 'end-left-1', plate: 'end-left', color: 'mint', position: [0, 0.1] },
      { id: 'end-low', plate: 'end-right', color: 'amber', position: [0, -0.3], coveredWhenOpen: ['end-flap'] },
      { id: 'lock-plate-1', plate: 'lock-plate', color: 'blue', position: [0, 0], blockedBy: ['hasp'] },
      { id: 'hasp-1', plate: 'hasp', color: 'amber', position: [0, 0.1] },
      { id: 'cleat-1', plate: 'cleat', color: 'coral', position: [0, 0.05], blockedBy: ['end-flap'] },
      { id: 'end-flap-1', plate: 'end-flap', color: 'amber', position: [0, 0.1] },
    ],
  }

  // A dockside crane: a boarded tower, a cab on top and a jib reaching over the water. Its two
  // railed parts run different ways: the hook block drops straight down the front, the
  // counterweight slides down the cab's back on a slant. The cab stands on the tower's sides, so
  // the front and back screws the covers land on are held by nothing else.
  const slant = [-0.447, -0.894, 0] as const
  const crane: PuzzleLevel = {
    id: 14, name: 'Harbor Crane', spareCapacity: 2, overflowLoses: true, trayColors: ['coral', 'blue', 'mint', 'amber'], stage: 'quay',
    plates: [
      { id: 'tower-front', name: 'Tower front', position: [0, -0.55, 0.7], size: [1.6, 2.0], normal: [0, 0, 1], up: [0, 1, 0], finish: 'plank', color: '#4f7a5a' },
      { id: 'tower-back', name: 'Tower back', position: [0, -0.55, -0.7], size: [1.6, 2.0], normal: [0, 0, -1], up: [0, 1, 0], finish: 'plank', color: '#4f7a5a' },
      { id: 'tower-left', name: 'Tower left side', position: [-0.8, -0.55, 0], size: [1.4, 2.0], normal: [-1, 0, 0], up: [0, 1, 0], finish: 'plank', color: '#5b8766' },
      { id: 'tower-right', name: 'Tower right side', position: [0.8, -0.55, 0], size: [1.4, 2.0], normal: [1, 0, 0], up: [0, 1, 0], finish: 'plank', color: '#5b8766' },
      { id: 'cab-front', name: 'Cab front', position: [0, 0.95, 0.85], size: [1.9, 1.0], normal: [0, 0, 1], up: [0, 1, 0], restsOn: ['tower-left', 'tower-right'], finish: 'guard', color: '#d8a640' },
      { id: 'cab-back', name: 'Cab back', position: [0, 0.95, -0.85], size: [1.9, 1.0], normal: [0, 0, -1], up: [0, 1, 0], restsOn: ['tower-left', 'tower-right'], finish: 'guard', color: '#d8a640' },
      { id: 'cab-roof', name: 'Cab roof', position: [0, 1.52, 0], size: [2.0, 1.85], normal: [0, 1, 0], up: [0, 0, -1], restsOn: ['cab-front', 'cab-back'], finish: 'guard', color: '#b9473b' },
      { id: 'jib', name: 'Jib', position: [1.45, 1.0, 0.85 + PROUD], size: [2.8, 0.5], normal: [0, 0, 1], up: [0, 1, 0], finish: 'beam', color: '#c0392b' },
      { id: 'hook-block', name: 'Hook block', position: [-0.5, 0.95, 0.85 + PROUD], size: [0.6, 0.7], normal: [0, 0, 1], up: [0, 1, 0], rail: { along: [0, -1, 0], travel: 1.9 }, host: 'cab-front', finish: 'guard', color: '#3d4a52' },
      { id: 'counterweight', name: 'Counterweight', position: [0.4, 0.95, -0.85 - PROUD], size: [0.7, 0.7], normal: [0, 0, -1], up: [0, 1, 0], rail: { along: slant, travel: 2.012 }, host: 'cab-back', finish: 'guard', color: '#5f6b72' },
      { id: 'tower-door', name: 'Tower door', position: [0.8 + PROUD, -0.85, 0], size: [0.8, 1.1], normal: [1, 0, 0], up: [0, 1, 0], hinge: 'left', host: 'tower-right', finish: 'plank', color: '#7a5a3c' },
    ],
    screws: [
      // The hook block lands here once it drops.
      { id: 'tower-front-1', plate: 'tower-front', color: 'mint', position: [-0.5, -0.4], coveredWhenOpen: ['hook-block'] },
      // The counterweight lands here; the cab's back faces -z, so its local x runs toward -x.
      { id: 'tower-back-1', plate: 'tower-back', color: 'blue', position: [0.5, -0.3], coveredWhenOpen: ['counterweight'] },
      { id: 'tower-left-1', plate: 'tower-left', color: 'amber', position: [0, 0] },
      { id: 'tower-right-1', plate: 'tower-right', color: 'blue', position: [0, -0.3], blockedBy: ['tower-door'] },
      { id: 'tower-door-1', plate: 'tower-door', color: 'blue', position: [0.15, 0] },
      { id: 'cab-front-1', plate: 'cab-front', color: 'coral', position: [-0.5, 0], blockedBy: ['hook-block'] },
      { id: 'cab-back-1', plate: 'cab-back', color: 'mint', position: [-0.4, 0], blockedBy: ['counterweight'] },
      { id: 'cab-roof-1', plate: 'cab-roof', color: 'coral', position: [0, 0] },
      // The pivot bolt pins the jib to the cab front; both let go together once the roof is off.
      { id: 'jib-pivot', plate: 'jib', through: ['cab-front'], color: 'amber', position: [-1.05, 0] },
      { id: 'jib-2', plate: 'jib', color: 'mint', position: [0.9, 0] },
      { id: 'hook-block-1', plate: 'hook-block', color: 'coral', position: [0, 0.1] },
      { id: 'counterweight-1', plate: 'counterweight', color: 'amber', position: [0, 0.1] },
    ],
  }

  // The harbor's assessment: a lightship at anchor. A drop flap on the stern, a shutter on the
  // mast lantern, and one bolt through the mast step and the deck, which the lantern rests on.
  const shipStern = 1.9
  const mastX = -0.6
  const lightship: PuzzleLevel = {
    id: 15, name: 'Lightship', spareCapacity: 2, overflowLoses: true, trayColors: ['amber', 'mint', 'blue', 'coral'], stage: 'sea',
    plates: [
      { id: 'port', name: 'Port side', position: [0, -0.9, 1.1], size: [3.8, 1.1], normal: [0, 0, 1], up: [0, 1, 0], outline: [[-1.7, -0.55], [1.65, -0.55], [1.9, 0.5], [-1.9, 0.55]], finish: 'hull', color: '#b23a32' },
      { id: 'starboard', name: 'Starboard side', position: [0, -0.9, -1.1], size: [3.8, 1.1], normal: [0, 0, -1], up: [0, 1, 0], outline: [[-1.65, -0.55], [1.7, -0.55], [1.9, 0.55], [-1.9, 0.5]], finish: 'hull', color: '#b23a32' },
      { id: 'bow', name: 'Bow', position: [-1.95, -0.85, 0], size: [2.0, 1.0], normal: [-1, 0, 0], up: [0, 1, 0], outline: [[-0.7, -0.5], [0.7, -0.5], [0.95, 0.5], [-0.95, 0.5]], finish: 'hull', color: '#e9e1cf' },
      { id: 'stern', name: 'Stern', position: [shipStern, -0.9, 0], size: [2.0, 1.1], normal: [1, 0, 0], up: [0, 1, 0], outline: [[-0.85, -0.55], [0.85, -0.55], [1.0, 0.55], [-1.0, 0.55]], finish: 'hull', color: '#e9e1cf' },
      { id: 'deck', name: 'Deck', position: [0.25, -0.3, 0], size: [2.1, 3.0], normal: [0, 1, 0], up: [1, 0, 0], restsOn: ['port', 'starboard'], finish: 'plank', color: '#c9a979' },
      { id: 'mast-step', name: 'Mast step', position: [-0.45, -0.03, 0], size: [1.0, 1.9], normal: [0, 1, 0], up: [1, 0, 0], finish: 'beam', color: '#6e4a2c' },
      { id: 'mast-collar', name: 'Mast collar', position: [mastX, 0.45, 0.27], size: [0.6, 0.7], normal: [0, 0, 1], up: [0, 1, 0], finish: 'guard', color: '#c9a64b' },
      // The lantern glass hangs on the mast, which stands on the step.
      { id: 'lantern', name: 'Lantern glass', position: [mastX, 1.45, 0.27], size: [0.7, 0.8], normal: [0, 0, 1], up: [0, 1, 0], translucent: true, restsOn: ['mast-step'], finish: 'glass-wall', color: '#bfe3ee' },
      { id: 'lantern-shutter', name: 'Lantern shutter', position: [mastX, 1.45, 0.27 + PROUD], size: [0.6, 0.6], normal: [0, 0, 1], up: [0, 1, 0], rail: { along: [0, -1, 0], travel: 1.0 }, host: 'lantern', finish: 'plank', color: '#2f5d74' },
      { id: 'stern-batten', name: 'Stern batten', position: [shipStern + PROUD, -0.5, 0], size: [1.7, 0.6], normal: [1, 0, 0], up: [0, 1, 0], finish: 'beam', color: '#8a6040' },
      { id: 'stern-flap', name: 'Stern flap', position: [shipStern + PROUD * 2, -0.45, 0], size: [1.0, 0.7], normal: [1, 0, 0], up: [0, 1, 0], hinge: 'bottom', hingeAngle: Math.PI, host: 'stern-batten', finish: 'plank', color: '#c9a36b' },
    ],
    screws: [
      { id: 'port-1', plate: 'port', color: 'blue', position: [0.9, 0] },
      { id: 'starboard-1', plate: 'starboard', color: 'coral', position: [0.9, 0] },
      { id: 'bow-1', plate: 'bow', color: 'coral', position: [0, 0.1] },
      { id: 'stern-1', plate: 'stern', color: 'amber', position: [0, -0.25], coveredWhenOpen: ['stern-flap'] },
      { id: 'deck-1', plate: 'deck', color: 'amber', position: [0.6, 1.0] },
      { id: 'deck-2', plate: 'deck', color: 'mint', position: [-0.6, 1.0] },
      // One bolt through the mast step and the deck below it, aft of the mast, where the lantern's
      // shutter rays never cross it. The lamp housing hides it from the bow; turn toward the stern.
      { id: 'mast-bolt', plate: 'mast-step', through: ['deck'], color: 'mint', position: [0, 0.53] },
      { id: 'mast-collar-1', plate: 'mast-collar', color: 'mint', position: [0, 0], coveredWhenOpen: ['lantern-shutter'] },
      { id: 'lantern-1', plate: 'lantern', color: 'blue', position: [0, 0.1], blockedBy: ['lantern-shutter'] },
      { id: 'lantern-shutter-1', plate: 'lantern-shutter', color: 'blue', position: [0, 0] },
      { id: 'stern-batten-1', plate: 'stern-batten', color: 'amber', position: [0, 0.05], blockedBy: ['stern-flap'] },
      { id: 'stern-flap-1', plate: 'stern-flap', color: 'coral', position: [0, 0.1] },
    ],
  }

  return [boat, lantern, chest, crane, lightship]
}
