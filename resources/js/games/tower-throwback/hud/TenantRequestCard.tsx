import type { ReactElement } from 'react'

import { ITEM_DEFS, SHAFT_DEFS } from '../engine/catalog'
import { floorLabel } from '../floorLabels'
import type { ItemKind, ShaftKind, TenantRequest } from '../gameTypes'

interface TenantRequestCardProps {
  request: TenantRequest
  onViewFloor: (floor: number) => void
}

function requestedKindName(request: TenantRequest): string {
  if (Object.hasOwn(ITEM_DEFS, request.wantsKind)) {
    return ITEM_DEFS[request.wantsKind as ItemKind].name
  }

  return SHAFT_DEFS[request.wantsKind as ShaftKind].name
}

export function TenantRequestCard({ request, onViewFloor }: TenantRequestCardProps): ReactElement {
  return (
    <section
      className="pointer-events-auto w-full max-w-xl shrink-0 rounded-xl border border-sky-400/60 bg-slate-950/90 px-4 py-3 text-sm shadow-2xl backdrop-blur-sm"
      data-testid="tenant-request-card"
      aria-labelledby="tenant-request-title"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="tenant-request-title" className="font-bold text-sky-100">
            Tenant request
          </h2>
          <p className="text-[12px] text-sky-100/85">{request.description}</p>
          <dl className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/65">
            <div>
              <dt className="sr-only">Requested facility</dt>
              <dd data-testid="tenant-request-kind">{requestedKindName(request)}</dd>
            </div>
            <div>
              <dt className="sr-only">Near floor</dt>
              <dd data-testid="tenant-request-floor">Near floor {floorLabel(request.nearFloor)}</dd>
            </div>
            <div>
              <dt className="sr-only">Expires</dt>
              <dd data-testid="tenant-request-expiry">Expires Day {request.expiresDay}</dd>
            </div>
          </dl>
        </div>
        <button
          type="button"
          data-testid="view-request-floor"
          onClick={() => onViewFloor(request.nearFloor)}
          className="pointer-events-auto min-h-11 shrink-0 rounded bg-sky-500/25 px-3 py-2 text-[12px] font-bold text-sky-100 hover:bg-sky-500/40"
        >
          View floor
        </button>
      </div>
    </section>
  )
}
