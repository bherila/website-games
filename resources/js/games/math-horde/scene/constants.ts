export const PLAYER_WORLD_Z = 3

export function toDisplayZ(worldZ: number, progress: number): number {
  return PLAYER_WORLD_Z - (worldZ - progress)
}
