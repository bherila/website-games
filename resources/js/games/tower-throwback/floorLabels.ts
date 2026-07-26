/** Shared floor naming for HUD text and scene labels. */
export function floorLabel(floor: number): string {
  return floor < 0 ? `B${Math.abs(floor)}` : String(floor)
}
