import { render, screen } from '@testing-library/react'

import { LevelSelectGrid } from '../LevelSelectGrid'

describe('LevelSelectGrid exit link', () => {
  const baseProps = {
    emoji: '🎱',
    levelIds: [1, 2, 3],
    progress: { unlockedLevel: 2, stars: { 1: 3 } },
    title: 'Test Game',
    onSelectLevel: () => {},
  }

  it('links back to the game-select page when exitHref is provided', () => {
    render(<LevelSelectGrid {...baseProps} exitHref="/" />)

    const exitLink = screen.getByTestId('level-select-exit')
    expect(exitLink).toHaveAttribute('href', '/')
    expect(exitLink).toHaveTextContent('All Games')
    // min-h-11 (2.75rem = 44px) keeps the tap area at/above the 44px mobile
    // touch-target guidance; jsdom has no layout engine, so we can only
    // assert the class is applied, not the computed pixel height.
    expect(exitLink).toHaveClass('min-h-11')
  })

  it('renders no exit link without exitHref', () => {
    render(<LevelSelectGrid {...baseProps} />)

    expect(screen.queryByTestId('level-select-exit')).not.toBeInTheDocument()
  })
})
