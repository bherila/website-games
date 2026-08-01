import currency from 'currency.js'
import { type FocusEvent, type ReactElement, useCallback, useEffect, useRef } from 'react'

import { itemDef, UPGRADE_PATHS } from '../engine/catalog'
import { floorLabel } from '../floorLabels'
import type { EngineEvent, GameClock, VacancyReason, VipTarget } from '../gameTypes'
import { vipFlavorFor, vipReportLine, vipVisitIdForTarget } from '../vipFlavor'

export type ToastType = 'starUp' | 'vip' | 'warning' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  body?: string | undefined
  /** Durable context rendered in Recent events, intentionally omitted from the live toast. */
  details?: string[] | undefined
  unlocked?: string[]
}

const AUTO_DISMISS_MS = 5000

function vipVisitId(target: VipTarget): string {
  return vipVisitIdForTarget(target)
}

const VACANCY_REASON_LABEL: Record<VacancyReason, string> = {
  elevatorCrowded: 'Elevator congestion',
  tooNoisy: 'Too noisy',
  noRestroom: 'No nearby restroom',
  rentTooHigh: 'Rent too high',
  noRoute: 'No route to the lobby',
  hotelDirty: 'Room left dirty',
  noReception: 'No hotel reception',
  lowEval: 'Poor conditions',
  incidentDamage: 'Incident damage',
}

type VacancyEvent = Extract<EngineEvent, { type: 'unitVacated' }>

function vacancyToast(event: VacancyEvent, allVacancies: readonly VacancyEvent[], id: string): ToastItem {
  const firstContext = `${itemDef(event.unitKind).name} on ${floorLabel(event.floor)} — ${VACANCY_REASON_LABEL[event.reason]}`
  if (allVacancies.length === 1) {
    return { id, type: 'warning', title: 'Tenant moved out', body: firstContext }
  }

  const reasonCounts = new Map<VacancyReason, number>()
  for (const vacancy of allVacancies) {
    reasonCounts.set(vacancy.reason, (reasonCounts.get(vacancy.reason) ?? 0) + 1)
  }
  const reasonSummary = [...reasonCounts]
    .map(([reason, count]) => `${VACANCY_REASON_LABEL[reason]} ×${count}`)
    .join(' · ')
  return {
    id,
    type: 'warning',
    title: `${allVacancies.length.toLocaleString()} tenants moved out`,
    body: `${firstContext}; +${(allVacancies.length - 1).toLocaleString()} more`,
    details: [`First loss: ${firstContext} (unit #${event.unitId})`, `Reasons: ${reasonSummary}`],
  }
}

/**
 * Map engine events to toast items. Pure and deterministic: ids derive from
 * the clock + a caller-owned batch sequence + the event's position (never
 * Date.now()).
 * unitVacated is throttled to at most one toast per batch; placementRejected
 * coalesces per reason (a shift-drag bulk build can reject hundreds of cells
 * in one tick).
 */
