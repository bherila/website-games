import { render, screen } from '@testing-library/react'

import type { HudSnapshot } from '../../gameTypes'
import { TopBar } from '../TopBar'

function snapshot(overrides: Partial<HudSnapshot> = {}): HudSnapshot {
  return {
    mapId: 'city-tower',
    funds: 1_234_567,
    netYesterday: -4740,
    population: 312,
    star: 2,
    maxStarReached: 2,
    starProgress: {
      nextStar: 3,
      threshold: 1000,
      remaining: 688,
      progress: 0.312,
    },
    vipGoal: {
      target: 3,
      status: 'notArmed',
      blockedReason: null,
      cooldownUntilDay: null,
    },
    towerAchieved: false,
    endgame: { kind: 'cathedral', name: 'Cathedral', floorLabel: '99', built: false },
    day: 9,
    minute: 8 * 60 + 5,
    phase: 'morningRush',
    weekend: false,
    speed: 1,
    fastMode: false,
    effectiveSpeed: 1,
    fastModeActive: false,
    disastersEnabled: true,
    activePeople: 12,
    peopleCap: { active: 12, max: 2000, atCap: false },
    trafficUnderstated: false,
    vipInBuilding: false,
    pendingLoanPrompt: null,
    activeIncident: null,
    ...overrides,
  }
}

describe('TopBar', () => {
  it('formats funds, net, clock, phase, and stars', () => {
    render(<TopBar snapshot={snapshot()} />)
    expect(screen.getByTestId('funds')).toHaveTextContent('$1,234,567')
    expect(screen.getByTestId('net-yesterday')).toHaveTextContent('-$4,740 yesterday')
    expect(screen.getByTestId('population')).toHaveTextContent('312')
    expect(screen.getByTestId('star-progress')).toHaveTextContent('Next ★3')
    expect(screen.getByTestId('star-progress')).toHaveTextContent('312/1,000')
    expect(screen.getByTestId('star-remaining')).toHaveTextContent('688 pop to go')
    expect(screen.getByTestId('star-badge')).toHaveTextContent('★★')
    expect(screen.getByTestId('vip-goal')).toHaveTextContent('VIP ★3')
    expect(screen.getByTestId('vip-status')).toHaveTextContent('Grow population')
    expect(screen.getByTestId('clock')).toHaveTextContent('Day 9 · 08:05')
    expect(screen.getByTestId('phase')).toHaveTextContent('Morning Rush')
  })

  it('shows positive net in green form, weekend marker, and the TOWER crown', () => {
    render(<TopBar snapshot={snapshot({ netYesterday: 2500, weekend: true, towerAchieved: true })} />)
    expect(screen.getByTestId('net-yesterday')).toHaveTextContent('+$2,500 yesterday')
    expect(screen.getByTestId('phase')).toHaveTextContent('Weekend')
    expect(screen.getByTestId('star-badge')).toHaveTextContent('TOWER')
  })

  it('shows the speed multiplier the engine is actually applying in fast mode', () => {
    const { rerender } = render(
      <TopBar snapshot={snapshot({ speed: 8, fastMode: true, effectiveSpeed: 24, fastModeActive: true })} />,
    )
    expect(screen.getByTestId('fast-mode-badge')).toHaveTextContent('FAST 24×')

    rerender(<TopBar snapshot={snapshot({ speed: 16, fastMode: true, effectiveSpeed: 48, fastModeActive: true })} />)
    expect(screen.getByTestId('fast-mode-badge')).toHaveTextContent('FAST 48×')
  })

  it('surfaces pending and blocked VIP goal state', () => {
    render(
      <TopBar
        snapshot={snapshot({
          vipGoal: {
            target: 4,
            status: 'cooldown',
            blockedReason: 'No clean suite was available',
            cooldownUntilDay: 12,
          },
        })}
      />,
    )
    expect(screen.getByTestId('vip-goal')).toHaveTextContent('VIP ★4')
    expect(screen.getByTestId('vip-status')).toHaveTextContent('Cooling down')
    expect(screen.getByTestId('vip-blocked')).toHaveTextContent('No clean suite was available')
    expect(screen.getByTestId('vip-cooldown')).toHaveTextContent('Retry day 12')
  })

  it('shows traffic understatement when the active people cap is reached', () => {
    render(<TopBar snapshot={snapshot({ activePeople: 2000, peopleCap: { active: 2000, max: 2000, atCap: true }, trafficUnderstated: true })} />)

    expect(screen.getByTestId('traffic-cap-warning')).toHaveTextContent('Traffic understated')
    expect(screen.getByTestId('traffic-cap-warning')).toHaveTextContent('2,000/2,000')
  })

  it('hides traffic understatement below the active people cap', () => {
    render(<TopBar snapshot={snapshot()} />)

    expect(screen.queryByTestId('traffic-cap-warning')).toBeNull()
  })

  it('hides star progress and VIP goal at max star', () => {
    render(<TopBar snapshot={snapshot({ star: 5, starProgress: null, vipGoal: null })} />)
    expect(screen.queryByTestId('star-progress')).toBeNull()
    expect(screen.queryByTestId('vip-goal')).toBeNull()
  })
})
