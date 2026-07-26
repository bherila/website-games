import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { createInitialProgress, recordGameEnd, saveProgress } from '../../2048/gameProgress'
import { MARBLE_SORT_PROGRESS_STORAGE_KEY } from '../../marble-sort/gameTypes'
import { TOTAL_LEVELS as MARBLE_SORT_TOTAL_LEVELS } from '../../marble-sort/levels'
import { GAME_CATALOG } from '../gameCatalog'
import { GameSelectPage } from '../GameSelectPage'

describe('GameSelectPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    delete window.bwhGamesPwa
  })

  it('renders a card linking to every game', () => {
    render(<GameSelectPage />)

    for (const entry of GAME_CATALOG) {
      expect(screen.getByTestId(`game-card-${entry.slug}`)).toHaveAttribute('href', entry.href)
    }
  })

  it('offers the captured browser install prompt', async () => {
    const prompt = jest.fn().mockResolvedValue(undefined)
    window.bwhGamesPwa = {
      installPrompt: {
        preventDefault: jest.fn(),
        prompt,
        userChoice: Promise.resolve({ outcome: 'accepted', platform: 'web' }),
      } as unknown as NonNullable<typeof window.bwhGamesPwa>['installPrompt'],
      clearCaches: jest.fn().mockResolvedValue(undefined),
    }

    render(<GameSelectPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Install app' }))

    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1))
  })

  it('shows "Play now" and level counts for games with no saved progress', () => {
    render(<GameSelectPage />)

    expect(screen.getAllByText('Play now')).toHaveLength(GAME_CATALOG.length)
    expect(screen.getByTestId('game-card-marble-sort')).toHaveTextContent(`${MARBLE_SORT_TOTAL_LEVELS} levels · not played yet`)
  })

  it('summarizes a score-only game with its stats instead of levels and stars', () => {
    let progress = recordGameEnd(createInitialProgress(), 4, 12480, 2048)
    for (let game = 0; game < 46; game += 1) {
      progress = recordGameEnd(progress, 4, 100, 32)
    }
    saveProgress(progress)

    render(<GameSelectPage />)

    const card = screen.getByTestId('game-card-2048')
    expect(card).toHaveAttribute('href', '/2048')
    expect(card).toHaveTextContent('Best: 12,480')
    expect(card).toHaveTextContent('Highest tile: 2,048')
    expect(card).toHaveTextContent('Games played: 47')
    expect(card).toHaveTextContent('Continue playing')
    expect(card).not.toHaveTextContent('levels')
  })

  it('shows a first-time score-only card without zeroed level counts', () => {
    render(<GameSelectPage />)

    const card = screen.getByTestId('game-card-2048')
    expect(card).toHaveTextContent('4 board sizes · not played yet')
    expect(card).not.toHaveTextContent('NaN')
    expect(card).not.toHaveTextContent('0 / 0')
    expect(card).toHaveTextContent('Play now')
  })

  it('summarizes saved progress into cleared levels and stars', () => {
    window.localStorage.setItem(MARBLE_SORT_PROGRESS_STORAGE_KEY, JSON.stringify({
      version: 2,
      unlockedLevel: 3,
      stars: { 1: 3, 2: 2 },
      totalScore: 0,
      highScore: 0,
      powerUps: { extraBelt: 0, magnet: 0, shuffle: 0 },
    }))

    render(<GameSelectPage />)

    const marbleSortCard = screen.getByTestId('game-card-marble-sort')
    expect(marbleSortCard).toHaveTextContent(`2 / ${MARBLE_SORT_TOTAL_LEVELS} levels`)
    expect(marbleSortCard).toHaveTextContent(`5 / ${MARBLE_SORT_TOTAL_LEVELS * 3}`)
    expect(marbleSortCard).toHaveTextContent('Continue playing')
    expect(screen.getByTestId('game-card-parking-pickup')).toHaveTextContent('Play now')
  })
})