export function toastsFromEvents(events: EngineEvent[], clock: GameClock, batchId = 0): ToastItem[] {
  const toasts: ToastItem[] = []
  const id = (index: number, kind: string): string => `${clock.day}:${Math.floor(clock.minute)}:${batchId}:${index}:${kind}`
  let vacatedShown = false
  const vacancyEvents = events.filter((event): event is VacancyEvent => event.type === 'unitVacated')
  const rejectionsByReason = new Map<string, { firstIndex: number; count: number }>()

  events.forEach((event, index) => {
    switch (event.type) {
      case 'starUp':
        toasts.push({
          id: id(index, 'starUp'),
          type: 'starUp',
          title: `${'★'.repeat(event.star)} ${event.star}-star tower!`,
          body: `Bonus ${currency(event.bonus, { precision: 0 }).format()}`,
          unlocked: [...event.unlocked],
        })
        return
      case 'starLost':
        toasts.push({
          id: id(index, 'starLost'),
          type: 'warning',
          title: `Star lost — back to ${'★'.repeat(event.star)}`,
          body: event.report[0],
          details: event.report.slice(1),
        })
        return
      case 'towerAchieved':
        toasts.push({ id: id(index, 'tower'), type: 'starUp', title: '👑 TOWER status achieved!' })
        return
      case 'vipArrived': {
        const visitId = vipVisitId(event.target)
        const flavor = vipFlavorFor(event.target, visitId)
        toasts.push({
          id: id(index, 'vipArrived'),
          type: 'vip',
          title: `${flavor.name} has arrived`,
          body: `${flavor.title} - ${flavor.arrivalLine}`,
        })
        return
      }
      case 'vipResult': {
        const visitId = vipVisitId(event.target)
        const flavor = vipFlavorFor(event.target, visitId)
        toasts.push({
          id: id(index, 'vipResult'),
          type: 'vip',
          title: event.success ? `${flavor.name} approved the visit` : `${flavor.name} left unimpressed`,
          body: event.success
            ? `${flavor.title} - Score ${event.score} - Bonus ${currency(event.bonus, { precision: 0 }).format()}`
            : vipReportLine(event.target, visitId, event.report[0] ?? 'No report filed'),
          details: event.success
            ? undefined
            : event.report.slice(1).map((line) => vipReportLine(event.target, visitId, line)),
        })
        return
      }
      case 'vipMovedIn': {
        const visitId = vipVisitId(event.target)
        const flavor = vipFlavorFor(event.target, visitId)
        toasts.push({ id: id(index, 'vipMovedIn'), type: 'vip', title: `${flavor.name} moved in`, body: `${flavor.title} is now a resident.` })
        return
      }
      case 'vipMovedOut': {
        const visitId = vipVisitId(event.target)
        const flavor = vipFlavorFor(event.target, visitId)
        toasts.push({
          id: id(index, 'vipMovedOut'),
          type: 'vip',
          title: `${flavor.name} moved out`,
          body: vipReportLine(event.target, visitId, event.report[0] ?? 'No report filed'),
          details: event.report.slice(1).map((line) => vipReportLine(event.target, visitId, line)),
        })
        return
      }
      case 'upgraded': {
        const label = UPGRADE_PATHS.find((path) => path.id === event.upgradeId)?.label ?? 'Upgrade'
        toasts.push({
          id: id(index, 'upgraded'),
          type: 'info',
          title: `${label} complete`,
          body: currency(event.cost, { precision: 0 }).format(),
        })
        return
      }
      case 'loanTaken':
        toasts.push({
          id: id(index, 'loanTaken'),
          type: 'info',
          title: `Loan taken: ${currency(event.amount, { precision: 0 }).format()}`,
        })
        return
      case 'requestFulfilled':
        toasts.push({
          id: id(index, 'request'),
          type: 'info',
          title: `Tenant request fulfilled · +${currency(event.reward, { precision: 0 }).format()}`,
        })
        return
      case 'incidentStarted':
        toasts.push({
          id: id(index, 'incident'),
          type: 'warning',
          title: event.kind === 'bombThreat' ? 'Bomb threat!' : event.kind === 'fire' ? 'Fire!' : 'Cockroach infestation!',
          body: `Floor ${floorLabel(event.floor)}`,
        })
        return
      case 'incidentResolved':
        toasts.push({
          id: id(index, 'incidentResolved'),
          type: 'info',
          title: event.kind === 'bombThreat' ? 'Bomb threat resolved' : event.kind === 'fire' ? 'Fire extinguished' : 'Infestation cleared',
          body: event.outcome,
        })
        return
      case 'explosion': {
        const damagedCount = event.damagedUnitIds.length
        toasts.push({
          id: id(index, 'explosion'),
          type: 'warning',
          title: '💥 Explosion!',
          body: `Floor ${floorLabel(event.floor)} — ${damagedCount} ${damagedCount === 1 ? 'unit' : 'units'} damaged`,
        })
        return
      }
      case 'tenantRequest':
        toasts.push({
          id: id(index, 'tenantRequest'),
          type: 'info',
          title: 'Tenant request',
          body: event.request.description,
        })
        return
      case 'requestExpired':
        toasts.push({ id: id(index, 'requestExpired'), type: 'warning', title: 'A tenant request expired' })
        return
      case 'placementRejected': {
        const tally = rejectionsByReason.get(event.reason)
        if (tally) {
          tally.count += 1
        } else {
          rejectionsByReason.set(event.reason, { firstIndex: index, count: 1 })
        }
        return
      }
      case 'unitVacated':
        if (!vacatedShown) {
          vacatedShown = true
          toasts.push(vacancyToast(event, vacancyEvents, id(index, 'vacated')))
        }
        return
      default:
        return
    }
  })
  for (const [reason, tally] of rejectionsByReason) {
    toasts.push({
      id: id(tally.firstIndex, 'placementRejected'),
      type: 'warning',
      title: tally.count > 1 ? `Action rejected ×${tally.count}` : 'Action rejected',
      body: reason,
    })
  }
  return toasts
}

