export interface CanvasPlacementTile {
  floor: number
  x: number
}

/**
 * Report the exact tile returned by the canvas' screen-to-tile placement seam.
 *
 * These production data attributes are intentionally read-only: automation and
 * diagnostic tools can locate real pointer targets without reaching into the
 * engine or guessing camera geometry.
 */
export function setCanvasPlacementTarget(canvas: HTMLCanvasElement, tile: CanvasPlacementTile): void {
  canvas.dataset.towerTargetFloor = String(tile.floor)
  canvas.dataset.towerTargetX = String(tile.x)
}

export function clearCanvasPlacementTarget(canvas: HTMLCanvasElement): void {
  delete canvas.dataset.towerTargetFloor
  delete canvas.dataset.towerTargetX
}
