import { fireEvent, render, screen } from '@testing-library/react'

import type { Unit } from '../../gameTypes'
import { deriveTowerIssueEntries, TowerIssuesNavigator } from '../TowerIssuesNavigator'

function unit(overrides: Partial<Unit>): Unit {
  return {
    id: 1,
    kind: 'officeS',
    floor: 1,
    x: 1,
    width: 6,
    storeys: 1,
    grade: 'standard',
    rentTier: 'avg',
    occupied: true,
    population: { low: 1, med: 1, high: 1, vip: 0 },
    evalScore: 70,
    stressMarks: 0,
    lowEvalDays: 0,
    vacancyReason: null,
    flags: { noRestroom: false, noRoute: false, noReception: false, trashOverflow: false },
    dirty: false,
    infested: false,
    offline: false,
    damageKind: null,
    incidentPenaltyUntilDay: null,
    ...overrides,
  }
}

describe('TowerIssuesNavigator', () => {
  it('orders one row per unit by severity, floor, then id', () => {
    const units = [
      unit({ id: 9, floor: 8, flags: { noRestroom: true, noRoute: false, noReception: false, trashOverflow: false } }),
      unit({ id: 5, floor: 3, offline: true, flags: { noRestroom: false, noRoute: true, noReception: false, trashOverflow: false } }),
      unit({ id: 2, floor: -1, infested: true }),
      unit({ id: 4, floor: -1, offline: true }),
    ]

    const result = deriveTowerIssueEntries(units)

    expect(result.entries.map((entry) => entry.unitId)).toEqual([2, 4, 5, 9])
    expect(result.entries.find((entry) => entry.unitId === 5)?.issueCount).toBe(2)
    expect(result.total).toBe(4)
    expect(result.hidden).toBe(0)
  })

  it('keeps very large towers bounded', () => {
    const units = Array.from({ length: 4_096 }, (_, index) => unit({ id: index + 1, floor: index % 100, offline: true }))

    const result = deriveTowerIssueEntries(units)

    expect(result.total).toBe(4_096)
    expect(result.entries).toHaveLength(100)
    expect(result.hidden).toBe(3_996)
  })

  it('selects and views the chosen issue floor', () => {
    const onSelectUnit = jest.fn()
    const onViewFloor = jest.fn()
    render(
      <TowerIssuesNavigator
        units={[unit({ id: 7, floor: -3, offline: true })]}
        onSelectUnit={onSelectUnit}
        onViewFloor={onViewFloor}
      />,
    )

    expect(screen.getByTestId('tower-issues-summary')).toHaveTextContent('1')
    fireEvent.click(screen.getByTestId('tower-issue-7'))
    expect(onSelectUnit).toHaveBeenCalledWith(7)
    expect(onViewFloor).toHaveBeenCalledWith(-3)
    expect(screen.getByTestId('tower-issue-7')).toHaveTextContent('B3')
  })
})
