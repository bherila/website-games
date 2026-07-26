import type { MoveIntent } from '../engine/types'
import {
  type BoardOrientationPreference,
  type BoardQuarterTurns,
  chooseQuarterTurns,
  clampBoxToVisualViewport,
  COMFORTABLE_PX_PER_TILE,
  cycleBoardOrientationPreference,
  DEFAULT_ROTATED_QUARTER_TURNS,
  DEVICE_ANGLE_TURNED_CLOCKWISE,
  normaliseDeviceAngle,
  ROTATE_GAIN_THRESHOLD,
  type RotatedQuarterTurns,
  rotatedTurnsForDeviceAngle,
  rotateIntent,
  tilePxForRotation,
} from '../input/orientation'

const DIRECTIONS: readonly MoveIntent[] = ['up', 'right', 'down', 'left']

function decide(
  viewport: { width: number, height: number },
  board: { cols: number, rows: number },
  current: BoardQuarterTurns = 0,
  preference: BoardOrientationPreference = 'auto',
  rotatedTurns: RotatedQuarterTurns = 1,
): BoardQuarterTurns {
  return chooseQuarterTurns({ viewport, board, current, preference, rotatedTurns })
}

describe('tilePxForRotation', () => {
  it('measures the board against the viewport as-is at 0 turns', () => {
    // 10 cols x 20 rows in a 200x200 box is height-bound: 200/20 = 10 px/tile.
    expect(tilePxForRotation({ width: 200, height: 200 }, { cols: 10, rows: 20 }, 0)).toBeCloseTo(10)
  })

  it('swaps the board axes at a quarter turn', () => {
    // Rotated, the same board is 20 wide x 10 tall on screen: 200/20 = 10 px/tile.
    expect(tilePxForRotation({ width: 400, height: 200 }, { cols: 10, rows: 20 }, 1)).toBeCloseTo(20)
    expect(tilePxForRotation({ width: 400, height: 200 }, { cols: 10, rows: 20 }, 0)).toBeCloseTo(10)
  })

  it('is unchanged by a half turn and matches the quarter turn at three quarters', () => {
    const board = { cols: 7, rows: 13 }
    const viewport = { width: 400, height: 300 }
    expect(tilePxForRotation(viewport, board, 2)).toBeCloseTo(tilePxForRotation(viewport, board, 0))
    expect(tilePxForRotation(viewport, board, 3)).toBeCloseTo(tilePxForRotation(viewport, board, 1))
  })
})

describe('rotatedTurnsForDeviceAngle', () => {
  it('turns counter-clockwise only for a device turned clockwise', () => {
    // The board must lean the opposite way to the device to come out world-upright.
    expect(rotatedTurnsForDeviceAngle(DEVICE_ANGLE_TURNED_CLOCKWISE)).toBe(3)
    expect(rotatedTurnsForDeviceAngle(90)).toBe(1)
  })

  it('keeps the clockwise default for both portrait angles (neither is world-upright)', () => {
    expect(rotatedTurnsForDeviceAngle(0)).toBe(1)
    expect(rotatedTurnsForDeviceAngle(180)).toBe(1)
  })

  it('falls back to the clockwise default when the angle cannot be read', () => {
    expect(rotatedTurnsForDeviceAngle(null)).toBe(DEFAULT_ROTATED_QUARTER_TURNS)
    expect(rotatedTurnsForDeviceAngle(undefined)).toBe(DEFAULT_ROTATED_QUARTER_TURNS)
    expect(rotatedTurnsForDeviceAngle(Number.NaN)).toBe(DEFAULT_ROTATED_QUARTER_TURNS)
    expect(rotatedTurnsForDeviceAngle(Number.POSITIVE_INFINITY)).toBe(DEFAULT_ROTATED_QUARTER_TURNS)
    expect(DEFAULT_ROTATED_QUARTER_TURNS).toBe(1)
  })

  it('never returns 0 — it picks a direction, it never cancels a rotation', () => {
    for (const angle of [0, 45, 90, 135, 180, 225, 270, 315, 360, -90, Number.NaN, null, undefined]) {
      expect([1, 3]).toContain(rotatedTurnsForDeviceAngle(angle))
    }
  })

  it('snaps odd angles to the nearest quarter turn and normalises out-of-range ones', () => {
    expect(normaliseDeviceAngle(268)).toBe(270)
    expect(normaliseDeviceAngle(-90)).toBe(270)
    expect(normaliseDeviceAngle(360)).toBe(0)
    expect(normaliseDeviceAngle(450)).toBe(90)
    expect(normaliseDeviceAngle(Number.NaN)).toBeNull()
    expect(normaliseDeviceAngle(undefined)).toBeNull()
    expect(rotatedTurnsForDeviceAngle(268)).toBe(3)
    expect(rotatedTurnsForDeviceAngle(-90)).toBe(3)
  })
})

