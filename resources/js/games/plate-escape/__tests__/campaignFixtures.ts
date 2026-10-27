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

/** Dials, each held by a stop pin (16–20); turns are written as `turn:<dial>:<1|-1>`. */
export const RAILWAY_TRACES = [
  {
    level: 16,
    win: ['smokebox-pin', 'side-left-1', 'cab-back-1', 'boiler-top-1', 'chimney-1', 'boiler-top-2', 'turn:smokebox-door:1', 'turn:smokebox-door:1', 'smokebox-door-0', 'turn:smokebox-door:1', 'smokebox-door-1', 'side-left-2', 'side-right-1', 'turn:smokebox-door:1', 'smokebox-door-2', 'turn:smokebox-door:1', 'smokebox-door-3'],
    lose: ['side-left-1', 'cab-back-1', 'boiler-top-1', 'smokebox-door-2'],
  },
  {
    level: 17,
    win: ['front-pin', 'front-2', 'lid-1', 'back-1', 'deck-1', 'deck-2', 'end-right-1', 'turn:tune-dial:1', 'tune-dial-0', 'end-left-1', 'turn:tune-dial:1', 'tune-dial-1', 'turn:tune-dial:1', 'tune-dial-2', 'turn:tune-dial:1', 'tune-dial-3'],
    lose: ['front-pin', 'lid-1', 'deck-1', 'deck-2', 'end-left-1'],
  },
  {
    level: 18,
    win: ['face-pin', 'back-1', 'back-2', 'back-3', 'left-1', 'right-1', 'roof-1', 'roof-2', 'roof-3', 'left-2', 'right-2', 'turn:clock-face:1', 'turn:clock-face:1', 'clock-face-0', 'turn:clock-face:1', 'clock-face-1', 'turn:clock-face:1', 'clock-face-2', 'turn:clock-face:1', 'clock-face-3'],
    lose: ['back-2', 'left-1', 'right-1', 'roof-2'],
  },
  {
    level: 19,
    win: ['front-pin', 'right-pin', 'left-1', 'shutter-1', 'base-back-2', 'roof-left-1', 'roof-right-1', 'back-1', 'base-back-1', 'turn:front-selector:-1', 'front-selector-0', 'turn:front-selector:1', 'front-selector-1', 'turn:front-selector:1', 'front-selector-2', 'turn:side-selector:-1', 'side-selector-0', 'turn:side-selector:1', 'side-selector-1', 'turn:side-selector:1', 'side-selector-2'],
    lose: ['right-pin', 'shutter-1', 'roof-left-1', 'front-selector-1'],
  },
  {
    level: 20,
    win: ['smokebox-pin', 'boiler-top-1', 'boiler-top-2', 'engine-near-1', 'engine-far-1', 'tender-near-1', 'tender-back-1', 'turn:smokebox-door:1', 'turn:smokebox-door:1', 'smokebox-door-0', 'tender-far-1', 'coal-hatch-1', 'turn:smokebox-door:1', 'turn:smokebox-door:1', 'smokebox-door-2', 'coupling-pin', 'bunker-rail-1', 'turn:smokebox-door:-1', 'smokebox-door-1', 'turn:smokebox-door:1', 'turn:smokebox-door:1', 'smokebox-door-3'],
    lose: ['boiler-top-1', 'tender-far-1', 'coal-hatch-1', 'bunker-rail-1'],
  },
] as const

/** Linked counterweights (21, the teaching level; 22–23), a stop-pin collar beside one (24) and the clockworks assessment (25). Dial turns are written `turn:<dial>:<1|-1>`. */
export const CLOCKWORK_TRACES = [
  {
    level: 21,
    win: ['front-1', 'front-2', 'back-1', 'back-2', 'right-1', 'roof-left-2', 'roof-right-2', 'left-2', 'roof-left-1', 'roof-right-1', 'back-3', 'left-1', 'right-2', 'weight-1', 'perch'],
    lose: ['front-1', 'front-2', 'back-1', 'back-3'],
  },
  {
    level: 22,
    win: ['front-1', 'front-2', 'front-3', 'back-1', 'back-2', 'front-weight-1', 'back-weight-1', 'left-1', 'front-landing', 'back-landing', 'right-1', 'housing-1', 'housing-2', 'left-2', 'right-2'],
    lose: ['back-1', 'front-weight-1', 'front-landing'],
  },
  {
    level: 23,
    win: ['front-1', 'front-2', 'apron-side', 'back-2', 'left-2', 'right-1', 'battlements-2', 'back-1', 'battlements-1', 'right-2', 'weight-1', 'apron-near', 'apron-far', 'front-3', 'left-1'],
    lose: ['front-1', 'front-2', 'weight-1'],
  },
  {
    level: 24,
    win: ['collar-pin', 'turn:collar:1', 'turn:collar:1', 'collar-0', 'turn:collar:1', 'collar-1', 'turn:collar:1', 'collar-2', 'front-2', 'back-1', 'turn:collar:1', 'collar-3', 'back-2', 'weight-1', 'lid-2', 'front-1', 'hatch-under', 'lid-1', 'left-1', 'right-1'],
    lose: ['collar-pin', 'collar-2', 'turn:collar:1', 'collar-3'],
  },
  {
    level: 25,
    win: ['chest-1', 'chest-2', 'weight-1', 'arm-left-1', 'arm-right-1', 'shoulders-2', 'face-1', 'spring-box', 'right-1', 'visor-1', 'shoulder-left', 'face-eye', 'shoulders-1', 'shoulder-right', 'left-1'],
    lose: ['chest-2', 'weight-1', 'spring-box'],
  },
]

