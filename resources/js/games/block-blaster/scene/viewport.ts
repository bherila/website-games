export interface CanvasSize {
  height: number
  width: number
}

interface RectLike extends CanvasSize {
  left: number
  top: number
}

/** Keeps the renderer inside its actual container, including tiny embeds. */
export function canvasSizeForContainer(width: number, height: number): CanvasSize {
  return {
    width: Math.max(1, Math.floor(width)),
    height: Math.max(1, Math.floor(height)),
  }
}

export function pointerNdcForRect(clientX: number, clientY: number, rect: RectLike): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0) {
    return null
  }

  return {
    x: (((clientX - rect.left) / rect.width) * 2) - 1,
    y: -((((clientY - rect.top) / rect.height) * 2) - 1),
  }
}
