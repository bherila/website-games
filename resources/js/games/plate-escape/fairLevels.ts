import type { Plate, Point3, PuzzleLevel } from './level'

/** A part mounted on the outside of another: one panel thickness out, so their faces just clear. */
const PROUD = 0.27
/** How far proud of its host a collar turns: just clear of the heads behind it. */
const DIAL_PROUD = 0.32

type Side = 'front' | 'back' | 'left' | 'right'
const OUTWARD: Record<Side, readonly [number, number]> = { front: [0, 1], back: [0, -1], left: [-1, 0], right: [1, 0] }

/**
 * One triangular face of a four-sided pointed roof, from its eave (`half` out from the centre at
 * height `eave`) up to the apex. Its normal points outward and up, and its local Y runs up the slope.
 */
function pyramidFace(side: Side, apex: number, eave: number, half: number): Pick<Plate, 'position' | 'size' | 'normal' | 'up' | 'outline'> {
  const rise = apex - eave
  const length = Math.hypot(rise, half)
  const [x, z] = OUTWARD[side]
  return {
    position: [x * half / 2, (apex + eave) / 2, z * half / 2],
    size: [half * 2, length],
    normal: [x * rise / length, half / length, z * rise / length],
    up: [-x * half / length, rise / length, -z * half / length],
    outline: [[-half, -length / 2], [half, -length / 2], [0, length / 2]],
  }
}

/** A vertical panel facing `side`, `out` from the centre, its centre at height `y` and `along` across. */
function wall(side: Side, out: number, y: number, along = 0): Pick<Plate, 'position' | 'normal' | 'up'> {
  const [x, z] = OUTWARD[side]
  // Local X runs to the right as seen from outside: +x on the front, -x on the back, -z on the right.
  const across: Point3 = side === 'front' ? [1, 0, 0] : side === 'back' ? [-1, 0, 0] : side === 'left' ? [0, 0, 1] : [0, 0, -1]
  return { position: [x * out + across[0] * along, y, z * out + across[2] * along], normal: [x, 0, z], up: [0, 1, 0] }
}

/** A carousel horse in profile, facing its local +X: tail, back, a raised head, and four legs in pairs. */
const HORSE: readonly (readonly [number, number])[] = [
  [-1.15, 0.05], [-1.04, 0.32], [-0.76, 0.38], [0.35, 0.38], [0.5, 0.92], [0.95, 0.98], [1.17, 0.62], [1.1, 0.45], [0.85, 0.42],
  [0.72, 0.05], [0.65, -0.32], [0.63, -0.77], [0.41, -0.77], [0.39, -0.34], [-0.55, -0.34], [-0.59, -0.77], [-0.81, -0.77], [-0.83, -0.1], [-1.0, -0.05],
]

/** A tied sack, its neck at the top. */
const SANDBAG: readonly (readonly [number, number])[] = [[-0.42, -0.55], [0.42, -0.55], [0.46, 0.1], [0.22, 0.33], [0.12, 0.55], [-0.12, 0.55], [-0.22, 0.33], [-0.46, 0.1]]

/** A square arch: two legs under a lintel, open between them. */
const ARCH: readonly (readonly [number, number])[] = [[-1.3, -1.2], [-0.8, -1.2], [-0.8, 0.4], [0.8, 0.4], [0.8, -1.2], [1.3, -1.2], [1.3, 1.2], [-1.3, 1.2]]

/** An A-frame: two splayed legs meeting under the axle, open between them. */
const A_FRAME: readonly (readonly [number, number])[] = [[-1.7, -1.55], [-0.9, -1.55], [0, 0.95], [0.9, -1.55], [1.7, -1.55], [0.45, 1.55], [-0.45, 1.55]]

/** The wheel's rim, as a many-sided polygon just outside its nominal radius of 1.8. */
const WHEEL: readonly (readonly [number, number])[] = Array.from({ length: 48 }, (_, index) => [Math.cos(index * Math.PI / 24) * 1.82, Math.sin(index * Math.PI / 24) * 1.82] as const)

/**
 * Levels 26–30 at the fair. The staging rack arrives here: a cover marked with the rack's peg rail
 * that, once freed, opens one more spare slot for the rest of the attempt.
 */
