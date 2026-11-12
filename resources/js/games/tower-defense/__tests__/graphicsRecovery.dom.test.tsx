import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import * as THREE from 'three'

import { createGameState, orderBuild, tickGame } from '../gameEngine'
import { loadProgress, recordWin, saveProgress } from '../gameProgress'
import { TOWER_DEFENSE_SAVE_STORAGE_KEY } from '../gameTypes'
import { levelById } from '../levels'
import { loadRun, saveRun } from '../runProgress'
import { snapshotRun } from '../runSnapshot'
import { createTerrainView } from '../scene/terrainView'
import { TowerDefenseGame } from '../TowerDefenseGame'

jest.mock('three', () => ({ ...jest.requireActual('three'), WebGLRenderer: jest.fn() }))
jest.mock('../audio/sfx', () => ({ createSfxEngine: () => ({ unlock: jest.fn(), play: jest.fn(), setMuted: jest.fn(), dispose: jest.fn() }), playEventSfx: jest.fn() }))
jest.mock('../scene/terrainView', () => ({ createTerrainView: jest.fn() }))
jest.mock('../scene/buildingView', () => ({ createBuildingView: () => ({ update: jest.fn() }) }))
jest.mock('../scene/unitView', () => ({ createUnitView: () => ({ update: jest.fn() }) }))
jest.mock('../scene/effects', () => ({ createEffects: () => ({ handle: jest.fn(), update: jest.fn() }) }))

function graphics() {
  return {
    domElement: document.createElement('canvas'),
    shadowMap: { enabled: false, type: 0 },
    setPixelRatio: jest.fn(),
    setSize: jest.fn(),
    render: jest.fn<void, [THREE.Scene, THREE.Camera]>(),
    dispose: jest.fn(),
  }
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('bwh.tower-defense.tutorial.v1', 'seen')
  jest.clearAllMocks()
  jest.mocked(THREE.WebGLRenderer).mockImplementation(() => graphics() as unknown as THREE.WebGLRenderer)
  jest.mocked(createTerrainView).mockImplementation(() => ({ update: jest.fn() }))
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
})

afterEach(() => jest.restoreAllMocks())

function savedRun() {
  const level = levelById(1)
  if (!level) throw new Error('Missing level')
  const state = createGameState(level, 712)
  orderBuild(state, 'arrow', 3, 3)
  for (let index = 0; index < 60; index++) tickGame(state, 1 / 60)
  state.hero.moveTarget = { x: 5, y: 8 }
  state.hero.input = { x: 1, y: -1 }
  // Keep the cached breach costs, which need not match current building HP.
  state.breachField[0] = 123
  expect(saveRun(state).ok).toBe(true)
  return state
}

function failStartup(): void {
  jest.mocked(THREE.WebGLRenderer).mockImplementation(() => { throw new Error('No WebGL') })
}

