/**
 * A disc turning in equal stops. Slot k lies k stops clockwise from the top,
 * and at stop s a window drawn at slot w sits over slot w + s.
 */
export interface Dial {
  stops: number
  /** Slots the windows are cut over at stop 0. */
  windows: readonly number[]
  /** How far the windows' centres lie from the disc's centre. */
  windowRadius: number
  /** Screws that hold the disc still while they are in. */
  pins?: readonly string[]
  /** A head showing in a window catches the disc, so it will not turn until that head is out. */
  jams?: boolean
}

/** Where slot `slot` of a dial lies, in the disc's own X/Y. */
export function dialSlotPosition(dial: Dial, slot: number): readonly [number, number] {
  const angle = Math.PI / 2 - slot * Math.PI * 2 / dial.stops
  return [Math.cos(angle) * dial.windowRadius, Math.sin(angle) * dial.windowRadius]
}

/** How far the disc is drawn turned at a stop, about its own Z: clockwise seen from the front. */
export function dialAngle(dial: Dial, stop: number): number {
  return -stop * Math.PI * 2 / dial.stops
}
