import type { CarColor, Direction } from '../gameTypes'
import { lengthForCapacity } from '../gameTypes'
import type { CarCapacity, LevelCarDef, LevelDef } from './levelTypes'

/**
 * Hand-authored campaign levels on the standard 24×16 board. Levels 1–8 are
 * self-teaching (one new mechanic each, explicit passenger queues); later
 * levels lean on the deterministic queue planner for pacing. Every level is
 * proven solvable on the four starting slots by `levels.test.ts` — edit a
 * layout and the suite will tell you if it broke.
 *
 * Add new levels by appending to `PARKING_LEVELS`; the level select, unlock
 * watermark, and "coming soon" cap all derive from the array length.
 */

function car(
  capacity: CarCapacity,
  direction: Direction,
  x: number,
  y: number,
  color?: CarColor,
  colorHidden?: boolean,
): LevelCarDef {
  return { capacity, direction, x, y, ...(color ? { color } : {}), ...(colorHidden ? { colorHidden: true } : {}) }
}

/** Contiguous stack of cars in one column; each car is blocked by the one nearer the exit. */
function column(x: number, yStart: number, capacities: CarCapacity[], direction: 'down' | 'up' = 'up'): LevelCarDef[] {
  const cars: LevelCarDef[] = []
  let y = yStart
  for (const capacity of capacities) {
    cars.push(car(capacity, direction, x, y))
    y += lengthForCapacity(capacity)
  }

  return cars
}

/** Contiguous run of cars in one row; each car is blocked by the one nearer the exit. */
function rowRun(y: number, xStart: number, capacities: CarCapacity[], direction: 'left' | 'right'): LevelCarDef[] {
  const cars: LevelCarDef[] = []
  let x = xStart
  for (const capacity of capacities) {
    cars.push(car(capacity, direction, x, y))
    x += lengthForCapacity(capacity)
  }

  return cars
}

function seats(color: CarColor, count: number): CarColor[] {
  return Array.from({ length: count }, () => color)
}

