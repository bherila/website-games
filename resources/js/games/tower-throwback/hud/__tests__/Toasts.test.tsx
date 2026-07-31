import { act, fireEvent, render, screen } from '@testing-library/react'

import type { EngineEvent, VipTarget } from '../../gameTypes'
import { VIP_TARGETS, vipFlavorFor, vipReportLine, vipVisitIdForTarget } from '../../vipFlavor'
import { Toasts, toastsFromEvents } from '../Toasts'

const CLOCK = { day: 3, minute: 480 }

describe('toastsFromEvents', () => {
  it('maps engine events to typed toasts with stable ids', () => {
    const events: EngineEvent[] = [
      { type: 'starUp', star: 2, bonus: 200_000, unlocked: ['officeM', 'escalator'] },
      { type: 'vipArrived', target: 2 },
      { type: 'loanTaken', amount: 300_000 },
      { type: 'incidentStarted', kind: 'bombThreat', floor: 5 },
      { type: 'elevatorDing', floor: 1 }, // not toast-worthy
    ]
    const toasts = toastsFromEvents(events, CLOCK)

    expect(toasts).toHaveLength(4)
    expect(toasts[0]).toMatchObject({ type: 'starUp', unlocked: ['officeM', 'escalator'] })
    expect(toasts[0]?.title).toContain('2-star')
    expect(toasts[0]?.body).toContain('$200,000')
    expect(toasts[1]?.type).toBe('vip')
    expect(toasts[1]?.title).toContain(vipFlavorFor(2, vipVisitIdForTarget(2)).name)
    expect(toasts[2]?.title).toContain('$300,000')
    expect(toasts[3]).toMatchObject({ type: 'warning', title: 'Bomb threat!', body: 'Floor 5' })

    // Deterministic ids — same batch, same clock → same ids.
    expect(toastsFromEvents(events, CLOCK).map((t) => t.id)).toEqual(toasts.map((t) => t.id))
    expect(new Set(toasts.map((t) => t.id)).size).toBe(4)
  })

  it('maps upgrades to an info toast with the catalog label', () => {
    const toasts = toastsFromEvents(
      [{ type: 'upgraded', unitId: 5, upgradeId: 'fastfood-to-restaurant', cost: 40_000 }],
      CLOCK,
    )
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({ type: 'info', title: 'Upgrade to Restaurant complete' })
    expect(toasts[0]?.body).toContain('$40,000')
  })

  it.each(VIP_TARGETS)('names VIP arrival toasts for target %s', (target: VipTarget) => {
    const flavor = vipFlavorFor(target, vipVisitIdForTarget(target))
    const toasts = toastsFromEvents([{ type: 'vipArrived', target }], CLOCK)

    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({
      type: 'vip',
      title: `${flavor.name} has arrived`,
      body: `${flavor.title} - ${flavor.arrivalLine}`,
    })

    const onDismiss = jest.fn()
    render(<Toasts toasts={toasts} onDismiss={onDismiss} />)
    expect(screen.getByTestId('toast-vip')).toHaveTextContent(flavor.name)
    expect(screen.getByTestId('toast-vip')).toHaveTextContent(flavor.title)
  })

  it('names VIP result and report toasts', () => {
    const failFlavor = vipFlavorFor(3, vipVisitIdForTarget(3))
    const successFlavor = vipFlavorFor(4, vipVisitIdForTarget(4))
    const movedOutFlavor = vipFlavorFor('tower', vipVisitIdForTarget('tower'))
    const toasts = toastsFromEvents(
      [
        { type: 'vipResult', target: 3, success: false, score: 62, bonus: 10_000, report: ['Waited 12 min for an elevator'] },
        { type: 'vipResult', target: 4, success: true, score: 95, bonus: 200_000, report: [] },
        { type: 'vipMovedOut', target: 'tower', report: ['Their home fell below expectations'] },
      ],
      CLOCK,
    )

    expect(toasts[0]).toMatchObject({
      title: `${failFlavor.name} left unimpressed`,
      body: vipReportLine(3, vipVisitIdForTarget(3), 'Waited 12 min for an elevator'),
    })
    expect(toasts[1]).toMatchObject({
      title: `${successFlavor.name} approved the visit`,
      body: `${successFlavor.title} - Score 95 - Bonus $200,000`,
    })
    expect(toasts[2]).toMatchObject({
      title: `${movedOutFlavor.name} moved out`,
      body: vipReportLine('tower', vipVisitIdForTarget('tower'), 'Their home fell below expectations'),
    })
  })

  it('maps placement rejections to warning toasts with the engine reason', () => {
    const toasts = toastsFromEvents(
      [{ type: 'placementRejected', kind: 'express', reason: 'Express Elevator can have at most 5 enabled stops' }],
      CLOCK,
    )
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({
      type: 'warning',
      title: 'Action rejected',
      body: 'Express Elevator can have at most 5 enabled stops',
    })
  })

  it('coalesces placement rejections per reason with a count', () => {
    const events: EngineEvent[] = [
      ...Array.from({ length: 12 }, (): EngineEvent => ({ type: 'placementRejected', kind: 'officeS', reason: 'Insufficient funds' })),
      { type: 'placementRejected', kind: 'officeS', reason: 'Overlaps an existing unit' },
    ]
    const toasts = toastsFromEvents(events, CLOCK)
    expect(toasts).toHaveLength(2)
    expect(toasts[0]).toMatchObject({ type: 'warning', title: 'Action rejected ×12', body: 'Insufficient funds' })
    expect(toasts[1]).toMatchObject({ type: 'warning', title: 'Action rejected', body: 'Overlaps an existing unit' })
  })

  it('maps the incident and request lifecycle events', () => {
    const toasts = toastsFromEvents(
      [
        { type: 'incidentResolved', kind: 'bombThreat', outcome: 'sweep complete' },
        { type: 'explosion', floor: 4, damagedUnitIds: [1, 2, 3] },
        {
          type: 'tenantRequest',
          request: { id: 9, description: 'The office workers want food nearby', wantsKind: 'fastfood', nearFloor: 2, expiresDay: 12 },
        },
        { type: 'requestExpired', requestId: 9 },
      ],
      CLOCK,
    )
    expect(toasts.map((t) => t.type)).toEqual(['info', 'warning', 'info', 'warning'])
    expect(toasts[0]?.body).toBe('sweep complete')
    expect(toasts[1]?.body).toContain('3 units damaged')
    expect(toasts[2]?.body).toContain('want food nearby')
    expect(toasts[3]?.title).toContain('expired')
  })

  it('maps fire start and resolution copy', () => {
    const toasts = toastsFromEvents(
      [
        { type: 'incidentStarted', kind: 'fire', floor: 12 },
        { type: 'incidentResolved', kind: 'fire', outcome: 'security response extinguished fire' },
      ],
      CLOCK,
    )

    expect(toasts[0]).toMatchObject({ type: 'warning', title: 'Fire!', body: 'Floor 12' })
    expect(toasts[1]).toMatchObject({ type: 'info', title: 'Fire extinguished' })
  })

  it('uses shared basement labels for incident and explosion locations', () => {
    const toasts = toastsFromEvents(
      [
        { type: 'incidentStarted', kind: 'fire', floor: -2 },
        { type: 'explosion', floor: -3, damagedUnitIds: [1] },
      ],
      CLOCK,
    )

    expect(toasts[0]?.body).toBe('Floor B2')
    expect(toasts[1]?.body).toBe('Floor B3 — 1 unit damaged')
  })

  it('throttles unitVacated to one toast per batch', () => {
    const events: EngineEvent[] = [
      { type: 'unitVacated', unitId: 1, reason: 'tooNoisy' },
      { type: 'unitVacated', unitId: 2, reason: 'noRoute' },
      { type: 'unitVacated', unitId: 3, reason: 'lowEval' },
    ]
    expect(toastsFromEvents(events, CLOCK)).toHaveLength(1)
  })

  it('keeps ids unique across event batches within the same game minute', () => {
    const event: EngineEvent[] = [{ type: 'placementRejected', kind: 'officeS', reason: 'No support below' }]

    const first = toastsFromEvents(event, CLOCK, 7)
    const second = toastsFromEvents(event, CLOCK, 8)

    expect(first[0]?.id).not.toBe(second[0]?.id)
  })
})

