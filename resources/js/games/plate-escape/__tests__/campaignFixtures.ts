/**
 * Authored win and overflow traces, checked against the engine by
 * campaign.test.ts and replayed through real input by the browser journeys.
 * Generated with analyseLevel() from puzzleSolver.ts: roofs come off before
 * the gable walls that carry them.
 */
export const WORKSHOP_TRACE = {
  level: 2,
  win: ['front-brace-1', 'back-brace-1', 'left-1', 'front-brace-2', 'right-1', 'left-roof-1', 'front-1', 'right-roof-1', 'left-roof-2', 'right-roof-2', 'back-1', 'front-2'],
  lose: ['right-roof-1', 'left-roof-2', 'right-roof-2'],
}

export const VILLAGE_TRACES = [
  {
    level: 3,
    win: ['sail-coral-1', 'left-1', 'left-roof-1', 'sail-mint-1', 'right-1', 'sail-blue-1', 'sail-amber-1', 'right-roof-1', 'left-roof-2', 'right-roof-2', 'back-1', 'front-1'],
    lose: ['sail-blue-1', 'sail-amber-1', 'left-roof-2'],
  },
  {
    level: 4,
    win: ['front-brace-1', 'back-brace-1', 'left-1', 'front-brace-2', 'right-1', 'left-roof-1', 'front-1', 'right-roof-1', 'left-roof-2', 'right-roof-2', 'back-1', 'front-2'],
    lose: ['front-brace-1', 'front-brace-2', 'front-1', 'right-roof-1', 'left-roof-2', 'right-roof-2'],
  },
  {
    level: 5,
    win: ['cafe-sign-1', 'cafe-sign-2', 'left-1', 'cafe-awning-1', 'right-1', 'left-roof-1', 'front-1', 'right-roof-1', 'left-roof-2', 'right-roof-2', 'back-1', 'front-2'],
    lose: ['right-roof-1', 'left-roof-2', 'right-roof-2'],
  },
]

/** Shared screws (6–8), hinged panels (9) and turning sails (10). */
export const MILL_TRACES = [
  {
    level: 6,
    win: ['front-1', 'front-2', 'left-1', 'right-1', 'left-roof-1', 'left-roof-2', 'right-roof-1', 'right-roof-2', 'back-1', 'wheel-1', 'wheel-axle', 'sluice-hatch-1'],
    lose: ['left-roof-2', 'right-roof-1', 'wheel-axle', 'wheel-1'],
  },
  {
    level: 7,
    win: ['left-1', 'right-1', 'left-roof-1', 'left-roof-2', 'right-roof-2', 'door-left-1', 'right-roof-1', 'door-bar-left', 'front-1', 'back-1', 'door-bar-right', 'front-2'],
    lose: ['right-1', 'left-roof-2', 'right-roof-1'],
  },
  {
    level: 8,
    win: ['back-1', 'left-1', 'right-1', 'left-roof-1', 'left-roof-2', 'right-roof-2', 'saw-guard-1', 'right-roof-1', 'log-rack-1', 'front-2', 'saw-bolt', 'back-2'],
    lose: ['right-1', 'left-roof-2', 'right-roof-1'],
  },
  {
    level: 9,
    win: ['left-1', 'right-1', 'left-roof-1', 'left-roof-2', 'right-roof-1', 'right-roof-2', 'loft-door-1', 'front-2', 'hoist-bolt', 'hoist-beam-1', 'back-hatch-1', 'back-1'],
    lose: ['right-1', 'left-roof-1', 'hoist-bolt', 'back-hatch-1'],
  },
  {
    level: 10,
    win: ['front-1', 'left-1', 'left-roof-2', 'right-roof-2', 'sail-coral-1', 'sail-amber-1', 'mill-door-1', 'back-1', 'right-1', 'sail-mint-1', 'sail-blue-1', 'mill-hub'],
    lose: ['left-1', 'left-roof-2', 'sail-mint-1'],
  },
]

/** Captive covers: a drop flap (11), storm shutters on rails (12), then practice (13–14) and the harbor assessment (15). */
export const HARBOR_TRACES = [
  {
    level: 11,
    win: ['port-1', 'port-2', 'starboard-1', 'bow-1', 'bow-2', 'transom-1', 'thwart-1', 'thwart-2', 'port-3', 'starboard-2', 'bait-flap-1', 'batten-1'],
    lose: ['port-1', 'port-3', 'starboard-2', 'bow-1'],
  },
  {
    level: 12,
    win: ['glass-left-1', 'glass-right-1', 'cap-left-1', 'cap-right-1', 'shutter-front-1', 'glass-front-1', 'shutter-back-1', 'glass-back-1', 'base-front-1', 'base-front-2', 'base-back-1', 'base-back-2'],
    lose: ['glass-left-1', 'glass-right-1', 'shutter-back-1', 'base-front-2'],
  },
  {
    level: 13,
    win: ['lid-1', 'lid-2', 'front-low', 'back-1', 'end-left-1', 'front-2', 'back-2', 'end-low', 'hasp-1', 'end-flap-1', 'lock-plate-1', 'cleat-1'],
    lose: ['lid-2', 'front-low', 'back-2'],
  },
  {
    level: 14,
    win: ['tower-front-1', 'tower-back-1', 'tower-door-1', 'cab-roof-1', 'jib-pivot', 'hook-block-1', 'cab-front-1', 'jib-2', 'counterweight-1', 'cab-back-1', 'tower-left-1', 'tower-right-1'],
    lose: ['tower-front-1', 'jib-pivot', 'jib-2'],
  },
  {
    level: 15,
    win: ['bow-1', 'stern-1', 'deck-1', 'deck-2', 'mast-collar-1', 'stern-flap-1', 'stern-batten-1', 'lantern-shutter-1', 'lantern-1', 'mast-bolt', 'port-1', 'starboard-1'],
    lose: ['bow-1', 'lantern-shutter-1', 'lantern-1'],
  },
]
