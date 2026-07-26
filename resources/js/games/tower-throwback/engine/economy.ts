/**
 * Economy — ledger accrual, midnight settlement, and the loan flow.
 *
 * SIGN CONVENTION (used everywhere): ledger amounts are signed — income is
 * POSITIVE, costs are NEGATIVE. `DayLedger` net = plain sum of its lines.
 *
 * Funds flow rules:
 * - `requestSpend` deducts funds only; the caller accrues the matching ledger
 *   line (e.g. `accrue(state, 'construction', -cost)`) so a declined loan
 *   prompt never leaves a phantom ledger entry.
 * - `postImmediate` = accrue + apply to funds now (per-visit sales, refunds,
 *   bonuses; construction should go through `requestSpend` instead).
 * - FUNDS INVARIANT: `state.funds` never goes below 0 on any path. Settlement
 *   charges accrue in full on the ledger; when they exceed available funds the
 *   deduction floors at 0 AND the loan prompt arms for the shortfall — the
 *   spec's "offered automatically whenever funds would go below zero".
 */

import type { EngineEvent, EngineState, LedgerLine, Loan, Unit } from '../gameTypes'
import { TUNING } from '../gameTypes'
import { itemDef, shaftDef } from './catalog'
import { weeklyStressPass } from './occupancy'

export function accrue(state: EngineState, line: LedgerLine, amount: number): void {
  if (amount === 0) {
    return
  }
  state.ledgerToday.lines[line] = (state.ledgerToday.lines[line] ?? 0) + amount
}

export function postImmediate(state: EngineState, line: LedgerLine, amount: number, events?: EngineEvent[]): void {
  accrue(state, line, amount)
  state.funds = Math.max(0, state.funds + amount)
  if (amount > 0 && events) {
    events.push({ type: 'cash', amount })
  }
}

// ── Loans ────────────────────────────────────────────────────────────────────

/**
 * Attempt a player spend. Insufficient funds → arm the loan prompt (rounded up
 * to the loan increment), emit `loanPrompt`, leave funds untouched, return false.
 */
export function requestSpend(state: EngineState, cost: number, events: EngineEvent[]): boolean {
  if (state.funds >= cost) {
    state.funds -= cost
    return true
  }
  const shortfall = cost - state.funds
  offerLoan(state, shortfall, events)
  return false
}

/** Add a new shortfall to any offer already on screen instead of replacing its pending action. */
function offerLoan(state: EngineState, additionalShortfall: number, events: EngineEvent[]): void {
  const shortfall = (state.pendingLoanPrompt?.shortfall ?? 0) + additionalShortfall
  const suggested = Math.ceil(shortfall / TUNING.economy.loanIncrement) * TUNING.economy.loanIncrement
  state.pendingLoanPrompt = { shortfall, suggested }
  events.push({ type: 'loanPrompt', shortfall, suggested })
}

export function acceptLoan(state: EngineState, amount: number, events: EngineEvent[]): void {
  const loan: Loan = { id: state.nextId, principal: amount, outstanding: amount }
  state.nextId += 1
  state.loans.push(loan)
  state.funds += amount
  accrue(state, 'loan.principal', amount)
  state.pendingLoanPrompt = null
  events.push({ type: 'loanTaken', amount })
}

export function declineLoan(state: EngineState): void {
  state.pendingLoanPrompt = null
}

// ── Midnight settlement ──────────────────────────────────────────────────────

const MAINT_LINE_BY_CATEGORY: Record<string, LedgerLine> = {
  structure: 'maint.structure',
  transit: 'maint.transit',
  commerce: 'maint.commerce',
  hotel: 'maint.hotel',
  services: 'maint.services',
  office: 'maint.structure',
  residential: 'maint.structure',
  special: 'maint.structure',
}

function settleRent(state: EngineState): void {
  for (const unit of state.units) {
    const def = itemDef(unit.kind)
    if (!unit.occupied || unit.offline || unit.infested) {
      continue
    }
    if (def.income?.type === 'rent') {
      const rent = def.income.perDay * TUNING.rent.incomeMultiplier[unit.rentTier]
      const line: LedgerLine = def.category === 'office' ? 'rent.office' : 'rent.residential'
      accrue(state, line, rent)
      state.funds += rent
    } else if (def.income?.type === 'perNight') {
      // A room occupied at midnight hosted a guest tonight.
      const nightly = nightlyRoomIncome(unit)
      accrue(state, 'hotel.nights', nightly)
      state.funds += nightly
    }
  }
}

