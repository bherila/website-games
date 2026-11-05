import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { type ReactElement, StrictMode } from 'react'

import { createGameState, orderBuild, tickGame } from '../gameEngine'
import { loadProgress } from '../gameProgress'
import { type GameState, type HudSnapshot, TOWER_DEFENSE_SAVE_STORAGE_KEY } from '../gameTypes'
import { LEVELS } from '../levels'
import { loadRun, saveRun } from '../runProgress'
import { snapshotRun } from '../runSnapshot'
import { TowerDefenseGame } from '../TowerDefenseGame'
import type { BoardPointer } from '../TowerDefenseScene'

interface SceneProps {
  state: GameState
  active: boolean
  speed: number
  onPointer: (pointer: BoardPointer) => void
  onHud: (hud: HudSnapshot) => void
  onFinish: (state: GameState) => void
}

let scene: SceneProps | null = null

jest.mock('../TowerDefenseScene', () => ({
  TowerDefenseScene: (props: SceneProps): ReactElement => {
    scene = props

    return <div data-testid="tower-defense-scene" />
  },
}))

jest.mock('../audio/sfx', () => ({
  createSfxEngine: () => ({ unlock: jest.fn(), play: jest.fn(), setMuted: jest.fn(), dispose: jest.fn() }),
}))

function pointer(phase: BoardPointer['phase'], col: number, row: number, buildingId: number | null = null): BoardPointer {
  return { phase, pressed: phase === 'down' || phase === 'move', x: col + 0.5, y: row + 0.5, col, row, inBoard: true, buildingId }
}

function tap(col: number, row: number, buildingId: number | null = null): void {
  act(() => {
    scene?.onPointer(pointer('down', col, row, buildingId))
    scene?.onPointer(pointer('up', col, row, buildingId))
  })
}

function startFirstLevel(): GameState {
  window.localStorage.setItem('bwh.tower-defense.tutorial.v1', 'seen')
  render(<TowerDefenseGame />)
  fireEvent.click(screen.getByTestId('level-tile-1'))
  if (!scene) {
    throw new Error('scene not mounted')
  }

  return scene.state
}

