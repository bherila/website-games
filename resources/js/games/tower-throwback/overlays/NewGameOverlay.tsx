import currency from 'currency.js'
import { type ReactElement, useRef, useState } from 'react'

import { decodeChallengeCode, formatChallengeCode } from '../challengeCode'
import { allMaps, CITY_TOWER, getMap } from '../engine/maps'
import type { SandboxSlotSummary } from '../gameProgress'
import { SANDBOX_SLOT_IDS, type SandboxSlotId } from '../gameTypes'
import { DestructiveActionConfirmation } from './DestructiveActionConfirmation'

interface ImportFeedback {
  kind: 'success' | 'error'
  text: string
}

interface NewGameOverlayProps {
  slots: SandboxSlotSummary[]
  /** `seed` omitted ⇒ pick a fresh one; supplied ⇒ replay a shared challenge. */
  onStart: (lobbyHeight: 1 | 2 | 3, seed?: number, mapId?: string) => void
  onResume: (slotId: SandboxSlotId) => void
  onImport: (slotId: SandboxSlotId, raw: string) => ImportFeedback
}

const LOBBY_CHOICES: Array<{ height: 1 | 2 | 3; name: string; note: string }> = [
  { height: 1, name: 'Standard lobby', note: '$300/tile · no bonus' },
  { height: 2, name: 'Grand lobby', note: '$600/tile · +3 desirability tower-wide' },
  { height: 3, name: 'Super lobby', note: '$900/tile · +6 desirability tower-wide' },
]

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

