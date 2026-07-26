/** Shared 3/2/1 campaign rating band based on assists consumed. */
export function starsForAssists(assistsUsed: number): number {
  if (assistsUsed <= 0) {
    return 3
  }

  return assistsUsed <= 2 ? 2 : 1
}
