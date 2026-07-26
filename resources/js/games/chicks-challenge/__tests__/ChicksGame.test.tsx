import { act, fireEvent, render, screen, within } from '@testing-library/react'

import { ChicksGame } from '../ChicksGame'
import { solve } from '../engine/solver'
import { PROGRESS_STORAGE_KEY, STEP_TWEEN_MS, TOTAL_LEVELS } from '../gameTypes'
import { LEVELS } from '../levels'
import { parseLevel } from '../levels/parseLevel'

jest.mock('../ChicksScene', () => ({
  ChicksScene: () => null,
}))

// Injects one synthetic, guaranteed-to-drown level (id 9001, outside the 1..40
// shipped range) alongside the real pack so the death path doesn't need a
// shipped level's exact input sequence — see docs/games/chicks-challenge.md "Testing".
jest.mock('../levels', () => {
  const actual = jest.requireActual('../levels')
  const deathLevel = {
    id: 9001,
    title: 'Test Drown',
    grid: ['####', '#@~#', '####'],
    par: 1,
    solution: 'R',
  }

  return {
    ...actual,
    getLevelById: (id: number) => (id === deathLevel.id ? deathLevel : actual.getLevelById(id)),
  }
})

const CHAR_TO_KEY: Readonly<Record<string, string>> = {
  U: 'ArrowUp',
  D: 'ArrowDown',
  L: 'ArrowLeft',
  R: 'ArrowRight',
  W: ' ',
}

// Shipped levels carry no solution strings — the solver derives level 1's
// winning input sequence, exactly as the solver gate does (par === length).
const LEVEL1_SOLUTION = solve(parseLevel(LEVELS[0]!)).solution ?? ''

/** Presses one solution char and advances the STEP_TWEEN_MS consumption tick that applies it. */
function pressAndAdvance(char: string): void {
  const key = CHAR_TO_KEY[char]
  fireEvent.keyDown(window, { key })
  fireEvent.keyUp(window, { key })
  act(() => {
    jest.advanceTimersByTime(STEP_TWEEN_MS)
  })
}

function chipCount(grid: readonly string[]): number {
  return grid.join('').split('').filter((char) => char === 'c').length
}

describe('ChicksGame', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    window.localStorage.clear()
    window.history.pushState({}, '', '/chicks-challenge')
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders the level-select grid with TOTAL_LEVELS tiles and correct lock states', () => {
    render(<ChicksGame />)

    expect(screen.getAllByTestId(/^level-tile-/)).toHaveLength(TOTAL_LEVELS)
    expect(screen.getByTestId('level-tile-1')).toHaveAttribute('data-unlocked', 'true')
    expect(screen.getByTestId('level-tile-2')).toHaveAttribute('data-unlocked', 'false')
  })

  it("shows the HUD with the level's chip count and par after selecting an unlocked level", () => {
    render(<ChicksGame />)

    fireEvent.click(screen.getByTestId('level-tile-1'))

    const level1 = LEVELS[0]!
    expect(screen.getByLabelText(`${chipCount(level1.grid)} chips remaining`)).toBeInTheDocument()
    expect(screen.getByLabelText(`0 of ${level1.par} moves`)).toBeInTheDocument()
    expect(screen.getByLabelText('Level 1')).toBeInTheDocument()
  })

  it('reaches the win overlay with 3 stars and unlocks level 2 after playing the shipped solution', () => {
    render(<ChicksGame />)
    fireEvent.click(screen.getByTestId('level-tile-1'))

    const level1 = LEVELS[0]!
    for (const char of LEVEL1_SOLUTION) {
      pressAndAdvance(char)
    }

    expect(screen.getByLabelText('Level complete')).toBeInTheDocument()
    expect(screen.getByLabelText('3 of 3 stars')).toBeInTheDocument()
    expect(screen.getByText(`${LEVEL1_SOLUTION.length} / ${level1.par} moves`)).toBeInTheDocument()

    const saved = JSON.parse(window.localStorage.getItem(PROGRESS_STORAGE_KEY) ?? '{}') as {
      unlockedLevel: number
      stars: Record<string, number>
    }
    expect(saved.unlockedLevel).toBe(2)
    expect(saved.stars['1']).toBe(3)
  })

  it('shows the hint banner while standing on the hint tile mid-run', () => {
    render(<ChicksGame />)
    fireEvent.click(screen.getByTestId('level-tile-1'))

    const level1 = LEVELS[0]!
    expect(level1.hint).toBeTruthy()

    // Level 1's hint tile sits directly below the start (phase1.ts grid); the
    // solver's winning route may legally skirt it, so step onto it directly.
    pressAndAdvance('D')

    expect(screen.getByTestId('hint-banner')).toHaveTextContent(level1.hint as string)
  })

  it('R restarts the level and resets the move counter', () => {
    render(<ChicksGame />)
    fireEvent.click(screen.getByTestId('level-tile-1'))

    const level1 = LEVELS[0]!
    pressAndAdvance(LEVEL1_SOLUTION[0]!)
    expect(screen.getByLabelText(`1 of ${level1.par} moves`)).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'r' })

    expect(screen.getByLabelText(`0 of ${level1.par} moves`)).toBeInTheDocument()
    expect(screen.getByLabelText(`${chipCount(level1.grid)} chips remaining`)).toBeInTheDocument()
  })

  it('Escape returns to level select', () => {
    render(<ChicksGame />)
    fireEvent.click(screen.getByTestId('level-tile-1'))
    expect(screen.getByLabelText('Level 1')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.getAllByTestId(/^level-tile-/)).toHaveLength(TOTAL_LEVELS)
  })

  it('dies on drowning and shows the death overlay after the death delay', () => {
    window.history.pushState({}, '', '/chips?level=9001')
    render(<ChicksGame />)

    pressAndAdvance('R')

    expect(screen.queryByLabelText('You died')).not.toBeInTheDocument()

    act(() => {
      jest.advanceTimersByTime(600)
    })

    expect(screen.getByLabelText('You died')).toBeInTheDocument()
  })

  it('restarting from the death overlay resets the move counter', () => {
    window.history.pushState({}, '', '/chips?level=9001')
    render(<ChicksGame />)

    pressAndAdvance('R')
    act(() => {
      jest.advanceTimersByTime(600)
    })
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAccessibleName('You died')

    // Both the HUD and the death overlay expose a "Restart level" button —
    // scope to the overlay to disambiguate.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restart level' }))

    expect(screen.getByLabelText('0 of 1 moves')).toBeInTheDocument()
  })

  it('jumps straight into a level via the ?level= dev jump without touching persisted unlock', () => {
    window.history.pushState({}, '', '/chips?level=2')
    render(<ChicksGame />)

    expect(screen.getByLabelText('Level 2')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.getByTestId('level-tile-2')).toHaveAttribute('data-unlocked', 'false')
  })
})
