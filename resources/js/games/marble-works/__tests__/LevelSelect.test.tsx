import { fireEvent, render, screen } from '@testing-library/react'

import { LEVELS } from '../levels/levels'
import { LevelSelect } from '../LevelSelect'

describe('Marble Works LevelSelect', () => {
  it('uses the shared lock, star and next-unplayed behaviour', () => {
    const onSelectLevel = jest.fn()
    render(<LevelSelect levels={LEVELS} progress={{ version: 1, unlockedLevel: 3, stars: { 1: 3, 2: 1 } }} onSelectLevel={onSelectLevel} />)

    expect(screen.getByRole('heading', { name: 'Marble Works' })).toBeInTheDocument()
    expect(screen.getByTestId('level-tile-1')).toHaveAttribute('aria-label', 'Level 1, 3 stars')
    expect(screen.getByTestId('level-tile-3')).toHaveClass('animate-pulse')
    expect(screen.getByTestId('level-tile-4')).toHaveAttribute('data-unlocked', 'false')
    fireEvent.click(screen.getByTestId('level-tile-3'))
    expect(onSelectLevel).toHaveBeenCalledWith(3)
  })
})
