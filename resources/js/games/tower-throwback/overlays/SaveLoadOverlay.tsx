import currency from 'currency.js'
import { type ChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactElement, useCallback, useEffect, useRef, useState } from 'react'

import type { CloudSlotStatus, CloudSlotView } from '../cloudSync'
import type { SandboxSlotSummary } from '../gameProgress'
import { SANDBOX_SLOT_IDS, type SandboxSlotId } from '../gameTypes'
import { ChallengeCodeCard } from '../hud/ChallengeCodeCard'
import { DestructiveActionConfirmation } from './DestructiveActionConfirmation'
import { readTowerSaveFile } from './importSaveFile'

type PendingSaveAction =
  | { type: 'save' | 'load' | 'clear'; slotId: SandboxSlotId }
  | { type: 'import'; slotId: SandboxSlotId; raw: string }

interface SaveLoadOverlayProps {
  slots: SandboxSlotSummary[]
  activeSlotId: SandboxSlotId
  canSave: boolean
  exportText: string
  /** Shareable code for the tower currently in play; omitted on the title card. */
  challengeCode?: string
  message: { kind: 'success' | 'error'; text: string } | null
  disastersEnabled: boolean
  onClose: () => void
  onSave: (slotId: SandboxSlotId) => void
  onLoad: (slotId: SandboxSlotId) => void
  onExport: (slotId: SandboxSlotId) => void
  onImport: (slotId: SandboxSlotId, raw: string) => void
  onClear: (slotId: SandboxSlotId) => void
  onSetDisastersEnabled: (enabled: boolean) => void
  onRestoreFocus?: () => void
  cloudEnabled?: boolean
  cloudSlots?: Record<SandboxSlotId, CloudSlotView>
  onCloudRestore?: (slotId: SandboxSlotId) => void
  onTakeOver?: (slotId: SandboxSlotId) => void
  /** Re-attempt a failed or behind cloud mirror. */
  onCloudRetry?: (slotId: SandboxSlotId) => void
}

const CLOUD_STATUS_COPY: Record<CloudSlotStatus, { label: string; className: string }> = {
  synced: { label: 'Cloud: synced', className: 'text-emerald-200' },
  pushing: { label: 'Cloud: saving…', className: 'text-sky-200' },
  stale: { label: 'Cloud: behind this device', className: 'text-amber-200' },
  failed: { label: 'Cloud: save failed', className: 'text-red-200' },
  tooLarge: { label: 'Cloud: too large — local only', className: 'text-amber-200' },
  localOnly: { label: 'Cloud: local only', className: 'text-white/50' },
  cloudAvailable: { label: 'Cloud save available', className: 'text-sky-200' },
  conflict: { label: 'Open on another device — read-only', className: 'text-amber-200' },
  checking: { label: 'Cloud: checking…', className: 'text-white/50' },
  offline: { label: 'Cloud: offline', className: 'text-white/50' },
}

/** Extra explanation for the states a player would otherwise have to guess at. */
const CLOUD_STATUS_DETAIL: Partial<Record<CloudSlotStatus, string>> = {
  stale: 'Your browser has the newer tower. Retry to update the cloud copy.',
  failed: 'Your tower is saved in this browser; only the cloud copy is behind.',
  tooLarge: 'This tower exceeds the cloud size limit. It stays saved in this browser.',
}

function slotSummary(slot: SandboxSlotSummary): string {
  if (slot.loadFailure === 'unknownMap') {
    return 'Requires a newer version to load'
  }
  if (!slot.saved) {
    return 'Empty'
  }

  return `Day ${slot.day} · ${'★'.repeat(slot.star ?? 1)} · ${(slot.population ?? 0).toLocaleString()} pop · ${currency(slot.funds ?? 0, {
    precision: 0,
  }).format()}`
}

function slotHasStoredData(slot: SandboxSlotSummary): boolean {
  return slot.saved || slot.loadFailure === 'unknownMap'
}

function actionCopy(action: PendingSaveAction, slot: SandboxSlotSummary): { confirmLabel: string; description: string; title: string } {
  switch (action.type) {
    case 'save':
      return {
        title: `Overwrite ${slot.label}?`,
        description: 'The existing tower in this slot will be replaced by the current tower.',
        confirmLabel: 'Overwrite save',
      }
    case 'load':
      return {
        title: `Load ${slot.label}?`,
        description: 'Unsaved changes in the current tower will be discarded.',
        confirmLabel: 'Load tower',
      }
    case 'clear':
      return {
        title: `Clear ${slot.label}?`,
        description: 'This saved tower will be permanently removed from browser storage.',
        confirmLabel: 'Clear slot',
      }
    case 'import':
      return {
        title: `Replace ${slot.label} with imported data?`,
        description: 'The existing tower in this slot will be replaced by the imported tower.',
        confirmLabel: 'Import and replace',
      }
  }
}

