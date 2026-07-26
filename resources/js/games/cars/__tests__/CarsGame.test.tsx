import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { playSfx, setMuted } from '../audio/audioManager'
import { CarsGame } from '../CarsGame'
import { AUDIO_MUTED_STORAGE_KEY } from '../GameControls'
import { BOARD_HEIGHT, BOARD_WIDTH, type Car, GAME_PROGRESS_STORAGE_KEY, type GameState, LEVEL_SNAPSHOT_STORAGE_KEY, type ParkingSlot } from '../gameEngine'

jest.mock('../audio/audioManager', () => ({
  playSfx: jest.fn(),
  preloadSfx: jest.fn(() => Promise.resolve()),
  setMuted: jest.fn(),
}))

jest.mock('../CarsScene', () => {
  const engine = jest.requireActual('../gameEngine') as typeof import('../gameEngine')
  const { useEffect } = jest.requireActual('react') as typeof import('react')

  return {
    CarsScene: ({
      hintCarId,
      state,
      vipSelectionActive,
      onCarClick,
      onHintPosition,
      onPassengerGate,
    }: {
      hintCarId?: string | null
      state: import('../gameEngine').GameState
      vipSelectionActive: boolean
      onCarClick: (carId: string) => void
      onHintPosition?: (position: { x: number, y: number } | null) => void
      onPassengerGate: (passengerId: string) => void
    }) => {
      useEffect(() => {
        onHintPosition?.(hintCarId ? { x: 32, y: 64 } : null)
      }, [hintCarId, onHintPosition])
      const movableCar = state.cars.find((car) => car.status === 'field' && engine.canMoveCar(state, car.id))
      const blockedCar = state.cars.find((car) => car.status === 'field' && !engine.canMoveCar(state, car.id))
      const boardablePassenger = state.passengerQueue.find((passenger) => engine.canBoardPassengerAtParkingGate(state, passenger.id))
      const boardablePassengers = state.passengerQueue.filter((passenger) => engine.canBoardPassengerAtParkingGate(state, passenger.id))

      return (
        <div data-queue-length={state.passengerQueue.length} data-testid="cars-scene" data-vip-selection={vipSelectionActive ? 'active' : 'inactive'}>
          <button disabled={!movableCar} type="button" onClick={() => movableCar && onCarClick(movableCar.id)}>Move mock car</button>
          <button disabled={!blockedCar} type="button" onClick={() => blockedCar && onCarClick(blockedCar.id)}>Blocked mock car</button>
          <button disabled={!boardablePassenger} type="button" onClick={() => boardablePassenger && onPassengerGate(boardablePassenger.id)}>Board mock passenger</button>
          <button disabled={boardablePassengers.length === 0} type="button" onClick={() => boardablePassengers.forEach((passenger) => onPassengerGate(passenger.id))}>Board all mock passengers</button>
        </div>
      )
    },
  }
})

