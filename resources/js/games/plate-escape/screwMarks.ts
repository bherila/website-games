import type { ScrewColor } from './level'

type Polygon = readonly (readonly [number, number])[]

const rect = (halfWidth: number, halfHeight: number): Polygon => [[-halfWidth, -halfHeight], [halfWidth, -halfHeight], [halfWidth, halfHeight], [-halfWidth, halfHeight]]

const star = (points: number, outer: number, inner: number): Polygon => Array.from({ length: points * 2 }, (_, index) => {
  const radius = index % 2 === 0 ? outer : inner
  const angle = Math.PI / 2 + (index * Math.PI) / points
  return [radius * Math.cos(angle), radius * Math.sin(angle)] as const
})

/**
 * Each color's drive shape, in head radii about the head's center. They
 * differ in outline rather than angle, so a tilted panel or a turned view can
 * never make one read as another, and they never rely on color alone.
 */
export const SCREW_MARKS: Record<ScrewColor, Polygon> = {
  coral: rect(0.72, 0.15),
  mint: [[-0.15, -0.68], [0.15, -0.68], [0.15, -0.15], [0.68, -0.15], [0.68, 0.15], [0.15, 0.15], [0.15, 0.68], [-0.15, 0.68], [-0.15, 0.15], [-0.68, 0.15], [-0.68, -0.15], [-0.15, -0.15]],
  blue: rect(0.36, 0.36),
  amber: star(5, 0.74, 0.32),
}

/** An SVG path for the mark centered at (cx, cy), `radius` user units per head radius; y points down. */
export function markPath(color: ScrewColor, cx: number, cy: number, radius: number): string {
  const points = SCREW_MARKS[color].map(([x, y]) => `${(cx + x * radius).toFixed(2)} ${(cy - y * radius).toFixed(2)}`)
  return `M${points.join('L')}Z`
}
