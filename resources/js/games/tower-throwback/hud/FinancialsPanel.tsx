import currency from 'currency.js'
import { type ReactElement, useState } from 'react'

import type { DayLedger, LedgerLine, Loan } from '../gameTypes'
import { TUNING } from '../gameTypes'

interface FinancialsPanelProps {
  ledgerHistory: DayLedger[]
  ledgerToday: DayLedger
  loans: Loan[]
}

const LINE_LABELS: Record<LedgerLine, string> = {
  'rent.office': 'Office rent',
  'rent.residential': 'Residential rent',
  'sales.commerce': 'Commerce sales',
  'sales.amenity': 'Amenity sales',
  'sales.medical': 'Medical',
  'hotel.nights': 'Hotel nights',
  'events.income': 'Events',
  'maint.transit': 'Transit upkeep',
  'maint.commerce': 'Commerce upkeep',
  'maint.hotel': 'Hotel upkeep',
  'maint.services': 'Services upkeep',
  'maint.structure': 'Structure upkeep',
  construction: 'Construction',
  'demolition.refund': 'Demolition refunds',
  repairs: 'Repairs',
  'loan.principal': 'Loan principal',
  'loan.repayment': 'Loan repayment',
  'bonus.star': 'Star bonus',
  'bonus.vip': 'VIP bonus',
  'incident.cost': 'Incidents',
}

const INCOME_LINES: LedgerLine[] = [
  'rent.office',
  'rent.residential',
  'sales.commerce',
  'sales.amenity',
  'sales.medical',
  'hotel.nights',
  'events.income',
  'bonus.star',
  'bonus.vip',
  'demolition.refund',
  'loan.principal',
]

const EXPENSE_LINES: LedgerLine[] = [
  'maint.transit',
  'maint.commerce',
  'maint.hotel',
  'maint.services',
  'maint.structure',
  'construction',
  'repairs',
  'loan.repayment',
  'incident.cost',
]

const DAYS_SHOWN = 7
/** Full retained span (matches TUNING.economy.ledgerHistoryDays); table 30d toggle. */
const DAYS_SHOWN_FULL = TUNING.economy.ledgerHistoryDays

type TableSpan = typeof DAYS_SHOWN | typeof DAYS_SHOWN_FULL

function money(value: number): string {
  return currency(value, { precision: 0 }).format()
}

function ledgerNet(day: DayLedger): number {
  return Object.values(day.lines).reduce((sum, v) => sum + (v ?? 0), 0)
}

/**
 * Inline SVG net-per-day strip over the full available ledger history (oldest →
 * newest, today rightmost). Zero-centred bars: gains rise emerald, losses drop
 * red. No external chart dependency.
 */
function TrendStrip({ days }: { days: DayLedger[] }): ReactElement {
  const nets = days.map((day) => ({ day: day.day, net: ledgerNet(day) }))
  const maxAbs = Math.max(1, ...nets.map((point) => Math.abs(point.net)))
  const viewW = 300
  const viewH = 44
  const mid = viewH / 2
  const barW = viewW / Math.max(1, nets.length)
  return (
    <div className="mb-3 border-b border-white/15 pb-2">
      <div className="flex items-baseline justify-between pb-1">
        <span className="text-[10px] font-bold tracking-widest text-white/50">NET / DAY · {nets.length}D</span>
        <span className="text-[10px] tabular-nums text-white/40">peak ±{money(maxAbs)}</span>
      </div>
      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        preserveAspectRatio="none"
        className="h-11 w-full"
        role="img"
        aria-label={`Net income per day over the last ${nets.length} days`}
        data-testid="financials-trend"
      >
        <line x1={0} y1={mid} x2={viewW} y2={mid} stroke="currentColor" strokeWidth={0.4} className="text-white/25" />
        {nets.map((point, i) => {
          const magnitude = (Math.abs(point.net) / maxAbs) * (mid - 1)
          const height = Math.max(0.6, magnitude)
          const x = i * barW + barW * 0.15
          const y = point.net >= 0 ? mid - height : mid
          return (
            <rect
              key={point.day}
              data-testid="trend-bar"
              data-net={point.net}
              x={x}
              y={y}
              width={barW * 0.7}
              height={height}
              className={point.net >= 0 ? 'fill-emerald-400' : 'fill-red-400'}
            />
          )
        })}
      </svg>
    </div>
  )
}

