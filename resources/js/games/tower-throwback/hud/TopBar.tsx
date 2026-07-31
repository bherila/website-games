import currency from 'currency.js'
import type { ReactElement } from 'react'

import type { DayPhase, HudSnapshot, VipGoalStatus, VipTarget } from '../gameTypes'
import { clockTimeLabel } from './clockLabel'

interface TopBarProps {
  snapshot: HudSnapshot
}

const PHASE_LABELS: Record<DayPhase, string> = {
  night: 'Night',
  morningRush: 'Morning Rush',
  day: 'Daytime',
  lunch: 'Lunch',
  afternoon: 'Afternoon',
  eveningRush: 'Evening Rush',
  evening: 'Evening',
}

const VIP_STATUS_LABELS: Record<VipGoalStatus, string> = {
  notArmed: 'Grow population',
  armed: 'Visit ready',
  pending: 'Visit scheduled',
  visiting: 'VIP in tower',
  cooldown: 'Cooling down',
  resident: 'Resident secured',
  movedOut: 'Re-earn visit',
}

function vipTargetLabel(target: VipTarget): string {
  return target === 'tower' ? 'TOWER' : `★${target}`
}

/** Persistent status strip: funds, yesterday's net, population, star rating, clock. */
export function TopBar({ snapshot }: TopBarProps): ReactElement {
  const net = snapshot.netYesterday
  const starProgress = snapshot.starProgress
  const vipGoal = snapshot.vipGoal
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl bg-slate-950/70 px-4 py-2 text-sm shadow-lg backdrop-blur-sm">
      <div className="flex flex-col">
        <span className="font-bold tabular-nums text-emerald-300" data-testid="funds">
          {currency(snapshot.funds, { precision: 0 }).format()}
        </span>
        <span
          className={`text-[11px] tabular-nums ${net >= 0 ? 'text-emerald-400/80' : 'text-red-400/90'}`}
          data-testid="net-yesterday"
        >
          {net >= 0 ? '+' : ''}
          {currency(net, { precision: 0 }).format()} yesterday
        </span>
      </div>

      <div className="flex flex-col items-center">
        <span className="font-bold tabular-nums" data-testid="population">
          {snapshot.population.toLocaleString()}
        </span>
        <span className="text-[10px] tracking-widest text-white/50">POP</span>
        {snapshot.trafficUnderstated && (
          <span className="mt-0.5 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-200" data-testid="traffic-cap-warning">
            Traffic understated · {snapshot.peopleCap.active.toLocaleString()}/{snapshot.peopleCap.max.toLocaleString()}
          </span>
        )}
      </div>

      {starProgress && (
        <div className="flex min-w-40 flex-col gap-1" data-testid="star-progress">
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className="font-bold text-amber-200">Next ★{starProgress.nextStar}</span>
            <span className="tabular-nums text-white/60">
              {snapshot.population.toLocaleString()}/{starProgress.threshold.toLocaleString()}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
            <div className="h-full bg-amber-300" style={{ width: `${Math.round(starProgress.progress * 100)}%` }} />
          </div>
          <span className="text-[10px] tabular-nums text-white/50" data-testid="star-remaining">
            {starProgress.remaining === 0 ? 'Threshold reached' : `${starProgress.remaining.toLocaleString()} pop to go`}
          </span>
        </div>
      )}

      <div className="flex flex-col items-center" data-testid="star-badge">
        {snapshot.towerAchieved ? (
          <span className="font-bold text-amber-300">👑 TOWER</span>
        ) : (
          <span className="font-bold text-amber-300">{'★'.repeat(snapshot.star)}</span>
        )}
        <span className="text-[10px] tracking-widest text-white/50">RATING</span>
      </div>

      {vipGoal && (
        <div className="flex max-w-56 flex-col gap-0.5 rounded-md bg-white/5 px-2 py-1" data-testid="vip-goal">
          <div className="flex items-center justify-between gap-3 text-[11px]">
            <span className="font-bold text-amber-200">VIP {vipTargetLabel(vipGoal.target)}</span>
            <span className="text-white/70" data-testid="vip-status">
              {VIP_STATUS_LABELS[vipGoal.status]}
            </span>
          </div>
          {vipGoal.blockedReason && (
            <span className="truncate text-[10px] text-amber-100/70" data-testid="vip-blocked">
              Blocked: {vipGoal.blockedReason}
            </span>
          )}
          {vipGoal.status === 'cooldown' && vipGoal.cooldownUntilDay !== null && (
            <span className="text-[10px] tabular-nums text-white/50" data-testid="vip-cooldown">
              Retry day {vipGoal.cooldownUntilDay}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col items-end">
        <span className="font-bold tabular-nums" data-testid="clock">
          Day {snapshot.day} · {clockTimeLabel(snapshot.minute)}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-white/60" data-testid="phase">
          {PHASE_LABELS[snapshot.phase]}
          {snapshot.weekend ? ' · Weekend' : ''}
          {snapshot.fastModeActive && (
            <span
              className="rounded bg-amber-400/90 px-1 text-[10px] font-bold text-slate-950"
              data-testid="fast-mode-badge"
            >
              FAST {snapshot.effectiveSpeed}×
            </span>
          )}
        </span>
      </div>
    </div>
  )
}
