import { COLORS, type ScrewColor } from '../level'
import { markPath, SCREW_MARKS } from '../screwMarks'

const colors = Object.keys(COLORS) as ScrewColor[]

const area = (color: ScrewColor): number => {
  const points = SCREW_MARKS[color]
  return Math.abs(points.reduce((sum, [x, y], index) => {
    const [nx, ny] = points[(index + 1) % points.length]!
    return sum + x * ny - nx * y
  }, 0)) / 2
}
/** Unchanged by turning the head: the enclosed area and how far the outline reaches from the axis. */
const signature = (color: ScrewColor): [number, number, number] => {
  const radii = SCREW_MARKS[color].map(([x, y]) => Math.hypot(x, y))
  return [area(color), Math.max(...radii), Math.min(...radii)]
}

test('every color has a drive mark that fits inside the head', () => {
  for (const color of colors) {
    expect(area(color)).toBeGreaterThan(0.12)
    expect(signature(color)[1]).toBeLessThan(0.8)
  }
})

test('no mark becomes another when the head is turned', () => {
  // The old marks were one cross and one slot at two angles each, so a tilted roof could swap them.
  for (const [index, a] of colors.entries()) {
    for (const b of colors.slice(index + 1)) {
      const [areaA, outerA, innerA] = signature(a)
      const [areaB, outerB, innerB] = signature(b)
      const differs = Math.abs(areaA - areaB) > 0.05 || Math.abs(outerA - outerB) > 0.08 || Math.abs(innerA - innerB) > 0.08
      expect([a, b, differs]).toEqual([a, b, true])
    }
  }
})

test('the SVG path traces the same outline with y pointing down', () => {
  expect(markPath('blue', 20, 20, 10)).toBe('M16.40 23.60L23.60 23.60L23.60 16.40L16.40 16.40Z')
})
