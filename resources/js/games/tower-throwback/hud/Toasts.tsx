import currency from 'currency.js'
import { type ReactElement, useEffect } from 'react'

import { UPGRADE_PATHS } from '../engine/catalog'
import type { EngineEvent, GameClock, VipTarget } from '../gameTypes'
import { vipFlavorFor, vipReportLine, vipVisitIdForTarget } from '../vipFlavor'

export type ToastType = 'starUp' | 'vip' | 'warning' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  title: string
  body?: string | undefined
  unlocked?: string[]
}

const AUTO_DISMISS_MS = 5000

function vipVisitId(target: VipTarget): string {
  return vipVisitIdForTarget(target)
}

/**
 * Map engine events to toast items. Pure and deterministic: ids derive from
 * the clock + the event's position in this batch (never Date.now()).
 * unitVacated is throttled to at most one toast per batch; placementRejected
 * coalesces per reason (a shift-drag bulk build can reject hundreds of cells
 * in one tick).
 */
export function toastsFromEvents(events: EngineEvent[], clock: GameClock): ToastItem[] {
  const toasts: ToastItem[] = []
  const id = (index: number, kind: string): string => `${clock.day}:${Math.floor(clock.minute)}:${index}:${kind}`
  let vacatedShown = false
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
          body: `Floor ${event.floor}`,
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
      case 'explosion':
        toasts.push({
          id: id(index, 'explosion'),
          type: 'warning',
          title: '💥 Explosion!',
          body: `Floor ${event.floor} — ${event.damagedUnitIds.length} units damaged`,
        })
        return
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
          toasts.push({ id: id(index, 'vacated'), type: 'warning', title: 'A tenant moved out' })
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
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])

  return (
    <div
      data-testid={`toast-${toast.type}`}
      className={`pointer-events-auto w-64 rounded-lg border px-3 py-2 text-sm shadow-lg backdrop-blur-sm ${toastTypeStyles[toast.type]}`}
      onClick={() => onDismiss(toast.id)}
      role="status"
    >
      <div className={`font-bold ${toast.type === 'starUp' ? 'text-base' : ''}`}>{toast.title}</div>
      {toast.body && <div className="text-[12px] opacity-80">{toast.body}</div>}
      {toast.unlocked && toast.unlocked.length > 0 && (
        <div className="mt-1 text-[11px] opacity-80">Unlocked: {toast.unlocked.join(', ')}</div>
      )}
    </div>
  )
}

/** Bottom-right toast stack; each toast auto-dismisses after 5 s. */
export function Toasts({ toasts, onDismiss }: ToastsProps): ReactElement {
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-20 flex flex-col-reverse gap-2">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
