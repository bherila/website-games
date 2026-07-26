import { fireEvent, render, screen } from '@testing-library/react'

import { isObservationDeckHintDismissed, loadSavedProgress, saveProgress } from '../../gameProgress'
import type { HudSnapshot } from '../../gameTypes'
import { ObservationDeckHint, observationDeckHintSteps } from '../ObservationDeckHint'

function snapshot(overrides: Partial<HudSnapshot> = {}): HudSnapshot {
  return {
    mapId: 'niagara-falls',
    funds: 1_000_000,
    netYesterday: 0,
    population: 5_000,
    star: 4,
    maxStarReached: 4,
    starProgress: { nextStar: 5, threshold: 10_000, remaining: 5_000, progress: 0.5 },
    vipGoal: { target: 5, status: 'notArmed', blockedReason: null, cooldownUntilDay: null },
    towerAchieved: false,
    endgame: { kind: 'observationDeck', name: 'Observation Deck', floorLabel: 'B30 or 15', built: false },
    day: 40,
    minute: 12 * 60,
    phase: 'day',
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

describe('ObservationDeckHint', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('derives the full-rating and cantilever checklist from the snapshot', () => {
    const pending = observationDeckHintSteps(snapshot())
    expect(pending.map((step) => step.done)).toEqual([false, false])
    expect(pending[1]?.label).toContain('floor B30 or 15')
    expect(pending[1]?.label).toContain('cantilever 6 toward the Falls')

    const done = observationDeckHintSteps(snapshot({
      star: 5,
      maxStarReached: 5,
      endgame: { kind: 'observationDeck', name: 'Observation Deck', floorLabel: 'B30 or 15', built: true },
    }))
    expect(done.map((step) => step.done)).toEqual([true, true])
  })

  it('shows only for Niagara near the endgame and hides after TOWER', () => {
    const { rerender } = render(<ObservationDeckHint snapshot={snapshot({ maxStarReached: 3 })} />)
    expect(screen.queryByTestId('observation-deck-hint')).toBeNull()

    rerender(<ObservationDeckHint snapshot={snapshot()} />)
    expect(screen.getByTestId('observation-deck-hint')).toHaveTextContent('Build at B30 or 15 from either bank')

    rerender(<ObservationDeckHint snapshot={snapshot({ towerAchieved: true })} />)
    expect(screen.queryByTestId('observation-deck-hint')).toBeNull()
  })

  it('dismisses additively without dropping sibling progress fields', () => {
    saveProgress({ version: 2, milestones: ['started', 'star2'], gettingStartedDismissed: true })
    render(<ObservationDeckHint snapshot={snapshot()} />)

    fireEvent.click(screen.getByLabelText('Dismiss Observation Deck hint'))

    expect(screen.queryByTestId('observation-deck-hint')).toBeNull()
    expect(isObservationDeckHintDismissed()).toBe(true)
    expect(loadSavedProgress()).toEqual({
      version: 2,
      milestones: ['started', 'star2'],
      gettingStartedDismissed: true,
      observationDeckHintDismissed: true,
    })
  })
})