describe('chooseQuarterTurns', () => {
  it('leaves a square board upright in any viewport', () => {
    expect(decide({ width: 375, height: 812 }, { cols: 11, rows: 11 })).toBe(0)
    expect(decide({ width: 812, height: 375 }, { cols: 11, rows: 11 })).toBe(0)
    // ...and does not hold a square board rotated once it somehow got there.
    expect(decide({ width: 812, height: 375 }, { cols: 11, rows: 11 }, 1)).toBe(0)
  })

  it('rotates a tall board in a landscape viewport', () => {
    // 7x13 (the pack's tallest board) on a landscape phone: 23 px/tile upright vs 42 rotated.
    expect(decide({ width: 812, height: 300 }, { cols: 7, rows: 13 })).toBe(1)
  })

  it('rotates a wide board in a portrait viewport', () => {
    // 12x5 (the pack's widest board) on a portrait phone: 31 px/tile upright vs 50 rotated.
    expect(decide({ width: 375, height: 600 }, { cols: 12, rows: 5 })).toBe(1)
  })

  it('leaves a tall board upright in a portrait viewport', () => {
    expect(decide({ width: 375, height: 600 }, { cols: 7, rows: 13 })).toBe(0)
  })

  it('does not flip below the hysteresis margin, from either state', () => {
    // 10x20 board in 1100x1000: 50 px/tile upright vs 55 rotated — a 1.10x gain,
    // under the 1.15 margin. Both clear the fit floor and stay under the comfort ceiling.
    const viewport = { width: 1100, height: 1000 }
    const board = { cols: 10, rows: 20 }
    expect(tilePxForRotation(viewport, board, 1) / tilePxForRotation(viewport, board, 0)).toBeCloseTo(1.1)

    expect(decide(viewport, board, 0)).toBe(0)
    // The band is sticky in both directions: the same measurement holds a rotated board rotated.
    expect(decide(viewport, board, 1)).toBe(1)
  })

  it('flips exactly at the margin', () => {
    // 1150x1000 makes the rotated tile 57.5 px against 50 px upright — exactly 1.15x.
    expect(decide({ width: 1150, height: 1000 }, { cols: 10, rows: 20 }, 0)).toBe(1)
    expect(decide({ width: 1145, height: 1000 }, { cols: 10, rows: 20 }, 0)).toBe(0)
  })

  it('un-rotates only once the upright gain clears the same margin', () => {
    const board = { cols: 10, rows: 20 }
    // 10x20 in 1000x1150: upright 57.5 px/tile (1150/20) vs rotated 50 (1000/20) — exactly 1.15x.
    expect(decide({ width: 1000, height: 1150 }, board, 1)).toBe(0)
    // A hair short of the margin and the rotated board stays rotated.
    expect(decide({ width: 1000, height: 1145 }, board, 1)).toBe(1)
    // From upright, the same measurement never rotates.
    expect(decide({ width: 1000, height: 1145 }, board, 0)).toBe(0)
  })

  it('does not rotate a board too big to fit either way (the follow camera owns those)', () => {
    // 26x17 on a portrait phone: 14 px/tile upright, 22 rotated — a 1.5x gain that
    // still cannot show the whole board at the 32 px/tile floor, so the scene
    // follows the player instead and a quarter turn would only disorient.
    const viewport = { width: 375, height: 580 }
    const board = { cols: 26, rows: 17 }
    expect(tilePxForRotation(viewport, board, 1)).toBeLessThan(32)
    expect(tilePxForRotation(viewport, board, 1) / tilePxForRotation(viewport, board, 0)).toBeGreaterThan(1.15)

    expect(decide(viewport, board, 0)).toBe(0)
  })

  it('relaxes the fit floor by the same margin while already rotated', () => {
    // 10x20 board in a wide 1000px box: rotated is height-bound at exactly the
    // 32 px/tile floor when the box is 320 tall, and beats upright 2:1.
    const board = { cols: 10, rows: 20 }
    const atFloor = { width: 1000, height: 320 }
    expect(tilePxForRotation(atFloor, board, 1)).toBeCloseTo(32)
    expect(decide(atFloor, board, 0)).toBe(1)

    // Shrinking just under the floor keeps an upright board upright...
    const underFloor = { width: 1000, height: 300 }
    expect(decide(underFloor, board, 0)).toBe(0)
    // ...but an already-rotated board holds until it falls 15% below the floor.
    expect(decide(underFloor, board, 1)).toBe(1)
    expect(decide({ width: 1000, height: 250 }, board, 1)).toBe(0)
  })

  it('does not rotate a board that is already comfortable upright', () => {
    // 9x11 in a desktop window: 79 px/tile upright, 97 rotated. That is a real
    // 1.23x gain, but 79 px/tile is already comfortable, and turning a level
    // sideways on a big screen is a bad trade.
    const viewport = { width: 1703, height: 870 }
    const board = { cols: 9, rows: 11 }
    expect(tilePxForRotation(viewport, board, 1) / tilePxForRotation(viewport, board, 0)).toBeGreaterThan(1.15)
    expect(tilePxForRotation(viewport, board, 0)).toBeGreaterThan(COMFORTABLE_PX_PER_TILE)

    expect(decide(viewport, board, 0)).toBe(0)
  })

  it('still rotates a cramped board on a desktop window', () => {
    // 11x17 in the same window is only 51 px/tile upright — under the comfort
    // ceiling — and a quarter turn takes it to 79.
    expect(decide({ width: 1703, height: 870 }, { cols: 11, rows: 17 }, 0)).toBe(1)
  })

  it('holds a rotated board until upright is comfortable by the same margin', () => {
    const board = { cols: 9, rows: 11 }
    // Upright is exactly at the comfort ceiling (64 px/tile): enough to stay
    // upright, not enough to un-rotate a board that is already turned.
    const atCeiling = { width: 900, height: 704 }
    expect(tilePxForRotation(atCeiling, board, 0)).toBeCloseTo(COMFORTABLE_PX_PER_TILE)
    expect(decide(atCeiling, board, 0)).toBe(0)
    expect(decide(atCeiling, board, 1)).toBe(1)

    // 15% past the ceiling and the rotated board flips back.
    expect(decide({ width: 900, height: 810 }, board, 1)).toBe(0)
  })

  it('turns the board the device-appropriate way without changing whether it turns', () => {
    const landscape = { width: 812, height: 300 }
    const tall = { cols: 7, rows: 13 }
    const portrait = { width: 375, height: 600 }

    // Same geometry, both directions: the rotate/don't-rotate answer is identical.
    expect(decide(landscape, tall, 0, 'auto', 1)).toBe(1)
    expect(decide(landscape, tall, 0, 'auto', 3)).toBe(3)
    expect(decide(portrait, tall, 0, 'auto', 1)).toBe(0)
    expect(decide(portrait, tall, 0, 'auto', 3)).toBe(0)
  })

  it('treats either turned direction as the same hysteresis anchor', () => {
    const board = { cols: 10, rows: 20 }
    // Inside the sticky band a counter-clockwise board stays counter-clockwise...
    expect(decide({ width: 1100, height: 1000 }, board, 3, 'auto', 3)).toBe(3)
    // ...and un-rotates on exactly the same measurement as a clockwise one.
    expect(decide({ width: 1000, height: 1150 }, board, 3, 'auto', 3)).toBe(0)
    expect(decide({ width: 1000, height: 1145 }, board, 3, 'auto', 3)).toBe(3)
    // A device angle change while turned re-turns the board the other way rather
    // than reading as a fit change.
    expect(decide({ width: 1100, height: 1000 }, board, 1, 'auto', 3)).toBe(3)
    expect(decide({ width: 1100, height: 1000 }, board, 3, 'auto', 1)).toBe(1)
  })

  it('makes the manual "rotated" preference follow the device direction too', () => {
    expect(decide({ width: 375, height: 600 }, { cols: 7, rows: 13 }, 0, 'rotated', 3)).toBe(3)
    expect(decide({ width: 375, height: 600 }, { cols: 7, rows: 13 }, 0, 'rotated', 1)).toBe(1)
    // 'upright' still wins over everything.
    expect(decide({ width: 812, height: 300 }, { cols: 7, rows: 13 }, 3, 'upright', 3)).toBe(0)
  })

  it('defaults to a clockwise turn when no direction is supplied', () => {
    expect(chooseQuarterTurns({
      viewport: { width: 812, height: 300 },
      board: { cols: 7, rows: 13 },
      current: 0,
      preference: 'auto',
    })).toBe(DEFAULT_ROTATED_QUARTER_TURNS)
  })

  it('honours the documented threshold constants', () => {
    expect(DEVICE_ANGLE_TURNED_CLOCKWISE).toBe(270)
    expect(ROTATE_GAIN_THRESHOLD).toBeCloseTo(1.15)
    expect(COMFORTABLE_PX_PER_TILE).toBe(64)
  })

  it('lets a manual preference win over the measurement', () => {
    // Auto would rotate this one; 'upright' must not.
    expect(decide({ width: 812, height: 300 }, { cols: 7, rows: 13 }, 0, 'upright')).toBe(0)
    // Auto would leave this one upright; 'rotated' must rotate it anyway.
    expect(decide({ width: 375, height: 600 }, { cols: 7, rows: 13 }, 0, 'rotated')).toBe(1)
    // A manual preference ignores the hysteresis anchor entirely.
    expect(decide({ width: 375, height: 600 }, { cols: 12, rows: 5 }, 1, 'upright')).toBe(0)
  })

  it('holds the current rotation for a degenerate (unmeasured) viewport or board', () => {
    expect(decide({ width: 0, height: 0 }, { cols: 11, rows: 11 }, 1)).toBe(1)
    expect(decide({ width: 375, height: 600 }, { cols: 0, rows: 0 }, 1)).toBe(1)
    expect(decide({ width: 0, height: 0 }, { cols: 11, rows: 11 }, 0)).toBe(0)
  })
})

