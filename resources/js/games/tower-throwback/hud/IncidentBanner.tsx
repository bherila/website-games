import currency from 'currency.js'
import type { ReactElement } from 'react'

import { fireDispatchCost } from '../engine/incidents'
import { floorLabel } from '../floorLabels'
import type { BombThreatState, FireState } from '../gameTypes'

interface IncidentBannerProps {
  threat: BombThreatState
  hasSecurityOffice: boolean
  onResolve: (choice: 'ransom' | 'sweep') => void
  onViewFloor: (floor: number) => void
}

interface ViewIncidentFloorButtonProps {
  floor: number
  onViewFloor: (floor: number) => void
}

function ViewIncidentFloorButton({ floor, onViewFloor }: ViewIncidentFloorButtonProps): ReactElement {
  return (
    <button
      type="button"
      data-testid="view-incident-floor"
      onClick={() => onViewFloor(floor)}
      className="pointer-events-auto min-h-11 rounded bg-white/15 px-3 py-2 text-[12px] font-bold text-white hover:bg-white/25"
    >
      View floor
    </button>
  )
}

/** Top-center bomb-threat alert; buttons enqueue the resolveBombThreat command. Positioned by TowerGame's incident-banner stack. */
export function IncidentBanner({ threat, hasSecurityOffice, onResolve, onViewFloor }: IncidentBannerProps): ReactElement {
  const sweeping = threat.sweepRemainingMin !== null
  return (
    <div
      className="pointer-events-none w-[calc(100vw-1rem)] max-w-3xl rounded-xl border border-red-500/70 bg-red-950/90 px-4 py-2 text-sm shadow-2xl backdrop-blur-sm sm:w-fit"
      role="alert"
      data-testid="incident-banner"
    >
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <span className="text-lg">💣</span>
        <div>
          <div className="font-bold text-red-100">Bomb threat on floor {floorLabel(threat.floor)}!</div>
          {sweeping ? (
            <div className="text-[12px] text-red-200/90" data-testid="sweep-eta">
              Security sweep under way — {Math.ceil(threat.sweepRemainingMin ?? 0)} min remaining
            </div>
          ) : (
            <div className="text-[12px] text-red-200/80">
              {hasSecurityOffice ? 'Security can sweep the floor.' : 'No security office — a sweep means risking it (25% detonation).'}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2" data-testid="incident-actions">
          <ViewIncidentFloorButton floor={threat.floor} onViewFloor={onViewFloor} />
          {!sweeping && (
            <>
              <button
                type="button"
                data-testid="pay-ransom"
                onClick={() => onResolve('ransom')}
                className="pointer-events-auto min-h-11 rounded bg-amber-500/85 px-3 py-2 font-bold text-slate-950 hover:bg-amber-400"
              >
                Pay {currency(threat.ransom, { precision: 0 }).format()}
              </button>
              <button
                type="button"
                data-testid="start-sweep"
                onClick={() => onResolve('sweep')}
                className="pointer-events-auto min-h-11 rounded bg-white/15 px-3 py-2 font-bold text-white hover:bg-white/25"
              >
                {hasSecurityOffice ? 'Sweep' : 'Risk it'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

interface FireBannerProps {
  fire: FireState
  onRespond: (choice: 'dispatch' | 'firebreak' | 'wait') => void
  onViewFloor: (floor: number) => void
}

/** Top-center fire alert; buttons enqueue the respondToFire command. Positioned by TowerGame's incident-banner stack. */
export function FireBanner({ fire, onRespond, onViewFloor }: FireBannerProps): ReactElement {
  const burningCount = fire.burningUnitIds.length
  return (
    <div
      className="pointer-events-none w-[calc(100vw-1rem)] max-w-3xl rounded-xl border border-orange-500/70 bg-red-950/90 px-4 py-2 text-sm shadow-2xl backdrop-blur-sm sm:w-fit"
      role="alert"
      data-testid="fire-banner"
    >
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <span className="text-lg">🔥</span>
        <div>
          <div className="font-bold text-orange-100">Fire on floor {floorLabel(fire.floor)}!</div>
          <div className="text-[12px] text-orange-200/90">
            Security response in {Math.ceil(fire.responseRemainingMin)} min · {burningCount} unit
            {burningCount === 1 ? '' : 's'} burning
          </div>
        </div>
        <div className="flex flex-wrap gap-2" data-testid="fire-actions">
          <ViewIncidentFloorButton floor={fire.floor} onViewFloor={onViewFloor} />
          <button
            type="button"
            data-testid="fire-dispatch"
            onClick={() => onRespond('dispatch')}
            className="pointer-events-auto min-h-11 rounded bg-amber-500/85 px-3 py-2 font-bold text-slate-950 hover:bg-amber-400"
          >
            Dispatch {currency(fireDispatchCost(fire), { precision: 0 }).format()}
          </button>
          <button
            type="button"
            data-testid="fire-firebreak"
            onClick={() => onRespond('firebreak')}
            className="pointer-events-auto min-h-11 rounded bg-white/15 px-3 py-2 font-bold text-white hover:bg-white/25"
          >
            Firebreak
          </button>
        </div>
      </div>
    </div>
  )
}
