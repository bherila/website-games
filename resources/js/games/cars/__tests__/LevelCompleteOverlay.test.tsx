import { render, screen } from '@testing-library/react'

import { TOTAL_LEVELS } from '../gameEngine'
import { LevelCompleteOverlay } from '../LevelCompleteOverlay'

describe('LevelCompleteOverlay', () => {
  it('shows score multiplier messaging and stars for hard completions', () => {
    render(
      <LevelCompleteOverlay
        state={{
          completedLevel: {
            awardedPowerUp: 'vip',
            level: 10,
            score: 3100,
            stars: 2,
          },
          failedLevel: null,
        }}
        onBackToMenu={jest.fn()}
        onNextLevel={jest.fn()}
        onRestart={jest.fn()}
      />,
    )

    expect(screen.getByText('HARD x2')).toBeInTheDocument()
    expect(screen.getByText('Level 10 Complete')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '2 of 3 stars' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next level/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /level select/i })).toBeInTheDocument()
  })

  it('offers the level select instead of a next level after the finale', () => {
    render(
      <LevelCompleteOverlay
        state={{
          completedLevel: {
            awardedPowerUp: 'fill',
            level: TOTAL_LEVELS,
            score: 5000,
            stars: 3,
          },
          failedLevel: null,
        }}
        onBackToMenu={jest.fn()}
        onNextLevel={jest.fn()}
        onRestart={jest.fn()}
      />,
    )

    expect(screen.getByText(/cleared every level/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /next level/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /level select/i })).toBeInTheDocument()
  })

  it('shows restart-only messaging for failed levels', () => {
    render(
      <LevelCompleteOverlay
        state={{
          completedLevel: null,
          failedLevel: {
            level: 8,
            reason: 'No moves left. Restart the level to try again.',
          },
        }}
        onBackToMenu={jest.fn()}
        onNextLevel={jest.fn()}
        onRestart={jest.fn()}
      />,
    )

    expect(screen.getByText('Level 8 Failed')).toBeInTheDocument()
    expect(screen.getByText('No moves left. Restart the level to try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /restart level/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /next level/i })).not.toBeInTheDocument()
  })
})
