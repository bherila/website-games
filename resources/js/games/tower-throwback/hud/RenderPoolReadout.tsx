import type { ReactElement } from 'react'

import type { DynamicPoolUtilization, PoolUsage } from '../scene/dynamicPools'
import type { RenderMetrics } from '../scene/sceneController'

interface RenderPoolReadoutProps {
  metrics?: RenderMetrics | null
  utilization: DynamicPoolUtilization
}

function stressed(usage: PoolUsage): boolean {
  return usage.atCap || usage.overflow > 0
}

function poolLine(label: string, usage: PoolUsage): string {
  const overflow = usage.overflow > 0 ? ` +${usage.overflow.toLocaleString()} clipped` : ''
  return `${label} ${usage.used.toLocaleString()}/${usage.cap.toLocaleString()}${overflow}`
}

export function hasRenderPoolPressure(utilization: DynamicPoolUtilization): boolean {
  return (
    stressed(utilization.persons) ||
    stressed(utilization.cars) ||
    stressed(utilization.badges) ||
    stressed(utilization.fullBadges) ||
    stressed(utilization.bars)
  )
}

export function RenderPoolReadout({ metrics = null, utilization }: RenderPoolReadoutProps): ReactElement | null {
  if (!hasRenderPoolPressure(utilization) && !metrics) {
    return null
  }

  return (
    <div className="rounded-lg bg-slate-950/75 px-3 py-2 text-[11px] text-white/70 shadow-lg backdrop-blur-sm" data-testid="render-pool-utilization">
      <div className="pb-1 text-[10px] font-bold tracking-widest text-white/45">RENDER POOLS</div>
      {hasRenderPoolPressure(utilization) && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
          <span>{poolLine('People', utilization.persons)}</span>
          <span>{poolLine('Cars', utilization.cars)}</span>
          <span>{poolLine('Badges', utilization.badges)}</span>
          <span>{poolLine('Full flags', utilization.fullBadges)}</span>
          <span>{poolLine('Bars', utilization.bars)}</span>
        </div>
      )}
      {metrics && (
        <div className="flex flex-wrap gap-x-3 tabular-nums text-white/55" data-testid="render-cost-metrics">
          <span>{metrics.drawCalls.toLocaleString()} calls</span>
          <span>{metrics.triangles.toLocaleString()} tris</span>
          <span>{metrics.frameMs.toFixed(1)} ms render</span>
        </div>
      )}
    </div>
  )
}