it('keeps the saved run and progress through repeated failures, traps focus, and retries paused', async () => {
  const original = savedRun()
  saveProgress(recordWin(loadProgress(), 1, 3))
  const progress = loadProgress()
  const expected = snapshotRun(original)
  expected.hero.input = { x: 0, y: 0 }
  failStartup()
  render(<TowerDefenseGame />)
  fireEvent.click(screen.getByTestId('resume-run'))
  const dialog = screen.getByRole('alertdialog', { name: 'Graphics unavailable' })
  const retry = within(dialog).getByRole('button', { name: 'Retry graphics' })
  const exit = within(dialog).getByRole('button', { name: 'Level select' })
  expect(dialog).toHaveTextContent('Your run is paused')
  expect(retry).toHaveFocus()
  expect(screen.getByTestId('tower-defense-scene').closest('[inert]')).not.toBeNull()
  expect(screen.queryByTestId('tower-defense-canvas')).not.toBeInTheDocument()
  expect(window.requestAnimationFrame).not.toHaveBeenCalled()

  fireEvent.keyDown(retry, { key: 'Tab', shiftKey: true })
  expect(exit).toHaveFocus()
  fireEvent.keyDown(exit, { key: 'Tab' })
  expect(retry).toHaveFocus()
  fireEvent.keyDown(retry, { key: 'Escape', code: 'Escape' })
  expect(dialog).toBeInTheDocument()
  for (const code of ['KeyN', 'ArrowLeft', 'Digit2', 'Space']) fireEvent.keyDown(window, { code })
  fireEvent.click(screen.getByTestId('tray-arrow'))
  expect(loadRun().snapshot).toEqual(expected)

  fireEvent.click(retry)
  fireEvent.click(retry)
  expect(THREE.WebGLRenderer).toHaveBeenCalledTimes(3)
  expect(retry).toHaveFocus()
  expect(loadProgress()).toEqual(progress)
  expect(loadRun().snapshot).toEqual(expected)

  jest.mocked(THREE.WebGLRenderer).mockImplementation(() => graphics() as unknown as THREE.WebGLRenderer)
  fireEvent.click(retry)
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(screen.getByTestId('tower-defense-canvas')).toBeInTheDocument()
  const resume = within(screen.getByRole('dialog', { name: 'Game paused' })).getByRole('button', { name: 'Resume' })
  await waitFor(() => expect(resume).toHaveFocus())
  const frame = jest.mocked(requestAnimationFrame).mock.calls.at(-1)?.[0]
  if (!frame) throw new Error('Missing animation loop')
  act(() => frame(performance.now() + 100))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Game paused' })).getByRole('button', { name: 'Level select' }))
  expect(loadRun().snapshot).toEqual(expected)
  expect(loadProgress()).toEqual(progress)
})

it('returns to select with the checkpoint intact and ignores a disposed loop', async () => {
  const original = savedRun()
  const failed = graphics()
  failed.render.mockImplementation(() => { throw new Error('First frame failed') })
  jest.mocked(THREE.WebGLRenderer).mockImplementationOnce(() => failed as unknown as THREE.WebGLRenderer)
  render(<TowerDefenseGame />)
  fireEvent.click(screen.getByTestId('resume-run'))
  const saved = localStorage.getItem(TOWER_DEFENSE_SAVE_STORAGE_KEY)
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Level select' }))
  await waitFor(() => expect(screen.getByTestId('resume-run')).toHaveFocus())
  expect(localStorage.getItem(TOWER_DEFENSE_SAVE_STORAGE_KEY)).toBe(saved)
  expect(loadRun().snapshot?.clock).toBe(original.clock)
  expect(failed.domElement).not.toBeInTheDocument()
  expect(window.requestAnimationFrame).not.toHaveBeenCalled()

  fireEvent.click(screen.getByTestId('resume-run'))
  const stale = jest.mocked(requestAnimationFrame).mock.calls.at(-1)?.[0]
  if (!stale) throw new Error('Missing animation loop')
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Game paused' })).getByRole('button', { name: 'Level select' }))
  const checkpoint = loadRun().snapshot
  const frames = jest.mocked(requestAnimationFrame).mock.calls.length
  act(() => stale(performance.now() + 100))
  expect(requestAnimationFrame).toHaveBeenCalledTimes(frames)
  expect(loadRun().snapshot).toEqual(checkpoint)
  expect(screen.getByRole('heading', { name: 'Tower Defense' })).toBeInTheDocument()
})

