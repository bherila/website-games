/** Atlas layout matches assets/README.md: seven 256px finishes, one neutral white cell. */
export const FINISH_CELL = 256
export const FINISH_PADDING = 8
export const FINISH_STRIDE = FINISH_CELL + FINISH_PADDING * 2
export const FINISH_ATLAS_WIDTH = FINISH_STRIDE * 4
export const FINISH_ATLAS_HEIGHT = FINISH_STRIDE * 2
/** A repeat spans 6m (two site tiles), keeping its broad pattern readable at default zoom. */
export const FINISH_REPEAT = 2
export const FINISH_INDEX = { studio: 0, office: 1, shop: 2, cafe: 3, plate: 4, corridor: 5, core: 6, neutral: 7 } as const
export type FloorFinish = keyof typeof FINISH_INDEX

/** Cell-local (0..1) coordinates, inset half a texel and flipped for a top-down source image. */
export function finishUV(finish: FloorFinish, u: number, v: number): readonly [number, number] {
  const index = FINISH_INDEX[finish]
  return [
    ((index % 4) * FINISH_STRIDE + FINISH_PADDING + 0.5 + u * (FINISH_CELL - 1)) / FINISH_ATLAS_WIDTH,
    1 - (Math.floor(index / 4) * FINISH_STRIDE + FINISH_PADDING + 0.5 + v * (FINISH_CELL - 1)) / FINISH_ATLAS_HEIGHT,
  ]
}

/** Split a run at repeat boundaries: UV interpolation never crosses into a neighboring cell. */
export function finishSpans(from: number, to: number): readonly [number, number][] {
  const spans: [number, number][] = []
  for (let start = from; start < to;) {
    const end = Math.min(to, (Math.floor(start / FINISH_REPEAT) + 1) * FINISH_REPEAT)
    spans.push([start, end])
    start = end
  }
  return spans
}