export const toastTypeStyles: Record<ToastType, string> = {
  starUp: 'border-amber-400/70 bg-amber-500/20 text-amber-100',
  vip: 'border-yellow-300/70 bg-yellow-400/15 text-yellow-100',
  warning: 'border-red-400/60 bg-red-500/15 text-red-100',
  info: 'border-sky-400/50 bg-sky-500/15 text-sky-100',
}

interface ToastsProps {
  toasts: ToastItem[]
  onDismiss: (id: string) => void
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }): ReactElement {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startedAtRef = useRef(0)
  const remainingMsRef = useRef(AUTO_DISMISS_MS)
  const hoveredRef = useRef(false)
  const focusWithinRef = useRef(false)
  const onDismissRef = useRef(onDismiss)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  const stopTimer = useCallback((): void => {
    if (timerRef.current === null) {
      return
    }
    clearTimeout(timerRef.current)
    timerRef.current = null
    remainingMsRef.current = Math.max(0, remainingMsRef.current - (Date.now() - startedAtRef.current))
  }, [])

  const startTimer = useCallback((): void => {
    if (timerRef.current !== null || hoveredRef.current || focusWithinRef.current) {
      return
    }
    startedAtRef.current = Date.now()
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      remainingMsRef.current = 0
      onDismissRef.current(toast.id)
    }, remainingMsRef.current)
  }, [toast.id])

  const syncTimer = useCallback((): void => {
    if (hoveredRef.current || focusWithinRef.current) {
      stopTimer()
    } else {
      startTimer()
    }
  }, [startTimer, stopTimer])

  useEffect(() => {
    remainingMsRef.current = AUTO_DISMISS_MS
    startTimer()
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [startTimer])

  const onBlur = (event: FocusEvent<HTMLDivElement>): void => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      focusWithinRef.current = false
      syncTimer()
    }
  }

  return (
    <div
      data-testid={`toast-${toast.type}`}
      className={`pointer-events-auto relative w-64 rounded-lg border px-3 py-2 text-sm shadow-lg backdrop-blur-sm ${toastTypeStyles[toast.type]}`}
      onMouseEnter={() => {
        hoveredRef.current = true
        syncTimer()
      }}
      onMouseLeave={() => {
        hoveredRef.current = false
        syncTimer()
      }}
      onFocus={() => {
        focusWithinRef.current = true
        syncTimer()
      }}
      onBlur={onBlur}
    >
      <div role="status" className="pr-6">
        <div className={`font-bold ${toast.type === 'starUp' ? 'text-base' : ''}`}>{toast.title}</div>
        {toast.body && <div className="text-[12px] opacity-80">{toast.body}</div>}
        {toast.unlocked && toast.unlocked.length > 0 && (
          <div className="mt-1 text-[11px] opacity-80">Unlocked: {toast.unlocked.join(', ')}</div>
        )}
      </div>
      <button
        type="button"
        aria-label={`Dismiss ${toast.title}`}
        onClick={() => onDismiss(toast.id)}
        className="absolute right-2 top-1.5 rounded px-1.5 py-0.5 text-sm font-bold opacity-70 hover:bg-white/10 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-white"
      >
        ×
      </button>
    </div>
  )
}

/** Bottom-right toast stack; timers pause while a toast is hovered or focused. */
export function Toasts({ toasts, onDismiss }: ToastsProps): ReactElement {
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-20 flex flex-col-reverse gap-2">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