export function createFairLevels(): PuzzleLevel[] {
  // The carousel: a pointed canopy on two rounding boards, a horse hung from each board on its pole,
  // and the mirrored drum round the centre pole behind the horses. The rack is on the drum's side.
  const apex = 2.2
  const eave = 1.25
  const spread = 1.6
  const horseY = -0.6
  const carousel: PuzzleLevel = {
    id: 26, name: 'Carousel', spareCapacity: 2, overflowLoses: true, trayColors: ['coral', 'mint', 'blue', 'amber', 'pearl'], stage: 'fairground', rack: 'rack',
    introduction: 'The staging rack on the drum is screwed shut. Take its screw out and the rack opens a third spare slot, marked with its peg rail, for the rest of this attempt. Undo or Retry shuts it again.',
    plates: [
      { id: 'canopy-front', name: 'Front canopy', ...pyramidFace('front', apex, eave, spread), restsOn: ['board-front'], finish: 'canopy', color: '#c8463d' },
      { id: 'canopy-back', name: 'Back canopy', ...pyramidFace('back', apex, eave, spread), restsOn: ['board-back'], finish: 'canopy', color: '#c8463d' },
      { id: 'canopy-left', name: 'Left canopy', ...pyramidFace('left', apex, eave, spread), restsOn: ['board-front', 'board-back'], finish: 'canopy', color: '#2f6f8f' },
      { id: 'canopy-right', name: 'Right canopy', ...pyramidFace('right', apex, eave, spread), restsOn: ['board-front', 'board-back'], finish: 'canopy', color: '#2f6f8f' },
      { id: 'board-front', name: 'Front rounding board', ...wall('front', 1.25, 0.75), size: [2.6, 0.7], finish: 'rounding', color: '#e9c46a' },
      { id: 'board-back', name: 'Back rounding board', ...wall('back', 1.25, 0.75), size: [2.6, 0.7], finish: 'rounding', color: '#e9c46a' },
      // Each horse hangs from its rounding board on a brass pole.
      { id: 'horse-front', name: 'Front horse', ...wall('front', 1.0, horseY), size: [2.4, 2.0], outline: HORSE, restsOn: ['board-front'], finish: 'horse', color: '#f4efe4' },
      { id: 'horse-back', name: 'Back horse', ...wall('back', 1.0, horseY), size: [2.4, 2.0], outline: HORSE, restsOn: ['board-back'], finish: 'horse', color: '#f1d9a6' },
      { id: 'drum-front', name: 'Front mirror panel', ...wall('front', 0.55, horseY), size: [1.2, 1.0], finish: 'mirror', color: '#2f6f8f' },
      { id: 'drum-back', name: 'Back mirror panel', ...wall('back', 0.55, horseY), size: [1.2, 1.0], finish: 'mirror', color: '#2f6f8f' },
      { id: 'rack', name: 'Staging rack', ...wall('right', 0.58, horseY), size: [0.84, 1.0], finish: 'rack-door', color: '#e07a2f' },
    ],
    screws: [
      { id: 'canopy-front-1', plate: 'canopy-front', color: 'coral', position: [0, -0.3] },
      { id: 'canopy-back-1', plate: 'canopy-back', color: 'blue', position: [0, -0.3] },
      { id: 'canopy-left-1', plate: 'canopy-left', color: 'pearl', position: [0, -0.3] },
      { id: 'canopy-right-1', plate: 'canopy-right', color: 'coral', position: [0, -0.3] },
      { id: 'board-front-1', plate: 'board-front', color: 'blue', position: [0.75, -0.05] },
      { id: 'board-back-1', plate: 'board-back', color: 'amber', position: [0.75, -0.05] },
      { id: 'horse-front-1', plate: 'horse-front', color: 'pearl', position: [0.78, 0.62] },
      { id: 'horse-front-2', plate: 'horse-front', color: 'mint', position: [-0.72, 0.12] },
      { id: 'horse-back-1', plate: 'horse-back', color: 'mint', position: [0.78, 0.62] },
      { id: 'horse-back-2', plate: 'horse-back', color: 'coral', position: [-0.72, 0.12] },
      // Behind each horse's body.
      { id: 'drum-front-1', plate: 'drum-front', color: 'blue', position: [-0.3, 0.08], blockedBy: ['horse-front'] },
      { id: 'drum-front-2', plate: 'drum-front', color: 'amber', position: [0.22, -0.08], blockedBy: ['horse-front'] },
      { id: 'drum-back-1', plate: 'drum-back', color: 'pearl', position: [-0.3, 0.08], blockedBy: ['horse-back'] },
      { id: 'drum-back-2', plate: 'drum-back', color: 'amber', position: [0.22, -0.08], blockedBy: ['horse-back'] },
      { id: 'rack-1', plate: 'rack', color: 'mint', position: [0, 0.22] },
    ],
  }

  // A balloon basket on its launch field, the envelope overhead. The rack hangs on the basket's front
  // behind the ride sign, which slides down its rail onto the skid when freed and stays there.
  const front = 0.9
  const basket = { x: 1.3, y: -0.6, height: 1.8 }
  const balloon: PuzzleLevel = {
    id: 27, name: 'Balloon Basket', spareCapacity: 2, overflowLoses: true, trayColors: ['coral', 'mint', 'blue', 'amber', 'pearl'], stage: 'balloon-field', rack: 'rack',
    plates: [
      { id: 'burner', name: 'Burner deck', position: [0, basket.y + basket.height / 2 + 0.13, 0], size: [2.7, 1.9], normal: [0, 1, 0], up: [0, 0, -1], restsOn: ['basket-left', 'basket-right'], finish: 'plank', color: '#8a6040' },
      { id: 'basket-front', name: 'Basket front', ...wall('front', front, basket.y), size: [basket.x * 2, basket.height], finish: 'wicker', color: '#c9965a' },
      { id: 'basket-back', name: 'Basket back', ...wall('back', front, basket.y), size: [basket.x * 2, basket.height], finish: 'wicker', color: '#c9965a' },
      { id: 'basket-left', name: 'Basket left side', ...wall('left', basket.x, basket.y), size: [front * 2, basket.height], finish: 'wicker', color: '#bd8a50' },
      { id: 'basket-right', name: 'Basket right side', ...wall('right', basket.x, basket.y), size: [front * 2, basket.height], finish: 'wicker', color: '#bd8a50' },
      { id: 'sandbag-left', name: 'Left sandbag', ...wall('left', basket.x + PROUD, basket.y), size: [0.92, 1.1], outline: SANDBAG, restsOn: ['basket-left'], finish: 'sandbag', color: '#d8c7a0' },
      { id: 'sandbag-right', name: 'Right sandbag', ...wall('right', basket.x + PROUD, basket.y), size: [0.92, 1.1], outline: SANDBAG, restsOn: ['basket-right'], finish: 'sandbag', color: '#d8c7a0' },
      { id: 'rack', name: 'Staging rack', ...wall('front', front + PROUD, -0.1, 0.2), size: [1.1, 0.8], finish: 'rack-door', color: '#e07a2f' },
      { id: 'skid', name: 'Basket skid', ...wall('front', front + PROUD, -1.15), size: [2.4, 0.6], finish: 'beam', color: '#6b4428' },
      // The ride sign stands over the rack; freed, it slides down its rail onto the skid.
      { id: 'sign', name: 'Ride sign', ...wall('front', front + PROUD * 2, -0.1, 0.2), size: [1.2, 1.0], rail: { along: [0, -1, 0], travel: 0.95 }, host: 'basket-front', finish: 'banner', color: '#2f6f8f' },
    ],
    screws: [
      { id: 'burner-1', plate: 'burner', color: 'blue', position: [-0.7, 0.3] },
      { id: 'burner-2', plate: 'burner', color: 'coral', position: [0.7, -0.3] },
      // Behind the rack, which is behind the sign.
      { id: 'basket-front-2', plate: 'basket-front', color: 'blue', position: [-0.1, 0.37], blockedBy: ['rack', 'sign'] },
      // Beside the sign, clear of where it comes to rest.
      { id: 'basket-front-1', plate: 'basket-front', color: 'mint', position: [-1.0, 0.37] },
      { id: 'basket-back-1', plate: 'basket-back', color: 'blue', position: [-0.6, 0.1] },
      { id: 'basket-back-2', plate: 'basket-back', color: 'amber', position: [0.6, -0.3] },
      { id: 'basket-left-1', plate: 'basket-left', color: 'amber', position: [0, -0.3], blockedBy: ['sandbag-left'] },
      { id: 'basket-right-1', plate: 'basket-right', color: 'pearl', position: [0, -0.3], blockedBy: ['sandbag-right'] },
      { id: 'sandbag-left-1', plate: 'sandbag-left', color: 'mint', position: [0, 0.1] },
      { id: 'sandbag-right-1', plate: 'sandbag-right', color: 'coral', position: [0, 0.1] },
      { id: 'sign-1', plate: 'sign', color: 'mint', position: [-0.15, 0.25] },
      { id: 'sign-2', plate: 'sign', color: 'coral', position: [0.2, -0.25] },
      { id: 'rack-1', plate: 'rack', color: 'pearl', position: [0.25, 0.15], blockedBy: ['sign'] },
      // Where the sign comes to rest.
      { id: 'skid-1', plate: 'skid', color: 'amber', position: [0.2, 0.05], coveredWhenOpen: ['sign'] },
      { id: 'skid-2', plate: 'skid', color: 'pearl', position: [-0.9, 0] },
    ],
  }

  // A puppet theater: a narrow post, the stage opening with its curtains and painted backdrop, and a
  // wide prompt board carrying the collar and the rack. The header is bolted through both posts and
  // carries the collar on a bracket, so the rack can be reached either by turning the collar to it or
  // by taking the header down, collar and all.
  const face = 0.8
  const collarCentre = [1.3, 0] as const
  // The window starts at nine o'clock, clear of the red stop at the top that rests against the pin.
  const collar = { stops: 4, windows: [3], windowRadius: 0.6, pins: ['header-pin'] }
  const theater: PuzzleLevel = {
    id: 28, name: 'Puppet Theater', spareCapacity: 2, overflowLoses: true, trayColors: ['coral', 'mint', 'blue', 'amber', 'pearl'], stage: 'showground', rack: 'rack',
    plates: [
      { id: 'post-left', name: 'Left post', ...wall('front', face, 0.05, -1.85), size: [0.7, 3.1], finish: 'proscenium', color: '#a8323a' },
      { id: 'post-right', name: 'Prompt board', ...wall('front', face, 0.05, 1.275), size: [1.85, 3.1], finish: 'proscenium', color: '#a8323a' },
      { id: 'header', name: 'Theater header', ...wall('front', face + PROUD, 1.2), size: [4.6, 1.2], finish: 'proscenium', color: '#8e2a33' },
      {
        id: 'collar', name: 'Collar', position: [collarCentre[0], collarCentre[1], face + PROUD + DIAL_PROUD], size: [1.94, 1.94], normal: [0, 0, 1], up: [0, 1, 0],
        host: 'header', dial: collar, finish: 'dial', color: '#c9a64b',
      },
      { id: 'rack', name: 'Staging rack', ...wall('front', face + PROUD, -0.87, 1.3), size: [0.6, 1.1], finish: 'rack-door', color: '#e07a2f' },
      { id: 'curtain-left', name: 'Left curtain', ...wall('front', 0.62, -0.4, -1.17), size: [0.55, 2.1], restsOn: ['header'], finish: 'curtain', color: '#7a1f2b' },
      { id: 'curtain-right', name: 'Right curtain', ...wall('front', 0.62, -0.4, 0.025), size: [0.55, 2.1], restsOn: ['header'], finish: 'curtain', color: '#7a1f2b' },
      { id: 'backdrop', name: 'Backdrop', ...wall('front', 0.2, -0.45, -0.6), size: [1.8, 2.1], finish: 'backdrop', color: '#8fc3d9' },
      { id: 'roof', name: 'Theater roof', position: [0, 2.1, 0.35], size: [4.6, Math.hypot(1.7, 0.5)], normal: [0, 1.7 / Math.hypot(1.7, 0.5), 0.5 / Math.hypot(1.7, 0.5)], up: [0, 0.5 / Math.hypot(1.7, 0.5), -1.7 / Math.hypot(1.7, 0.5)], restsOn: ['header', 'backdrop'], finish: 'tent', color: '#2f6f8f' },
    ],
    screws: [
      // The frame bolts: each runs through the header into a post.
      { id: 'header-left', plate: 'header', through: ['post-left'], color: 'mint', position: [-1.85, 0.1] },
      { id: 'header-right', plate: 'header', through: ['post-right'], color: 'blue', position: [1.9, 0.1] },
      // Just above the collar's rim: the stop pin.
      { id: 'header-pin', plate: 'header', color: 'coral', position: [1.3, 0.05] },
      // Behind the collar: the rack's screw at the bottom, a prompt-board screw to the right.
      { id: 'rack-1', plate: 'rack', color: 'pearl', position: [0, 0.27], underDial: { dial: 'collar', slot: 2 } },
      { id: 'post-right-1', plate: 'post-right', color: 'pearl', position: [0.625, -0.05], underDial: { dial: 'collar', slot: 1 } },
      { id: 'post-left-1', plate: 'post-left', color: 'mint', position: [0, -1.2] },
      { id: 'post-left-2', plate: 'post-left', color: 'coral', position: [0, -0.5] },
      { id: 'post-right-2', plate: 'post-right', color: 'mint', position: [-0.625, -1.3] },
      { id: 'curtain-left-1', plate: 'curtain-left', color: 'pearl', position: [0, -0.75] },
      { id: 'curtain-right-1', plate: 'curtain-right', color: 'blue', position: [0, -0.75] },
      // The backdrop: one screw behind each curtain and one showing between them.
      { id: 'backdrop-1', plate: 'backdrop', color: 'amber', position: [-0.57, -0.15], blockedBy: ['curtain-left'] },
      { id: 'backdrop-2', plate: 'backdrop', color: 'amber', position: [0.625, -0.15], blockedBy: ['curtain-right'] },
      { id: 'backdrop-3', plate: 'backdrop', color: 'amber', position: [0.025, -0.15] },
      { id: 'roof-1', plate: 'roof', color: 'coral', position: [-1.2, 0] },
      { id: 'roof-2', plate: 'roof', color: 'blue', position: [1.2, 0] },
    ],
  }

  // The Ferris wheel at night: an A-frame each side of the axle, the wheel bolted to the front frame
  // through two spokes behind the hub collar, two gondolas and the marked rack mounted on the rim.
  // The left gondola rides a rail: freed, it drops down the frame's leg onto the screw there.
  const hub = [0, 1.3] as const
  const rim = (angle: number, radius = 1.45): [number, number] => [hub[0] + Math.cos(angle * Math.PI / 180) * radius, hub[1] + Math.sin(angle * Math.PI / 180) * radius]
  const tower = 0.2
  const wheelZ = tower + PROUD
  const gondolaZ = wheelZ + PROUD
  const [carA, carB] = [rim(0), rim(-150)]
  const rackAt = rim(135, 1.4)
  const radial = [Math.cos(135 * Math.PI / 180), Math.sin(135 * Math.PI / 180), 0] as const
  const ferris: PuzzleLevel = {
    id: 29, name: 'Ferris Wheel', spareCapacity: 2, overflowLoses: true, trayColors: ['coral', 'mint', 'blue', 'amber', 'pearl'], stage: 'midway', rack: 'rack',
    plates: [
      { id: 'tower', name: 'Front frame', position: [0, -0.05, tower], size: [3.4, 3.1], normal: [0, 0, 1], up: [0, 1, 0], outline: A_FRAME, finish: 'girder', color: '#c9ccd1' },
      { id: 'tower-back', name: 'Back frame', position: [0, -0.05, -tower], size: [3.4, 3.1], normal: [0, 0, -1], up: [0, 1, 0], outline: A_FRAME, finish: 'girder', color: '#c9ccd1' },
      { id: 'wheel', name: 'Wheel', position: [hub[0], hub[1], wheelZ], size: [3.64, 3.64], normal: [0, 0, 1], up: [0, 1, 0], outline: WHEEL, restsOn: ['tower', 'tower-back'], finish: 'ferris', color: '#e8e2d4' },
      { id: 'collar', name: 'Hub collar', position: [hub[0], hub[1], wheelZ + DIAL_PROUD], size: [1.74, 1.74], normal: [0, 0, 1], up: [0, 1, 0], host: 'wheel', dial: { stops: 4, windows: [2], windowRadius: 0.5, pins: ['wheel-pin'] }, finish: 'dial', color: '#d9a441' },
      { id: 'car-a', name: 'Right gondola', position: [carA[0], carA[1] - 0.3, gondolaZ], size: [1.05, 1.15], normal: [0, 0, 1], up: [0, 1, 0], restsOn: ['wheel'], finish: 'gondola', color: '#2f8f83' },
      { id: 'car-b', name: 'Left gondola', position: [carB[0], carB[1] - 0.3, gondolaZ], size: [0.9, 1.15], normal: [0, 0, 1], up: [0, 1, 0], rail: { along: [0, -1, 0], travel: 1.2 }, host: 'wheel', finish: 'gondola', color: '#d9473b' },
      // Mounted across the rim, its top toward the rim's edge.
      { id: 'rack', name: 'Staging rack', position: [rackAt[0], rackAt[1], gondolaZ], size: [1.1, 0.95], normal: [0, 0, 1], up: radial, finish: 'rack-door', color: '#e07a2f' },
    ],
    screws: [
      // The spoke bolts run through the wheel into the front frame, behind the collar at three and nine.
      { id: 'spoke-a', plate: 'wheel', through: ['tower'], color: 'blue', position: [0.5, 0], underDial: { dial: 'collar', slot: 1 } },
      { id: 'spoke-b', plate: 'wheel', through: ['tower'], color: 'amber', position: [-0.5, 0], underDial: { dial: 'collar', slot: 3 } },
      { id: 'wheel-pin', plate: 'wheel', color: 'coral', position: [0, 1.17] },
      { id: 'rim-a', plate: 'wheel', color: 'pearl', position: [carA[0] - hub[0], carA[1] - hub[1]], blockedBy: ['car-a'] },
      { id: 'rim-b', plate: 'wheel', color: 'blue', position: [carB[0] - hub[0], carB[1] - hub[1]], blockedBy: ['car-b'] },
      { id: 'rim-c', plate: 'wheel', color: 'mint', position: [radial[0] * 1.3, radial[1] * 1.3], blockedBy: ['rack'] },
      { id: 'car-a-1', plate: 'car-a', color: 'pearl', position: [-0.27, -0.2] },
      { id: 'car-a-2', plate: 'car-a', color: 'mint', position: [0.27, -0.2] },
      { id: 'car-b-1', plate: 'car-b', color: 'blue', position: [0, -0.15] },
      { id: 'rack-1', plate: 'rack', color: 'amber', position: [-0.3, 0.2] },
      { id: 'rack-2', plate: 'rack', color: 'coral', position: [0.3, 0.2] },
      // On the frame's legs, below the wheel: the left gondola comes to rest over the first.
      { id: 'tower-1', plate: 'tower', color: 'pearl', position: [-1.1, -0.9], coveredWhenOpen: ['car-b'] },
      { id: 'tower-2', plate: 'tower', color: 'coral', position: [1.1, -0.9] },
      { id: 'tower-back-1', plate: 'tower-back', color: 'mint', position: [-1.1, -0.9] },
      { id: 'tower-back-2', plate: 'tower-back', color: 'amber', position: [1.1, -0.9] },
    ],
  }

  // The festival float: an arch at each end carrying the canopy, a garland bolted through the front
  // arch, a clock on the right-hand side and the rack on the left. On the back arch a counterweight
  // hangs on the left leg; its cord runs over two pulleys under the lintel to the hatch on the right
  // leg, which it lifts clear of the screw behind it when the weight drops, like a sash window.
  const archRun = 1.55
  const archRise = 0.65
  const slope = Math.hypot(archRun, archRise)
  /** How far the weight drops, and so how far the hatch rises. */
  const sash = 0.7
  const clock = { stops: 4, windows: [2], windowRadius: 0.42, pins: ['clock-pin'] }
  const float: PuzzleLevel = {
    id: 30, name: 'Festival Float', spareCapacity: 2, overflowLoses: true, trayColors: ['coral', 'mint', 'blue', 'amber', 'pearl'], stage: 'parade', rack: 'rack',
    plates: [
      { id: 'canopy-left', name: 'Left canopy', position: [-archRun / 2, 1.5 + archRise / 2, 0], size: [2.7, slope], normal: [-archRise / slope, archRun / slope, 0], up: [archRun / slope, archRise / slope, 0], restsOn: ['arch-front', 'arch-back'], finish: 'tent', color: '#7b4fa0' },
      { id: 'canopy-right', name: 'Right canopy', position: [archRun / 2, 1.5 + archRise / 2, 0], size: [2.7, slope], normal: [archRise / slope, archRun / slope, 0], up: [-archRun / slope, archRise / slope, 0], restsOn: ['arch-front', 'arch-back'], finish: 'tent', color: '#7b4fa0' },
      { id: 'arch-front', name: 'Front arch', ...wall('front', 1.1, 0.3), size: [2.6, 2.4], outline: ARCH, finish: 'arch', color: '#2f8f83' },
      { id: 'arch-back', name: 'Back arch', ...wall('back', 1.1, 0.3), size: [2.6, 2.4], outline: ARCH, finish: 'arch', color: '#2f8f83' },
      // Bolted through the front arch's lintel; the flap on it drops open over the arch's right leg.
      { id: 'garland', name: 'Garland board', ...wall('front', 1.1 + PROUD, 1.1), size: [2.6, 0.7], finish: 'banner', color: '#d9473b' },
      // The back arch's local X runs toward world -X: the weight is on its left leg as seen from behind.
      { id: 'weight', name: 'Counterweight', ...wall('back', 1.1 + PROUD, 0.35, 1.05), size: [0.56, 0.6], rail: { along: [0, -1, 0], travel: sash }, host: 'arch-back', finish: 'weight', color: '#4a4f55' },
      {
        id: 'hatch', name: 'Float hatch', ...wall('back', 1.1 + PROUD, -0.45, -1.05), size: [0.56, 0.6], rail: { along: [0, 1, 0], travel: sash }, host: 'arch-back', drivenBy: 'weight',
        cord: [[-1.05, 0.85, -1.1 - PROUD], [1.05, 0.85, -1.1 - PROUD]], finish: 'plank', color: '#e9c46a',
      },
      { id: 'clock-board', name: 'Clock board', ...wall('right', 1.4, 0), size: [2.2, 1.8], finish: 'proscenium', color: '#2f6f8f' },
      { id: 'clock', name: 'Clock face', position: [1.4 + DIAL_PROUD, -0.1, 0], size: [1.58, 1.58], normal: [1, 0, 0], up: [0, 1, 0], host: 'clock-board', dial: clock, finish: 'dial', color: '#f1e3c0' },
      { id: 'rack', name: 'Staging rack', ...wall('left', 1.45, -0.4), size: [1.2, 0.8], finish: 'rack-door', color: '#e07a2f' },
      { id: 'skirt-left', name: 'Left skirt', ...wall('left', 1.45, -1.25), size: [2.4, 0.6], finish: 'curtain', color: '#e9c46a' },
      { id: 'skirt-right', name: 'Right skirt', ...wall('right', 1.45, -1.25), size: [2.4, 0.6], finish: 'curtain', color: '#e9c46a' },
    ],
    screws: [
      { id: 'canopy-left-1', plate: 'canopy-left', color: 'pearl', position: [0, 0] },
      { id: 'canopy-right-1', plate: 'canopy-right', color: 'coral', position: [0, 0] },
      { id: 'garland-left', plate: 'garland', through: ['arch-front'], color: 'blue', position: [-0.9, 0] },
      { id: 'garland-right', plate: 'garland', through: ['arch-front'], color: 'amber', position: [0.9, 0] },
      { id: 'arch-front-1', plate: 'arch-front', color: 'pearl', position: [1.05, 0.1] },
      { id: 'weight-1', plate: 'weight', color: 'blue', position: [0, 0] },
      // On the back arch's lintel, above the cord, and behind the hatch on the right leg.
      { id: 'arch-back-1', plate: 'arch-back', color: 'mint', position: [0, 0.95] },
      { id: 'arch-back-2', plate: 'arch-back', color: 'blue', position: [-1.05, -0.75], blockedBy: ['hatch'] },
      { id: 'skirt-left-1', plate: 'skirt-left', color: 'amber', position: [0.6, 0] },
      { id: 'skirt-right-1', plate: 'skirt-right', color: 'amber', position: [0.6, 0] },
      // A stop pin beside the clock, and a screw behind the clock at three and at nine.
      { id: 'clock-pin', plate: 'clock-board', color: 'coral', position: [0.85, 0.6] },
      { id: 'clock-a', plate: 'clock-board', color: 'mint', position: [0.42, -0.1], underDial: { dial: 'clock', slot: 1 } },
      { id: 'clock-b', plate: 'clock-board', color: 'pearl', position: [-0.42, -0.1], underDial: { dial: 'clock', slot: 3 } },
      { id: 'rack-1', plate: 'rack', color: 'coral', position: [-0.3, 0.12] },
      { id: 'rack-2', plate: 'rack', color: 'mint', position: [0.3, 0.12] },
    ],
  }

  return [carousel, balloon, theater, ferris, float]
}