/** Title card: pick the permanent lobby height, or resume the saved tower. */
export function NewGameOverlay({ slots, onStart, onResume, onImport }: NewGameOverlayProps): ReactElement {
  const [lobbyHeight, setLobbyHeight] = useState<1 | 2 | 3>(1)
  const [confirming, setConfirming] = useState(false)
  const [importSlotId, setImportSlotId] = useState<SandboxSlotId>('slot-a')
  const [importPayload, setImportPayload] = useState('')
  const [importFeedback, setImportFeedback] = useState<ImportFeedback | null>(null)
  const [confirmingImport, setConfirmingImport] = useState(false)
  const [challengeCode, setChallengeCode] = useState('')
  const maps = allMaps()
  const [mapId, setMapId] = useState(maps[0]?.id ?? CITY_TOWER.id)
  const importButtonRef = useRef<HTMLButtonElement | null>(null)
  const hasSave = slots.some((slot) => slot.saved || slot.loadFailure === 'unknownMap')
  const importSlot = slots.find((slot) => slot.id === importSlotId)

  const trimmedCode = challengeCode.trim()
  const decodedChallenge = trimmedCode.length > 0 ? decodeChallengeCode(trimmedCode) : null
  const challengeInvalid = trimmedCode.length > 0 && decodedChallenge === null

  const start = (): void => {
    // A code that is present but unreadable must never fall back to a random
    // tower — the player asked for a specific one.
    if (challengeInvalid) {
      return
    }
    if (hasSave && !confirming) {
      setConfirming(true)
      return
    }
    if (decodedChallenge) {
      onStart(decodedChallenge.lobbyHeight, decodedChallenge.seed, decodedChallenge.mapId)
      return
    }
    onStart(lobbyHeight, undefined, mapId)
  }

  const runImport = (): void => {
    setImportFeedback(onImport(importSlotId, importPayload))
    setConfirmingImport(false)
    importButtonRef.current?.focus()
  }

  const requestImport = (): void => {
    if (importSlot?.saved || importSlot?.loadFailure === 'unknownMap') {
      setConfirmingImport(true)
      return
    }
    runImport()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/90 p-4">
      <div className="max-h-[90vh] w-[34rem] overflow-y-auto rounded-2xl bg-slate-900 p-6 shadow-2xl">
        <h1 className="text-center text-3xl font-black tracking-tight">Tower Throwback</h1>
        <p className="mt-1 text-center text-sm text-white/60">Grow an empty lot into a five-star skyscraper.</p>

        {maps.length > 1 && (
          <div className="mt-5">
            <div className="pb-2 text-[10px] font-bold tracking-widest text-white/50">MAP</div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Map">
              {maps.map((map) => (
                <button
                  key={map.id}
                  type="button"
                  data-testid={`map-${map.id}`}
                  aria-pressed={mapId === map.id}
                  onClick={() => setMapId(map.id)}
                  className={`flex-1 rounded-lg border p-2 text-left text-sm transition-colors ${
                    mapId === map.id ? 'border-sky-400 bg-sky-500/20' : 'border-white/15 bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <div className="font-bold">{map.name}</div>
                  <div className="text-[11px] text-white/60">{map.blurb}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5">
          <div className="pb-2 text-[10px] font-bold tracking-widest text-white/50">
            LOBBY HEIGHT — PERMANENT, CHOOSE WISELY
          </div>
          <div className="flex gap-2">
            {LOBBY_CHOICES.map((choice) => (
              <button
                key={choice.height}
                type="button"
                data-testid={`lobby-${choice.height}`}
                aria-pressed={lobbyHeight === choice.height}
                onClick={() => setLobbyHeight(choice.height)}
                className={`flex-1 rounded-lg border p-2 text-left text-sm transition-colors ${
                  lobbyHeight === choice.height
                    ? 'border-emerald-400 bg-emerald-500/20'
                    : 'border-white/15 bg-white/5 hover:bg-white/10'
                }`}
              >
                <div className="font-bold">{choice.name}</div>
                <div className="text-[11px] text-white/60">{choice.note}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-lg bg-white/5 p-3">
          <label
            htmlFor="challenge-code"
            className="block pb-2 text-[10px] font-bold tracking-widest text-white/50"
          >
            CHALLENGE CODE — OPTIONAL
          </label>
          <input
            id="challenge-code"
            data-testid="challenge-code"
            value={challengeCode}
            onChange={(event) => setChallengeCode(event.target.value)}
            placeholder="Paste a code to replay someone else's tower"
            aria-invalid={challengeInvalid}
            aria-describedby="challenge-code-status"
            className={`w-full rounded bg-slate-950/70 px-2 py-1.5 font-mono text-[12px] uppercase text-white/85 placeholder:normal-case placeholder:font-sans placeholder:text-white/35 ${
              challengeInvalid ? 'ring-1 ring-red-400/70' : ''
            }`}
          />
          <div id="challenge-code-status" className="mt-1 text-[11px]" data-testid="challenge-code-status">
            {challengeInvalid ? (
              <span className="text-red-200">That code is not valid. Check for a mistyped character.</span>
            ) : decodedChallenge ? (
              <span className="text-emerald-200">
                Ready — {getMap(decodedChallenge.mapId).name}, {decodedChallenge.lobbyHeight === 1 ? 'standard' : decodedChallenge.lobbyHeight === 2 ? 'grand' : 'super'} lobby. The choices above are ignored.
              </span>
            ) : (
              <span className="text-white/45">Leave blank for a fresh random tower.</span>
            )}
          </div>
        </div>

        <div className="mt-5">
          <div className="pb-2 text-[10px] font-bold tracking-widest text-white/50">SAVED TOWERS</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {slots.map((slot) => (
              <div key={slot.id} className="rounded-lg bg-white/5 p-2" data-testid={`title-slot-${slot.id}`}>
                <div className="font-bold">{slot.label}</div>
                <div className="text-[11px] text-white/60" data-testid={`title-slot-summary-${slot.id}`}>
                  {slotSummary(slot)}
                </div>
                <button
                  type="button"
                  data-testid={`resume-${slot.id}`}
                  disabled={!slot.saved}
                  onClick={() => onResume(slot.id)}
                  className="mt-2 w-full rounded bg-emerald-500/25 px-2 py-1 text-[12px] font-bold text-emerald-100 hover:bg-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {slot.loadFailure === 'unknownMap' ? 'Update required' : 'Load'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 rounded-lg bg-white/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
            <div className="text-[10px] font-bold tracking-widest text-white/50">IMPORT JSON</div>
            <select
              data-testid="title-import-slot"
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
            data-testid="title-import-payload"
            value={importPayload}
            onChange={(event) => setImportPayload(event.target.value)}
            className="h-20 w-full resize-none rounded bg-slate-950/70 p-2 font-mono text-[11px] text-white/75"
            placeholder="Paste exported tower JSON."
          />
          {importFeedback && (
            <div
              data-testid="title-import-message"
              className={`mt-2 rounded px-2 py-1 text-[12px] ${importFeedback.kind === 'success' ? 'bg-emerald-500/15 text-emerald-100' : 'bg-red-500/15 text-red-100'}`}
            >
              {importFeedback.text}
            </div>
          )}
          {confirmingImport && importSlot && (
            <div className="mt-2">
              <DestructiveActionConfirmation
                title={`Replace ${importSlot.label} with imported data?`}
                description="The existing tower in this slot will be replaced by the imported tower."
                confirmLabel="Import and replace"
                onConfirm={runImport}
                onCancel={() => {
                  setConfirmingImport(false)
                  importButtonRef.current?.focus()
                }}
              />
            </div>
          )}
          <button
            type="button"
            ref={importButtonRef}
            data-testid="title-import-save"
            disabled={importPayload.trim().length === 0}
            onClick={requestImport}
            className="mt-2 rounded bg-amber-500/80 px-3 py-1.5 text-sm font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Import to slot
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            data-testid="start"
            onClick={start}
            disabled={challengeInvalid}
            className={`w-full rounded-lg px-4 py-2 font-bold ${
              confirming
                ? 'bg-red-500/85 text-white hover:bg-red-400'
                : hasSave
                  ? 'bg-white/10 text-white/85 hover:bg-white/20'
                  : 'bg-emerald-500/85 text-slate-950 hover:bg-emerald-400'
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            {confirming
              ? 'Really abandon the saved tower?'
              : decodedChallenge
                ? `Start challenge ${formatChallengeCode(trimmedCode)}`
                : hasSave
                  ? 'New tower'
                  : 'Start building'}
          </button>
          {confirming && (
            <button
              type="button"
              data-testid="cancel-new"
              onClick={() => setConfirming(false)}
              className="w-full rounded-lg bg-white/5 px-4 py-1.5 text-sm text-white/60 hover:bg-white/10"
            >
              Keep my tower
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
