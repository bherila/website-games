import type { VipTarget } from '../gameTypes'
import { VIP_TARGETS, vipDisplayName, vipFlavorFor, vipReportLine, vipVisitIdForTarget } from '../vipFlavor'

describe('VIP flavor lookup', () => {
  it.each(VIP_TARGETS)('is deterministic for target %s and the same visit id', (target: VipTarget) => {
    const first = vipFlavorFor(target, 'visit-42')
    expect(vipFlavorFor(target, 'visit-42')).toEqual(first)
    expect(vipDisplayName(target, 'visit-42')).toBe(`${first.name}, ${first.title}`)
    expect(vipReportLine(target, 'visit-42', 'Waited 9 min for an elevator')).toBe(`${first.name}: Waited 9 min for an elevator`)
  })

  it('uses stable target visit ids for presentation-only lifecycle text', () => {
    expect(VIP_TARGETS.map((target) => vipVisitIdForTarget(target))).toEqual([
      'target:2',
      'target:3',
      'target:4',
      'target:5',
      'target:tower',
    ])
  })
})
