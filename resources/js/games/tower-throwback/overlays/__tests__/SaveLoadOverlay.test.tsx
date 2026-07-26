import { fireEvent, render, screen } from '@testing-library/react'

import type { SandboxSlotSummary } from '../../gameProgress'
import { SANDBOX_SLOT_IDS, SANDBOX_SLOT_LABELS, type SandboxSlotId } from '../../gameTypes'
import { SaveLoadOverlay } from '../SaveLoadOverlay'

function slots(savedSlotId: SandboxSlotId = 'slot-a'): SandboxSlotSummary[] {
  return SANDBOX_SLOT_IDS.map((slotId) => ({
    id: slotId,
    label: SANDBOX_SLOT_LABELS[slotId],
    saved: slotId === savedSlotId,
    loadFailure: null,
    day: slotId === savedSlotId ? 4 : null,
    star: slotId === savedSlotId ? 2 : null,
    population: slotId === savedSlotId ? 88 : null,
    funds: slotId === savedSlotId ? 12_345 : null,
  }))
}

describe('SaveLoadOverlay', () => {
  it('protects an unknown-map save from overwrite while allowing explicit clearing', () => {
    const onSave = jest.fn()
    const unknownMapSlots = slots().map((slot) =>
      slot.id === 'slot-a' ? { ...slot, saved: false, loadFailure: 'unknownMap' as const } : slot,
    )

    render(
      <SaveLoadOverlay
        slots={unknownMapSlots}
        activeSlotId="autosave"
        canSave={true}
        exportText=""
        message={null}
        disastersEnabled={true}
        onClose={jest.fn()}
        onSave={onSave}
        onLoad={jest.fn()}
        onExport={jest.fn()}
        onImport={jest.fn()}
        onClear={jest.fn()}
        onSetDisastersEnabled={jest.fn()}
      />,
    )

    expect(screen.getByTestId('slot-summary-slot-a')).toHaveTextContent('Requires a newer version')
    expect(screen.getByTestId('load-slot-a')).toBeDisabled()
    expect(screen.getByTestId('clear-slot-a')).toBeEnabled()

    fireEvent.click(screen.getByTestId('save-slot-a'))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Overwrite Slot A')
  })

  it('routes slot actions and shows export text plus restore caveats', () => {
    const onSave = jest.fn()
    const onLoad = jest.fn()
    const onExport = jest.fn()
    const onImport = jest.fn()
    const onClear = jest.fn()
    const onSetDisastersEnabled = jest.fn()

    render(
      <SaveLoadOverlay
        slots={slots()}
        activeSlotId="autosave"
        canSave={true}
        exportText='{"version":1}'
        message={{ kind: 'success', text: 'Saved to Slot A.' }}
        disastersEnabled={true}
        onClose={jest.fn()}
        onSave={onSave}
        onLoad={onLoad}
        onExport={onExport}
        onImport={onImport}
        onClear={onClear}
        onSetDisastersEnabled={onSetDisastersEnabled}
      />,
    )

    expect(screen.getByTestId('slot-summary-slot-a')).toHaveTextContent('Day 4')
    expect(screen.getByTestId('export-payload')).toHaveValue('{"version":1}')
    expect(screen.getByText(/resume the full deterministic simulation/i)).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('save-slot-a'))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Overwrite Slot A?')
    fireEvent.click(screen.getByTestId('confirm-destructive-action'))
    expect(onSave).toHaveBeenCalledWith('slot-a')
    fireEvent.click(screen.getByTestId('load-slot-a'))
    expect(onLoad).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('confirm-destructive-action'))
    expect(onLoad).toHaveBeenCalledWith('slot-a')
    fireEvent.click(screen.getByTestId('export-slot-a'))
    expect(onExport).toHaveBeenCalledWith('slot-a')
    fireEvent.click(screen.getByTestId('clear-slot-a'))
    expect(onClear).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('confirm-destructive-action'))
    expect(onClear).toHaveBeenCalledWith('slot-a')

    fireEvent.change(screen.getByTestId('import-slot'), { target: { value: 'slot-c' } })
    fireEvent.change(screen.getByTestId('import-payload'), { target: { value: '{"version":1}' } })
    fireEvent.click(screen.getByTestId('import-save'))
    expect(onImport).toHaveBeenCalledWith('slot-c', '{"version":1}')

    fireEvent.click(screen.getByTestId('disasters-toggle'))
    expect(onSetDisastersEnabled).toHaveBeenCalledWith(false)
  })

  it('keeps destructive actions cancelable, restores focus, and leaves empty-slot saves one-step', () => {
    const onSave = jest.fn()
    const onLoad = jest.fn()
    render(
      <SaveLoadOverlay
        slots={slots()}
        activeSlotId="autosave"
        canSave={true}
        exportText=""
        message={null}
        disastersEnabled={false}
        onClose={jest.fn()}
        onSave={onSave}
        onLoad={onLoad}
        onExport={jest.fn()}
        onImport={jest.fn()}
        onClear={jest.fn()}
        onSetDisastersEnabled={jest.fn()}
      />,
    )

    const loadButton = screen.getByTestId('load-slot-a')
    fireEvent.click(loadButton)
    fireEvent.click(screen.getByTestId('cancel-destructive-action'))
    expect(onLoad).not.toHaveBeenCalled()
    expect(loadButton).toHaveFocus()

    fireEvent.click(screen.getByTestId('save-slot-b'))
    expect(onSave).toHaveBeenCalledWith('slot-b')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('disables load/export/clear for empty slots and save when the game cannot save', () => {
    render(
      <SaveLoadOverlay
        slots={slots()}
        activeSlotId="autosave"
        canSave={false}
        exportText=""
        message={null}
        disastersEnabled={false}
        onClose={jest.fn()}
        onSave={jest.fn()}
        onLoad={jest.fn()}
        onExport={jest.fn()}
        onImport={jest.fn()}
        onClear={jest.fn()}
        onSetDisastersEnabled={jest.fn()}
      />,
    )

    expect(screen.getByTestId('save-slot-a')).toBeDisabled()
    expect(screen.getByTestId('load-slot-b')).toBeDisabled()
    expect(screen.getByTestId('export-slot-b')).toBeDisabled()
    expect(screen.getByTestId('clear-slot-b')).toBeDisabled()
  })
})
