/**
 * The first-run tutorial: a short list of steps, each finished by the state of
 * the building rather than by clicks, so undo walks back through it and a
 * player who builds ahead skips steps naturally.
 */
import type { BuildingAnalysis } from './engine/analysis'
import { type Building, SITE_DEPTH } from './engine/building'
import type { ToolId } from './interaction'

/** A dashed outline on the plan suggesting where a step's work goes. */
export interface Guide {
  floor: number
  x: number
  y: number
  width: number
  depth: number
}

export interface TutorialStep {
  id: string
  title: string
  body: string
  /** The tool the step needs, picked for the player when the step begins. */
  tool: ToolId
  /** The floor the step happens on. */
  floor: number
  guide?: Guide
  done: (building: Building, analysis: BuildingAnalysis) => boolean
}

/** The suggested starter block: 16×12 tiles on the street edge of the lot. */
const BLOCK: Guide = { floor: 0, x: 12, y: SITE_DEPTH - 12, width: 16, depth: 12 }

function reachableRooms(building: Building, analysis: BuildingAnalysis) {
  return building.allRooms().filter((room) => analysis.rate(room).reachable)
}

export const TUTORIAL: readonly TutorialStep[] = [
  {
    id: 'plate',
    title: 'Lay the street floor',
    body: 'Drag out a block of floor on the street edge of the lot, about 16 by 12 tiles. The yellow line is the street.',
    tool: 'plate',
    floor: 0,
    guide: BLOCK,
    done: (building) => building.plateArea(0) >= 80,
  },
  {
    id: 'corridor',
    title: 'Run a corridor in from the street',
    body: 'Drag a corridor from the street edge of your block into the middle. Where it meets the street becomes the lobby entrance.',
    tool: 'corridor',
    floor: 0,
    guide: { floor: 0, x: 20, y: SITE_DEPTH - 10, width: 1, depth: 10 },
    done: (building) => {
      const entrance = building.entrance()
      return entrance !== null && !building.hasPlate(0, entrance.x, entrance.y + 1)
    },
  },
  {
    id: 'core',
    title: 'Place a core beside the corridor',
    body: 'A core holds the elevators, a stair and the risers. Tap next to the corridor to place one, so people can get upstairs later.',
    tool: 'core',
    floor: 0,
    done: (building, analysis) => building.coresOn(0).some((core) => analysis.isServed(0, core)),
  },
  {
    id: 'storefront',
    title: 'Open a shop onto the street',
    body: 'Place a shop on the street edge with its arrow pointing out at the street. Its door opens straight onto the pavement, so passers-by walk in.',
    tool: 'shop',
    floor: 0,
    done: (building, analysis) => reachableRooms(building, analysis).some((room) => room.storefront),
  },
  {
    id: 'cafe',
    title: 'Add a café off the corridor',
    body: 'Place a café beside the corridor with its arrow on the corridor. Press R or Turn to swing the door round.',
    tool: 'cafe',
    floor: 0,
    done: (building, analysis) => reachableRooms(building, analysis).some((room) => room.use === 'cafe' && !room.storefront),
  },
  {
    id: 'upstairs',
    title: 'Build the floor above',
    body: 'Go up to floor 1 and press Copy floor below. It copies the outline only, not the rooms.',
    tool: 'select',
    floor: 1,
    done: (building) => building.plateArea(1) > 0,
  },
  {
    id: 'raise-core',
    title: 'Stretch the core up',
    body: 'Select the core and raise its top floor to 1, so its elevators stop up here.',
    tool: 'select',
    floor: 1,
    done: (building, analysis) => building.coresOn(1).some((core) => analysis.isServed(1, core)),
  },
  {
    id: 'corridor-up',
    title: 'Draw a corridor from the core',
    body: 'On floor 1, drag a corridor that starts beside the core and runs across the floor.',
    tool: 'corridor',
    floor: 1,
    done: (building, analysis) => {
      const corridor = building.corridorMask(1)
      for (let index = 0; index < corridor.length; index++) {
        if (corridor[index] === 1 && analysis.isServed(1, { x: index % building.width, y: Math.floor(index / building.width) })) return true
      }
      return false
    },
  },
  {
    id: 'office',
    title: 'Let an office upstairs',
    body: 'Place a startup office beside the corridor. Offices like daylight and a short walk to a core: watch its stars.',
    tool: 'office',
    floor: 1,
    done: (building, analysis) => reachableRooms(building, analysis).some((room) => room.use === 'office' && room.floor > 0),
  },
]

/** The first unfinished step, or TUTORIAL.length when every step is done. */
export function tutorialProgress(building: Building, analysis: BuildingAnalysis): number {
  const index = TUTORIAL.findIndex((step) => !step.done(building, analysis))
  return index < 0 ? TUTORIAL.length : index
}
