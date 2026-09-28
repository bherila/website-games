import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { createInitialProgress, recordGameEnd, saveProgress } from '../../2048/gameProgress'
import { loadCourse as loadMandarinCourse } from '../../mandarin/domain/course'
import {
  completeNode as completeMandarinNode,
  createInitialProgress as createMandarinInitialProgress,
  markNodeIntroduced as markMandarinNodeIntroduced,
} from '../../mandarin/domain/progress'
import { MARBLE_SORT_PROGRESS_STORAGE_KEY } from '../../marble-sort/gameTypes'
import { TOTAL_LEVELS as MARBLE_SORT_TOTAL_LEVELS } from '../../marble-sort/levels'
import { GAME_CATALOG } from '../gameCatalog'
import { GameSelectPage } from '../GameSelectPage'

function setInitialData(data: unknown | null): void {
  const existing = document.getElementById('app-initial-data')
  if (existing) {
    existing.remove()
  }
  if (data !== null) {
    const script = document.createElement('script')
    script.id = 'app-initial-data'
    script.type = 'application/json'
    script.textContent = JSON.stringify(data)
    document.body.appendChild(script)
  }
}

describe('GameSelectPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
    delete window.bwhGamesPwa
    setInitialData(null)
  })

  afterEach(() => {
    setInitialData(null)
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

  it('shows accurate empty-state copy for Mandarin Quest when not played yet', () => {
    render(<GameSelectPage />)

    const card = screen.getByTestId('game-card-mandarin')
    expect(card).toHaveAttribute('href', '/mandarin')
    expect(card).toHaveTextContent('10 scenes · not played yet')
    expect(card).not.toHaveTextContent('Preview')
    expect(card).not.toHaveTextContent('progress stays in this browser')
    expect(card).toHaveTextContent('Play now')
  })

  it('shows live guest progress on Mandarin card and ignores preview storage', () => {
    const course = loadMandarinCourse()

    // Save mock progress into preview storage only
    let previewProgress = createMandarinInitialProgress(course)
    for (const nodeId of ['s1n1', 's1n2']) {
      previewProgress = completeMandarinNode(markMandarinNodeIntroduced(previewProgress, nodeId), course, nodeId).progress
    }
    window.localStorage.setItem('mandarin.preview.progress.v1', JSON.stringify(previewProgress))

    // Card should still be unplayed because preview storage is ignored
    const { unmount } = render(<GameSelectPage />)
    const card = screen.getByTestId('game-card-mandarin')
    expect(card).toHaveTextContent('10 scenes · not played yet')
    expect(card).toHaveTextContent('Play now')
    unmount()

    // Now save live guest progress
    let guestProgress = createMandarinInitialProgress(course)
    guestProgress = completeMandarinNode(markMandarinNodeIntroduced(guestProgress, 's1n1'), course, 's1n1').progress
    window.localStorage.setItem('mandarin.live.guest.progress.v1', JSON.stringify(guestProgress))

    render(<GameSelectPage />)
    const liveCard = screen.getByTestId('game-card-mandarin')
    expect(liveCard).toHaveTextContent('Scenes: 0/10')
    expect(liveCard).toHaveTextContent('Lessons: 1/20')
    expect(liveCard).toHaveTextContent('Continue playing')
  })

  it('partitions Mandarin card progress by account and isolates across guest, signed-in, signed-out, and switch', () => {
    const course = loadMandarinCourse()

    // Guest has completed lesson 1
    let guestProgress = createMandarinInitialProgress(course)
    guestProgress = completeMandarinNode(markMandarinNodeIntroduced(guestProgress, 's1n1'), course, 's1n1').progress
    window.localStorage.setItem('mandarin.live.guest.progress.v1', JSON.stringify(guestProgress))

    // User 42 has completed scene 1 (2 lessons)
    let user42Progress = createMandarinInitialProgress(course)
    for (const nodeId of ['s1n1', 's1n2']) {
      user42Progress = completeMandarinNode(markMandarinNodeIntroduced(user42Progress, nodeId), course, nodeId).progress
    }
    window.localStorage.setItem('mandarin.live.user_42.progress.v1', JSON.stringify(user42Progress))

    // User 99 has completed scene 1 and scene 2 (4 lessons)
    let user99Progress = createMandarinInitialProgress(course)
    for (const nodeId of ['s1n1', 's1n2', 's2n1', 's2n2']) {
      user99Progress = completeMandarinNode(markMandarinNodeIntroduced(user99Progress, nodeId), course, nodeId).progress
    }
    window.localStorage.setItem('mandarin.live.user_99.progress.v1', JSON.stringify(user99Progress))

    // 1. Guest view
    const guestView = render(<GameSelectPage />)
    expect(screen.getByTestId('game-card-mandarin')).toHaveTextContent('Scenes: 0/10')
    expect(screen.getByTestId('game-card-mandarin')).toHaveTextContent('Lessons: 1/20')
    guestView.unmount()

    // 2. Sign in as User 42
    setInitialData({ authenticated: true, currentUser: { id: 42 } })
    const user42View = render(<GameSelectPage />)
    expect(screen.getByTestId('game-card-mandarin')).toHaveTextContent('Scenes: 1/10')
    expect(screen.getByTestId('game-card-mandarin')).toHaveTextContent('Lessons: 2/20')
    user42View.unmount()

    // 3. Switch account to User 99
    setInitialData({ authenticated: true, currentUser: { id: 99 } })
    const user99View = render(<GameSelectPage />)
    expect(screen.getByTestId('game-card-mandarin')).toHaveTextContent('Scenes: 2/10')
    expect(screen.getByTestId('game-card-mandarin')).toHaveTextContent('Lessons: 4/20')
    user99View.unmount()

    // 4. Sign out -> back to guest view
    setInitialData({ authenticated: false, currentUser: null })
    render(<GameSelectPage />)
    expect(screen.getByTestId('game-card-mandarin')).toHaveTextContent('Scenes: 0/10')
    expect(screen.getByTestId('game-card-mandarin')).toHaveTextContent('Lessons: 1/20')
  })
})
