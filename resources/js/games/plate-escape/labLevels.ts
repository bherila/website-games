import { type Dial, dialSlotPosition } from './dial'
import type { PuzzleLevel, Screw, ScrewColor } from './level'

/** Lab board ids, outside the campaign's numbering. */
export const LAB_DIAL_PIN = 901
export const LAB_DIAL_JAM = 902

/** The link names that open each lab board. */
export const LAB_LINKS: Record<string, number> = { 'dial-pin': LAB_DIAL_PIN, 'dial-jam': LAB_DIAL_JAM }

const door = { position: [0, -0.35, 0.9] as const, size: 2.4 }
/** The dial's centre on the door, and how far proud of the door it turns: just clear of the heads behind it. */
const DIAL_CENTRE = [0, -0.2] as const
const DIAL_PROUD = 0.32

/**
 * Two toy safes that differ only in what stops the combination dial. One has a
 * stop pin: take it and the dial turns freely. On the other, a head showing in
 * the window catches the dial until it comes out. Both start with the window
 * at the bottom, well away from the pin.
 */
export function createLabLevels(): PuzzleLevel[] {
  const safe = (id: number, name: string, dial: Dial, colors: Record<string, ScrewColor>): PuzzleLevel => {
    const behind = Array.from({ length: dial.stops }, (_, slot): Screw => {
      const [x, y] = dialSlotPosition(dial, slot)
      return { id: `dial-${slot}`, plate: 'door', color: colors[`dial-${slot}`]!, position: [DIAL_CENTRE[0] + x, DIAL_CENTRE[1] + y], underDial: { dial: 'dial', slot } }
    })
    return {
      id, name, spareCapacity: 3, overflowLoses: true, trayColors: ['coral', 'mint', 'blue', 'amber'], stage: 'workbench',
      introduction: dial.pins
        ? 'The stop pin above the dial holds it still. Take the pin out, then turn the dial to bring its window over each screw behind it.'
        : 'A screw showing in the dial\'s window catches it. Take that screw out, then turn the dial to bring the window over the next.',
      plates: [
        { id: 'door', name: 'Safe door', position: door.position, size: [door.size, door.size], normal: [0, 0, 1], up: [0, 1, 0], finish: 'guard', color: '#4f6f78' },
        { id: 'back', name: 'Safe back', position: [0, -0.35, -0.9], size: [2.4, 2.4], normal: [0, 0, -1], up: [0, 1, 0], finish: 'guard', color: '#4f6f78' },
        { id: 'left', name: 'Left side', position: [-1.2, -0.35, 0], size: [1.8, 2.4], normal: [-1, 0, 0], up: [0, 1, 0], finish: 'guard', color: '#5a7b84' },
        { id: 'right', name: 'Right side', position: [1.2, -0.35, 0], size: [1.8, 2.4], normal: [1, 0, 0], up: [0, 1, 0], finish: 'guard', color: '#5a7b84' },
        { id: 'top', name: 'Safe top', position: [0, 0.98, 0], size: [2.6, 2.0], normal: [0, 1, 0], up: [0, 0, -1], restsOn: ['left', 'right'], finish: 'guard', color: '#46636b' },
        {
          id: 'dial', name: 'Combination dial', position: [door.position[0] + DIAL_CENTRE[0], door.position[1] + DIAL_CENTRE[1], door.position[2] + DIAL_PROUD],
          size: [1.8, 1.8], normal: [0, 0, 1], up: [0, 1, 0], host: 'door', dial, finish: 'dial', color: '#c9a64b',
        },
      ],
      screws: [
        // Just above the dial's rim, where it engages the notch at the top.
        { id: 'door-pin', plate: 'door', color: colors['door-pin']!, position: [0, 1.0] },
        { id: 'door-corner', plate: 'door', color: colors['door-corner']!, position: [-0.95, 0.95] },
        ...behind,
        { id: 'left-1', plate: 'left', color: colors['left-1']!, position: [0, 0.2] },
        { id: 'right-1', plate: 'right', color: colors['right-1']!, position: [0, 0.2] },
        { id: 'back-1', plate: 'back', color: colors['back-1']!, position: [-0.6, 0.3] },
        { id: 'back-2', plate: 'back', color: colors['back-2']!, position: [0.6, 0.3] },
        { id: 'top-1', plate: 'top', color: colors['top-1']!, position: [-0.7, 0] },
        { id: 'top-2', plate: 'top', color: colors['top-2']!, position: [0.7, 0] },
      ],
    }
  }
  // Three colors behind the dial, so which stop is worked first decides which trays fill.
  const colors: Record<string, ScrewColor> = {
    'door-pin': 'amber', 'door-corner': 'coral', 'dial-0': 'mint', 'dial-1': 'blue', 'dial-2': 'coral', 'dial-3': 'mint',
    'left-1': 'blue', 'right-1': 'amber', 'back-1': 'coral', 'back-2': 'amber', 'top-1': 'blue', 'top-2': 'mint',
  }
  const ring = { stops: 4, windows: [2], windowRadius: 0.5 }
  return [
    safe(LAB_DIAL_PIN, 'Toy Safe (stop pin)', { ...ring, pins: ['door-pin'] }, colors),
    safe(LAB_DIAL_JAM, 'Toy Safe (jamming head)', { ...ring, jams: true }, colors),
  ]
}