export const PARKING_LEVELS: readonly LevelDef[] = [
  {
    id: 1,
    intro: 'Tap a car with a clear road to park it — matching passengers hop aboard!',
    cars: [
      car(4, 'up', 11, 6, 'red'),
      car(4, 'up', 13, 6, 'red'),
    ],
    queue: [...seats('red', 8)],
  },
  {
    id: 2,
    intro: 'Passengers wait in line and only ride their own color.',
    cars: [
      car(4, 'up', 10, 6, 'red'),
      car(4, 'up', 12, 6, 'blue'),
      car(4, 'up', 14, 6, 'yellow'),
    ],
    queue: [...seats('red', 4), ...seats('blue', 4), ...seats('yellow', 4)],
  },
  {
    id: 3,
    intro: 'Blocked cars bounce back — free the car in front first.',
    cars: [
      car(4, 'up', 12, 4, 'blue'),
      car(4, 'up', 12, 7, 'red'),
      car(4, 'up', 9, 6, 'green'),
      car(4, 'up', 15, 6, 'yellow'),
    ],
    queue: [...seats('blue', 4), ...seats('red', 4), ...seats('green', 4), ...seats('yellow', 4)],
  },
  {
    id: 4,
    intro: 'Bigger buses seat more passengers — they hold their space until full.',
    cars: [
      car(10, 'up', 12, 4, 'purple'),
      car(6, 'up', 15, 3, 'blue'),
      car(4, 'up', 9, 6, 'red'),
      car(4, 'up', 17, 7, 'yellow'),
    ],
    queue: [...seats('purple', 10), ...seats('blue', 6), ...seats('red', 4), ...seats('yellow', 4)],
  },
  {
    id: 5,
    intro: 'Cars drive the way their arrow points — any edge of the lot works.',
    cars: [
      car(4, 'up', 12, 5, 'green'),
      car(4, 'right', 13, 7, 'red'),
      car(4, 'down', 12, 8, 'blue'),
      car(4, 'left', 10, 7, 'yellow'),
    ],
    queue: [...seats('green', 4), ...seats('red', 4), ...seats('blue', 4), ...seats('yellow', 4)],
  },
  {
    id: 6,
    intro: 'Garages hide extra cars — send off the door car and the next pops out.',
    cars: [
      car(4, 'up', 14, 4, 'green'),
      car(4, 'up', 16, 8, 'yellow'),
      car(4, 'down', 7, 10, 'red'),
    ],
    tunnels: [
      { direction: 'right', x: 10, y: 7, cars: [{ color: 'blue', capacity: 4 }, { color: 'red', capacity: 4 }] },
    ],
    queue: [...seats('blue', 4), ...seats('green', 4), ...seats('yellow', 4), ...seats('red', 8)],
  },
  {
    id: 7,
    intro: "'?' cars keep their color secret until their lane is clear.",
    cars: [
      car(4, 'up', 12, 4, 'blue'),
      car(4, 'up', 12, 7, 'red', true),
      car(4, 'up', 12, 10, 'green', true),
      car(4, 'up', 9, 6, 'yellow'),
      car(4, 'up', 15, 6, 'purple'),
    ],
    queue: [...seats('blue', 4), ...seats('yellow', 4), ...seats('purple', 4), ...seats('red', 4), ...seats('green', 4)],
  },
  {
    id: 8,
    intro: 'Diagonal cars drive corner to corner.',
    cars: [
      car(4, 'up-right', 11, 6, 'cyan'),
      car(4, 'down-left', 14, 9, 'orange'),
      car(4, 'up', 8, 4, 'red'),
      car(4, 'down', 18, 10, 'blue'),
      car(6, 'right', 9, 12, 'green'),
    ],
    queue: [...seats('red', 4), ...seats('cyan', 4), ...seats('green', 6), ...seats('orange', 4), ...seats('blue', 4)],
  },
  {
    id: 9,
    intro: 'Three lanes of traffic — peel each lane from the front.',
    cars: [
      ...column(9, 2, [4, 4, 6]),
      ...column(12, 2, [6, 4, 4]),
      ...column(15, 2, [4, 6, 4]),
      car(10, 'up', 18, 3),
    ],
  },
  {
    id: 10,
    difficulty: 'hard',
    intro: 'Gridlock! Every car is stuck behind the next — find the loose end.',
    cars: [
      ...rowRun(4, 9, [4, 4, 4], 'right'),
      ...column(16, 5, [4, 4], 'down'),
      ...rowRun(10, 11, [4, 4], 'left'),
      car(4, 'left', 9, 10),
      ...column(7, 5, [4, 4]),
    ],
  },
  {
    id: 11,
    intro: 'A herringbone lot — diagonals weave between the straights.',
    cars: [
      car(4, 'up-right', 8, 3),
      car(4, 'up-right', 11, 3),
      car(4, 'up-right', 14, 3),
      car(4, 'down-left', 9, 10),
      car(4, 'down-left', 12, 10),
      car(4, 'down-left', 15, 10),
      ...column(18, 3, [4, 4], 'down'),
      ...column(5, 8, [4, 4]),
      car(6, 'right', 10, 7),
      car(6, 'left', 13, 6),
    ],
  },
  {
    id: 12,
    intro: 'Four corners, four exits — work every direction at once.',
    cars: [
      ...column(8, 2, [4, 6]),
      ...column(15, 2, [6, 4]),
      ...column(8, 9, [6, 4], 'down'),
      ...column(15, 9, [4, 6], 'down'),
      car(4, 'left', 5, 7),
      car(4, 'right', 17, 7),
      ...rowRun(7, 10, [4, 4], 'right'),
    ],
  },
  {
    id: 13,
    intro: 'A chevron of buses — the point of the V leads the way.',
    cars: [
      car(4, 'up', 12, 2),
      car(4, 'up', 10, 4),
      car(4, 'up', 14, 4),
      car(6, 'up', 8, 6),
      car(6, 'up', 16, 6),
      car(4, 'up', 10, 7),
      car(4, 'up', 14, 7),
      car(10, 'up', 12, 5),
      car(4, 'left', 6, 10),
      car(4, 'right', 17, 10),
      ...rowRun(12, 10, [4, 4], 'left'),
    ],
  },
  {
    id: 14,
    intro: 'Two garages feed the jam from inside.',
    cars: [
      ...column(8, 3, [4, 4, 4]),
      ...column(16, 3, [4, 4, 4]),
      car(6, 'up', 12, 2),
      ...rowRun(11, 10, [4, 4], 'left'),
      car(4, 'down', 6, 9),
      car(4, 'down', 18, 9),
    ],
    tunnels: [
      { direction: 'right', x: 11, y: 6, cars: [{ capacity: 4 }, { capacity: 4 }] },
      { direction: 'left', x: 12, y: 8, cars: [{ capacity: 4 }, { capacity: 4 }] },
    ],
  },
  {
    id: 15,
    difficulty: 'hard',
    intro: 'An arrow pointing home — but the shaft is packed tight.',
    cars: [
      car(4, 'up', 12, 2),
      car(4, 'up-left', 10, 3),
      car(4, 'up-right', 13, 3),
      car(6, 'up-left', 6, 4),
      car(6, 'up-right', 15, 4),
      ...column(12, 4, [4, 4, 4, 4]),
      ...column(10, 6, [4, 4], 'down'),
      ...column(14, 6, [4, 4], 'down'),
      car(6, 'left', 6, 12),
      car(6, 'right', 15, 12),
    ],
  },
  {
    id: 16,
    intro: 'Rush hour at the depot — garages on every side.',
    cars: [
      ...column(10, 2, [4, 4]),
      ...column(13, 2, [4, 4]),
      ...rowRun(8, 8, [4, 4, 4], 'right'),
      ...rowRun(10, 9, [4, 4], 'left'),
      car(6, 'up', 6, 3),
      car(6, 'up', 17, 3),
    ],
    tunnels: [
      { direction: 'right', x: 7, y: 6, cars: [{ capacity: 4 }, { capacity: 4 }, { capacity: 4 }] },
      { direction: 'left', x: 15, y: 12, cars: [{ capacity: 4 }, { capacity: 4 }] },
    ],
  },
  {
    id: 17,
    intro: 'A diamond lattice — every diagonal has exactly one way out.',
    cars: [
      car(4, 'up-left', 10, 4),
      car(4, 'up-right', 13, 4),
      car(4, 'down-left', 10, 9),
      car(4, 'down-right', 13, 9),
      car(4, 'up-left', 7, 6),
      car(4, 'up-right', 15, 6),
      car(4, 'down-left', 7, 11),
      car(4, 'down-right', 15, 11),
      ...column(12, 6, [4], 'up'),
      car(4, 'left', 5, 3),
      car(4, 'right', 18, 3),
      ...rowRun(13, 10, [4, 4], 'right'),
      car(6, 'up', 6, 12),
      car(6, 'up', 17, 12),
    ],
  },
  {
    id: 18,
    intro: 'Show the lot some love.',
    cars: [
      car(4, 'up', 9, 3),
      car(4, 'up', 14, 3),
      car(4, 'up-left', 7, 4),
      car(4, 'up-right', 15, 4),
      car(4, 'up', 11, 4),
      car(4, 'up', 12, 4),
      ...column(6, 6, [4], 'up'),
      ...column(17, 6, [4], 'up'),
      car(6, 'down-right', 8, 8),
      car(6, 'down-left', 13, 8),
      car(4, 'down', 11, 9),
      car(4, 'down', 12, 9),
      car(4, 'down', 11, 12),
      car(4, 'down', 12, 12),
      car(10, 'left', 2, 13),
      car(10, 'right', 18, 13),
    ],
  },
  {
    id: 19,
    intro: 'Serpentine parking — every row flows the opposite way.',
    cars: [
      ...rowRun(2, 8, [4, 4, 4], 'right'),
      ...rowRun(4, 8, [4, 4, 4], 'left'),
      ...rowRun(6, 8, [6, 6], 'right'),
      ...rowRun(8, 8, [4, 4, 4], 'left'),
      ...rowRun(10, 8, [4, 4, 4], 'right'),
      ...rowRun(12, 8, [6, 6], 'left'),
      car(4, 'up', 5, 5),
      car(4, 'down', 18, 8),
    ],
  },
  {
    id: 20,
    difficulty: 'super-hard',
    intro: 'The fortress: crack the outer wall to reach the couriers inside.',
    cars: [
      ...rowRun(3, 8, [4, 4, 4], 'right'),
      ...column(16, 4, [4, 4, 4], 'down'),
      ...rowRun(11, 10, [4, 4, 4], 'left'),
      ...column(7, 4, [4, 4, 4]),
      car(4, 'up', 11, 6),
      car(4, 'down', 13, 9),
    ],
    tunnels: [
      { direction: 'right', x: 10, y: 8, cars: [{ capacity: 6 }, { capacity: 6 }] },
      { direction: 'left', x: 12, y: 6, cars: [{ capacity: 6 }, { capacity: 6 }] },
    ],
  },
  {
    id: 21,
    intro: 'Twin spirals — unwind them from the outside in.',
    cars: [
      ...rowRun(2, 6, [4, 4], 'right'),
      ...column(11, 3, [4, 4], 'down'),
      ...rowRun(8, 7, [4, 4], 'left'),
      ...column(6, 3, [4, 4]),
      car(4, 'up', 8, 5),
      ...rowRun(5, 13, [4, 4], 'right'),
      ...column(18, 6, [4, 4], 'down'),
      ...rowRun(11, 14, [4, 4], 'left'),
      ...column(13, 6, [4, 4]),
      car(4, 'down', 15, 8),
      car(10, 'up', 21, 2),
      car(10, 'down', 2, 10),
    ],
  },
  {
    id: 22,
    intro: 'Half this lot is a mystery — reveal colors by clearing lanes.',
    cars: [
      ...column(9, 2, [4, 4]),
      car(4, 'up', 9, 6, undefined, true),
      ...column(12, 2, [4, 4]),
      car(4, 'up', 12, 6, undefined, true),
      ...column(15, 2, [4, 4]),
      car(4, 'up', 15, 6, undefined, true),
      ...rowRun(10, 8, [6, 6], 'right'),
      ...rowRun(12, 8, [4, 4, 4], 'left'),
      car(4, 'left', 5, 4),
      car(4, 'right', 18, 4),
      car(6, 'down', 6, 8),
      car(6, 'down', 18, 8),
    ],
  },
  {
    id: 23,
    intro: 'The interchange: five lanes merge and nobody signals.',
    cars: [
      ...rowRun(2, 7, [4, 4, 4, 4], 'right'),
      ...rowRun(4, 7, [6, 6, 4], 'left'),
      ...rowRun(6, 7, [4, 4, 4, 4], 'right'),
      ...rowRun(8, 7, [4, 6, 6], 'left'),
      ...rowRun(10, 7, [4, 4, 4, 4], 'right'),
      car(4, 'up', 5, 3),
      car(4, 'down', 18, 9),
      car(4, 'up-right', 6, 12),
      car(4, 'down-left', 16, 12),
    ],
  },
  {
    id: 24,
    intro: 'Full jam. Every trick you know, all at once.',
    cars: [
      ...column(7, 2, [4, 4, 4]),
      ...column(10, 2, [4, 6]),
      ...column(13, 2, [6, 4]),
      ...column(16, 2, [4, 4, 4]),
      car(4, 'up', 10, 7, undefined, true),
      car(4, 'up', 13, 7, undefined, true),
      ...rowRun(10, 6, [4, 4], 'right'),
      ...rowRun(11, 14, [4, 4], 'left'),
      ...rowRun(12, 8, [6, 6], 'left'),
      car(4, 'down-right', 5, 11),
      car(4, 'down-left', 18, 11),
    ],
    tunnels: [
      { direction: 'up', x: 19, y: 5, cars: [{ capacity: 4 }, { capacity: 4 }] },
    ],
  },
  {
    id: 25,
    difficulty: 'super-hard',
    intro: 'The trophy run. Earn it.',
    cars: [
      ...rowRun(2, 8, [4, 4, 4], 'right'),
      car(4, 'up', 7, 3),
      car(4, 'up', 16, 3),
      ...column(7, 5, [4], 'down'),
      ...column(16, 5, [4], 'down'),
      car(4, 'up-left', 8, 5),
      car(4, 'up-right', 14, 5),
      ...column(10, 4, [4, 4]),
      ...column(13, 4, [4, 4]),
      car(6, 'up', 11, 8),
      car(6, 'up', 12, 8),
      ...rowRun(12, 9, [4, 4], 'left'),
      ...rowRun(14, 8, [4], 'right'),
      car(10, 'left', 3, 8),
      car(10, 'right', 17, 8),
    ],
    tunnels: [
      { direction: 'down', x: 11, y: 13, cars: [{ capacity: 6 }, { capacity: 6 }] },
    ],
  },
]

export const TOTAL_LEVELS = PARKING_LEVELS.length