describe('CarsGame', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.history.replaceState(null, '', '/')
    jest.clearAllMocks()
  })

  it('boots to the level select with locked tiles past the watermark', () => {
    saveProgressV3({ unlockedLevel: 3 })

    render(<CarsGame />)

    expect(screen.getByText('Parking Pickup')).toBeInTheDocument()
    expect(screen.getByTestId('level-tile-3')).toHaveAttribute('data-unlocked', 'true')
    expect(screen.getByTestId('level-tile-4')).toHaveAttribute('data-unlocked', 'false')
  })

  it('mounts the game controls and Three.js scene shell', () => {
    render(<CarsGame />)
    enterLevel(1)

    expect(screen.getAllByText('Level').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'VIP' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shuffle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fill' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Spot' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tutorial' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mute audio' })).toBeInTheDocument()
    expect(screen.getByTestId('cars-scene')).toHaveAttribute('data-vip-selection', 'inactive')
    expect(screen.getByTestId('portrait-game-viewport').getAttribute('style')).toContain('calc(100vh * 3 / 4)')
  })

  it('shows hard difficulty indicators on hard authored levels', () => {
    saveProgressV3({ unlockedLevel: 10 })

    render(<CarsGame />)
    enterLevel(10)

    expect(screen.getAllByText('HARD').length).toBeGreaterThan(0)
  })

  it('shows super hard difficulty indicators on super-hard authored levels', () => {
    saveProgressV3({ unlockedLevel: 20 })

    render(<CarsGame />)
    enterLevel(20)

    expect(screen.getAllByText('SUPER HARD').length).toBeGreaterThan(0)
  })

  it('confirms VIP power-up use before arming selection mode', () => {
    saveProgressV3({ powerUps: { fill: 1, shuffle: 1, vip: 1 } })

    render(<CarsGame />)
    enterLevel(1)

    fireEvent.click(screen.getByRole('button', { name: 'VIP' }))

    expect(screen.getByText('Use VIP power-up?')).toBeInTheDocument()
    expect(screen.getByText(/bypassing normal blocking/i)).toBeInTheDocument()
    expect(screen.getByTestId('cars-scene')).toHaveAttribute('data-vip-selection', 'inactive')

    fireEvent.click(screen.getByRole('button', { name: 'Use VIP' }))

    expect(screen.getByTestId('cars-scene')).toHaveAttribute('data-vip-selection', 'active')
  })

  it('resumes the in-progress snapshot when its level is re-selected from the menu', () => {
    saveAudioTestSnapshot(makeAudioTestState({
      cars: [makeAudioTestCar({ id: 'red-car' })],
      passengerQueue: [
        { id: 'p1', color: 'red' },
        { id: 'p2', color: 'red' },
      ],
    }))

    render(<CarsGame />)

    // Boot resumes straight into the snapshot (queue of 2, not a fresh board).
    expect(screen.getByTestId('cars-scene')).toHaveAttribute('data-queue-length', '2')

    fireEvent.click(screen.getByRole('button', { name: 'Level select' }))
    expect(screen.getByText('Parking Pickup')).toBeInTheDocument()

    enterLevel(1)

    // Re-selecting the same level resumes the snapshot instead of restarting.
    expect(screen.getByTestId('cars-scene')).toHaveAttribute('data-queue-length', '2')
  })

  it('shows a self-teaching tap hint on fresh level 1 that clears after the first move', () => {
    render(<CarsGame />)
    enterLevel(1)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('tap-hint')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Move mock car' }))

    expect(screen.queryByTestId('tap-hint')).not.toBeInTheDocument()
  })

  it('returns to the level select when the level badge is clicked', () => {
    render(<CarsGame />)
    enterLevel(1)

    // Desktop header and mobile bar each render a level badge; either works.
    const levelBadges = screen.getAllByRole('button', { name: 'Back to level select' })
    expect(levelBadges.length).toBeGreaterThan(0)
    fireEvent.click(levelBadges[0]!)

    expect(screen.getByText('Parking Pickup')).toBeInTheDocument()
  })

  it('preserves the saved level snapshot when Reset is clicked in visual test mode', () => {
    const savedSnapshot = JSON.stringify({ version: 2, marker: 'user-progress' })
    window.localStorage.setItem(LEVEL_SNAPSHOT_STORAGE_KEY, savedSnapshot)
    window.history.replaceState(null, '', '/?visualTest=1&level=3')

    render(<CarsGame />)

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(window.localStorage.getItem(LEVEL_SNAPSHOT_STORAGE_KEY)).toBe(savedSnapshot)
  })

  it('expands the mobile stats overlay when visualTest hud=normal', () => {
    window.history.replaceState(null, '', '/?visualTest=1&level=1&hud=normal')

    render(<CarsGame />)

    const expandable = screen.getByTestId('cars-mobile-stats-panel')
    expect(expandable).not.toHaveClass('hidden')
  })

  it('keeps the mobile stats overlay collapsed when visualTest hud is absent', () => {
    window.history.replaceState(null, '', '/?visualTest=1&level=1')

    render(<CarsGame />)

    const expandable = screen.getByTestId('cars-mobile-stats-panel')
    expect(expandable).toHaveClass('hidden')
  })

  it('persists the audio mute toggle', () => {
    render(<CarsGame />)
    enterLevel(1)

    expect(setMuted).toHaveBeenLastCalledWith(false)

    fireEvent.click(screen.getByRole('button', { name: 'Mute audio' }))

    expect(setMuted).toHaveBeenLastCalledWith(true)
    expect(window.localStorage.getItem(AUDIO_MUTED_STORAGE_KEY)).toBe('1')
    expect(screen.getByRole('button', { name: 'Unmute audio' })).toBeInTheDocument()
  })

  it('restores the persisted audio mute preference', () => {
    window.localStorage.setItem(AUDIO_MUTED_STORAGE_KEY, '1')

    render(<CarsGame />)
    enterLevel(1)

    expect(screen.getByRole('button', { name: 'Unmute audio' })).toBeInTheDocument()
    expect(setMuted).toHaveBeenLastCalledWith(true)
  })

  it('plays parking, boarding, and completion sound effects at game transitions', async () => {
    saveAudioTestSnapshot(makeAudioTestState({
      cars: [makeAudioTestCar({ id: 'red-car' })],
      passengerQueue: [
        { id: 'p1', color: 'red' },
        { id: 'p2', color: 'red' },
      ],
    }))

    render(<CarsGame />)

    fireEvent.click(screen.getByRole('button', { name: 'Move mock car' }))
    expect(playSfx).toHaveBeenCalledWith('car-park-success')

    fireEvent.click(screen.getByRole('button', { name: 'Board mock passenger' }))
    expect(playSfx).toHaveBeenCalledWith('passenger-board')

    fireEvent.click(screen.getByRole('button', { name: 'Board mock passenger' }))

    expect(playSfx).toHaveBeenCalledWith('passenger-board')
    await waitFor(() => expect(playSfx).toHaveBeenCalledWith('level-complete'))
  })

  it('merges a win into progress reconciled after the game mounted', async () => {
    saveAudioTestSnapshot(makeAudioTestState({
      cars: [makeAudioTestCar({ id: 'red-car' })],
      passengerQueue: [
        { id: 'p1', color: 'red' },
        { id: 'p2', color: 'red' },
      ],
    }))

    render(<CarsGame />)
    window.localStorage.setItem(GAME_PROGRESS_STORAGE_KEY, JSON.stringify({
      version: 3,
      unlockedLevel: 5,
      stars: { 4: 3 },
      levelScores: { 4: 99_999 },
      totalScore: 99_999,
      highScore: 99_999,
      powerUps: { fill: 0, shuffle: 0, vip: 0 },
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Move mock car' }))
    fireEvent.click(screen.getByRole('button', { name: 'Board all mock passengers' }))

    await waitFor(() => {
      const persisted = JSON.parse(window.localStorage.getItem(GAME_PROGRESS_STORAGE_KEY) ?? '{}') as {
        highScore?: number
        totalScore?: number
      }

      expect(persisted).toMatchObject({
        unlockedLevel: 5,
        stars: { 4: 3 },
        levelScores: { 4: 99_999 },
      })
      expect(persisted.totalScore).toBeGreaterThanOrEqual(99_999)
      expect(persisted.highScore).toBeGreaterThanOrEqual(persisted.totalScore ?? 0)
    })
  })

  it('plays the blocked-car sound effect when a blocked car attempt is set', () => {
    saveAudioTestSnapshot(makeAudioTestState({
      cars: [
        makeAudioTestCar({ id: 'blocked-car', position: { x: 20, y: 2 }, sequence: 0 }),
        makeAudioTestCar({ id: 'blocker-car', position: { x: 22, y: 2 }, sequence: 1 }),
      ],
    }))

    render(<CarsGame />)

    fireEvent.click(screen.getByRole('button', { name: 'Blocked mock car' }))

    expect(playSfx).toHaveBeenCalledWith('car-blocked')
  })

  it('applies synchronous passenger boarding notifications cumulatively', async () => {
    saveAudioTestSnapshot(makeAudioTestState({
      cars: [makeAudioTestCar({ id: 'red-car', status: 'parked', parkingSlotId: 'slot-1' })],
      parkingSlots: makeAudioTestParkingSlots().map((slot) => (
        slot.id === 'slot-1' ? { ...slot, occupiedCarId: 'red-car' } : slot
      )),
      passengerQueue: [
        { id: 'p1', color: 'red' },
        { id: 'p2', color: 'red' },
      ],
    }))

    render(<CarsGame />)

    fireEvent.click(screen.getByRole('button', { name: 'Board all mock passengers' }))

    await waitFor(() => expect(screen.getByTestId('cars-scene')).toHaveAttribute('data-queue-length', '0'))
    expect((playSfx as jest.Mock).mock.calls.filter(([name]) => name === 'passenger-board')).toEqual([
      ['passenger-board'],
      ['passenger-board'],
    ])
  })
})

function enterLevel(levelId: number): void {
  fireEvent.click(screen.getByTestId(`level-tile-${levelId}`))
}

function saveProgressV3(overrides: { unlockedLevel?: number, powerUps?: GameState['powerUps'] } = {}): void {
  window.localStorage.setItem(GAME_PROGRESS_STORAGE_KEY, JSON.stringify({
    version: 3,
    unlockedLevel: overrides.unlockedLevel ?? 1,
    stars: {},
    totalScore: 0,
    highScore: 0,
    powerUps: overrides.powerUps ?? { fill: 0, shuffle: 0, vip: 0 },
  }))
}

function saveAudioTestSnapshot(state: GameState): void {
  window.localStorage.setItem(GAME_PROGRESS_STORAGE_KEY, JSON.stringify({
    version: 3,
    unlockedLevel: state.level,
    stars: {},
    totalScore: state.totalScore,
    highScore: state.highScore,
    powerUps: state.powerUps,
  }))
  window.localStorage.setItem(LEVEL_SNAPSHOT_STORAGE_KEY, JSON.stringify({ version: 3, state }))
}

function makeAudioTestState(overrides: Partial<GameState> = {}): GameState {
  const state: GameState = {
    version: 2,
    level: 1,
    seed: 565,
    boardWidth: BOARD_WIDTH,
    boardHeight: BOARD_HEIGHT,
    cars: [],
    tunnels: [],
    passengerQueue: [],
    parkingSlots: makeAudioTestParkingSlots(),
    powerUps: { vip: 0, shuffle: 0, fill: 0 },
    levelScore: 1000,
    totalScore: 0,
    highScore: 0,
    moves: 0,
    maxRegularSlotsUsed: 0,
    maxRegularSlotsUnlocked: 4,
    powerUpsUsed: 0,
    lastMessage: 'Audio test level ready.',
    completedLevel: null,
    failedLevel: null,
  }

  return {
    ...state,
    ...overrides,
    cars: overrides.cars ?? state.cars,
    tunnels: overrides.tunnels ?? state.tunnels,
    passengerQueue: overrides.passengerQueue ?? state.passengerQueue,
    parkingSlots: overrides.parkingSlots ?? state.parkingSlots,
    powerUps: overrides.powerUps ?? state.powerUps,
    completedLevel: overrides.completedLevel ?? state.completedLevel,
    failedLevel: overrides.failedLevel ?? state.failedLevel,
  }
}

function makeAudioTestCar(overrides: Partial<Car> = {}): Car {
  return {
    id: 'car-1',
    color: 'red',
    colorHidden: false,
    direction: 'right',
    capacity: 2,
    length: 2,
    position: { x: 22, y: 1 },
    status: 'field',
    parkingSlotId: null,
    boarded: 0,
    tunnelId: null,
    sequence: 0,
    ...overrides,
  }
}

function makeAudioTestParkingSlots(): ParkingSlot[] {
  return [
    { id: 'vip', kind: 'vip', unlocked: true, occupiedCarId: null, index: -1 },
    { id: 'slot-1', kind: 'regular', unlocked: true, occupiedCarId: null, index: 0 },
    { id: 'slot-2', kind: 'regular', unlocked: true, occupiedCarId: null, index: 1 },
    { id: 'slot-3', kind: 'regular', unlocked: true, occupiedCarId: null, index: 2 },
    { id: 'slot-4', kind: 'regular', unlocked: true, occupiedCarId: null, index: 3 },
    { id: 'slot-5', kind: 'regular', unlocked: false, occupiedCarId: null, index: 4 },
  ]
}
