import type { EngineEvent } from '../../gameTypes'
import { advanceClock } from '../clock'
import { acceptLoan, accrue, declineLoan, maximumLoanOffer, postImmediate, requestSpend, settleMidnight } from '../economy'
import { injectUnit, makeTestState, placeShaft, placeSlabRow } from './testState'

describe('accrue & postImmediate', () => {
  it('accumulates signed amounts per line', () => {
    const state = makeTestState()
    accrue(state, 'sales.commerce', 100)
    accrue(state, 'sales.commerce', 50)
    accrue(state, 'repairs', -300)
    accrue(state, 'maint.transit', 0)
    expect(state.ledgerToday.lines['sales.commerce']).toBe(150)
    expect(state.ledgerToday.lines.repairs).toBe(-300)
    expect(state.ledgerToday.lines['maint.transit']).toBeUndefined()
  })

  it('postImmediate applies to funds and emits cash for income', () => {
    const state = makeTestState({ funds: 1000 })
    const events: EngineEvent[] = []
    postImmediate(state, 'sales.commerce', 500, events)
    expect(state.funds).toBe(1500)
    expect(events).toContainEqual({ type: 'cash', amount: 500 })
    // Negative posts floor at 0 and emit nothing.
    postImmediate(state, 'repairs', -2000, events)
    expect(state.funds).toBe(0)
    expect(events).toHaveLength(1)
  })
})

describe('settleMidnight', () => {
  it('computes rent, maintenance, and loan repayment with exact dollars', () => {
    const state = makeTestState()
    placeSlabRow(state, 0, 0, 39)
    injectUnit(state, {
      kind: 'officeS', floor: 0, x: 0, width: 6, storeys: 1,
      occupied: true, rentTier: 'high', population: { low: 0, med: 2, high: 2, vip: 0 },
    })
    injectUnit(state, {
      kind: 'aptStudio', floor: 0, x: 6, width: 4, storeys: 1,
      occupied: true, rentTier: 'low', population: { low: 2, med: 0, high: 0, vip: 0 },
    })
    injectUnit(state, { kind: 'shop', floor: 0, x: 10, width: 8, storeys: 1 })
    injectUnit(state, { kind: 'lobby', floor: 0, x: 18, width: 10, storeys: 1 })
    placeShaft(state, 'standard', 30, 0, 4)
    state.loans.push({ id: 900, principal: 100_000, outstanding: 100_000 })

    const fundsBefore = state.funds
    advanceClock(state, 1440)
    const events: EngineEvent[] = []
    settleMidnight(state, events)

    expect(state.ledgerHistory[0]?.lines).toEqual({
      'rent.office': 500, // 400 × 1.25
      'rent.residential': 160, // 200 × 0.8
      'maint.commerce': -150,
      'maint.structure': -50, // lobby $5 × 10 tiles
      'maint.transit': -200, // 1 car × $200
      'loan.repayment': -5000, // 5% of 100k
    })
    expect(events).toContainEqual({ type: 'settlement', day: 1, net: -4740 })
    expect(state.funds).toBe(fundsBefore + 660 - 400 - 5000)
    expect(state.loans[0]?.outstanding).toBe(95_000)
    expect(state.ledgerHistory[0]?.day).toBe(1)
    expect(state.ledgerToday).toEqual({ day: 2, lines: {} })
  })

  it('skips rent for offline or infested units', () => {
    const state = makeTestState()
    injectUnit(state, {
      kind: 'officeS', floor: 0, x: 0, width: 6, storeys: 1,
      occupied: true, offline: true, population: { low: 0, med: 4, high: 0, vip: 0 },
    })
    injectUnit(state, {
      kind: 'aptStudio', floor: 0, x: 6, width: 4, storeys: 1,
      occupied: true, infested: true, population: { low: 2, med: 0, high: 0, vip: 0 },
    })
    settleMidnight(state, [])
    expect(state.ledgerHistory[0]?.lines['rent.office']).toBeUndefined()
    expect(state.ledgerHistory[0]?.lines['rent.residential']).toBeUndefined()
  })

  it('caps ledger history at 30 days, newest first', () => {
    const state = makeTestState()
    for (let i = 0; i < 35; i++) {
      advanceClock(state, 1440)
      settleMidnight(state, [])
    }
    expect(state.ledgerHistory).toHaveLength(30)
    expect(state.ledgerHistory[0]?.day).toBe(35)
    expect(state.ledgerHistory[29]?.day).toBe(6)
  })

  it('runs the weekly stress pass only when settling a 7th day', () => {
    const state = makeTestState()
    const unit = injectUnit(state, {
      kind: 'aptStudio', floor: 0, x: 0, width: 4, storeys: 1,
      occupied: true, stressMarks: 3, population: { low: 2, med: 0, high: 0, vip: 0 },
    })
    state.ledgerToday.day = 6
    settleMidnight(state, [])
    expect(unit.occupied).toBe(true)

    unit.stressMarks = 3
    state.ledgerToday.day = 7
    const events: EngineEvent[] = []
    settleMidnight(state, events)
    expect(unit.occupied).toBe(false)
    expect(events.some((e) => e.type === 'unitVacated')).toBe(true)
  })
})

