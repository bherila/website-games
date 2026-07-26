import { fireEvent, render, screen } from '@testing-library/react'

import { MathHordeGame } from '../MathHordeGame'

jest.mock('../MathHordeScene', () => ({ MathHordeScene: () => <div data-testid="mock-math-horde-scene" /> }))

describe('MathHordeGame', () => {
  beforeEach(() => window.localStorage.clear())

  it('starts at the campaign level select', () => {
    render(<MathHordeGame />)
    expect(screen.getByText('Math Horde')).toBeInTheDocument()
    expect(screen.getByTestId('level-tile-1')).toHaveAttribute('data-unlocked', 'true')
    expect(screen.getByTestId('level-tile-2')).toHaveAttribute('data-unlocked', 'false')
  })

  it('opens the tutorial before the first run', () => {
    render(<MathHordeGame />)
    fireEvent.click(screen.getByTestId('level-tile-1'))
    expect(screen.getByRole('dialog', { name: 'How to play' })).toBeInTheDocument()
    expect(screen.getByText(/blue grows your crowd, red shrinks it/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'START FIRING' }))
    expect(screen.queryByRole('dialog', { name: 'How to play' })).not.toBeInTheDocument()
  })

  it('hides the boss bar on ordinary levels and toggles the mute preference', () => {
    render(<MathHordeGame />)
    fireEvent.click(screen.getByTestId('level-tile-1'))
    expect(screen.queryByText('BOSS')).not.toBeInTheDocument()
    expect(screen.getByTestId('army-size')).toHaveTextContent('5')

    const muteButton = screen.getByRole('button', { name: 'Mute' })
    fireEvent.click(muteButton)
    expect(screen.getByRole('button', { name: 'Unmute' })).toBeInTheDocument()
    expect(window.localStorage.getItem('bwh.math-horde.muted.v1')).toBe('1')
    fireEvent.click(screen.getByRole('button', { name: 'Unmute' }))
    expect(screen.getByRole('button', { name: 'Mute' })).toBeInTheDocument()
    expect(window.localStorage.getItem('bwh.math-horde.muted.v1')).toBe('0')
  })
})