describe('Toasts', () => {
  it('renders the stack, dismisses with a semantic button, and auto-dismisses after 5 s', () => {
    jest.useFakeTimers()
    const onDismiss = jest.fn()
    const toasts = toastsFromEvents(
      [
        { type: 'starUp', star: 3, bonus: 300_000, unlocked: [] },
        { type: 'loanTaken', amount: 100_000 },
      ],
      CLOCK,
    )
    render(<Toasts toasts={toasts} onDismiss={onDismiss} />)

    expect(screen.getByTestId('toast-starUp')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /dismiss loan taken/i }))
    expect(onDismiss).toHaveBeenCalledWith(toasts[1]?.id)

    act(() => {
      jest.advanceTimersByTime(5100)
    })
    expect(onDismiss).toHaveBeenCalledWith(toasts[0]?.id)
    jest.useRealTimers()
  })

  it('pauses and resumes the remaining timer while hover or focus is within the toast', () => {
    jest.useFakeTimers()
    const onDismiss = jest.fn()
    const toast = toastsFromEvents([{ type: 'loanTaken', amount: 100_000 }], CLOCK)[0]!
    render(<Toasts toasts={[toast]} onDismiss={onDismiss} />)
    const container = screen.getByTestId('toast-info')
    const dismiss = screen.getByRole('button', { name: /dismiss loan taken/i })

    act(() => jest.advanceTimersByTime(3_000))
    fireEvent.mouseEnter(container)
    act(() => jest.advanceTimersByTime(5_000))
    expect(onDismiss).not.toHaveBeenCalled()

    dismiss.focus()
    fireEvent.mouseLeave(container)
    act(() => jest.advanceTimersByTime(5_000))
    expect(onDismiss).not.toHaveBeenCalled()

    fireEvent.blur(dismiss, { relatedTarget: document.body })
    act(() => jest.advanceTimersByTime(1_999))
    expect(onDismiss).not.toHaveBeenCalled()
    act(() => jest.advanceTimersByTime(1))
    expect(onDismiss).toHaveBeenCalledWith(toast.id)
    jest.useRealTimers()
  })
})
