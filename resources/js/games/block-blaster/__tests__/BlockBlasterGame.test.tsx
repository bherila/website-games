import { fireEvent, render, screen } from '@testing-library/react'

import { BlockBlasterGame } from '../BlockBlasterGame'
import { BLOCK_BLASTER_PROGRESS_STORAGE_KEY, type SavedProgress } from '../gameTypes'

jest.mock('../levels/levels', () => ({
  LEVELS: [
    {
      id: 1,
      balls: 3,
      starThresholds: { twoStar: 1, threeStar: 2 },
      platforms: [],
      hint: { platform: 0, block: 0 },
    },
    {
      id: 2,
      balls: 4,
      starThresholds: { twoStar: 2, threeStar: 3 },
      platforms: [],
    },
    {
      id: 3,
      balls: 5,
      starThresholds: { twoStar: 2, threeStar: 4 },
      platforms: [],
    },
  ],
}))

jest.mock('../BlockBlasterScene', () => ({
  BlockBlasterScene: (props: {
    ballsRemaining: number
    onHintPosition?: (position: { x: number, y: number } | null) => void
    onLose: () => void
    onShotFired: () => void
    onWin: () => void
  }) => (
    <div data-balls-remaining={props.ballsRemaining} data-testid="scene-stub">
      <button type="button" onClick={props.onShotFired}>fire</button>
      <button type="button" onClick={props.onWin}>win</button>
      <button type="button" onClick={props.onLose}>lose</button>
      <button type="button" onClick={() => props.onHintPosition?.({ x: 10, y: 20 })}>reveal-hint</button>
    </div>
  ),
}))

function seedProgress(progress: SavedProgress): void {
  window.localStorage.setItem(BLOCK_BLASTER_PROGRESS_STORAGE_KEY, JSON.stringify(progress))
}

describe('BlockBlasterGame', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.pushState({}, '', '/block-blaster')
  })

  it('renders the level-select grid with correct lock state from seeded progress', () => {
    seedProgress({ version: 1, unlockedLevel: 2, stars: { 1: 2 } })

    render(<BlockBlasterGame />)

    expect(screen.getByRole('button', { name: 'Level 1, 2 stars' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Level 2, 0 stars' })).toBeInTheDocument()
    expect(screen.getByLabelText('Level 3 locked')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Level 3/ })).not.toBeInTheDocument()
  })

  it('pulses the lowest unplayed unlocked tile only', () => {
    seedProgress({ version: 1, unlockedLevel: 2, stars: { 1: 2 } })

    render(<BlockBlasterGame />)

    expect(screen.getByRole('button', { name: 'Level 2, 0 stars' })).toHaveClass('animate-pulse')
    expect(screen.getByRole('button', { name: 'Level 1, 2 stars' })).not.toHaveClass('animate-pulse')
  })

  it("shows the HUD with that level's ball count after tapping an unlocked tile", () => {
    render(<BlockBlasterGame />)

    fireEvent.click(screen.getByRole('button', { name: 'Level 1, 0 stars' }))

    expect(screen.getByLabelText('Balls remaining 3')).toBeInTheDocument()
    expect(screen.getByLabelText('Level 1')).toBeInTheDocument()
  })

  it('decrements the ball chip when the scene reports a shot fired', () => {
    render(<BlockBlasterGame />)

    fireEvent.click(screen.getByRole('button', { name: 'Level 1, 0 stars' }))
    fireEvent.click(screen.getByRole('button', { name: 'fire' }))

    expect(screen.getByLabelText('Balls remaining 2')).toBeInTheDocument()
  })

  it('shows the win overlay with the correct star count and unlocks the next tile', () => {
    seedProgress({ version: 1, unlockedLevel: 2, stars: {} })

    render(<BlockBlasterGame />)

    // Level 2: balls=4, thresholds { twoStar: 2, threeStar: 3 }. One shot -> 3 remaining -> 3 stars.
    fireEvent.click(screen.getByRole('button', { name: 'Level 2, 0 stars' }))
    fireEvent.click(screen.getByRole('button', { name: 'fire' }))
    fireEvent.click(screen.getByRole('button', { name: 'win' }))

    expect(screen.getByTestId('level-complete-stars')).toHaveAttribute('data-stars', '3')
    expect(screen.getByLabelText('Next level')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Level select' }))

    expect(screen.getByRole('button', { name: 'Level 3, 0 stars' })).toBeInTheDocument()
  })

  it('merges a win into progress reconciled after the game mounted', () => {
    render(<BlockBlasterGame />)

    seedProgress({ version: 1, unlockedLevel: 3, stars: { 2: 3 } })
    fireEvent.click(screen.getByRole('button', { name: 'Level 1, 0 stars' }))
    fireEvent.click(screen.getByRole('button', { name: 'win' }))

    expect(JSON.parse(window.localStorage.getItem(BLOCK_BLASTER_PROGRESS_STORAGE_KEY) ?? '{}')).toMatchObject({
      unlockedLevel: 3,
      stars: { 1: 3, 2: 3 },
    })
  })

  it('shows the lose overlay when the scene reports a loss', () => {
    render(<BlockBlasterGame />)

    fireEvent.click(screen.getByRole('button', { name: 'Level 1, 0 stars' }))
    fireEvent.click(screen.getByRole('button', { name: 'lose' }))

    expect(screen.getByLabelText('Level failed')).toBeInTheDocument()
  })

  it('restores the ball count on retry', () => {
    render(<BlockBlasterGame />)

    fireEvent.click(screen.getByRole('button', { name: 'Level 1, 0 stars' }))
    fireEvent.click(screen.getByRole('button', { name: 'fire' }))
    expect(screen.getByLabelText('Balls remaining 2')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(screen.getByLabelText('Balls remaining 3')).toBeInTheDocument()
  })

  it('hides the tutorial hint after the first shot', () => {
    render(<BlockBlasterGame />)

    fireEvent.click(screen.getByRole('button', { name: 'Level 1, 0 stars' }))
    fireEvent.click(screen.getByRole('button', { name: 'reveal-hint' }))

    expect(screen.getByTestId('tap-hint')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'fire' }))

    expect(screen.queryByTestId('tap-hint')).not.toBeInTheDocument()
  })

  it('shows a trophy instead of a next button on the final level', () => {
    window.history.pushState({}, '', '/block-blaster?level=3')

    render(<BlockBlasterGame />)

    fireEvent.click(screen.getByRole('button', { name: 'win' }))

    expect(screen.getByLabelText('All levels complete')).toBeInTheDocument()
    expect(screen.queryByLabelText('Next level')).not.toBeInTheDocument()
  })

  it('starts directly in the requested level via the ?level= dev jump without changing persisted unlock', () => {
    window.history.pushState({}, '', '/block-blaster?level=3')

    render(<BlockBlasterGame />)

    expect(screen.getByLabelText('Balls remaining 5')).toBeInTheDocument()
    expect(screen.getByLabelText('Level 3')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Level select' }))

    expect(screen.getByLabelText('Level 3 locked')).toBeInTheDocument()
  })
})