interface CloudSlotStatusRowProps {
  slotId: SandboxSlotId
  view: CloudSlotView
  onCloudRestore: ((slotId: SandboxSlotId) => void) | undefined
  onTakeOver: ((slotId: SandboxSlotId) => void) | undefined
  onCloudRetry: ((slotId: SandboxSlotId) => void) | undefined
}

function CloudSlotStatusRow({ slotId, view, onCloudRestore, onTakeOver, onCloudRetry }: CloudSlotStatusRowProps): ReactElement {
  const copy = CLOUD_STATUS_COPY[view.status]
  const detail = CLOUD_STATUS_DETAIL[view.status]

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
      <span data-testid={`cloud-status-${slotId}`} className={`text-[11px] font-semibold ${copy.className}`}>
        {copy.label}
      </span>
      {view.canRetry && onCloudRetry && (
        <button
          type="button"
          data-testid={`cloud-retry-${slotId}`}
          onClick={() => onCloudRetry(slotId)}
          className="rounded bg-white/10 px-2 py-0.5 text-[11px] font-bold text-white/85 hover:bg-white/20"
        >
          Retry
        </button>
      )}
      {detail && (
        <span className="w-full text-[10px] text-white/45" data-testid={`cloud-detail-${slotId}`}>
          {detail}
        </span>
      )}
      {view.canRestore && onCloudRestore && (
        <button
          type="button"
          data-testid={`cloud-restore-${slotId}`}
          onClick={() => onCloudRestore(slotId)}
          className="rounded bg-sky-500/25 px-2 py-0.5 text-[11px] font-bold text-sky-100 hover:bg-sky-500/40"
        >
          Restore from cloud
        </button>
      )}
      {view.status === 'conflict' && onTakeOver && (
        <button
          type="button"
          data-testid={`cloud-takeover-${slotId}`}
          onClick={() => onTakeOver(slotId)}
          className="rounded bg-amber-500/80 px-2 py-0.5 text-[11px] font-bold text-slate-950 hover:bg-amber-400"
        >
          Take over
        </button>
      )}
    </div>
  )
}

