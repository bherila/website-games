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
  return { deletion: 'idle', matchedAt: null, status: 'localOnly', canRestore: false, conflict: null, cloudUpdatedAt: null, canRetry: false, ...overrides }
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
          'slot-b': view({ deletion: 'idle', matchedAt: null, status: 'cloudAvailable', canRestore: true }),
        })}
        onCloudRestore={onCloudRestore}
        onTakeOver={jest.fn()}
      />,
    )

    expect(screen.getByTestId('cloud-status-slot-a')).toHaveTextContent(/synced/i)
    expect(screen.getByTestId('cloud-status-slot-b')).toHaveTextContent(/cloud save available/i)

    fireEvent.click(screen.getByTestId('cloud-restore-slot-b'))
    expect(onCloudRestore).toHaveBeenCalledWith('slot-b', 'absent')

    // A local-only slot without a cloud copy offers no restore button.
    expect(screen.queryByTestId('cloud-restore-slot-c')).toBeNull()
  })
})

describe('SaveLoadOverlay — honest cloud states', () => {
  it.each([
    ['pushing', /saving/i],
    ['stale', /not compared/i],
    ['failed', /save failed/i],
    ['tooLarge', /too large/i],
    ['unverified', /not verified/i],
    ['different', /copies differ/i],
    ['matched', /matched on last check/i],
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

it.each(['readable', 'unknown-map'] as const)('confirms replacing %s local data from cloud and restores focus on cancellation', (kind) => {
  const onCloudRestore = jest.fn()
  const props = baseProps()
  if (kind === 'unknown-map') {
    props.slots[1] = { ...props.slots[1]!, saved: false, loadFailure: 'unknownMap' }
  }
  render(<SaveLoadOverlay {...props} cloudEnabled
    cloudSlots={cloudSlots({ 'slot-a': view({ deletion: 'idle', matchedAt: null, status: 'cloudAvailable', canRestore: true }) })}
    onCloudRestore={onCloudRestore} />)
  const trigger = screen.getByTestId('cloud-restore-slot-a')
  fireEvent.click(trigger)
  expect(onCloudRestore).not.toHaveBeenCalled()
  expect(screen.getByTestId('confirm-destructive-action')).toHaveTextContent('Restore and replace')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(trigger).toHaveFocus()
  expect(onCloudRestore).not.toHaveBeenCalled()
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: 'Restore and replace' }))
  expect(onCloudRestore).toHaveBeenCalledTimes(1)
  expect(onCloudRestore).toHaveBeenCalledWith('slot-a', 'absent')
})


it.each([false, true])('describes the complete Clear scope (cloud enabled: %s)', (cloudEnabled) => {
  render(<SaveLoadOverlay {...baseProps()} cloudEnabled={cloudEnabled} />)
  fireEvent.click(screen.getByTestId('clear-slot-a'))
  const confirmation = screen.getByRole('alertdialog')
  expect(confirmation).toHaveTextContent('browser storage')
  if (cloudEnabled) expect(confirmation).toHaveTextContent("account's cloud copy")
  else expect(confirmation).not.toHaveTextContent('cloud')
})


it('offers confirmed Clear for a cloud-only slot after a remount', () => {
  const onClear = jest.fn()
  render(<SaveLoadOverlay {...baseProps()} cloudEnabled onClear={onClear}
    cloudSlots={cloudSlots({ 'slot-b': view({ status: 'cloudAvailable', canRestore: true }) })} />)
  fireEvent.click(screen.getByTestId('clear-slot-b'))
  expect(onClear).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Clear slot' }))
  expect(onClear).toHaveBeenCalledWith('slot-b', 'absent')
})

it('reports unconfirmed deletion and offers a separate explicit retry', () => {
  const onCloudDeleteRetry = jest.fn()
  const props = { ...baseProps(), cloudEnabled: true, onCloudDeleteRetry,
    cloudSlots: cloudSlots({ 'slot-b': view({ deletion: 'failed' }) }) }
  const { rerender } = render(<SaveLoadOverlay {...props} />)
  expect(screen.getByTestId('cloud-status-slot-b')).toHaveTextContent('deletion unconfirmed')
  fireEvent.click(screen.getByTestId('cloud-delete-retry-slot-b'))
  expect(onCloudDeleteRetry).toHaveBeenCalledWith('slot-b')
  expect(props.onClear).not.toHaveBeenCalled()
  rerender(<SaveLoadOverlay {...props} cloudSlots={cloudSlots({ 'slot-b': view({ deletion: 'pending' }) })} />)
  expect(screen.queryByTestId('cloud-delete-retry-slot-b')).not.toBeInTheDocument()
  expect(screen.getByTestId('save-slot-b')).toBeDisabled()
  expect(screen.getByTestId('clear-slot-b')).toBeDisabled()
})


it('shows when a cloud match was actually observed', () => {
  render(<SaveLoadOverlay {...baseProps()} cloudEnabled
    cloudSlots={cloudSlots({ 'slot-a': view({ status: 'matched', matchedAt: Date.UTC(2026, 10, 18, 12, 34) }) })} />)
  expect(screen.getByTestId('cloud-detail-slot-a')).toHaveTextContent('matched this browser at')
})

it.each(['clear', 'restore', 'replace'] as const)('pins the displayed cloud revision while a %s confirmation remains open', (kind) => {
  const props = { ...baseProps(), cloudEnabled: true, onCloudRestore: jest.fn(), onCloudRetry: jest.fn() }
  const initial = cloudSlots({ 'slot-a': view({ status: kind === 'replace' ? 'changed' : 'stale', canRetry: true, canRestore: true, revision: 'first-revision' }) })
  const opened = render(<SaveLoadOverlay {...props} cloudSlots={initial} />)
  fireEvent.click(screen.getByTestId(kind === 'clear' ? 'clear-slot-a' : kind === 'restore' ? 'cloud-restore-slot-a' : 'cloud-retry-slot-a'))
  opened.rerender(<SaveLoadOverlay {...props} cloudSlots={cloudSlots({ 'slot-a': { ...initial['slot-a'], revision: 'new-revision' } })} />)
  const label = kind === 'clear' ? 'Clear slot' : kind === 'restore' ? 'Restore and replace' : 'Replace cloud backup'
  fireEvent.click(screen.getByRole('button', { name: label }))
  if (kind === 'clear') expect(props.onClear).toHaveBeenCalledWith('slot-a', 'first-revision')
  else if (kind === 'restore') expect(props.onCloudRestore).toHaveBeenCalledWith('slot-a', 'first-revision')
  else expect(props.onCloudRetry).toHaveBeenCalledWith('slot-a', 'first-revision')
})

it('allows a fresh Clear confirmation for a remote replacement after failed deletion', () => {
  const props = baseProps()
  const emptySlots = slots().map((slot) => ({ ...slot, saved: false }))
  render(<SaveLoadOverlay {...props} slots={emptySlots} cloudEnabled cloudSlots={cloudSlots({ 'slot-a': view({ deletion: 'failed', status: 'changed', canRestore: false, canClear: true, revision: 'new-revision' }) })} />)
  expect(screen.getByTestId('clear-slot-a')).toBeEnabled()
  fireEvent.click(screen.getByTestId('clear-slot-a'))
  fireEvent.click(screen.getByRole('button', { name: 'Clear slot' }))
  expect(props.onClear).toHaveBeenCalledWith('slot-a', 'new-revision')
})