describe('TowerDefenseGame', () => {
  beforeEach(() => {
    window.localStorage.clear()
    scene = null
  })

  it('shows the level select, then the tutorial the first time, and runs only once it is dismissed', () => {
    render(<TowerDefenseGame />)
    expect(screen.getByRole('heading', { name: 'Tower Defense' })).toBeInTheDocument()
    expect(screen.getByTestId('level-tile-2')).toHaveAttribute('data-unlocked', 'false')

    fireEvent.click(screen.getByTestId('level-tile-1'))
    expect(screen.getByRole('dialog', { name: 'How to play' })).toBeInTheDocument()
    expect(scene?.active).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'Start building' }))
    expect(screen.queryByRole('dialog', { name: 'How to play' })).not.toBeInTheDocument()
    expect(scene?.active).toBe(true)
    expect(window.localStorage.getItem('bwh.tower-defense.tutorial.v1')).toBe('seen')
  })

  it('places a tower from the tray with a tap, and tells the player when it cannot', () => {
    const state = startFirstLevel()
    expect(screen.getByTestId('tray-arrow')).toHaveAccessibleName('Arrow Tower, 30 gold')
    fireEvent.click(screen.getByTestId('tray-arrow'))
    expect(screen.getByTestId('tray-arrow')).toHaveAttribute('aria-pressed', 'true')

    tap(2, 8)
    expect(state.plans).toHaveLength(1)
    expect(state.plans[0]).toMatchObject({ tower: 'arrow', col: 2, row: 8 })
    expect(screen.getByTestId('gold')).toHaveTextContent('70')

    tap(2, 8)
    expect(state.plans).toHaveLength(1)
    expect(screen.getByTestId('game-notice')).toHaveTextContent('taken')
  })

  it('drags a line of walls with one stroke', () => {
    const state = startFirstLevel()
    fireEvent.click(screen.getByTestId('tray-wall'))
    act(() => {
      scene?.onPointer(pointer('down', 2, 8))
      scene?.onPointer(pointer('move', 3, 8))
      scene?.onPointer(pointer('move', 3, 8))
      scene?.onPointer(pointer('move', 4, 8))
      scene?.onPointer(pointer('up', 4, 8))
    })
    expect(state.plans.map((plan) => [plan.tower, plan.col, plan.row])).toEqual([['wall', 2, 8], ['wall', 3, 8], ['wall', 4, 8]])
  })

  it('sends the hero when no tool is armed, and takes a queued plan back with a tap', () => {
    const state = startFirstLevel()
    tap(10, 15)
    expect(state.hero.moveTarget).toEqual({ x: 10.5, y: 15.5 })

    orderBuild(state, 'arrow', 3, 3)
    const gold = state.gold
    tap(3, 3)
    expect(state.plans).toHaveLength(0)
    expect(state.gold).toBe(gold + 30)
  })

  it('opens a building panel and upgrades or sells from it', () => {
    const state = startFirstLevel()
    state.gold = 500
    state.buildings.push({ id: 900, tower: 'arrow', tier: 1, col: 3, row: 3, hp: 70, maxHp: 70, progress: 1, cooldown: 0, invested: 30, hitAge: 10, aim: 0 })
    state.buildingAt[(3 * 13) + 3] = state.buildings[0] ?? null
    tap(3, 3, 900)
    expect(screen.getByTestId('building-panel')).toHaveTextContent('Arrow Tower')

    fireEvent.click(screen.getByTestId('upgrade-building'))
    expect(state.plans[0]).toMatchObject({ type: 'upgrade', buildingId: 900 })
    expect(screen.getByTestId('upgrade-building')).toBeDisabled()

    const gold = state.gold
    fireEvent.click(screen.getByTestId('sell-building'))
    expect(state.gold).toBe(gold + 36 + 21)
    expect(screen.queryByTestId('building-panel')).not.toBeInTheDocument()
  })

  it('asks for an element when one is owed and adds its tower to the tray', () => {
    const state = startFirstLevel()
    act(() => {
      state.pendingPicks = 1
      scene?.onHud({ gold: state.gold, lives: 20, maxLives: 20, waveNumber: 3, totalWaves: 8, nextWaveIn: 10, nextWave: state.waves[3] ?? null, enemiesAlive: 0, coinsOnGround: 0, pathBlocked: false, unlocked: [], pendingPicks: 1, heroSpeedLevel: 0, heroMagnetLevel: 0, plans: 0, buildingCount: 0, status: 'playing' })
    })
    expect(screen.getByRole('dialog', { name: 'Choose an element' })).toBeInTheDocument()
    expect(scene?.active).toBe(false)
    fireEvent.click(screen.getByTestId('pick-fire'))
    expect(state.unlocked).toEqual(['fire'])
    expect(screen.queryByRole('dialog', { name: 'Choose an element' })).not.toBeInTheDocument()
    expect(screen.getByTestId('tray-ember')).toBeInTheDocument()
  })

  it('warns when the route is sealed', () => {
    const state = startFirstLevel()
    expect(screen.queryByTestId('path-blocked')).not.toBeInTheDocument()
    act(() => {
      scene?.onHud({ gold: state.gold, lives: 20, maxLives: 20, waveNumber: 0, totalWaves: 8, nextWaveIn: 10, nextWave: state.waves[0] ?? null, enemiesAlive: 0, coinsOnGround: 0, pathBlocked: true, unlocked: [], pendingPicks: 0, heroSpeedLevel: 0, heroMagnetLevel: 0, plans: 0, buildingCount: 13, status: 'playing' })
    })
    expect(screen.getByTestId('path-blocked')).toHaveTextContent('smash through')
  })

  it('pauses, doubles the speed, and pauses by itself when the tab is hidden', () => {
    startFirstLevel()
    fireEvent.click(screen.getByRole('button', { name: 'Double speed' }))
    expect(scene?.speed).toBe(2)
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(screen.getByRole('dialog', { name: 'Game paused' })).toBeInTheDocument()
    expect(scene?.active).toBe(false)
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Game paused' })).getByRole('button', { name: 'Resume' }))
    expect(scene?.active).toBe(true)

    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    expect(screen.getByRole('dialog', { name: 'Game paused' })).toBeInTheDocument()
  })

  it('steers the hero with the keyboard, but leaves focused buttons alone', () => {
    const state = startFirstLevel()
    fireEvent.keyDown(window, { code: 'ArrowLeft' })
    expect(state.hero.input.x).toBe(-1)
    fireEvent.keyUp(window, { code: 'ArrowLeft' })
    expect(state.hero.input.x).toBe(0)

    fireEvent.keyDown(screen.getByRole('button', { name: 'Pause' }), { code: 'Space' })
    expect(screen.queryByRole('dialog', { name: 'Game paused' })).not.toBeInTheDocument()
    fireEvent.keyDown(window, { code: 'Space' })
    expect(screen.getByRole('dialog', { name: 'Game paused' })).toBeInTheDocument()
  })

  it('records stars and unlocks the next level on a win', () => {
    const state = startFirstLevel()
    act(() => {
      state.status = 'won'
      state.lives = 18
      scene?.onHud({ gold: 0, lives: 18, maxLives: 20, waveNumber: 8, totalWaves: 8, nextWaveIn: null, nextWave: null, enemiesAlive: 0, coinsOnGround: 0, pathBlocked: false, unlocked: [], pendingPicks: 0, heroSpeedLevel: 0, heroMagnetLevel: 0, plans: 0, buildingCount: 0, status: 'won' })
      scene?.onFinish(state)
    })
    expect(screen.getByTestId('won-stars')).toHaveAttribute('data-stars', '3')
    expect(loadProgress()).toMatchObject({ unlockedLevel: 2, stars: { 1: 3 } })

    fireEvent.click(screen.getByRole('button', { name: 'Next level' }))
    expect(scene?.state.level.id).toBe(2)
  })

  it('offers a retry on a loss without touching saved progress', () => {
    const state = startFirstLevel()
    act(() => {
      state.status = 'lost'
      scene?.onFinish(state)
    })
    expect(screen.getByRole('dialog', { name: 'Keep lost' })).toBeInTheDocument()
    expect(loadProgress().unlockedLevel).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(scene?.state).not.toBe(state)
    expect(scene?.state.status).toBe('playing')
  })
})


