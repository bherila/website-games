import { fireEvent, render, screen } from '@testing-library/react'

import { isGettingStartedDismissed } from '../../gameProgress'
import type { HudSnapshot } from '../../gameTypes'
import { GettingStarted, gettingStartedSteps } from '../GettingStarted'

function snapshot(overrides: Partial<HudSnapshot> = {}): HudSnapshot {
  return {
    mapId: 'city-tower',
    funds: 100_000,
    netYesterday: 0,
    population: 0,
    star: 1,
    maxStarReached: 1,
    starProgress: { nextStar: 2, threshold: 300, remaining: 300, progress: 0 },
    vipGoal: { target: 2, status: 'notArmed', blockedReason: null, cooldownUntilDay: null },
    towerAchieved: false,
    endgame: { kind: 'cathedral', name: 'Cathedral', floorLabel: '99', built: false },
    day: 1,
    minute: 8 * 60,
    phase: 'morningRush',
    weekend: false,
    speed: 1,
    fastMode: false,
    fastModeActive: false,
    disastersEnabled: true,
    activePeople: 0,
    peopleCap: { active: 0, max: 2000, atCap: false },
    trafficUnderstated: false,
    vipInBuilding: false,
    pendingLoanPrompt: null,
    activeIncident: null,
    ...overrides,
  }
}

function doneById(steps: ReturnType<typeof gettingStartedSteps>): Record<string, boolean> {
  return Object.fromEntries(steps.map((step) => [step.id, step.done]))
}

describe('gettingStartedSteps', () => {
  it('marks every step pending for a brand-new empty tower', () => {
    const done = doneById(gettingStartedSteps(snapshot()))
    expect(Object.values(done).every((value) => value === false)).toBe(true)
  })

  it('completes activity + first-tenants once population arrives', () => {
    const done = doneById(gettingStartedSteps(snapshot({ population: 4, activePeople: 12 })))
    expect(done.firstActivity).toBe(true)
    expect(done.firstTenants).toBe(true)
    expect(done.growPopulation).toBe(false)
    expect(done.reachStar2).toBe(false)
  })

  it('completes the halfway step once starProgress crosses 50%', () => {
    const below = doneById(gettingStartedSteps(snapshot({ population: 149, starProgress: { nextStar: 2, threshold: 300, remaining: 151, progress: 0.497 } })))
    const above = doneById(gettingStartedSteps(snapshot({ population: 150, starProgress: { nextStar: 2, threshold: 300, remaining: 150, progress: 0.5 } })))
    expect(below.growPopulation).toBe(false)
    expect(above.growPopulation).toBe(true)
  })

  it('completes the threshold step when the VIP inspection is armed', () => {
    const done = doneById(
      gettingStartedSteps(
        snapshot({
          population: 300,
          starProgress: { nextStar: 2, threshold: 300, remaining: 0, progress: 1 },
          vipGoal: { target: 2, status: 'armed', blockedReason: null, cooldownUntilDay: null },
        }),
      ),
    )
    expect(done.reachThreshold).toBe(true)
    expect(done.hostInspector).toBe(false)
  })

  it('completes the host step while the inspector is visiting', () => {
    const done = doneById(
      gettingStartedSteps(snapshot({ vipGoal: { target: 2, status: 'visiting', blockedReason: null, cooldownUntilDay: null } })),
    )
    expect(done.hostInspector).toBe(true)
  })
})

describe('GettingStarted', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders nothing when the snapshot is null', () => {
    const { container } = render(<GettingStarted snapshot={null} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the checklist with a running completion count at Star 1', () => {
    render(<GettingStarted snapshot={snapshot({ population: 4, activePeople: 5 })} />)
    expect(screen.getByTestId('getting-started')).toBeInTheDocument()
    expect(screen.getByTestId('getting-started-count')).toHaveTextContent('2/6')
  })

  it('auto-hides once the tower passes Star 1', () => {
    render(<GettingStarted snapshot={snapshot({ star: 2, starProgress: { nextStar: 3, threshold: 1000, remaining: 700, progress: 0.3 } })} />)
    expect(screen.queryByTestId('getting-started')).toBeNull()
  })

  it('dismisses and persists the dismissal through gameProgress', () => {
    const { rerender } = render(<GettingStarted snapshot={snapshot()} />)
    expect(isGettingStartedDismissed()).toBe(false)

    fireEvent.click(screen.getByLabelText('Dismiss getting started'))

    expect(screen.queryByTestId('getting-started')).toBeNull()
    expect(isGettingStartedDismissed()).toBe(true)

    // A freshly mounted panel stays hidden because the preference persisted.
    rerender(<GettingStarted snapshot={snapshot({ population: 3 })} />)
    render(<GettingStarted snapshot={snapshot({ population: 3 })} />)
    expect(screen.queryByTestId('getting-started')).toBeNull()
  })
})
