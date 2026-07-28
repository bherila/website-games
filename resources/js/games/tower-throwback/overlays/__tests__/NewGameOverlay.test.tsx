import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { encodeChallengeCode } from '../../challengeCode'
import type { SandboxSlotSummary } from '../../gameProgress'
import { SANDBOX_SLOT_IDS, SANDBOX_SLOT_LABELS, type SandboxSlotId } from '../../gameTypes'
import { NewGameOverlay } from '../NewGameOverlay'

function slots(savedSlotId: SandboxSlotId | null = null): SandboxSlotSummary[] {
  return SANDBOX_SLOT_IDS.map((slotId) => ({
    id: slotId,
    label: SANDBOX_SLOT_LABELS[slotId],
    saved: slotId === savedSlotId,
    loadFailure: null,
    day: slotId === savedSlotId ? 8 : null,
    star: slotId === savedSlotId ? 3 : null,
    population: slotId === savedSlotId ? 120 : null,
    funds: slotId === savedSlotId ? 50_000 : null,
  }))
}

describe('NewGameOverlay', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('starts with the chosen lobby height when no save exists', () => {
    const onStart = jest.fn()
    render(<NewGameOverlay slots={slots()} onStart={onStart} onResume={jest.fn()} onImport={jest.fn()} />)

    expect(screen.getByTestId('resume-autosave')).toBeDisabled()
    fireEvent.click(screen.getByTestId('lobby-3'))
    expect(screen.getByTestId('lobby-3')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('start'))
    expect(onStart).toHaveBeenCalledWith(3, undefined, 'city-tower')
  })

  it('offers resume and requires confirmation before replacing the autosave', () => {
    const onStart = jest.fn()
    const onResume = jest.fn()
    render(<NewGameOverlay slots={slots('autosave')} onStart={onStart} onResume={onResume} onImport={jest.fn()} />)

    expect(screen.getByTestId('title-slot-summary-autosave')).toHaveTextContent('Day 8')
    fireEvent.click(screen.getByTestId('resume-autosave'))
    expect(onResume).toHaveBeenCalledWith('autosave')

    // First click arms the confirmation; nothing starts yet.
    fireEvent.click(screen.getByTestId('start'))
    expect(onStart).not.toHaveBeenCalled()
    expect(screen.getByTestId('start')).toHaveTextContent('Replace autosave')

    // Cancel returns to the safe state…
    fireEvent.click(screen.getByTestId('cancel-new'))
    expect(screen.getByTestId('start')).toHaveTextContent('New tower')
    expect(screen.getByTestId('start')).toHaveFocus()

    // …and confirming actually starts.
    fireEvent.click(screen.getByTestId('start'))
    fireEvent.click(screen.getByTestId('start'))
    expect(onStart).toHaveBeenCalledWith(1, undefined, 'city-tower')
  })

  it('starts immediately when only a named slot is saved', () => {
    const onStart = jest.fn()
    render(<NewGameOverlay slots={slots('slot-a')} onStart={onStart} onResume={jest.fn()} onImport={jest.fn()} />)

    fireEvent.click(screen.getByTestId('start'))

    expect(onStart).toHaveBeenCalledWith(1, undefined, 'city-tower')
    expect(screen.queryByTestId('cancel-new')).not.toBeInTheDocument()
  })

  it('does not present or overwrite an unknown-map save as empty', () => {
    const onStart = jest.fn()
    const unknownMapSlots = slots().map((slot) =>
      slot.id === 'autosave' ? { ...slot, loadFailure: 'unknownMap' as const } : slot,
    )
    render(<NewGameOverlay slots={unknownMapSlots} onStart={onStart} onResume={jest.fn()} onImport={jest.fn()} />)

    expect(screen.getByTestId('title-slot-summary-autosave')).toHaveTextContent('Requires a newer version')
    expect(screen.getByTestId('resume-autosave')).toBeDisabled()
    expect(screen.getByTestId('resume-autosave')).toHaveTextContent('Update required')

    fireEvent.click(screen.getByTestId('start'))
    expect(onStart).not.toHaveBeenCalled()
    expect(screen.getByTestId('start')).toHaveTextContent('Replace autosave')

    fireEvent.click(screen.getByTestId('start'))
    expect(onStart).toHaveBeenCalledWith(1, undefined, 'city-tower')
  })

  it('imports JSON into the selected slot and shows feedback', () => {
    const onImport = jest.fn(() => ({ kind: 'success' as const, text: 'Imported to Slot B.' }))
    render(<NewGameOverlay slots={slots()} onStart={jest.fn()} onResume={jest.fn()} onImport={onImport} />)

    fireEvent.change(screen.getByTestId('title-import-slot'), { target: { value: 'slot-b' } })
    fireEvent.change(screen.getByTestId('title-import-payload'), { target: { value: '{"version":1}' } })
    fireEvent.click(screen.getByTestId('title-import-save'))

    expect(onImport).toHaveBeenCalledWith('slot-b', '{"version":1}')
    expect(screen.getByTestId('title-import-message')).toHaveTextContent('Imported to Slot B.')
  })

  it('loads import JSON from a downloaded save file', async () => {
    render(<NewGameOverlay slots={slots()} onStart={jest.fn()} onResume={jest.fn()} onImport={jest.fn()} />)

    const file = new File(['{"version":2,"seed":17}'], 'tower-save.json', { type: 'application/json' })
    fireEvent.change(screen.getByTestId('title-import-file'), { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByTestId('title-import-payload')).toHaveValue('{"version":2,"seed":17}')
    })
  })

  it('reports a save file that the browser cannot read', async () => {
    jest.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
      this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>)
    })
    render(<NewGameOverlay slots={slots()} onStart={jest.fn()} onResume={jest.fn()} onImport={jest.fn()} />)

    const file = new File(['unreadable'], 'tower-save.json', { type: 'application/json' })
    fireEvent.change(screen.getByTestId('title-import-file'), { target: { files: [file] } })

    expect(await screen.findByTestId('title-import-message')).toHaveTextContent('Could not read that save file')
  })

  it('locks map and lobby choices to a valid challenge code', () => {
    const onStart = jest.fn()
    render(<NewGameOverlay slots={slots()} onStart={onStart} onResume={jest.fn()} onImport={jest.fn()} />)

    const code = encodeChallengeCode({ seed: 42, lobbyHeight: 3, mapId: 'niagara-falls' })
    fireEvent.change(screen.getByTestId('challenge-code'), { target: { value: code } })

    expect(screen.getByTestId('map-city-tower')).toBeDisabled()
    expect(screen.getByTestId('map-niagara-falls')).toBeDisabled()
    expect(screen.getByTestId('lobby-1')).toBeDisabled()
    expect(screen.getByTestId('lobby-3')).toBeDisabled()
    expect(screen.getByTestId('challenge-code-status')).toHaveTextContent('locked to this code')

    fireEvent.click(screen.getByTestId('start'))
    expect(onStart).toHaveBeenCalledWith(3, 42, 'niagara-falls')

    fireEvent.change(screen.getByTestId('challenge-code'), { target: { value: '' } })
    expect(screen.getByTestId('map-city-tower')).toBeEnabled()
    expect(screen.getByTestId('map-niagara-falls')).toBeEnabled()
    expect(screen.getByTestId('lobby-1')).toBeEnabled()
    expect(screen.getByTestId('lobby-3')).toBeEnabled()
  })

  it('confirms before importing over an occupied slot', () => {
    const onImport = jest.fn(() => ({ kind: 'success' as const, text: 'Imported to Slot A.' }))
    render(<NewGameOverlay slots={slots('slot-a')} onStart={jest.fn()} onResume={jest.fn()} onImport={onImport} />)

    fireEvent.change(screen.getByTestId('title-import-slot'), { target: { value: 'slot-a' } })
    fireEvent.change(screen.getByTestId('title-import-payload'), { target: { value: '{"version":1}' } })
    fireEvent.click(screen.getByTestId('title-import-save'))

    expect(onImport).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Replace Slot A')
    fireEvent.click(screen.getByTestId('confirm-destructive-action'))
    expect(onImport).toHaveBeenCalledWith('slot-a', '{"version":1}')
  })
})