describe('saved run recovery', () => {
  beforeEach(() => { localStorage.clear(); scene = null })
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers() })

  it('restores a saved level paused, preserves queued work, and survives another unmount/reload', () => {
    localStorage.setItem('bwh.tower-defense.tutorial.v1', 'seen')
    const original = createGameState(LEVELS[0]!, 123)
    orderBuild(original, 'arrow', 2, 8)
    for (let i = 0; i < 25; i += 1) tickGame(original, 1 / 60)
    expect(saveRun(original).ok).toBe(true)
    const view = render(<StrictMode><TowerDefenseGame /></StrictMode>)
    fireEvent.click(screen.getByTestId('resume-run'))
    expect(screen.getByRole('dialog', { name: 'Game paused' })).toBeInTheDocument()
    expect(scene?.active).toBe(false)
    expect(scene?.state.plans).toEqual(original.plans)
    expect(snapshotRun(scene!.state)).toEqual(snapshotRun(original))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Game paused' })).getByRole('button', { name: 'Resume' }))
    expect(scene?.active).toBe(true)
    const running = scene!.state
    for (let i = 0; i < 60; i += 1) tickGame(running, 1 / 60)
    view.unmount()
    expect(loadRun().snapshot?.clock).toBe(running.clock)
    const current = render(<TowerDefenseGame />)
    fireEvent.click(screen.getByTestId('resume-run'))
    expect(scene?.state.clock).toBe(running.clock)
    expect(scene?.active).toBe(false)
    current.unmount()
  })

  it('confirms replacing a saved run and keeps its bytes when replacement fails or is cancelled', () => {
    saveRun(createGameState(LEVELS[0]!, 123))
    const previous = localStorage.getItem(TOWER_DEFENSE_SAVE_STORAGE_KEY)
    render(<TowerDefenseGame />)
    fireEvent.click(screen.getByTestId('level-tile-1'))
    expect(screen.getByRole('dialog', { name: 'Replace saved run' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep saved run' }))
    expect(localStorage.getItem(TOWER_DEFENSE_SAVE_STORAGE_KEY)).toBe(previous)
    fireEvent.click(screen.getByTestId('level-tile-1'))
    const realSetItem = Storage.prototype.setItem
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === TOWER_DEFENSE_SAVE_STORAGE_KEY) throw new DOMException('Full', 'QuotaExceededError')
      realSetItem.call(this, key, value)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Start new run' }))
    expect(screen.getByRole('alert')).toHaveTextContent('previous saved run is unchanged')
    expect(screen.queryByTestId('tower-defense-scene')).not.toBeInTheDocument()
    expect(localStorage.getItem(TOWER_DEFENSE_SAVE_STORAGE_KEY)).toBe(previous)
    jest.restoreAllMocks()
    fireEvent.click(screen.getByRole('button', { name: 'Start new run' }))
    expect(screen.getByTestId('tower-defense-scene')).toBeInTheDocument()
    expect(localStorage.getItem(TOWER_DEFENSE_SAVE_STORAGE_KEY)).not.toBe(previous)
  })

  it('saves changes after bounded debounce, periodically, and immediately on tab hide', () => {
    jest.useFakeTimers()
    const state = startFirstLevel()
    fireEvent.click(screen.getByTestId('tray-wall'))
    tap(2, 8)
    tap(3, 8)
    expect(loadRun().snapshot?.plans).toHaveLength(0)
    act(() => jest.advanceTimersByTime(750))
    expect(loadRun().snapshot?.plans).toHaveLength(2)
    state.clock = 10
    act(() => jest.advanceTimersByTime(10_000))
    expect(loadRun().snapshot?.clock).toBe(10)
    state.gold = 50
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    expect(loadRun().snapshot?.gold).toBe(50)
    expect(screen.getByRole('dialog', { name: 'Game paused' })).toBeInTheDocument()
  })

  it('keeps first-time play available if storage fails, with a visible warning', () => {
    const realSetItem = Storage.prototype.setItem
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === TOWER_DEFENSE_SAVE_STORAGE_KEY) throw new Error('Blocked')
      realSetItem.call(this, key, value)
    })
    startFirstLevel()
    expect(scene?.active).toBe(true)
    expect(screen.getByRole('alert')).toHaveTextContent('Saving is unavailable')
  })

  it('explains a damaged snapshot without touching earned stars or its old bytes', () => {
    localStorage.setItem(TOWER_DEFENSE_SAVE_STORAGE_KEY, '{')
    render(<TowerDefenseGame />)
    expect(screen.getByRole('alert')).toHaveTextContent('damaged or from an incompatible version')
    expect(screen.queryByTestId('resume-run')).not.toBeInTheDocument()
    expect(localStorage.getItem(TOWER_DEFENSE_SAVE_STORAGE_KEY)).toBe('{')
    expect(loadProgress().unlockedLevel).toBe(1)
  })
})