it.each(['settings', 'terrain', 'resize', 'render'] as const)('cleans partial %s startup before renderer disposal even when disposal throws', (stage) => {
  const failed = graphics()
  const order: string[] = []
  const texture = new THREE.Texture()
  const material = new THREE.MeshBasicMaterial({ map: texture })
  const geometry = new THREE.BoxGeometry()
  const shadow = new THREE.WebGLRenderTarget(8, 8)
  for (const [label, resource] of [['texture', texture], ['material', material], ['geometry', geometry], ['shadow', shadow]] as const) {
    resource.addEventListener('dispose', () => order.push(label))
  }
  jest.mocked(createTerrainView).mockImplementation((scene) => {
    scene.add(new THREE.Mesh(geometry, material))
    const sun = scene.children.find((child): child is THREE.DirectionalLight => child instanceof THREE.DirectionalLight)
    if (!sun) throw new Error('Missing sun')
    sun.shadow.map = shadow
    if (stage === 'terrain') throw new Error('Terrain failed')
    return { update: jest.fn() }
  })
  if (stage === 'settings') failed.setPixelRatio.mockImplementation(() => { throw new Error('Settings failed') })
  if (stage === 'resize') failed.setSize.mockImplementation(() => { throw new Error('Resize failed') })
  if (stage === 'render') failed.render.mockImplementation(() => { throw new Error('Draw failed') })
  failed.dispose.mockImplementation(() => { order.push('renderer'); throw new Error('Disposal failed') })
  jest.mocked(THREE.WebGLRenderer).mockImplementationOnce(() => failed as unknown as THREE.WebGLRenderer)
  const observer = jest.spyOn(ResizeObserver.prototype, 'disconnect')
  render(<TowerDefenseGame />)
  fireEvent.click(screen.getByTestId('level-tile-1'))
  expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  expect(failed.domElement).not.toBeInTheDocument()
  expect(failed.dispose).toHaveBeenCalledTimes(1)
  expect(requestAnimationFrame).not.toHaveBeenCalled()
  if (stage !== 'settings') {
    expect(order).toEqual(expect.arrayContaining(['texture', 'material', 'geometry', 'shadow']))
    expect(order.at(-1)).toBe('renderer')
  }
  if (stage === 'resize' || stage === 'render') expect(observer).toHaveBeenCalled()
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Level select' }))
  expect(screen.getByTestId('resume-run')).toBeInTheDocument()
})

it('survives StrictMode replay, cancels the old loop, and leaves one live canvas', () => {
  savedRun()
  render(<StrictMode><TowerDefenseGame /></StrictMode>)
  fireEvent.click(screen.getByTestId('resume-run'))
  expect(screen.getAllByTestId('tower-defense-canvas')).toHaveLength(1)
  const first = jest.mocked(THREE.WebGLRenderer).mock.results[0]?.value as ReturnType<typeof graphics> | undefined
  if (!first) throw new Error('Missing first renderer')
  expect(first.dispose).toHaveBeenCalledTimes(1)
  expect(first.domElement).not.toBeInTheDocument()
  const stale = jest.mocked(requestAnimationFrame).mock.calls[0]?.[0]
  if (!stale) throw new Error('Missing old frame')
  const count = jest.mocked(requestAnimationFrame).mock.calls.length
  act(() => stale(performance.now() + 100))
  expect(requestAnimationFrame).toHaveBeenCalledTimes(count)
  expect(screen.getByRole('dialog', { name: 'Game paused' })).toBeInTheDocument()
})

it('retains the live run on return to select when checkpoint writes fail', async () => {
  savedRun()
  const stored = localStorage.getItem(TOWER_DEFENSE_SAVE_STORAGE_KEY)
  const originalSetItem = Storage.prototype.setItem
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === TOWER_DEFENSE_SAVE_STORAGE_KEY) throw new Error('Storage full')
    originalSetItem.call(this, key, value)
  })
  const failed = graphics()
  failed.render.mockImplementation(() => { throw new Error('Draw failed') })
  jest.mocked(THREE.WebGLRenderer).mockImplementationOnce(() => failed as unknown as THREE.WebGLRenderer)
  render(<TowerDefenseGame />)
  fireEvent.click(screen.getByTestId('resume-run'))
  const live = jest.mocked(createTerrainView).mock.calls[0]?.[1]
  if (!live) throw new Error('Missing live run')
  const expected = snapshotRun(live)
  fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Level select' }))
  expect(localStorage.getItem(TOWER_DEFENSE_SAVE_STORAGE_KEY)).toBe(stored)
  expect(screen.getByTestId('resume-run')).toHaveTextContent('Resume current run')
  await waitFor(() => expect(screen.getByTestId('resume-run')).toHaveFocus())
  fireEvent.click(screen.getByTestId('level-tile-1'))
  fireEvent.click(await screen.findByRole('button', { name: 'Keep saved run' }))
  fireEvent.click(screen.getByTestId('resume-run'))
  expect(jest.mocked(createTerrainView).mock.calls.at(-1)?.[1]).toBe(live)
  expect(snapshotRun(live)).toEqual(expected)
  expect(screen.getByRole('dialog', { name: 'Game paused' })).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('could not be saved')
  expect(localStorage.getItem(TOWER_DEFENSE_SAVE_STORAGE_KEY)).toBe(stored)
})