/** Lab boards, played with dial turns written as `turn:<dial>:<1|-1>`. */
export const LAB_TRACES = [
  {
    level: 901,
    lab: 'dial-pin',
    win: ['door-pin', 'door-corner', 'dial-2', 'turn:dial:1', 'dial-3', 'turn:dial:1', 'dial-0', 'turn:dial:1', 'dial-1', 'back-1', 'back-2', 'top-1', 'top-2', 'left-1', 'right-1'],
    lose: ['door-pin', 'turn:dial:-1', 'dial-1', 'back-2', 'top-1'],
  },
  {
    level: 902,
    lab: 'dial-jam',
    win: ['door-pin', 'door-corner', 'dial-2', 'turn:dial:-1', 'dial-1', 'turn:dial:-1', 'dial-0', 'turn:dial:-1', 'dial-3', 'back-1', 'back-2', 'top-1', 'top-2', 'left-1', 'right-1'],
    lose: ['door-pin', 'dial-2', 'turn:dial:-1', 'dial-1', 'back-2', 'top-1'],
  },
] as const

/**
 * The fair (26–30), with dial turns written as `turn:<dial>:<1|-1>`. Each win frees the staging rack
 * early: on the carousel straight away, on the basket after the sign, in the theater by turning the
 * collar to it, and on the wheel and float first of all. The float's counterweight drops before the
 * screw behind its hatch comes out.
 */
export const FAIR_TRACES = [
  {
    level: 26,
    win: ['rack-1', 'canopy-front-1', 'canopy-back-1', 'canopy-left-1', 'canopy-right-1', 'horse-front-1', 'horse-front-2', 'horse-back-1', 'board-front-1', 'horse-back-2', 'board-back-1', 'drum-front-1', 'drum-front-2', 'drum-back-1', 'drum-back-2'],
    lose: ['canopy-back-1', 'canopy-left-1', 'horse-front-1'],
  },
  {
    level: 27,
    win: ['sign-1', 'sign-2', 'rack-1', 'burner-1', 'burner-2', 'basket-front-2', 'basket-front-1', 'sandbag-left-1', 'basket-back-1', 'basket-back-2', 'basket-left-1', 'sandbag-right-1', 'basket-right-1', 'skid-1', 'skid-2'],
    lose: ['burner-1', 'basket-back-1', 'basket-back-2'],
  },
  {
    level: 28,
    win: ['header-pin', 'turn:collar:-1', 'rack-1', 'header-left', 'turn:collar:-1', 'post-right-1', 'post-left-1', 'post-left-2', 'post-right-2', 'curtain-left-1', 'curtain-right-1', 'roof-1', 'backdrop-1', 'backdrop-2', 'roof-2', 'header-right', 'backdrop-3'],
    lose: ['header-right', 'curtain-left-1', 'curtain-right-1'],
  },
  {
    level: 29,
    win: ['rack-1', 'rack-2', 'wheel-pin', 'turn:collar:-1', 'spoke-a', 'turn:collar:1', 'turn:collar:1', 'spoke-b', 'rim-c', 'car-a-2', 'tower-2', 'car-a-1', 'car-b-1', 'rim-b', 'rim-a', 'tower-1', 'tower-back-1', 'tower-back-2'],
    lose: ['rack-1', 'car-a-1', 'car-b-1'],
  },
  {
    level: 30,
    win: ['rack-1', 'rack-2', 'canopy-left-1', 'canopy-right-1', 'garland-left', 'garland-right', 'arch-back-1', 'clock-pin', 'arch-front-1', 'weight-1', 'arch-back-2', 'skirt-left-1', 'skirt-right-1', 'turn:clock:-1', 'clock-a', 'turn:clock:1', 'turn:clock:1', 'clock-b'],
    lose: ['canopy-left-1', 'garland-left', 'garland-right'],
  },
] as const
