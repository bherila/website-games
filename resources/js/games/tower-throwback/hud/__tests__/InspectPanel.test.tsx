import { fireEvent, render, screen } from '@testing-library/react'

import { shaftDef } from '../../engine/catalog'
import { defaultShaftProgram, type Shaft, type ShaftProgram, type Unit, type VipRecord } from '../../gameTypes'
import { vipRecordDisplayName, vipReportLine, vipVisitIdForTarget } from '../../vipFlavor'
import { InspectPanel } from '../InspectPanel'
import { programForPreset } from '../shaftProgramPresets'

function makeUnit(overrides: Partial<Unit> = {}): Unit {
  return {
    id: 7,
    kind: 'officeS',
    floor: 3,
    x: 10,
    width: 6,
    storeys: 1,
    grade: 'standard',
    rentTier: 'avg',
    occupied: true,
    population: { low: 1, med: 2, high: 1, vip: 0 },
    evalScore: 72,
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

function makeShaft(kind: Shaft['kind'] = 'standard'): Shaft {
  return {
    id: 12,
    kind,
    x: 20,
    bottomFloor: 0,
    topFloor: 8,
    stops: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    enabledStops: [0, 2, 4, 6, 8],
    cars: [
      { index: 0, y: 0, dir: 0, state: 'idle', doorTimer: 0, homeFloor: null, passengerIds: [] },
      { index: 1, y: 4, dir: 0, state: 'idle', doorTimer: 0, homeFloor: 4, passengerIds: [] },
    ],
    program: defaultShaftProgram(),
    stats: { avgWaitGameMin: 2.4, peakWaitGameMin: 2.4 },
  }
}

function makeVipRecord(overrides: Partial<VipRecord> = {}): VipRecord {
  return {
    target: 2,
    state: 'resident',
    satisfaction: 80,
    unitId: 7,
    cooldownUntilDay: null,
    lastReport: [],
    ...overrides,
  }
}

function handlers() {
  return {
    onSetRentTier: jest.fn(),
    onApplyUpgrade: jest.fn(),
    onDemolish: jest.fn(),
    onAddCar: jest.fn(),
    onSetStopEnabled: jest.fn(),
    onSetProgram: jest.fn(),
    onSetCarHomeFloor: jest.fn(),
  }
}

describe('InspectPanel — unit', () => {
  it('shows the active heatmap value even when the tile has no selectable structure', () => {
    render(
      <InspectPanel
        selection={null}
        overlaySample={{ floor: -2, kind: 'congestion', value: 4.25, x: 19 }}
        maxStarReached={2}
        {...handlers()}
      />,
    )

    expect(screen.getByTestId('overlay-tile-sample')).toHaveTextContent('Congestion · floor B2 · tile 19')
    expect(screen.getByTestId('overlay-tile-sample')).toHaveTextContent('4.3 min avg wait')
  })

  it('shows occupancy, eval, fixed rent economics, and fires the rent tier command', () => {
    const h = handlers()
    render(<InspectPanel selection={{ type: 'unit', unit: makeUnit() }} maxStarReached={2} {...h} />)

    expect(screen.getByTestId('occupancy')).toHaveTextContent('4/4')
    expect(screen.getByTestId('eval-score')).toHaveTextContent('72/100')
    expect(screen.getByTestId('income-line')).toHaveTextContent('$400/day rent') // avg ×1.0
    expect(screen.getByTestId('maintenance-line')).toHaveTextContent('$0/day')
    expect(screen.getByTestId('daily-net-line')).toHaveTextContent('$400/day')

    expect(screen.getByTestId('rent-avg')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('rent-high'))
    expect(h.onSetRentTier).toHaveBeenCalledWith(7, 'high')
  })

  it('shows maintenance without promising daily net for variable income', () => {
    render(<InspectPanel selection={{ type: 'unit', unit: makeUnit({ kind: 'fastfood' }) }} maxStarReached={2} {...handlers()} />)

    expect(screen.getByTestId('income-line')).toHaveTextContent('$10 per visit')
    expect(screen.getByTestId('maintenance-line')).toHaveTextContent('$250/day')
    expect(screen.queryByTestId('daily-net-line')).toBeNull()
  })

  it('shows the same nightly hotel rate that settlement credits', () => {
    const averageRoom = makeUnit({ kind: 'hotel2p', rentTier: 'avg' })
    const { rerender } = render(
      <InspectPanel selection={{ type: 'unit', unit: averageRoom }} maxStarReached={3} {...handlers()} />,
    )
    expect(screen.getByTestId('income-line')).toHaveTextContent('$600 per night')

    const luxuryRoom = makeUnit({ kind: 'hotel2p', grade: 'luxury', rentTier: 'high' })
    rerender(<InspectPanel selection={{ type: 'unit', unit: luxuryRoom }} maxStarReached={3} {...handlers()} />)
    expect(screen.getByTestId('income-line')).toHaveTextContent('$1,200 per night')
  })

  it('shows the vacancy banner, flag warnings, upgrades, and refund', () => {
    const h = handlers()
    const unit = makeUnit({
      kind: 'fastfood',
      occupied: false,
      vacancyReason: 'noRoute',
      population: { low: 0, med: 0, high: 0, vip: 0 },
      flags: { noRestroom: false, noRoute: true, noReception: false, trashOverflow: false },
    })
    render(<InspectPanel selection={{ type: 'unit', unit }} maxStarReached={2} {...h} />)

    expect(screen.getByTestId('issue-vacant')).toHaveTextContent('no route to the lobby')
    expect(screen.getByTestId('issue-noRoute')).toBeInTheDocument()
    expect(screen.getByTestId('issue-noRoute')).toHaveAttribute('data-severity', 'critical')

    // fastfood → restaurant upgrade is 2★.
    fireEvent.click(screen.getByTestId('upgrade-fastfood-to-restaurant'))
    expect(h.onApplyUpgrade).toHaveBeenCalledWith(7, 'fastfood-to-restaurant')

    // Refund = 50% of the $50,000 build cost. Demolition is confirm-gated.
    expect(screen.getByTestId('demolish')).toHaveTextContent('$25,000')
    fireEvent.click(screen.getByTestId('demolish'))
    expect(h.onDemolish).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('confirm-destructive-action'))
    expect(h.onDemolish).toHaveBeenCalledWith({ type: 'unit', unit })
  })

  it('shows the clinic copay control and effective copay, and fires the tier command', () => {
    const h = handlers()
    const clinic = makeUnit({ kind: 'medicalClinic', rentTier: 'avg', population: { low: 0, med: 0, high: 0, vip: 0 } })
    render(<InspectPanel selection={{ type: 'unit', unit: clinic }} maxStarReached={4} {...h} />)

    expect(screen.getByTestId('income-line')).toHaveTextContent('$30 copay/visit') // avg ×1.0
    expect(screen.getByTestId('copay-avg')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('copay-high'))
    expect(h.onSetRentTier).toHaveBeenCalledWith(7, 'high')
    // No rent-tier control for a per-visit earner.
    expect(screen.queryByTestId('rent-avg')).toBeNull()
  })

  it('shows the named VIP resident and flavored report line for a VIP home', () => {
    const h = handlers()
    const unit = makeUnit({ population: { low: 0, med: 0, high: 0, vip: 1 } })
    const vipRecord = makeVipRecord({ lastReport: ['Their home fell below expectations'] })

    render(<InspectPanel selection={{ type: 'unit', unit }} maxStarReached={2} vipRecords={[vipRecord]} {...h} />)

    expect(screen.getByTestId('vip-resident')).toHaveTextContent('VIP resident')
    expect(screen.getByTestId('vip-resident')).toHaveTextContent(vipRecordDisplayName(vipRecord))
    expect(screen.getByTestId('vip-report-line')).toHaveTextContent(
      vipReportLine(vipRecord.target, vipVisitIdForTarget(vipRecord.target), 'Their home fell below expectations'),
    )
  })
})

describe('InspectPanel — shaft', () => {
  it.each(['standard', 'express', 'service', 'glass'] as const)('shows catalog semantics for %s shafts', (kind) => {
    const h = handlers()
    const def = shaftDef(kind)
    render(<InspectPanel selection={{ type: 'shaft', shaft: makeShaft(kind) }} maxStarReached={4} {...h} />)

    expect(screen.getByTestId('shaft-capacity')).toHaveTextContent(`${def.carCapacity}/car`)
    if (def.serviceOnly) {
      expect(screen.getByTestId('shaft-service-badge')).toHaveTextContent('Staff/trash only')
    } else {
      expect(screen.getByTestId('shaft-service-badge')).toHaveTextContent('Passenger service')
    }
    if (def.maxStops !== undefined) {
      expect(screen.getByTestId('shaft-limits')).toHaveTextContent(`${def.maxStops} enabled stops max`)
    }
    if (def.maxReachFloors !== undefined) {
      expect(screen.getByTestId('shaft-limits')).toHaveTextContent(`${def.maxReachFloors} floors reach max`)
    }
  })

  it('hides passenger direction programs for service shafts', () => {
    const h = handlers()
    render(<InspectPanel selection={{ type: 'shaft', shaft: makeShaft('service') }} maxStarReached={2} {...h} />)

    expect(screen.getByTestId('shaft-service-badge')).toHaveTextContent('Staff/trash only')
    expect(screen.getByTestId('service-program-note')).toHaveTextContent('skip passenger direction-priority programs')
    expect(screen.queryByTestId('program-weekday-morningRush')).toBeNull()
    expect(screen.queryByTestId('program-weekend-night')).toBeNull()
  })

  it('round-trips a program edit through onSetProgram', () => {
    const h = handlers()
    const shaft = makeShaft()
    render(<InspectPanel selection={{ type: 'shaft', shaft }} maxStarReached={2} {...h} />)

    fireEvent.change(screen.getByTestId('program-weekday-morningRush'), { target: { value: 'expressToTop' } })
    expect(h.onSetProgram).toHaveBeenCalledTimes(1)
    const [shaftId, program] = h.onSetProgram.mock.calls[0] as [number, ShaftProgram]
    expect(shaftId).toBe(12)
    expect(program.weekday.morningRush).toBe('expressToTop')
    expect(program.weekday.daytime).toBe('balanced') // rest preserved
    expect(program.weekend.morningRush).toBe('balanced')
    expect(program.doorDwellSec).toBe(shaft.program.doorDwellSec)

    fireEvent.change(screen.getByTestId('idle-threshold'), { target: { value: '9' } })
    const idleProgram = h.onSetProgram.mock.calls[1]?.[1] as ShaftProgram
    expect(idleProgram.idleAnswerThreshold).toBe(9)
  })

  it('dispatches elevator program presets and reset-to-default', () => {
    const h = handlers()
    const shaft = makeShaft()
    shaft.program.weekday.morningRush = 'expressToBottom'
    shaft.program.weekday.daytime = 'expressToTop'
    shaft.program.weekend.night = 'expressToTop'
    shaft.program.idleAnswerThreshold = 7
    shaft.program.doorDwellSec = 12
    render(<InspectPanel selection={{ type: 'shaft', shaft }} maxStarReached={2} {...h} />)

    fireEvent.click(screen.getByTestId('program-preset-rush'))
    const rushProgram = h.onSetProgram.mock.calls.at(-1)?.[1] as ShaftProgram
    expect(rushProgram.weekday).toEqual(programForPreset('rush').weekday)
    expect(rushProgram.weekend).toEqual(programForPreset('rush').weekend)
    expect(rushProgram.idleAnswerThreshold).toBe(7)
    expect(rushProgram.doorDwellSec).toBe(12)

    fireEvent.click(screen.getByTestId('program-preset-balanced'))
    const balancedProgram = h.onSetProgram.mock.calls.at(-1)?.[1] as ShaftProgram
    expect(balancedProgram.weekday).toEqual(programForPreset('balanced').weekday)
    expect(balancedProgram.weekend).toEqual(programForPreset('balanced').weekend)
    expect(balancedProgram.idleAnswerThreshold).toBe(7)
    expect(balancedProgram.doorDwellSec).toBe(12)

    fireEvent.click(screen.getByTestId('program-preset-offHoursLobby'))
    const offHoursProgram = h.onSetProgram.mock.calls.at(-1)?.[1] as ShaftProgram
    expect(offHoursProgram.weekday).toEqual(programForPreset('offHoursLobby').weekday)
    expect(offHoursProgram.weekend).toEqual(programForPreset('offHoursLobby').weekend)
    expect(offHoursProgram.idleAnswerThreshold).toBe(7)
    expect(offHoursProgram.doorDwellSec).toBe(12)

    fireEvent.click(screen.getByTestId('program-reset'))
    expect(h.onSetProgram).toHaveBeenLastCalledWith(12, defaultShaftProgram())
  })

  it('shows a non-blocking sparse stops warning', () => {
    const h = handlers()
    const shaft = makeShaft()
    shaft.topFloor = 40
    shaft.stops = [0, 10, 20, 30, 40]
    shaft.enabledStops = [0, 40]
    render(<InspectPanel selection={{ type: 'shaft', shaft }} maxStarReached={2} {...h} />)

    expect(screen.getByTestId('sparse-stops-warning')).toHaveTextContent('Only 2 stops')
    fireEvent.click(screen.getByTestId('stop-20'))
    expect(h.onSetStopEnabled).toHaveBeenCalledWith(12, 20, true)
  })

  it('drives stops, cars, and home floors through their callbacks', () => {
    const h = handlers()
    const shaft = makeShaft()
    render(<InspectPanel selection={{ type: 'shaft', shaft }} maxStarReached={2} {...h} />)

    fireEvent.click(screen.getByTestId('stop-2')) // enabled → disable
    expect(h.onSetStopEnabled).toHaveBeenCalledWith(12, 2, false)
    fireEvent.click(screen.getByTestId('stop-3')) // disabled → enable
    expect(h.onSetStopEnabled).toHaveBeenCalledWith(12, 3, true)

    fireEvent.click(screen.getByTestId('add-car'))
    expect(h.onAddCar).toHaveBeenCalledWith(12)

    fireEvent.change(screen.getByTestId('home-0'), { target: { value: '6' } })
    expect(h.onSetCarHomeFloor).toHaveBeenCalledWith(12, 0, 6)
    fireEvent.change(screen.getByTestId('home-1'), { target: { value: '' } })
    expect(h.onSetCarHomeFloor).toHaveBeenCalledWith(12, 1, null)
  })

  it('shows live per-car status and flags a car idling on its home floor', () => {
    const h = handlers()
    const shaft = makeShaft()
    const cap = shaftDef('standard').carCapacity
    // Car 0: mid-flight upward with riders, no home floor.
    shaft.cars[0] = { index: 0, y: 3, dir: 1, state: 'moving', doorTimer: 0, homeFloor: null, passengerIds: [1, 2, 3] }
    // Car 1: idle exactly on its home floor (4) → highlighted as HOME.
    shaft.cars[1] = { index: 1, y: 4, dir: 0, state: 'idle', doorTimer: 0, homeFloor: 4, passengerIds: [] }
    render(<InspectPanel selection={{ type: 'shaft', shaft }} maxStarReached={2} {...h} />)

    expect(screen.getByTestId('car-floor-0')).toHaveTextContent('3')
    expect(screen.getByTestId('car-motion-0')).toHaveTextContent('up')
    expect(screen.getByTestId('car-load-0')).toHaveTextContent(`3/${cap}`)
    expect(screen.queryByTestId('car-athome-0')).toBeNull()

    expect(screen.getByTestId('car-floor-1')).toHaveTextContent('4')
    expect(screen.getByTestId('car-motion-1')).toHaveTextContent('idle')
    expect(screen.getByTestId('car-athome-1')).toBeInTheDocument()
  })

  it('does not flag an idle car as HOME when it is away from its home floor', () => {
    const h = handlers()
    const shaft = makeShaft()
    shaft.cars[1] = { index: 1, y: 0, dir: 0, state: 'idle', doorTimer: 0, homeFloor: 4, passengerIds: [] }
    render(<InspectPanel selection={{ type: 'shaft', shaft }} maxStarReached={2} {...h} />)
    expect(screen.queryByTestId('car-athome-1')).toBeNull()
  })

  it('uses the shared basement floor label convention for stops and home floors', () => {
    const h = handlers()
    const shaft = makeShaft()
    shaft.bottomFloor = -2
    shaft.topFloor = 2
    shaft.stops = [-2, -1, 0, 1, 2]
    shaft.enabledStops = [-2, 0, 2]
    shaft.cars[0]!.homeFloor = -2
    render(<InspectPanel selection={{ type: 'shaft', shaft }} maxStarReached={2} {...h} />)

    expect(screen.getByText('Floors B2–2')).toBeInTheDocument()
    expect(screen.getByTestId('stop--2').closest('label')).toHaveTextContent('B2')
    expect(screen.getByTestId('home-0')).toHaveTextContent('B2')
  })

  it('disables Add car at the car cap', () => {
    const h = handlers()
    const shaft = makeShaft()
    shaft.cars = Array.from({ length: 6 }, (_, index) => ({
      index,
      y: 0,
      dir: 0 as const,
      state: 'idle' as const,
      doorTimer: 0,
      homeFloor: null,
      passengerIds: [],
    }))
    render(<InspectPanel selection={{ type: 'shaft', shaft }} maxStarReached={2} {...h} />)
    expect(screen.getByTestId('add-car')).toBeDisabled()
  })
})

describe('InspectPanel — incident actions', () => {
  it('offers pest control on infested units and repair on offline units', () => {
    const h = handlers()
    const onPestControl = jest.fn()
    const onRepair = jest.fn()
    const unit = makeUnit({ infested: true, offline: true })
    render(
      <InspectPanel
        selection={{ type: 'unit', unit }}
        maxStarReached={2}
        {...h}
        onPestControl={onPestControl}
        onRepair={onRepair}
      />,
    )

    fireEvent.click(screen.getByTestId('pest-control'))
    expect(onPestControl).toHaveBeenCalledWith(7)
    expect(screen.getByTestId('pest-control')).toHaveTextContent('$5,000')

    fireEvent.click(screen.getByTestId('repair'))
    expect(onRepair).toHaveBeenCalledWith(7)
    expect(screen.getByTestId('repair')).toHaveTextContent('$12,000') // 2000 × width 6
  })

  it('quotes the higher repair rate for fire damage', () => {
    const unit = makeUnit({ offline: true, damageKind: 'fire' })
    render(<InspectPanel selection={{ type: 'unit', unit }} maxStarReached={2} {...handlers()} />)

    expect(screen.getByTestId('repair')).toHaveTextContent('$15,000') // 2500 × width 6
  })

  it('hides both buttons on a healthy unit', () => {
    const h = handlers()
    render(<InspectPanel selection={{ type: 'unit', unit: makeUnit() }} maxStarReached={2} {...h} />)
    expect(screen.queryByTestId('pest-control')).toBeNull()
    expect(screen.queryByTestId('repair')).toBeNull()
  })
})

describe('InspectPanel — slab-family (review fix #14)', () => {
  it('shows per-tile pricing and demolish for a bare floor run', () => {
    const h = handlers()
    const slab = makeUnit({ kind: 'slab', width: 10, floor: 3, capacity: undefined } as never)
    render(<InspectPanel selection={{ type: 'unit', unit: slab }} maxStarReached={2} {...h} />)

    expect(screen.getByTestId('slab-width')).toHaveTextContent('10 × $50')
    expect(screen.queryByTestId('eval-score')).toBeNull() // desirability is meaningless for slabs
    expect(screen.getByTestId('demolish')).toHaveTextContent('$250') // 0.5 × 10 × $50
    fireEvent.click(screen.getByTestId('demolish'))
    fireEvent.click(screen.getByTestId('confirm-destructive-action'))
    expect(h.onDemolish).toHaveBeenCalled()
  })
})