describe('settlement loan prompt (review fix #4)', () => {
  it('arms the refinance prompt when midnight charges exceed funds', () => {
    const state = makeTestState({ funds: 100 })
    injectUnit(state, { kind: 'shop', floor: 0, x: 0, width: 8, storeys: 1 }) // $150/day upkeep
    const events: EngineEvent[] = []
    settleMidnight(state, events)

    expect(state.funds).toBe(0)
    expect(state.ledgerHistory[0]?.lines['maint.commerce']).toBe(-150) // full accrual
    expect(state.pendingLoanPrompt).toEqual({ shortfall: 50, suggested: 100_000 })
    expect(events).toContainEqual({ type: 'loanPrompt', shortfall: 50, suggested: 100_000 })
  })

  it('deferred loan repayments count toward the shortfall', () => {
    const state = makeTestState({ funds: 0 })
    state.loans.push({ id: 1, principal: 100_000, outstanding: 100_000 })
    const events: EngineEvent[] = []
    settleMidnight(state, events)
    expect(state.pendingLoanPrompt?.shortfall).toBe(5000) // the whole 5% deferred
    expect(events).toContainEqual(expect.objectContaining({ type: 'loanPrompt' }))
  })

  it('stays silent when the settlement is covered', () => {
    const state = makeTestState({ funds: 10_000 })
    injectUnit(state, { kind: 'shop', floor: 0, x: 0, width: 8, storeys: 1 })
    const events: EngineEvent[] = []
    settleMidnight(state, events)
    expect(state.pendingLoanPrompt).toBeNull()
    expect(events.some((e) => e.type === 'loanPrompt')).toBe(false)
  })
})

describe('loan flow', () => {
  it('requestSpend deducts when affordable', () => {
    const state = makeTestState({ funds: 2000 })
    expect(requestSpend(state, 500, [])).toBe(true)
    expect(state.funds).toBe(1500)
    expect(state.pendingLoanPrompt).toBeNull()
  })

  it('arms the loan prompt on a shortfall without touching funds', () => {
    const state = makeTestState({ funds: 1000 })
    const events: EngineEvent[] = []
    expect(requestSpend(state, 250_900, events)).toBe(false)
    expect(state.funds).toBe(1000)
    // shortfall 249,900 → next $100k increment.
    expect(state.pendingLoanPrompt).toEqual({ shortfall: 249_900, suggested: 300_000 })
    expect(events).toContainEqual({ type: 'loanPrompt', shortfall: 249_900, suggested: 300_000 })
  })

  it('acceptLoan credits funds, records the loan and ledger, clears the prompt', () => {
    const state = makeTestState({ funds: 1000 })
    requestSpend(state, 250_900, [])
    const events: EngineEvent[] = []
    acceptLoan(state, 300_000, events)
    expect(state.funds).toBe(301_000)
    expect(state.loans).toEqual([{ id: 1, principal: 300_000, outstanding: 300_000 }])
    expect(state.ledgerToday.lines['loan.principal']).toBe(300_000)
    expect(state.pendingLoanPrompt).toBeNull()
    expect(events).toContainEqual({ type: 'loanTaken', amount: 300_000 })
  })

  it('bounds an accepted offer, snaps it to increments, and requires an active prompt', () => {
    const state = makeTestState({ funds: 1000 })
    requestSpend(state, 250_900, [])
    expect(maximumLoanOffer(state.pendingLoanPrompt!)).toBe(600_000)

    const events: EngineEvent[] = []
    expect(acceptLoan(state, 99_999_999, events)).toBe(true)
    expect(state.loans).toEqual([{ id: 1, principal: 600_000, outstanding: 600_000 }])
    expect(events).toContainEqual({ type: 'loanTaken', amount: 600_000 })

    const funds = state.funds
    expect(acceptLoan(state, 12_000_000, events)).toBe(false)
    expect(state.funds).toBe(funds)
    expect(state.loans).toHaveLength(1)
  })

  it('normalizes a custom accepted amount to the offer increment', () => {
    const state = makeTestState({ funds: 1000 })
    requestSpend(state, 250_900, [])

    acceptLoan(state, 550_000, [])

    expect(state.loans[0]?.principal).toBe(500_000)
  })

  it('declineLoan clears the prompt', () => {
    const state = makeTestState({ funds: 0 })
    requestSpend(state, 100, [])
    expect(state.pendingLoanPrompt).not.toBeNull()
    declineLoan(state)
    expect(state.pendingLoanPrompt).toBeNull()
  })

  it('repayment clamps at zero funds and defers the remainder', () => {
    const state = makeTestState({ funds: 3000 })
    state.loans.push({ id: 1, principal: 100_000, outstanding: 100_000 })
    settleMidnight(state, [])
    expect(state.funds).toBe(0) // scheduled 5000, only 3000 available
    expect(state.loans[0]?.outstanding).toBe(97_000)

    settleMidnight(state, []) // nothing left to repay — fully deferred
    expect(state.loans[0]?.outstanding).toBe(97_000)
    expect(state.funds).toBe(0)
  })

  it('removes a fully repaid loan and emits loanRepaid', () => {
    const state = makeTestState({ funds: 10_000 })
    state.loans.push({ id: 7, principal: 100_000, outstanding: 1 })
    const events: EngineEvent[] = []
    settleMidnight(state, events)
    expect(state.loans).toHaveLength(0)
    expect(events).toContainEqual({ type: 'loanRepaid', loanId: 7 })
    expect(state.funds).toBe(10_000 - 1)
  })

  it('funds never go negative across a scripted lean week', () => {
    const state = makeTestState({ funds: 100 })
    injectUnit(state, { kind: 'shop', floor: 0, x: 0, width: 8, storeys: 1 }) // $150/day upkeep
    state.loans.push({ id: 1, principal: 50_000, outstanding: 50_000 })
    for (let day = 0; day < 7; day++) {
      advanceClock(state, 1440)
      settleMidnight(state, [])
      expect(state.funds).toBeGreaterThanOrEqual(0)
    }
  })
})