export function SaveLoadOverlay({
  slots,
  activeSlotId,
  canSave,
  exportText,
  challengeCode,
  message,
  disastersEnabled,
  onClose,
  onSave,
  onLoad,
  onExport,
  onImport,
  onClear,
  onSetDisastersEnabled,
  onRestoreFocus,
  cloudEnabled = false,
  cloudSlots,
  onCloudRestore,
  onTakeOver,
  onCloudRetry,
}: SaveLoadOverlayProps): ReactElement {
  const [importSlotId, setImportSlotId] = useState<SandboxSlotId>('slot-a')
  const [importPayload, setImportPayload] = useState('')
  const [pendingAction, setPendingAction] = useState<PendingSaveAction | null>(null)
  const [exportCopyResult, setExportCopyResult] = useState<{ state: 'copied' | 'failed'; text: string } | null>(null)
  const [importFileError, setImportFileError] = useState(false)
  const confirmationTriggerRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const exportRef = useRef<HTMLTextAreaElement | null>(null)
  const onCloseRef = useRef(onClose)
  const onRestoreFocusRef = useRef(onRestoreFocus)
  const focusRestoredRef = useRef(false)
  const exportCopyState = exportCopyResult?.text === exportText ? exportCopyResult.state : 'idle'

  useEffect(() => {
    onCloseRef.current = onClose
    onRestoreFocusRef.current = onRestoreFocus
  }, [onClose, onRestoreFocus])

  const restoreFocus = useCallback((): void => {
    if (!focusRestoredRef.current) {
      focusRestoredRef.current = true
      onRestoreFocusRef.current?.()
    }
  }, [])

  const close = useCallback((): void => {
    onCloseRef.current()
    restoreFocus()
  }, [restoreFocus])

  useEffect(() => {
    closeButtonRef.current?.focus()
    return restoreFocus
  }, [restoreFocus])

  const trapTabKey = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    if (event.key !== 'Tab') {
      return
    }
    const dialog = dialogRef.current
    if (!dialog) {
      return
    }
    const focusable = [...dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    )].filter((element) => element.getAttribute('aria-hidden') !== 'true')
    const first = focusable[0]
    const last = focusable.at(-1)
    if (!first || !last) {
      event.preventDefault()
      return
    }
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault()
      first.focus()
    }
  }

  const copyExport = useCallback((): void => {
    exportRef.current?.focus()
    exportRef.current?.select()
    void (async () => {
      try {
        if (!navigator.clipboard) {
          throw new Error('clipboard unavailable')
        }
        await navigator.clipboard.writeText(exportText)
        setExportCopyResult({ state: 'copied', text: exportText })
      } catch {
        setExportCopyResult({ state: 'failed', text: exportText })
      }
    })()
  }, [exportText])

  const downloadExport = useCallback((): void => {
    const objectUrl = URL.createObjectURL(new Blob([exportText], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = 'tower-throwback-save.json'
    document.body.append(anchor)
    try {
      anchor.click()
    } finally {
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
    }
  }, [exportText])

  const slotFor = (slotId: SandboxSlotId): SandboxSlotSummary =>
    slots.find((slot) => slot.id === slotId) ?? { id: slotId, label: slotId, saved: false, loadFailure: null, day: null, star: null, population: null, funds: null }

  const executeAction = (action: PendingSaveAction): void => {
    switch (action.type) {
      case 'save':
        onSave(action.slotId)
        break
      case 'load':
        onLoad(action.slotId)
        break
      case 'clear':
        onClear(action.slotId)
        break
      case 'import':
        onImport(action.slotId, action.raw)
        break
    }
  }

  const requestAction = (action: PendingSaveAction, event: MouseEvent<HTMLButtonElement>): void => {
    const slot = slotFor(action.slotId)
    const destructive = action.type === 'load' || action.type === 'clear' || slotHasStoredData(slot)
    if (!destructive) {
      executeAction(action)
      return
    }
    confirmationTriggerRef.current = event.currentTarget
    setPendingAction(action)
  }

  const closeConfirmation = (): void => {
    setPendingAction(null)
    confirmationTriggerRef.current?.focus()
    confirmationTriggerRef.current = null
  }

  const confirmAction = (): void => {
    if (pendingAction) {
      executeAction(pendingAction)
    }
    closeConfirmation()
  }

  const loadImportFile = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }

    void readTowerSaveFile(file)
      .then((payload) => {
        setImportPayload(payload)
        setImportFileError(false)
      })
      .catch(() => setImportFileError(true))
  }

  const pendingSlot = pendingAction ? slotFor(pendingAction.slotId) : null
  const pendingCopy = pendingAction && pendingSlot ? actionCopy(pendingAction, pendingSlot) : null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/85 p-4">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-load-title"
        onKeyDown={trapTabKey}
        className="flex max-h-[90vh] w-[42rem] flex-col gap-4 overflow-y-auto rounded-2xl bg-slate-900 p-5 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="save-load-title" className="text-xl font-black tracking-tight">Save / Load</h2>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close save overlay"
            onClick={close}
            className="rounded-md bg-white/10 px-2.5 py-1 text-sm font-bold text-white/80 hover:bg-white/20"
          >
            Close
          </button>
        </div>

        {message && (
          <div
            data-testid="save-message"
            className={`rounded px-3 py-2 text-sm ${message.kind === 'success' ? 'bg-emerald-500/15 text-emerald-100' : 'bg-red-500/15 text-red-100'}`}
          >
            {message.text}
          </div>
        )}

        {pendingAction && pendingCopy && (
          <DestructiveActionConfirmation
            title={pendingCopy.title}
            description={pendingCopy.description}
            confirmLabel={pendingCopy.confirmLabel}
            onConfirm={confirmAction}
            onCancel={closeConfirmation}
          />
        )}

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
          <input
            type="checkbox"
            data-testid="disasters-toggle"
            checked={disastersEnabled}
            onChange={(event) => onSetDisastersEnabled(event.target.checked)}
            className="mt-0.5 size-4 accent-amber-400"
          />
          <span>
            <span className="block font-bold">Disasters: {disastersEnabled ? 'on' : 'off'}</span>
            <span className="block text-[12px] text-white/60">Bomb threats, fires, and new infestations</span>
          </span>
        </label>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {slots.map((slot) => (
            <div key={slot.id} className="rounded-lg border border-white/10 bg-white/5 p-3" data-testid={`save-slot-${slot.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold">
                    {slot.label}
                    {slot.id === activeSlotId && <span className="ml-2 rounded bg-emerald-400/20 px-1.5 py-0.5 text-[10px] text-emerald-100">ACTIVE</span>}
                  </div>
                  <div className="text-[12px] text-white/60" data-testid={`slot-summary-${slot.id}`}>
                    {slotSummary(slot)}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  data-testid={`save-${slot.id}`}
                  disabled={!canSave}
                  onClick={(event) => requestAction({ type: 'save', slotId: slot.id }, event)}
                  className="rounded bg-emerald-500/25 px-2 py-1 text-[12px] font-bold text-emerald-100 hover:bg-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  type="button"
                  data-testid={`load-${slot.id}`}
                  disabled={!slot.saved}
                  onClick={(event) => requestAction({ type: 'load', slotId: slot.id }, event)}
                  className="rounded bg-sky-500/25 px-2 py-1 text-[12px] font-bold text-sky-100 hover:bg-sky-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {slot.loadFailure === 'unknownMap' ? 'Update required' : 'Load'}
                </button>
                <button
                  type="button"
                  data-testid={`export-${slot.id}`}
                  disabled={!slot.saved}
                  onClick={() => onExport(slot.id)}
                  className="rounded bg-white/10 px-2 py-1 text-[12px] font-bold text-white/75 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Export
                </button>
                <button
                  type="button"
                  data-testid={`clear-${slot.id}`}
                  disabled={!slotHasStoredData(slot)}
                  onClick={(event) => requestAction({ type: 'clear', slotId: slot.id }, event)}
                  className="rounded bg-red-500/20 px-2 py-1 text-[12px] font-bold text-red-100 hover:bg-red-500/35 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clear
                </button>
              </div>
              {cloudEnabled && cloudSlots && (
                <CloudSlotStatusRow
                  slotId={slot.id}
                  view={cloudSlots[slot.id]}
                  onCloudRestore={onCloudRestore}
                  onTakeOver={onTakeOver}
                  onCloudRetry={onCloudRetry}
                />
              )}
            </div>
          ))}
        </div>

        {challengeCode && <ChallengeCodeCard code={challengeCode} />}

        <div className="rounded-lg bg-white/5 p-3">
          <div className="pb-1 text-[10px] font-bold tracking-widest text-white/50">EXPORT JSON</div>
          <textarea
            ref={exportRef}
            readOnly
            data-testid="export-payload"
            value={exportText}
            className="h-28 w-full resize-none rounded bg-slate-950/70 p-2 font-mono text-[11px] text-white/75"
            placeholder="Choose Export on a saved slot."
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="copy-export"
              disabled={exportText.length === 0}
              onClick={copyExport}
              className="rounded bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white/85 hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {exportCopyState === 'copied' ? 'Copied' : exportCopyState === 'failed' ? 'Select & copy' : 'Copy JSON'}
            </button>
            <button
              type="button"
              data-testid="download-export"
              disabled={exportText.length === 0}
              onClick={downloadExport}
              className="rounded bg-sky-500/25 px-3 py-1.5 text-[12px] font-bold text-sky-100 hover:bg-sky-500/40 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Download JSON
            </button>
          </div>
        </div>

        <div className="rounded-lg bg-white/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
            <div className="text-[10px] font-bold tracking-widest text-white/50">IMPORT JSON</div>
            <select
              data-testid="import-slot"
              value={importSlotId}
              onChange={(event) => setImportSlotId(event.target.value as SandboxSlotId)}
              className="rounded bg-slate-950/80 px-2 py-1 text-[12px] text-white"
            >
              {SANDBOX_SLOT_IDS.map((slotId) => (
                <option key={slotId} value={slotId} className="bg-slate-950">
                  {slots.find((slot) => slot.id === slotId)?.label ?? slotId}
                </option>
              ))}
            </select>
          </div>
          <textarea
            data-testid="import-payload"
            value={importPayload}
            onChange={(event) => setImportPayload(event.target.value)}
            className="h-28 w-full resize-none rounded bg-slate-950/70 p-2 font-mono text-[11px] text-white/75"
            placeholder="Paste exported tower JSON."
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer rounded bg-white/10 px-3 py-1.5 text-sm font-bold text-white/85 hover:bg-white/20">
              Choose JSON file
              <input
                type="file"
                accept=".json,application/json"
                data-testid="import-file"
                onChange={loadImportFile}
                className="sr-only"
              />
            </label>
            {importFileError && <span className="text-[12px] text-red-200">Could not read that save file.</span>}
          </div>
          <button
            type="button"
            data-testid="import-save"
            disabled={importPayload.trim().length === 0}
            onClick={(event) => requestAction({ type: 'import', slotId: importSlotId, raw: importPayload }, event)}
            className="mt-2 rounded bg-amber-500/80 px-3 py-1.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Import to slot
          </button>
        </div>

        <p className="text-[12px] text-white/55">
          Loads resume the full deterministic simulation, including active journeys, incidents, requests, ledgers, and scheduled work.
        </p>
      </section>
    </div>
  )
}
