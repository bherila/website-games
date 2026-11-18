import { act, fireEvent, render, screen } from '@testing-library/react'
import { type ComponentProps, useEffect } from 'react'

import { buildHudSnapshot, createEngineState } from '../../engine/engine'
import { claimSandboxSlot, sandboxOwnerStorageKey, saveSandbox } from '../../gameProgress'
import { TowerGame } from '../../TowerGame'
import type { TowerScene } from '../../TowerScene'
import * as sfx from '../sfx'

jest.mock('../sfx', () => ({
  ...jest.requireActual('../sfx'),
  startNightCrickets: jest.fn(),
  stopNightCrickets: jest.fn(),
}))
jest.mock('../../TowerScene', () => ({
  TowerScene: function SnapshotProbe({ engineState, onSnapshot }: ComponentProps<typeof TowerScene>) {
    useEffect(() => { onSnapshot?.(buildHudSnapshot(engineState)) }, [engineState, onSnapshot])
    return <div data-testid="scene" />
  },
}))

it('silences the title screen after ownership loss and resumes audio for another tower', () => {
  localStorage.clear()
  sessionStorage.clear()
  const state = createEngineState({ seed: 287, mapId: 'city-tower', lobbyHeight: 1 })
  state.clock.minute = 0
  saveSandbox(state, 'autosave')
  saveSandbox(state, 'slot-a')
  render(<TowerGame />)
  fireEvent.click(screen.getByTestId('resume-autosave'))
  expect(sfx.startNightCrickets).toHaveBeenCalledTimes(1)
  jest.clearAllMocks()
  act(() => {
    claimSandboxSlot('autosave', 'other-tab')
    window.dispatchEvent(new StorageEvent('storage', {
      key: sandboxOwnerStorageKey('autosave'), newValue: 'other-tab',
    }))
  })
  expect(screen.queryByTestId('scene')).not.toBeInTheDocument()
  expect(sfx.stopNightCrickets).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByTestId('resume-slot-a'))
  expect(sfx.startNightCrickets).toHaveBeenCalledTimes(1)
})
