/** Replays earn score and a power-up only when they improve the saved result. */
export function earnsCompletionReward(existingStars: number, completedStars: number): boolean {
  return completedStars > existingStars
}
