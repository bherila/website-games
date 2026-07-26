export const GRID_CELL_SIZE = 0.92
export const GRID_CELL_GAP = 0.18
export const GRID_ORIGIN_X = -1.1
export const GRID_ORIGIN_Z = -2.55
export const GRID_STEP_X = 1.1
export const GRID_STEP_Z = 0.82
export const CONVEYOR_CENTER_Z = 2.85
export const CONVEYOR_WIDTH = 5.4
export const CONVEYOR_HEIGHT = 1.05
export const CONVEYOR_MARBLE_Y = 0.36
export const MARBLE_DIAMETER = 0.27
export const MARBLE_RADIUS = MARBLE_DIAMETER / 2
export const CONVEYOR_PERIMETER = 2 * (CONVEYOR_WIDTH - CONVEYOR_HEIGHT) + Math.PI * CONVEYOR_HEIGHT
// Belt = the painted top run. CONVEYOR_WIDTH × CONVEYOR_HEIGHT is the visible
// belt rectangle that marbles SIT ON; do not use it for the marble path. The
// path is an inset oval — see CONVEYOR_PATH_* below.
export const CONVEYOR_BELT_NORTH_Z = CONVEYOR_CENTER_Z - CONVEYOR_HEIGHT / 2
export const CONVEYOR_BELT_SOUTH_Z = CONVEYOR_CENTER_Z + CONVEYOR_HEIGHT / 2

// Inner marble-lane oval. Marbles and belt markers travel along this path,
// which sits inside the belt rectangle so marbles appear in the gray slot
// channel rather than orbiting the housing rim. The belt visual stays at
// CONVEYOR_WIDTH × CONVEYOR_HEIGHT.
export const CONVEYOR_PATH_WIDTH = CONVEYOR_WIDTH - 0.7
export const CONVEYOR_PATH_HEIGHT = CONVEYOR_HEIGHT - 0.36
export const CONVEYOR_PATH_RADIUS = CONVEYOR_PATH_HEIGHT / 2
export const CONVEYOR_PATH_PERIMETER = 2 * (CONVEYOR_PATH_WIDTH - CONVEYOR_PATH_HEIGHT)
  + Math.PI * CONVEYOR_PATH_HEIGHT
export const CONVEYOR_PATH_NORTH_Z = CONVEYOR_CENTER_Z - CONVEYOR_PATH_RADIUS
export const CONVEYOR_PATH_SOUTH_Z = CONVEYOR_CENTER_Z + CONVEYOR_PATH_RADIUS
export const CONVEYOR_SLOT_FRACTION = MARBLE_DIAMETER / CONVEYOR_PATH_PERIMETER
// Funnel starts just south of the grid plate (which ends at Z ≈ 1.19) and
// exits slightly north of the belt's north edge so marbles physically fall
// south through the throat and land on the belt. The conveyor housing (wider
// in Z than the belt) reaches north past the belt edge into the funnel area,
// producing the "tucked under" visual without putting the throat geometry
// inside the belt's z range.
export const BASIN_NORTH_Z = 1.25
export const BASIN_CONVEYOR_OVERLAP = 0.08
export const BASIN_SOUTH_Z = CONVEYOR_BELT_NORTH_Z - BASIN_CONVEYOR_OVERLAP
export const BASIN_CENTER_Z = (BASIN_NORTH_Z + BASIN_SOUTH_Z) / 2
export const BASIN_FLOOR_Y = CONVEYOR_MARBLE_Y - 0.02
export const BASIN_TOP_HALF_WIDTH = 1.5
export const BASIN_EXIT_HALF_WIDTH = 0.42
export const BASIN_HALF_DEPTH = (BASIN_SOUTH_Z - BASIN_NORTH_Z) / 2
export const BASIN_HALF_WIDTH = BASIN_TOP_HALF_WIDTH
export const BASIN_EXIT_X = 0
export const BASIN_EXIT_Z = BASIN_SOUTH_Z
// Holding corridor at the funnel mouth where a marble waits when the conveyor
// is full. Keep this before the inner conveyor lane so backed-up marbles spread
// through the funnel instead of sitting on top of belt marbles.
export const BASIN_HOLD_LINE_Z = BASIN_SOUTH_Z + MARBLE_RADIUS + 0.06
export const BASIN_HOLD_CORRIDOR_HALF_WIDTH = BASIN_EXIT_HALF_WIDTH + MARBLE_RADIUS + 0.04
export const SORTING_STACK_Z = 4.15
export const SORTING_STACK_BLOCK_DEPTH = 0.44
export const SORTING_STACK_BLOCK_STEP_Z = 0.40
export const SORTING_STACK_BLOCK_STEP_Y = 0.06
export const SORTING_STACK_TOP_Y = 0.22
export const SORTING_STACK_VISIBLE_BLOCKS = 5

// --- Sky-island visual layout ---------------------------------------------
// The launch island and conveyor pod float in the sky; the collector trays sit
// on the meadow far below. Physics Y values (BASIN_FLOOR_Y, CONVEYOR_MARBLE_Y)
// are load-bearing for the funnel simulation and stay untouched; the visual
// surfaces are aligned TO them.
//
// Marbles roll through the basin with their centers at BASIN_FLOOR_Y, so the
// island's walking surface must sit exactly one marble radius below that.
export const DECK_TOP_Y = BASIN_FLOOR_Y - MARBLE_RADIUS
// Belt surface under conveyor marbles (centers at CONVEYOR_MARBLE_Y).
export const BELT_TOP_Y = CONVEYOR_MARBLE_Y - MARBLE_RADIUS - 0.005
// Boxes are 0.44 tall and rest on the deck.
export const BOX_REST_Y = DECK_TOP_Y + 0.225
// Dispenser chutes are ~0.44 tall and rest on the deck beside the grid.
export const CHUTE_REST_Y = DECK_TOP_Y + 0.22
// Absolute marble spawn height above a popped box. This value is tuned
// against the physics ceiling (see physics/world.ts): spawning higher makes
// fast marbles clip the ceiling's north edge at the funnel mouth.
export const MARBLE_SPAWN_Y = 0.52
// The meadow the whole contraption floats above, and the base altitude of the
// sorting stacks standing on it.
export const GROUND_Y = -1.85
export const STACK_BASE_Y = -1.55

// Sky gradient (scene background) from zenith to horizon.
export const SKY_TOP_COLOR = '#3f9bf0'
export const SKY_HORIZON_COLOR = '#d9f0ff'
export const SKY_FOG_COLOR = '#bfe0ff'

// The launch island (with its crates and funnel) is tilted up toward the
// camera like an easel so box faces read clearly. The tilt is purely visual:
// physics runs in flat space, and physics coordinates are interpreted as the
// tilted group's LOCAL space. The pivot sits at the funnel throat so the
// board stays glued to the conveyor belt where marbles hand over.
export const BOARD_TILT_RADIANS = 0.5
export const BOARD_TILT_PIVOT_Z = 2.35
