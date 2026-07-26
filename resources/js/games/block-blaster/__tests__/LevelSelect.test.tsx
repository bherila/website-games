import { fireEvent, render, screen } from '@testing-library/react'

import type { LevelDef } from '../levels/levelTypes'
import { LevelSelect } from '../LevelSelect'

describe('Block Blaster LevelSelect', () => {
  it('uses the shared lock, star, and next-unplayed behavior', () => {
    const levels = [{ id: 1 }, { id: 2 }, { id: 3 }] as LevelDef[]
    const onSelectLevel = jest.fn()
    render(<LevelSelect levels={levels} progress={{ version: 1, unlockedLevel: 2, stars: { 1: 3 } }} onSelectLevel={onSelectLevel} />)

    expect(screen.getByTestId('level-tile-1')).toHaveAttribute('aria-label', 'Level 1, 3 stars')
    expect(screen.getByTestId('level-tile-2')).toHaveClass('animate-pulse')
    expect(screen.getByTestId('level-tile-3')).toHaveAttribute('data-unlocked', 'false')
    fireEvent.click(screen.getByTestId('level-tile-2'))
    expect(onSelectLevel).toHaveBeenCalledWith(2)
  })
})
