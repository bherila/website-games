import { fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'

import { type GridPosition, MARBLE_SORT_PROGRESS_STORAGE_KEY } from '../gameEngine'
import { MarbleSortGame } from '../MarbleSortGame'

jest.mock('../MarbleSortScene', () => ({
  MarbleSortScene: ({
    colorblindMode,
    hintCell,
    onHintPosition,
  }: {
    colorblindMode: boolean
    hintCell?: GridPosition | null
    onHintPosition?: (position: { x: number, y: number } | null) => void
  }) => {
    useEffect(() => {
      onHintPosition?.(hintCell ? { x: 24, y: 42 } : null)
    }, [hintCell, onHintPosition])

    return (
      <div data-colorblind-mode={colorblindMode ? 'enabled' : 'disabled'} data-testid="marble-sort-scene" />
    )
  },
}))

describe('MarbleSortGame', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('boots to the level select and mounts the game shell for a chosen level', () => {
    render(<MarbleSortGame />)

    expect(screen.getByText('Marble Sort')).toBeInTheDocument()
    expect(screen.getByTestId('level-tile-1')).toHaveAttribute('data-unlocked', 'true')
    expect(screen.getByTestId('level-tile-2')).toHaveAttribute('data-unlocked', 'false')

    fireEvent.click(screen.getByTestId('level-tile-1'))

    expect(screen.getAllByText('Level').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Magnet' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shuffle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Extra Belt' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Level select' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tutorial' })).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Game controls' })).toHaveClass('gap-1.5', 'sm:gap-2')
    expect(screen.getByRole('button', { name: 'Reset' })).toHaveClass('size-12', 'sm:size-14')
    expect(screen.getByTestId('marble-sort-scene')).toHaveAttribute('data-colorblind-mode', 'disabled')
    expect(screen.getByTestId('portrait-game-viewport').getAttribute('style')).toContain('calc(100dvh * 3 / 4)')
  })

  it('confirms power-up use before applying the action', () => {
    window.localStorage.setItem(MARBLE_SORT_PROGRESS_STORAGE_KEY, JSON.stringify({
      highScore: 0,
      powerUps: { extraBelt: 1, magnet: 1, shuffle: 1 },
      stars: {},
      totalScore: 0,
      unlockedLevel: 1,
      version: 2,
    }))

    render(<MarbleSortGame />)
    fireEvent.click(screen.getByTestId('level-tile-1'))

    fireEvent.click(screen.getByRole('button', { name: 'Extra Belt' }))

    expect(screen.getByText('Use Extra Belt?')).toBeInTheDocument()
    expect(screen.getByText(/adds room for one more opened box/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Use Extra Belt' }))

    expect(screen.getByText(/Extra Belt added room/i)).toBeInTheDocument()
  })

  it('merges power-up use into progress reconciled after the game mounted', () => {
    window.localStorage.setItem(MARBLE_SORT_PROGRESS_STORAGE_KEY, JSON.stringify({
      highScore: 0,
      levelScores: {},
      powerUps: { extraBelt: 1, magnet: 0, shuffle: 0 },
      stars: {},
      totalScore: 0,
      unlockedLevel: 1,
      version: 2,
    }))

    render(<MarbleSortGame />)
    fireEvent.click(screen.getByTestId('level-tile-1'))

    window.localStorage.setItem(MARBLE_SORT_PROGRESS_STORAGE_KEY, JSON.stringify({
      highScore: 400,
      levelScores: { 2: 400 },
      powerUps: { extraBelt: 1, magnet: 0, shuffle: 0 },
      stars: { 2: 3 },
      totalScore: 400,
      unlockedLevel: 3,
      version: 2,
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Extra Belt' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use Extra Belt' }))

    expect(JSON.parse(window.localStorage.getItem(MARBLE_SORT_PROGRESS_STORAGE_KEY) ?? '{}')).toMatchObject({
      highScore: 400,
      levelScores: { 2: 400 },
      powerUps: { extraBelt: 0, magnet: 0, shuffle: 0 },
      stars: { 2: 3 },
      totalScore: 400,
      unlockedLevel: 3,
    })
  })

  it('shows a self-teaching tap hint on a fresh level 1 and no auto tutorial dialog', () => {
    render(<MarbleSortGame />)
    fireEvent.click(screen.getByTestId('level-tile-1'))

    expect(screen.getByTestId('tap-hint')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