describe('cycleBoardOrientationPreference', () => {
  it('cycles auto -> rotated -> upright -> auto', () => {
    expect(cycleBoardOrientationPreference('auto')).toBe('rotated')
    expect(cycleBoardOrientationPreference('rotated')).toBe('upright')
    expect(cycleBoardOrientationPreference('upright')).toBe('auto')
  })
})

describe('rotateIntent', () => {
  it('is the identity at 0 turns', () => {
    for (const intent of [...DIRECTIONS, 'wait'] as const) {
      expect(rotateIntent(intent, 0)).toBe(intent)
    }
  })

  it('maps every screen direction to board space at one clockwise quarter turn', () => {
    // The board is drawn rotated 90deg clockwise, so board-right points at
    // screen-down: a screen-up swipe must step the chick board-left.
    expect(rotateIntent('up', 1)).toBe('left')
    expect(rotateIntent('left', 1)).toBe('down')
    expect(rotateIntent('down', 1)).toBe('right')
    expect(rotateIntent('right', 1)).toBe('up')
  })

  it('maps every screen direction at three quarter turns (the mirror rotation)', () => {
    expect(rotateIntent('up', 3)).toBe('right')
    expect(rotateIntent('right', 3)).toBe('down')
    expect(rotateIntent('down', 3)).toBe('left')
    expect(rotateIntent('left', 3)).toBe('up')
  })

  it('is exactly the inverse of the clockwise mapping at three quarter turns', () => {
    // The counter-clockwise board needs no special case: 3 turns undoes 1.
    for (const intent of [...DIRECTIONS, 'wait'] as const) {
      expect(rotateIntent(rotateIntent(intent, 1), 3)).toBe(intent)
      expect(rotateIntent(rotateIntent(intent, 3), 1)).toBe(intent)
    }
  })

  it('reverses direction at a half turn', () => {
    expect(rotateIntent('up', 2)).toBe('down')
    expect(rotateIntent('left', 2)).toBe('right')
  })

  it('never rotates wait', () => {
    for (const turns of [0, 1, 2, 3]) {
      expect(rotateIntent('wait', turns)).toBe('wait')
    }
  })

  it('round-trips to the identity for every direction and rotation', () => {
    for (const intent of [...DIRECTIONS, 'wait'] as const) {
      for (const turns of [0, 1, 2, 3]) {
        expect(rotateIntent(rotateIntent(intent, turns), 4 - turns)).toBe(intent)
      }
    }
  })

  it('is a bijection at every rotation (no two screen directions collapse onto one)', () => {
    for (const turns of [0, 1, 2, 3]) {
      const mapped = new Set(DIRECTIONS.map((intent) => rotateIntent(intent, turns)))
      expect(mapped.size).toBe(DIRECTIONS.length)
    }
  })

  it('normalises out-of-range and negative quarter turns', () => {
    expect(rotateIntent('up', 5)).toBe(rotateIntent('up', 1))
    expect(rotateIntent('up', -1)).toBe(rotateIntent('up', 3))
  })
})

describe('clampBoxToVisualViewport', () => {
  it('shrinks the box to the visible viewport when browser chrome overlaps it', () => {
    expect(clampBoxToVisualViewport({ width: 375, height: 812 }, { width: 375, height: 640 })).toEqual({
      width: 375,
      height: 640,
    })
  })

  it('never grows the box', () => {
    expect(clampBoxToVisualViewport({ width: 300, height: 400 }, { width: 900, height: 900 })).toEqual({
      width: 300,
      height: 400,
    })
  })

  it('passes the box through when there is no visual viewport to clamp against', () => {
    const box = { width: 375, height: 812 }
    expect(clampBoxToVisualViewport(box, null)).toEqual(box)
    expect(clampBoxToVisualViewport(box, undefined)).toEqual(box)
    expect(clampBoxToVisualViewport(box, { width: 0, height: 0 })).toEqual(box)
  })
})
