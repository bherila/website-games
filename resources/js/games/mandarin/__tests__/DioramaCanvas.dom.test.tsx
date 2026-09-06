import { act, render, screen } from '@testing-library/react'

import { DioramaCanvas } from '../scene/DioramaCanvas'
import type { DioramaController } from '../scene/dioramaRenderer'
import { probeWebGl } from '../scene/webglSupport'

jest.mock('../scene/webglSupport', () => ({ probeWebGl: jest.fn(() => false) }))

const probe = probeWebGl as jest.MockedFunction<typeof probeWebGl>

function fakeController(): DioramaController & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    setScene: (setting) => { calls.push(`scene:${setting}`) },
    setBeat: (beat) => { calls.push(`beat:${beat}`) },
    setReducedMotion: (value) => { calls.push(`motion:${value}`) },
    setPaused: (value) => { calls.push(`paused:${value}`) },
    resize: () => { calls.push('resize') },
    getMetrics: () => ({ drawCalls: 0, triangles: 0, geometries: 0, textures: 0, frameMs: 0 }),
    dispose: () => { calls.push('dispose') },
  }
}

describe('DioramaCanvas', () => {
  beforeEach(() => { probe.mockReset(); probe.mockReturnValue(false) })

  it('keeps the poster and never loads Three.js in 2D mode', async () => {
    const loader = jest.fn()
    const statuses: string[] = []
    render(<DioramaCanvas setting="gate" beat="idle" posterSlotId="scene-gate-poster" mode="2d" reducedMotion={false} onStatus={(status) => statuses.push(status)} loadRenderer={loader} />)
    expect(screen.getByTestId('diorama')).toHaveAttribute('data-diorama-status', 'poster')
    expect(screen.getByTestId('diorama-2d')).toBeInTheDocument()
    expect(loader).not.toHaveBeenCalled()
    expect(probe).not.toHaveBeenCalled()
  })

  it('falls back to the poster when WebGL is unavailable', () => {
    const loader = jest.fn()
    render(<DioramaCanvas setting="street" beat="idle" posterSlotId="scene-street-poster" mode="3d" reducedMotion={false} loadRenderer={loader} />)
    expect(screen.getByTestId('diorama')).toHaveAttribute('data-diorama-status', 'fallback')
    expect(loader).not.toHaveBeenCalled()
    expect(screen.getByTestId('diorama-2d').querySelector('img')).toHaveAttribute('data-visual-slot', 'scene-street-poster')
  })

  it('falls back when the renderer fails to load or construct', async () => {
    probe.mockReturnValue(true)
    const failing = jest.fn(() => Promise.reject(new Error('chunk failed')))
    render(<DioramaCanvas setting="bridge" beat="idle" posterSlotId="scene-bridge-poster" mode="3d" reducedMotion={false} loadRenderer={failing} />)
    expect(screen.getByTestId('diorama')).toHaveAttribute('data-diorama-status', 'loading')
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByTestId('diorama')).toHaveAttribute('data-diorama-status', 'fallback')
    const throwing = jest.fn(() => Promise.resolve({ createDioramaRenderer: () => { throw new Error('no context') } } as unknown as typeof import('../scene/dioramaRenderer')))
    render(<DioramaCanvas setting="bridge" beat="idle" posterSlotId="scene-bridge-poster" mode="3d" reducedMotion={false} loadRenderer={throwing} />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.getAllByTestId('diorama')[1]).toHaveAttribute('data-diorama-status', 'fallback')
  })

  it('drives the controller with scene, beat and reduced motion, then disposes on unmount', async () => {
    probe.mockReturnValue(true)
    const controller = fakeController()
    const loader = jest.fn(() => Promise.resolve({ createDioramaRenderer: () => controller } as unknown as typeof import('../scene/dioramaRenderer')))
    const view = render(<DioramaCanvas setting="roadside" beat="idle" posterSlotId="scene-roadside-poster" mode="3d" reducedMotion={false} loadRenderer={loader} />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByTestId('diorama')).toHaveAttribute('data-diorama-status', 'ready')
    expect(controller.calls).toContain('scene:roadside')
    view.rerender(<DioramaCanvas setting="reunion" beat="complete" posterSlotId="scene-reunion-poster" mode="3d" reducedMotion loadRenderer={loader} />)
    expect(controller.calls).toContain('scene:reunion')
    expect(controller.calls).toContain('beat:complete')
    expect(controller.calls).toContain('motion:true')
    view.unmount()
    expect(controller.calls.at(-1)).toBe('dispose')
  })
})
