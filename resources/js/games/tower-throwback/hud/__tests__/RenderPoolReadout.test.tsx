import { render, screen } from '@testing-library/react'

import type { DynamicPoolUtilization } from '../../scene/dynamicPools'
import { RenderPoolReadout } from '../RenderPoolReadout'

function utilization(overrides: Partial<DynamicPoolUtilization> = {}): DynamicPoolUtilization {
  return {
    persons: { used: 10, needed: 10, cap: 4000, overflow: 0, atCap: false },
    cars: { used: 2, needed: 2, cap: 256, overflow: 0, atCap: false },
    badges: { used: 0, needed: 0, cap: 256, overflow: 0, atCap: false },
    fullBadges: { used: 0, needed: 0, cap: 256, overflow: 0, atCap: false },
    bars: { used: 4, needed: 4, cap: 2048, overflow: 0, atCap: false },
    ...overrides,
  }
}

describe('RenderPoolReadout', () => {
  it('hides when every pool is below pressure', () => {
    render(<RenderPoolReadout utilization={utilization()} />)

    expect(screen.queryByTestId('render-pool-utilization')).toBeNull()
  })

  it('shows utilization and clipped counts when a pool overflows', () => {
    render(<RenderPoolReadout utilization={utilization({ persons: { used: 4000, needed: 4005, cap: 4000, overflow: 5, atCap: true } })} />)

    expect(screen.getByTestId('render-pool-utilization')).toHaveTextContent('People 4,000/4,000 +5 clipped')
  })

  it('exposes bounded renderer-cost telemetry without requiring pool pressure', () => {
    render(<RenderPoolReadout utilization={utilization()} metrics={{ drawCalls: 42, triangles: 12_345, frameMs: 3.25 }} />)

    expect(screen.getByTestId('render-cost-metrics')).toHaveTextContent('42 calls')
    expect(screen.getByTestId('render-cost-metrics')).toHaveTextContent('12,345 tris')
    expect(screen.getByTestId('render-cost-metrics')).toHaveTextContent('3.3 ms render')
  })
})