/** Nightly bill for an occupied hotel room: rate × rent tier × luxury uplift. */
export function nightlyRoomIncome(unit: Unit): number {
  const income = itemDef(unit.kind).income
  if (income?.type !== 'perNight') {
    return 0
  }
  const luxury = unit.grade === 'luxury' ? TUNING.hotel.luxuryRateFactor : 1
  return income.amount * TUNING.rent.incomeMultiplier[unit.rentTier] * luxury
}

/** Returns the unpaid remainder when charges exceeded available funds. */
function settleMaintenance(state: EngineState): number {
  let total = 0
  for (const unit of state.units) {
    const def = itemDef(unit.kind)
    // Per-tile items (lobby/skylobby/skybridge) also maintain per tile, per the balance table.
    const maint = def.maintPerDay * (def.perTile ? unit.width : 1)
    if (maint > 0) {
      accrue(state, MAINT_LINE_BY_CATEGORY[def.category] ?? 'maint.structure', -maint)
      total += maint
    }
  }
  for (const shaft of state.shafts) {
    const maint = shaftDef(shaft.kind).maintPerCarPerDay * shaft.cars.length
    accrue(state, 'maint.transit', -maint)
    total += maint
  }
  const shortfall = Math.max(0, total - state.funds)
  state.funds = Math.max(0, state.funds - total)
  return shortfall
}

/**
 * 5% of outstanding per day, whole dollars, clamped to funds; the deferred
 * remainder is returned so the settlement can arm the refinance prompt.
 */
function settleLoans(state: EngineState, events: EngineEvent[]): number {
  const remaining: Loan[] = []
  let deferred = 0
  for (const loan of state.loans) {
    const scheduled = Math.max(1, Math.round(loan.outstanding * TUNING.economy.loanDailyRepayRate))
    const repay = Math.min(scheduled, loan.outstanding, state.funds)
    if (repay > 0) {
      state.funds -= repay
      loan.outstanding -= repay
      accrue(state, 'loan.repayment', -repay)
    }
    deferred += Math.min(scheduled, loan.outstanding + repay) - repay
    if (loan.outstanding <= 0) {
      events.push({ type: 'loanRepaid', loanId: loan.id })
    } else {
      remaining.push(loan)
    }
  }
  state.loans = remaining
  return deferred
}

/**
 * Midnight settlement, called after `advanceClock` reports `crossedMidnight`:
 * rent + hotel nights → maintenance → weekly stress pass (every 7th day) →
 * loan repayment → `settlement` event → rotate the ledger. Tenants pay the
 * settled day's rent before any weekly move-out. (Trash generation also
 * happens at midnight, via schedules' minute-0 tick — economy cannot import
 * trash.ts without an economy→trash→people→economy cycle.)
 */
export function settleMidnight(state: EngineState, events: EngineEvent[]): void {
  const settledDay = state.ledgerToday.day

  settleRent(state)
  const maintenanceShortfall = settleMaintenance(state)
  if (settledDay % 7 === 0) {
    weeklyStressPass(state, events)
  }
  const deferredRepayments = settleLoans(state, events)

  if (state.funds < 0) {
    state.funds = 0
  }

  // Spec: loans are offered automatically whenever funds would go below zero.
  const shortfall = maintenanceShortfall + deferredRepayments
  if (shortfall > 0) {
    offerLoan(state, shortfall, events)
  }

  const net = Object.values(state.ledgerToday.lines).reduce((sum, amount) => sum + (amount ?? 0), 0)
  events.push({ type: 'settlement', day: settledDay, net })

  state.ledgerHistory.unshift(state.ledgerToday)
  if (state.ledgerHistory.length > TUNING.economy.ledgerHistoryDays) {
    state.ledgerHistory.length = TUNING.economy.ledgerHistoryDays
  }
  state.ledgerToday = { day: state.clock.day, lines: {} }
}
