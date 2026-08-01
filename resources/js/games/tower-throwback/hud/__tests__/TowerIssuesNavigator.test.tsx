import { fireEvent, render, screen } from '@testing-library/react'

import { defaultShaftProgram, type Shaft, type Unit } from '../../gameTypes'
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

function shaft(overrides: Partial<Shaft> = {}): Shaft {
  return {
    id: 20,
    kind: 'standard',
    x: 30,
    bottomFloor: -1,
    topFloor: 4,
    stops: [-1, 0, 1, 2, 3, 4],
    enabledStops: [-1, 0, 1, 2, 3, 4],
    cars: [{ index: 0, y: 0, dir: 0, state: 'idle', doorTimer: 0, homeFloor: null, passengerIds: [] }],
    program: defaultShaftProgram(),
    stats: { avgWaitGameMin: 0, peakWaitGameMin: 0 },
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

    expect(result.entries.map((entry) => entry.id)).toEqual([2, 4, 5, 9])
    expect(result.entries.find((entry) => entry.id === 5)?.issueCount).toBe(2)
    expect(result.total).toBe(4)
    expect(result.hidden).toBe(0)
  })

  it('mixes shaft failures into the same stable severity, floor, type, and id order', () => {
    const result = deriveTowerIssueEntries(
      [unit({ id: 9, floor: 2, offline: true })],
      [
        shaft({ id: 7, bottomFloor: -2, cars: [] }),
        shaft({ id: 3, bottomFloor: 2, stats: { avgWaitGameMin: 5, peakWaitGameMin: 8 } }),
      ],
    )
    expect(result.entries.map((entry) => `${entry.type}:${entry.id}`)).toEqual(['shaft:7', 'unit:9', 'shaft:3'])
    expect(result.entries[0]?.label).toContain('No elevator cars')
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
    const onSelectShaft = jest.fn()
    const onViewFloor = jest.fn()
    render(
      <TowerIssuesNavigator
        units={[unit({ id: 7, floor: -3, offline: true })]}
        shafts={[]}
        onSelectUnit={onSelectUnit}
        onSelectShaft={onSelectShaft}
        onViewFloor={onViewFloor}
      />,
    )

    expect(screen.getByTestId('tower-issues-summary')).toHaveTextContent('1')
    fireEvent.click(screen.getByTestId('tower-issue-unit-7'))
    expect(onSelectUnit).toHaveBeenCalledWith(7)
    expect(onViewFloor).toHaveBeenCalledWith(-3)
    expect(onSelectShaft).not.toHaveBeenCalled()
    expect(screen.getByTestId('tower-issue-unit-7')).toHaveTextContent('B3')
  })

  it('selects and views an actionable shaft problem', () => {
    const onSelectShaft = jest.fn()
    const onViewFloor = jest.fn()
    render(
      <TowerIssuesNavigator
        units={[]}
        shafts={[shaft({ id: 22, bottomFloor: -4, cars: [] })]}
        onSelectUnit={jest.fn()}
        onSelectShaft={onSelectShaft}
        onViewFloor={onViewFloor}
      />,
    )
    fireEvent.click(screen.getByTestId('tower-issue-shaft-22'))
    expect(onSelectShaft).toHaveBeenCalledWith(22)
    expect(onViewFloor).toHaveBeenCalledWith(-4)
  })
})
