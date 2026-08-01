import { fireEvent, render, screen, within } from '@testing-library/react'

import type { Shaft, Unit } from '../../gameTypes'
import { deriveTowerInventory, TowerInventory } from '../TowerInventory'

function unit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 1,
    kind: 'officeS',
    floor: 1,
    x: 10,
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
    cars: [],
    program: {
      weekday: {
        morningRush: 'balanced',
        daytime: 'balanced',
        eveningRush: 'balanced',
        night: 'balanced',
      },
      weekend: {
        morningRush: 'balanced',
        daytime: 'balanced',
        eveningRush: 'balanced',
        night: 'balanced',
      },
      idleAnswerThreshold: 0,
      doorDwellSec: 0,
    },
    stats: { avgWaitGameMin: 0, peakWaitGameMin: 0 },
    ...overrides,
  }
}

describe('TowerInventory', () => {
  it('groups entries by floor with stable item ordering and player-facing details', () => {
    const result = deriveTowerInventory(
      [
        unit({ id: 4, floor: -2, x: 20, kind: 'shop', occupied: false, population: { low: 0, med: 0, high: 0, vip: 0 } }),
        unit({ id: 3, floor: 3, x: 12, kind: 'aptStudio', offline: true }),
        unit({ id: 2, floor: 3, x: 4, kind: 'officeS' }),
      ],
      [shaft({ id: 7, bottomFloor: -2, topFloor: 3, x: 8, cars: [{ index: 0, y: 0, dir: 0, state: 'idle', doorTimer: 0, homeFloor: null, passengerIds: [] }] })],
    )

    expect(result.map((group) => group.floor)).toEqual([3, -2])
    expect(result[0]?.entries.map((entry) => `${entry.type}:${entry.id}`)).toEqual(['unit:2', 'unit:3'])
    expect(result[0]?.entries[0]).toEqual(expect.objectContaining({
      label: 'Office (S)',
      occupancy: 'Occupied · 3 people',
      issue: null,
    }))
    expect(result[0]?.entries[1]).toEqual(expect.objectContaining({
      label: 'Apartment (Studio)',
      issue: 'Damaged — offline',
    }))
    expect(result[1]?.entries[0]).toEqual(expect.objectContaining({
      label: 'Elevator',
      occupancy: 'B2–3 · 1 car',
      issue: null,
    }))
  })

  it('surfaces the worst actionable shaft issue in inventory', () => {
    const result = deriveTowerInventory([], [shaft({ cars: [], stats: { avgWaitGameMin: 18, peakWaitGameMin: 20 } })])
    expect(result[0]?.entries[0]).toEqual(expect.objectContaining({
      type: 'shaft',
      issue: 'No elevator cars',
    }))
  })

  it('uses semantic floor groups, selects an item, views its floor, closes, and restores focus', () => {
    const onClose = jest.fn()
    const onSelectUnit = jest.fn()
    const onSelectShaft = jest.fn()
    const onViewFloor = jest.fn()
    const onFocusInspector = jest.fn()
    const restoreFocus = jest.fn()

    render(
      <TowerInventory
        units={[unit({ id: 9, floor: -3, offline: true })]}
        shafts={[]}
        onClose={onClose}
        onSelectUnit={onSelectUnit}
        onSelectShaft={onSelectShaft}
        onViewFloor={onViewFloor}
        onFocusInspector={onFocusInspector}
        onRestoreFocus={restoreFocus}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Tower inventory' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /B3 1 item/ })).toHaveAttribute('aria-expanded', 'true')
    const list = screen.getByRole('list', { name: 'Items on B3' })
    expect(within(list).getByText('Damaged — offline')).toBeInTheDocument()

    fireEvent.click(within(list).getByRole('button', { name: 'Select Office (S) on B3' }))
    expect(onSelectUnit).toHaveBeenCalledWith(9)
    expect(onSelectShaft).not.toHaveBeenCalled()
    expect(onViewFloor).toHaveBeenCalledWith(-3)
    expect(onClose).toHaveBeenCalled()
    expect(onFocusInspector).toHaveBeenCalled()
    expect(restoreFocus).not.toHaveBeenCalled()
  })

  it('restores trigger focus when closed without selecting an item', () => {
    const onClose = jest.fn()
    const restoreFocus = jest.fn()
    render(
      <TowerInventory
        units={[]}
        shafts={[]}
        onClose={onClose}
        onSelectUnit={jest.fn()}
        onSelectShaft={jest.fn()}
        onViewFloor={jest.fn()}
        onFocusInspector={jest.fn()}
        onRestoreFocus={restoreFocus}
      />,
    )

    expect(screen.getByRole('button', { name: 'Close tower inventory' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Close tower inventory' }))
    expect(onClose).toHaveBeenCalled()
    expect(restoreFocus).toHaveBeenCalled()
  })

  it('bounds the rendered entity rows for a 5,000-unit floor while keeping every item reachable', () => {
    const units = Array.from({ length: 5_000 }, (_, index) =>
      unit({ id: index + 1, x: index, floor: 8 }),
    )

    render(
      <TowerInventory
        units={units}
        shafts={[]}
        onClose={jest.fn()}
        onSelectUnit={jest.fn()}
        onSelectShaft={jest.fn()}
        onViewFloor={jest.fn()}
        onFocusInspector={jest.fn()}
        onRestoreFocus={jest.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /8 5,000 items/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByTestId('tower-inventory-entry')).toHaveLength(100)
    expect(screen.getByText('Showing 100 of 5,000')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show next 100 items' }))
    expect(screen.getAllByTestId('tower-inventory-entry')).toHaveLength(200)
    expect(screen.getByText('Showing 200 of 5,000')).toBeInTheDocument()
  })
})
