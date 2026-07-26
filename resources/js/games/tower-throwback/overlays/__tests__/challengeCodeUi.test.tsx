import { fireEvent, render, screen } from '@testing-library/react'

import { encodeChallengeCode } from '../../challengeCode'
import type { SandboxSlotSummary } from '../../gameProgress'
import { ChallengeCodeCard } from '../../hud/ChallengeCodeCard'
import { NewGameOverlay } from '../NewGameOverlay'

function slots(saved = false): SandboxSlotSummary[] {
  return [{ id: 'autosave', label: 'Autosave', saved, loadFailure: null, day: saved ? 4 : null, star: null, population: null, funds: null }]
}

function renderOverlay(saved = false) {
  const onStart = jest.fn()
  render(<NewGameOverlay slots={slots(saved)} onStart={onStart} onResume={jest.fn()} onImport={jest.fn()} />)
  return onStart
}

describe('NewGameOverlay — challenge codes', () => {
  it('starts a random tower with the chosen lobby when no code is given', () => {
    const onStart = renderOverlay()

    fireEvent.click(screen.getByTestId('lobby-2'))
    fireEvent.click(screen.getByTestId('start'))

    expect(onStart).toHaveBeenCalledWith(2, undefined, 'city-tower')
  })

  it('starts the coded tower, overriding the lobby picker', () => {
    const onStart = renderOverlay()
    const code = encodeChallengeCode({ seed: 123_456, lobbyHeight: 3, mapId: 'city-tower' })

    fireEvent.click(screen.getByTestId('lobby-1'))
    fireEvent.change(screen.getByTestId('challenge-code'), { target: { value: code } })
    fireEvent.click(screen.getByTestId('start'))

    expect(onStart).toHaveBeenCalledWith(3, 123_456, 'city-tower')
  })

  it('accepts a code in its grouped display form', () => {
    const onStart = renderOverlay()

    fireEvent.change(screen.getByTestId('challenge-code'), { target: { value: '0001E24-1M' } })
    fireEvent.click(screen.getByTestId('start'))

    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onStart.mock.calls[0]?.[1]).toEqual(expect.any(Number))
  })

  it('refuses to start on an invalid code rather than silently going random', () => {
    const onStart = renderOverlay()

    fireEvent.change(screen.getByTestId('challenge-code'), { target: { value: 'NOTACODE1' } })

    expect(screen.getByTestId('challenge-code-status')).toHaveTextContent('not valid')
    expect(screen.getByTestId('challenge-code')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByTestId('start')).toBeDisabled()

    fireEvent.click(screen.getByTestId('start'))
    expect(onStart).not.toHaveBeenCalled()
  })

  it('still confirms before abandoning an existing save', () => {
    const onStart = renderOverlay(true)
    fireEvent.change(screen.getByTestId('challenge-code'), {
      target: { value: encodeChallengeCode({ seed: 9, lobbyHeight: 1, mapId: 'city-tower' }) },
    })

    fireEvent.click(screen.getByTestId('start'))
    expect(onStart).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('start'))
    expect(onStart).toHaveBeenCalledWith(1, 9, 'city-tower')
  })

  it('reports the lobby the code will use', () => {
    renderOverlay()

    fireEvent.change(screen.getByTestId('challenge-code'), {
      target: { value: encodeChallengeCode({ seed: 1, lobbyHeight: 2, mapId: 'city-tower' }) },
    })

    expect(screen.getByTestId('challenge-code-status')).toHaveTextContent('grand lobby')
  })
})

describe('ChallengeCodeCard', () => {
  it('shows the code in grouped form', () => {
    render(<ChallengeCodeCard code={encodeChallengeCode({ seed: 0xffff_ffff, lobbyHeight: 3, mapId: 'city-tower' })} />)

    expect(screen.getByTestId('challenge-code-value')).toHaveValue('1Z141Z3-30B')
  })

  it('copies to the clipboard', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<ChallengeCodeCard code={encodeChallengeCode({ seed: 42, lobbyHeight: 1, mapId: 'city-tower' })} />)

    fireEvent.click(screen.getByTestId('challenge-code-copy'))

    expect(writeText).toHaveBeenCalledWith(screen.getByTestId('challenge-code-value').getAttribute('value') ?? '')
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })

  it('falls back to select-and-copy when the clipboard is unavailable', async () => {
    Object.assign(navigator, { clipboard: undefined })
    render(<ChallengeCodeCard code={encodeChallengeCode({ seed: 42, lobbyHeight: 1, mapId: 'city-tower' })} />)

    fireEvent.click(screen.getByTestId('challenge-code-copy'))

    // A dead-looking button is worse than an honest one: the text is selected
    // and the label says so.
    expect(await screen.findByText('Select & copy')).toBeInTheDocument()
  })
})