/** Ledger table + trend strip: settled-day history, income vs expenses, loans. */
export function FinancialsPanel({ ledgerHistory, ledgerToday, loans }: FinancialsPanelProps): ReactElement {
  const [tableSpan, setTableSpan] = useState<TableSpan>(DAYS_SHOWN)

  // History is newest-first; render oldest → newest with today rightmost.
  const trendDays: DayLedger[] = [...ledgerHistory].reverse().concat([ledgerToday])
  const days: DayLedger[] = [...ledgerHistory.slice(0, tableSpan - 1)].reverse().concat([ledgerToday])

  const activeLines = (lines: LedgerLine[]): LedgerLine[] =>
    lines.filter((line) => days.some((day) => (day.lines[line] ?? 0) !== 0))

  const incomeRows = activeLines(INCOME_LINES)
  const expenseRows = activeLines(EXPENSE_LINES)
  const netOf = ledgerNet

  const section = (title: string, rows: LedgerLine[], tone: string): ReactElement | null =>
    rows.length === 0 ? null : (
      <>
        <tr>
          <td colSpan={days.length + 1} className={`pt-2 pb-0.5 text-[10px] font-bold tracking-widest ${tone}`}>
            {title}
          </td>
        </tr>
        {rows.map((line) => (
          <tr key={line} data-testid={`row-${line}`}>
            <td className="pr-2 text-white/70">{LINE_LABELS[line]}</td>
            {days.map((day) => (
              <td key={day.day} className="px-1 text-right tabular-nums">
                {(day.lines[line] ?? 0) === 0 ? '·' : money(day.lines[line] ?? 0)}
              </td>
            ))}
          </tr>
        ))}
      </>
    )

  const spanButton = (span: TableSpan, label: string): ReactElement => (
    <button
      type="button"
      onClick={() => setTableSpan(span)}
      aria-pressed={tableSpan === span}
      data-testid={`table-span-${span}`}
      className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
        tableSpan === span ? 'bg-white/20 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'
      }`}
    >
      {label}
    </button>
  )

  return (
    <div className="max-h-[70vh] overflow-auto rounded-xl bg-slate-950/85 p-3 text-[12px] shadow-lg backdrop-blur-sm">
      <TrendStrip days={trendDays} />

      <div className="flex items-center justify-between pb-1">
        <span className="text-[10px] font-bold tracking-widest text-white/50">DAILY LEDGER</span>
        <div className="flex gap-1" role="group" aria-label="Ledger table span">
          {spanButton(DAYS_SHOWN, '7d')}
          {spanButton(DAYS_SHOWN_FULL, '30d')}
        </div>
      </div>

      <table className="w-full">
        <thead>
          <tr className="text-white/50">
            <th className="pr-2 text-left font-normal">Line</th>
            {days.map((day, i) => (
              <th key={day.day} className="px-1 text-right font-normal tabular-nums">
                {i === days.length - 1 ? 'Today' : `D${day.day}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section('INCOME', incomeRows, 'text-emerald-300/80')}
          {section('EXPENSES', expenseRows, 'text-red-300/80')}
          <tr className="border-t border-white/20 font-bold" data-testid="totals-row">
            <td className="pr-2 pt-1">Net</td>
            {days.map((day) => {
              const net = netOf(day)
              return (
                <td key={day.day} className={`px-1 pt-1 text-right tabular-nums ${net >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                  {money(net)}
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>

      {loans.length > 0 && (
        <div className="mt-3 border-t border-white/20 pt-2">
          <div className="pb-1 text-[10px] font-bold tracking-widest text-white/50">ACTIVE LOANS</div>
          {loans.map((loan) => (
            <div key={loan.id} className="flex justify-between tabular-nums" data-testid={`loan-${loan.id}`}>
              <span className="text-white/70">Loan #{loan.id}</span>
              <span>
                {money(loan.outstanding)} outstanding · {money(Math.round(loan.outstanding * TUNING.economy.loanDailyRepayRate))}
                /day
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
