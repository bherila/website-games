import { fireEvent, render, screen } from '@testing-library/react'

import type { CloudSlotView } from '../../cloudSync'
import type { SandboxSlotSummary } from '../../gameProgress'
import { SANDBOX_SLOT_IDS, SANDBOX_SLOT_LABELS, type SandboxSlotId } from '../../gameTypes'
import { SaveLoadOverlay } from '../SaveLoadOverlay'

function slots(): SandboxSlotSummary[] {
  return SANDBOX_SLOT_IDS.map((slotId) => ({
    id: slotId,
    label: SANDBOX_SLOT_LABELS[slotId],
    saved: slotId === 'slot-a',
    loadFailure: null,
    day: slotId === 'slot-a' ? 4 : null,
    star: slotId === 'slot-a' ? 2 : null,
    population: slotId === 'slot-a' ? 88 : null,
    funds: slotId === 'slot-a' ? 12_345 : null,
  }))
}

/** Fills in the fields a test does not care about so fixtures stay readable. */
function view(overrides: Partial<CloudSlotView> = {}): CloudSlotView {
  return { status: 'localOnly', canRestore: false, conflict: null, cloudUpdatedAt: null, canRetry: false, ...overrides }
}

function cloudSlots(overrides: Partial<Record<SandboxSlotId, CloudSlotView>>): Record<SandboxSlotId, CloudSlotView> {
  const base = {} as Record<SandboxSlotId, CloudSlotView>
  for (const slotId of SANDBOX_SLOT_IDS) {
    base[slotId] = view()
  }
  return { ...base, ...overrides }
}

function baseProps() {
  return {
    slots: slots(),
    activeSlotId: 'autosave' as SandboxSlotId,
    canSave: true,
    exportText: '',
    message: null,
    disastersEnabled: false,
    onClose: jest.fn(),
    onSave: jest.fn(),
    onLoad: jest.fn(),
    onExport: jest.fn(),
    onImport: jest.fn(),
    onClear: jest.fn(),
    onSetDisastersEnabled: jest.fn(),
  }
}

describe('SaveLoadOverlay cloud status', () => {
  it('renders no cloud row when cloud sync is disabled', () => {
    render(<SaveLoadOverlay {...baseProps()} />)
    expect(screen.queryByTestId('cloud-status-slot-a')).toBeNull()
  })

  it('shows a read-only conflict indicator and drives the take-over flow', () => {
    const onTakeOver = jest.fn()
    render(
      <SaveLoadOverlay
        {...baseProps()}
        cloudEnabled
        cloudSlots={cloudSlots({
          'slot-a': view({ status: 'conflict', canRestore: true, conflict: { acquired_at: 'A', expires_at: 'B' } }),
        })}
        onTakeOver={onTakeOver}
        onCloudRestore={jest.fn()}
      />,
    )

    expect(screen.getByTestId('cloud-status-slot-a')).toHaveTextContent(/read-only/i)

    fireEvent.click(screen.getByTestId('cloud-takeover-slot-a'))
    expect(onTakeOver).toHaveBeenCalledWith('slot-a')
  })

  it('offers restore for a cloud-only slot and reports synced slots', () => {
    const onCloudRestore = jest.fn()
    render(
      <SaveLoadOverlay
        {...baseProps()}
        cloudEnabled
        cloudSlots={cloudSlots({
          'slot-a': view({ status: 'synced', canRestore: true }),
          'slot-b': view({ status: 'cloudAvailable', canRestore: true }),
        })}
        onCloudRestore={onCloudRestore}
        onTakeOver={jest.fn()}
      />,
    )

    expect(screen.getByTestId('cloud-status-slot-a')).toHaveTextContent(/synced/i)
    expect(screen.getByTestId('cloud-status-slot-b')).toHaveTextContent(/cloud save available/i)

    fireEvent.click(screen.getByTestId('cloud-restore-slot-b'))
    expect(onCloudRestore).toHaveBeenCalledWith('slot-b')

    // A local-only slot without a cloud copy offers no restore button.
    expect(screen.queryByTestId('cloud-restore-slot-c')).toBeNull()
  })
})

describe('SaveLoadOverlay — honest cloud states', () => {
  it.each([
    ['pushing', /saving/i],
    ['stale', /behind this device/i],
    ['failed', /save failed/i],
    ['tooLarge', /too large/i],
  ] as const)('labels the %s state', (status, pattern) => {
    render(
      <SaveLoadOverlay
        {...baseProps()}
        cloudEnabled
        cloudSlots={cloudSlots({ 'slot-a': view({ status }) })}
      />,
    )

    expect(screen.getByTestId('cloud-status-slot-a')).toHaveTextContent(pattern)
  })

  it('offers a retry for a failed mirror and reassures about the local save', () => {
    const onCloudRetry = jest.fn()
    render(
      <SaveLoadOverlay
        {...baseProps()}
        cloudEnabled
        cloudSlots={cloudSlots({ 'slot-a': view({ status: 'failed', canRetry: true }) })}
        onCloudRetry={onCloudRetry}
      />,
    )

    expect(screen.getByTestId('cloud-detail-slot-a')).toHaveTextContent(/saved in this browser/i)
    fireEvent.click(screen.getByTestId('cloud-retry-slot-a'))
    expect(onCloudRetry).toHaveBeenCalledWith('slot-a')
  })

  it('does not offer a retry for a slot that cannot be retried', () => {
    render(
      <SaveLoadOverlay
        {...baseProps()}
        cloudEnabled
        cloudSlots={cloudSlots({ 'slot-a': view({ status: 'tooLarge', canRetry: false }) })}
        onCloudRetry={jest.fn()}
      />,
    )

    // Retrying an over-budget save would just fail again.
    expect(screen.queryByTestId('cloud-retry-slot-a')).toBeNull()
  })
})
